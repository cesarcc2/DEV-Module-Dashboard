const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const kill = require("tree-kill");

const app = express();
const PORT = 4000;
const CONFIG_FILE = path.resolve(__dirname, "config.json");

// Middleware
app.use(cors());
app.use(express.json());

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
  const runningScripts = Array.from(runningCommands.entries()).map(([modulePath, process]) => ({
    modulePath,
    script: process.script, // Store the script name when starting the process
  }));
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
  runningCommands.set(modulePath, process);

  process.stdout.on("data", (data) => console.log(`[${modulePath}] ${data}`));
  process.stderr.on("data", (data) => console.error(`[${modulePath}] ${data}`));

  process.on("close", (code) => {
    runningCommands.delete(modulePath);
    console.log(`[${modulePath}] Process exited with code ${code}`);
  });

  res.json({ success: true, message: `Running '${script}' in ${modulePath}` });
});

app.post("/api/stop-script", (req, res) => {
  const { modulePath } = req.body;
  const process = runningCommands.get(modulePath);

  if (!process) {
    return res.status(400).json({ error: "No running process for this module" });
  }

  kill(process.pid, "SIGINT", (err) => {
    if (err) {
      console.error(`[${modulePath}] Failed to kill process:`, err);
      return res.status(500).json({ error: "Failed to stop the process" });
    }

    runningCommands.delete(modulePath);
    res.json({ success: true, message: `Stopped process in ${modulePath}` });
  });
});

// Serve the frontend
const frontendPath = path.resolve(__dirname, "frontend/build");
app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Start the server
app.listen(PORT, async () => {
  console.log(`Dev Dashboard server running on http://localhost:${PORT}`);
  
  // Dynamically import the 'open' module and open the URL
  const { default: open } = await import('open');
  open(`http://localhost:${PORT}`);
});