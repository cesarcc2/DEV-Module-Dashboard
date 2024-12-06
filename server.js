const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const kill = require("tree-kill");
const { WebSocketServer } = require("ws");

const app = express();
const PORT = 4000;
const CONFIG_FILE = path.resolve(__dirname, "config.json");

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

// Store running commands for control
const runningCommands = new Map();

// API Routes
app.get("/api/modules", (req, res) => {
  const modules = scanModules();
  res.json(modules);
});

// API to fetch running commands
app.get("/api/running-scripts", (req, res) => {
  const runningScripts = Array.from(runningCommands.entries()).flatMap(([modulePath, processes]) =>
    processes.map(({ script }) => ({ modulePath, script }))
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
  runningCommands.get(modulePath).push({ script, process });

  process.stdout.on("data", (data) => console.log(`[${modulePath}] ${data}`));
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

// Serve the frontend
const frontendPath = path.resolve(__dirname, "frontend/build");
app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});