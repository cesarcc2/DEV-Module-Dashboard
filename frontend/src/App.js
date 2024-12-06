import React, { useEffect, useState } from "react";
import "./App.css";

const WS_BASE = "ws://localhost:4000";
const API_BASE = "http://localhost:4000/api";

function App() {
  const [modules, setModules] = useState([]);
  const [running, setRunning] = useState({});
  const [search, setSearch] = useState("");
  const [selectedModules, setSelectedModules] = useState([]);

  useEffect(() => {
    fetchModules();
    fetchRunningScripts();
    loadSelectedModules();
    setupWebSocket();
  }, []);

  const setupWebSocket = () => {
    const ws = new WebSocket(WS_BASE);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "process-stopped") {
        const { modulePath, script } = message;
        setRunning((prev) => {
          const updated = { ...prev };
          if (updated[modulePath]) {
            updated[modulePath] = { ...updated[modulePath], [script]: false };
          }
          return updated;
        });
      }
    };

    return () => ws.close();
  };

  const fetchModules = async () => {
    const response = await fetch(`${API_BASE}/modules`);
    const data = await response.json();
    setModules(data);
  };

  const fetchRunningScripts = async () => {
    const response = await fetch(`${API_BASE}/running-scripts`);
    const data = await response.json();
    const runningState = data.reduce((acc, { modulePath, script }) => {
      acc[modulePath] = script;
      return acc;
    }, {});
    setRunning(runningState);
  };

  const loadSelectedModules = () => {
    const savedModules = JSON.parse(localStorage.getItem("selectedModules")) || [];
    setSelectedModules(savedModules);
  };

  const saveSelectedModules = (updatedModules) => {
    localStorage.setItem("selectedModules", JSON.stringify(updatedModules));
  };

  const toggleModuleSelection = (modulePath) => {
    const updatedSelection = selectedModules.includes(modulePath)
      ? selectedModules.filter((path) => path !== modulePath)
      : [...selectedModules, modulePath];

    setSelectedModules(updatedSelection);
    saveSelectedModules(updatedSelection);
  };

  const runScript = async (modulePath, script) => {
    await fetch(`${API_BASE}/run-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modulePath, script }),
    });
    setRunning((prev) => ({
      ...prev,
      [modulePath]: { ...(prev[modulePath] || {}), [script]: true },
    }));
  };

  const stopScript = async (modulePath, script) => {
    await fetch(`${API_BASE}/stop-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modulePath, script }),
    });
    setRunning((prev) => ({
      ...prev,
      [modulePath]: { ...(prev[modulePath] || {}), [script]: false },
    }));
  };

  const filteredModules = modules.filter((module) =>
    module.name.toLowerCase().includes(search.toLowerCase())
  );

  const displayedModules = modules.filter((module) =>
    selectedModules.includes(module.path)
  );


  // Render the script buttons dynamically
  const renderScriptButtons = (modulePath, scriptName) => {
    const isRunning = running[modulePath]?.[scriptName];
    return (
      <button
        className={isRunning ? "running" : ""}
        onClick={() =>
          isRunning
            ? stopScript(modulePath, scriptName)
            : runScript(modulePath, scriptName)
        }
      >
        {isRunning ? "Stop" : "Run"} {scriptName}
      </button>
    );
  };

  return (
    <div className="App">
      
      <div className="content">
        <aside className="side-panel">
            <header>
                <h1>Module Commands</h1>
            </header>
          <input
            className="search-input"
            type="text"
            placeholder="Search modules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="select-all-container">
            <label>
            Select All Modules
            <input
                className="select-all-checkbox"
                type="checkbox"
                checked={filteredModules.every((module) => selectedModules.includes(module.path)) && filteredModules.length > 0}
                onChange={(e) => {
                const allFilteredPaths = filteredModules.map((module) => module.path);
                if (e.target.checked) {
                    const updatedSelection = [...new Set([...selectedModules, ...allFilteredPaths])];
                    setSelectedModules(updatedSelection);
                    saveSelectedModules(updatedSelection);
                } else {
                    const updatedSelection = selectedModules.filter((path) => !allFilteredPaths.includes(path));
                    setSelectedModules(updatedSelection);
                    saveSelectedModules(updatedSelection);
                }
                }}
            />
            </label>
        </div>
          <ul>
            {filteredModules.map((module) => (
              <li key={module.path}>
                <label className={selectedModules.includes(module.path) ? "selected" : ""} >
                  <input
                    className="module-checkbox"
                    type="checkbox"
                    checked={selectedModules.includes(module.path)}
                    onChange={() => toggleModuleSelection(module.path)}
                  />
                  {module.name}
                </label>
              </li>
            ))}
          </ul>
        </aside>
        <main>
          <div className="modules">
            {displayedModules.map((module) => (
              <div className="module-card" key={module.path}>
                <h2>{module.name}</h2>
                <p>Path: {module.path.substring(module.path.indexOf("/Modules"))}</p>
                <h3>Scripts</h3>
                <ul>
                  {Object.entries(module.scripts).map(([scriptName]) => (
                    <li key={scriptName}>{renderScriptButtons(module.path, scriptName)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;