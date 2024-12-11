#!/usr/bin/env node --no-warnings
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const kill = require("tree-kill");
const { WebSocketServer } = require("ws");
const pLimit = require('p-limit').default;

const app = express();
const PORT = 4000;
const CONFIG_FILE = path.resolve(__dirname, "config.json");
const limit = pLimit(2); // Limit to 2 concurrent processes

// Middleware
app.use(cors());
app.use(express.json());

// Create a WebSocket server
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket connections
const sockets = new Set();
wss.on("connection", (socket) => {
  sockets.add(socket);

  socket.on("close", () => {
    sockets.delete(socket);
  });
});

// Upgrade HTTP server to handle WebSocket connections
app.server = app.listen(PORT, () => {
  console.log(`Dev Dashboard server running on http://localhost:${PORT}`);
  
  (async () => {
    const { default: open } = await import("open");
    open(`http://localhost:${PORT}`);
  })();
});

app.server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// Notify WebSocket clients
const notifyClients = (message) => {
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
};

// Load configuration
const loadConfig = () => {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Missing config file: ${CONFIG_FILE}`);
    process.exit(1); // Exit if config.json is missing
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  if (!config.modulesPath || !fs.existsSync(config.modulesPath)) {
    console.error("Invalid or missing modulesPath in config.json.");
    process.exit(1);
  }
  return config;
};

// Load the modulesPath
const config = loadConfig();
const modulesPath = config.modulesPath;

// Scan for modules and their package.json scripts
const scanModules = () => {
  const modules = [];
  const categories = fs.readdirSync(modulesPath).filter((category) =>
    fs.statSync(path.join(modulesPath, category)).isDirectory()
  );

  categories.forEach((category) => {
    const categoryPath = path.join(modulesPath, category);
    const moduleNames = fs.readdirSync(categoryPath).filter((moduleName) =>
      fs.statSync(path.join(categoryPath, moduleName)).isDirectory()
    );

    moduleNames.forEach((moduleName) => {
      const modulePath = path.join(categoryPath, moduleName);
      const packageJsonPath = path.join(modulePath, "package.json");

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        modules.push({
          name: packageJson.name || moduleName,
          path: modulePath,
          scripts: packageJson.scripts || {},
        });
      }
    });
  });

  return modules;
};

const appsPath = config.appsPath;
const scanApps = () => {
  const apps = [];
  const entries = fs.readdirSync(appsPath);

  entries.forEach((entry) => {
    const entryPath = path.join(appsPath, entry);

    if (fs.statSync(entryPath).isDirectory()) {
      // Check if this directory itself is an app
      const packageJsonPath = path.join(entryPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        console.log("Direct app package.json path is:", packageJsonPath);
        apps.push({
          name: packageJson.name || entry,
          path: entryPath,
          scripts: packageJson.scripts || {},
        });
        return; // Skip further processing for this directory as it's already an app
      }

      // If it's not an app itself, check its subdirectories for nested apps
      const subEntries = fs.readdirSync(entryPath).filter((subEntry) =>
        fs.statSync(path.join(entryPath, subEntry)).isDirectory()
      );

      subEntries.forEach((subEntry) => {
        const appPath = path.join(entryPath, subEntry);
        const nestedPackageJsonPath = path.join(appPath, "package.json");
        console.log("Nested app package.json path is:", nestedPackageJsonPath);
        if (fs.existsSync(nestedPackageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(nestedPackageJsonPath, "utf-8"));
          apps.push({
            name: packageJson.name || subEntry,
            path: appPath,
            scripts: packageJson.scripts || {},
          });
        }
      });
    }
  });

  return apps;
};

// Store running commands for control
const runningCommands = new Map();

// API Routes
app.get("/api/modules", (req, res) => {
  const modules = scanModules();
  res.json(modules);
});

// API Routes
app.get("/api/apps", (req, res) => {
  const apps = scanApps();
  res.json(apps);
});

// API to fetch running commands
app.get("/api/running-scripts", (req, res) => {
  const runningScripts = Array.from(runningCommands.entries()).flatMap(([modulePath, processes]) =>
    processes.map(({ script, url }) => ({
      modulePath,
      script,
      url, // Include URL if available
    }))
  );
  res.json(runningScripts);
});

// Modify the run-script endpoint to store the script name
app.post("/api/run-script", (req, res) => {
  const { modulePath, script } = req.body;
  if (!modulePath || !script) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const command = "npm";
  const args = ["run", script];
  const process = spawn(command, args, { cwd: modulePath, stdio: "pipe", shell: true });

  process.script = script; // Attach the script name to the process object

  if (!runningCommands.has(modulePath)) {
    runningCommands.set(modulePath, []);
  }
  runningCommands.get(modulePath).push({ script, process, url: null });

  // Listen for stdout to detect localhost URLs
  process.stdout.on("data", (data) => {
    console.log(`[${modulePath}] ${data}`);
    const output = data.toString();
    const urlMatch = output.match(/http:\/\/localhost:\d+/); // Match localhost URLs
    if (urlMatch) {
      const url = urlMatch[0];
      const moduleProcesses = runningCommands.get(modulePath);
      const runningProcess = moduleProcesses.find((p) => p.script === script);
      if (runningProcess) {
        runningProcess.url = url;
        notifyClients({
          type: "script-url-detected",
          modulePath,
          script,
          url,
        });
      }
    }
  });

  process.stderr.on("data", (data) => console.error(`[${modulePath}] ${data}`));

  process.on("close", (code) => {
    const moduleProcesses = runningCommands.get(modulePath) || [];
    const index = moduleProcesses.findIndex((p) => p.process === process);
    let stoppedScript = null;

    if (index !== -1) {
      stoppedScript = moduleProcesses[index].script;
      moduleProcesses.splice(index, 1);
    }

    if (moduleProcesses.length === 0) {
      runningCommands.delete(modulePath);
    }

    if (stoppedScript) {
      notifyClients({
        type: "process-stopped",
        modulePath,
        script: stoppedScript,
      });
    }

    console.log(`[${modulePath}] Process for '${stoppedScript}' exited with code ${code}`);
  });

  res.json({ success: true, message: `Running '${script}' in ${modulePath}` });
});

app.post("/api/stop-script", (req, res) => {
  const { modulePath, script } = req.body;
  const moduleProcesses = runningCommands.get(modulePath);

  if (!moduleProcesses) {
    return res.status(400).json({ error: "No running processes for this module" });
  }

  const processIndex = moduleProcesses.findIndex((p) => p.script === script);
  if (processIndex === -1) {
    return res.status(400).json({ error: `Script '${script}' is not running in ${modulePath}` });
  }

  const { process } = moduleProcesses[processIndex];

  kill(process.pid, "SIGINT", (err) => {
    if (err) {
      console.error(`[${modulePath}] Failed to kill process '${script}':`, err);
      return res.status(500).json({ error: "Failed to stop the process" });
    }

    moduleProcesses.splice(processIndex, 1);
    if (moduleProcesses.length === 0) {
      runningCommands.delete(modulePath);
    }

    res.json({ success: true, message: `Stopped script '${script}' in ${modulePath}` });
  });
});




// Install dependencies in the specified directories
app.post("/api/install-dependencies", async (req, res) => {
  const { paths } = req.body;

  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: "Invalid paths array" });
  }

  const installationResults = [];

  const installDependencies = (directory) => {
    return new Promise((resolve, reject) => {
      const command = "npm";
      const args = ["install"];
      const process = spawn(command, args, { cwd: directory, shell: true });

      process.stdout.on("data", (data) => {
        console.log(`[${directory}] ${data}`);
        notifyClients({
          type: "install-progress",
          directory,
          message: data.toString(),
        });
      });

      process.stderr.on("data", (data) => {
        console.error(`[${directory}] ${data}`);
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve({ directory, status: "success" });
        } else {
          reject({ directory, status: "failed" });
        }
      });
    });
  };

  const installTasks = paths.map((path) =>
    installDependencies(path)
      .then((result) => {
        installationResults.push(result);
      })
      .catch((error) => {
        installationResults.push(error);
      })
  );

  try {
    await Promise.all(installTasks);
    res.json({ success: true, results: installationResults });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.post("/api/switch-to-local-files", async (req, res) => {
  const { paths } = req.body;
  console.log("DEBUG PATHS ORIGINAL: ", paths);

  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: "Invalid paths array" });
  }

  const moduleMap = new Map();

  // Step 1: Cache dependencies for each directory
  const cacheModules = async (directory) => {
    const packageJsonPath = path.join(directory, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`package.json not found at ${packageJsonPath}`);
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const allDependencies = [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
      ...Object.keys(packageJson.peerDependencies || {}),
    ];

    // Filter dependencies to include only those in the received paths
    const relevantDependencies = allDependencies.filter((dep) =>
      paths.some((p) => path.basename(p) === dep)
    );

    console.log(`Cached ${directory}:`, relevantDependencies);
    moduleMap.set(directory, relevantDependencies);
  };

  // Step 2: Globally link cached modules
  const linkModulesGlobally = async (directory) => {
    const packageJsonPath = path.join(directory, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const moduleName = packageJson.name;

    if (!moduleName) {
      throw new Error(`No module name found in package.json at ${directory}`);
    }

    return new Promise((resolve, reject) => {
      const command = "npm";
      const args = ["link"];
      const process = spawn(command, args, { cwd: directory, shell: true });

      process.stdout.on("data", (data) => {
        console.log(`[${directory}] ${data}`);
      });

      process.stderr.on("data", (data) => {
        console.error(`[${directory}] ${data}`);
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm link failed for ${directory}`));
        }
      });
    });
  };

  // Step 3: Locally link dependencies in each directory
  const linkDependenciesLocally = async (directory, dependencies) => {
    await Promise.all(
      dependencies.map((dep) =>
        new Promise((resolve, reject) => {
          const command = "npm";
          const args = ["link", dep];
          const process = spawn(command, args, { cwd: directory, shell: true });

          process.stdout.on("data", (data) => {
            console.log(`[${directory}] Linking ${dep}: ${data}`);
          });

          process.stderr.on("data", (data) => {
            console.error(`[${directory}] Error linking ${dep}: ${data}`);
          });

          process.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Failed to link dependency ${dep} in ${directory}`));
            }
          });
        })
      )
    );
  };

  try {
    // Step 1: Cache modules
    
    await Promise.all(paths.map(cacheModules));

    // Step 2: Globally link modules
    await Promise.all(paths.map(linkModulesGlobally));

    // Step 3: Locally link dependencies
    for (const [directory, dependencies] of moduleMap.entries()) {
      await linkDependenciesLocally(directory, dependencies);
    }

    console.log("All modules linked successfully.");
    res.json({ success: true, message: "All modules linked successfully." });
  } catch (error) {
    console.error("Error during linking:", error);
    res.status(500).json({
      success: false,
      error: "An error occurred during module linking.",
      details: error.message,
    });
  }
});


// Serve the frontend
const frontendPath = path.resolve(__dirname, "frontend/build");
app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});