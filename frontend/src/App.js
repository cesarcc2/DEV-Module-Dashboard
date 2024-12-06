import React, { useEffect, useState } from "react";
import "./App.css";

const WS_BASE = "ws://localhost:4000";
const API_BASE = "http://localhost:4000/api";

function App() {
  const [modules, setModules] = useState([]);
  const [running, setRunning] = useState({});
  const [search, setSearch] = useState("");
  const [selectedModules, setSelectedModules] = useState([]);
  const [moduleOrder, setModuleOrder] = useState([]);
  const [dragOverTarget, setDragOverTarget] = useState(null);

  useEffect(() => {
    loadModuleOrder();
    fetchModules();
    fetchRunningScripts();
    loadSelectedModules();
    setupWebSocket();
  }, []);

  useEffect(() => {
    setModuleOrder(selectedModules);
  }, [selectedModules]);

  useEffect(() => {
    saveModuleOrder(moduleOrder);
  }, [moduleOrder]);

  const saveModuleOrder = (moduleOrder) => {
    localStorage.setItem("moduleOrder", JSON.stringify(moduleOrder));
  } 

  const loadModuleOrder = () => {
    const savedOrder = JSON.parse(localStorage.getItem("moduleOrder")) || [];
    setModuleOrder(savedOrder);
  };

  const setupWebSocket = () => {
    const ws = new WebSocket(WS_BASE);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "process-stopped") {
        const { modulePath, script } = message;
        setRunning((prev) => {
          const updated = { ...prev };
          if (updated[modulePath]) {
            updated[modulePath] = { ...updated[modulePath], [script]: { isRunning: false, url: null } };
          }
          return updated;
        });
      }
  
      if (message.type === "script-url-detected") {
        const { modulePath, script, url } = message;
        setRunning((prev) => ({
          ...prev,
          [modulePath]: {
            ...(prev[modulePath] || {}),
            [script]: { isRunning: true, url }, // Update only the relevant script
          },
        }));
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
  
    const runningState = data.reduce((acc, { modulePath, script, url }) => {
      acc[modulePath] = {
        ...(acc[modulePath] || {}),
        [script]: { isRunning: true, url: url || null }, // Add URL if available
      };
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
    setRunning((prev) => ({
      ...prev,
      [modulePath]: {
        ...(prev[modulePath] || {}),
        [script]: { isRunning: "starting", url: null }, // Mark as starting
      },
    }));
  
    const response = await fetch(`${API_BASE}/run-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modulePath, script }),
    });
  
    if (!response.ok) {
      // If the API call fails, revert the state
      setRunning((prev) => ({
        ...prev,
        [modulePath]: {
          ...(prev[modulePath] || {}),
          [script]: { isRunning: false, url: null },
        },
      }));
    }
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






  const handleDragStart = (event, modulePath) => {
    event.dataTransfer.setData("modulePath", modulePath);
  };
  
  const handleDragOver = (event, targetPath) => {
    event.preventDefault();
    setDragOverTarget(targetPath); // Set the current drag-over target
  };
  
  const handleDrop = (event, targetPath) => {
    event.preventDefault();
    const draggedPath = event.dataTransfer.getData("modulePath");
  
    // Update the order
    setModuleOrder((prevOrder) => {
      const updatedOrder = [...prevOrder];
      const draggedIndex = updatedOrder.indexOf(draggedPath);
      const targetIndex = updatedOrder.indexOf(targetPath);
  
      // Reorder the modules
      updatedOrder.splice(draggedIndex, 1);
      updatedOrder.splice(targetIndex, 0, draggedPath);
  
      return updatedOrder;
    });
  
    setDragOverTarget(null); // Reset the drag-over target
  };
  
  const handleDragLeave = () => {
    setDragOverTarget(null); // Clear the drag-over state when leaving
  };


  const filteredModules = modules.filter((module) =>
    module.name.toLowerCase().includes(search.toLowerCase())
  );

  const displayedModules = modules
  .filter((module) => moduleOrder.includes(module.path))
  .sort((a, b) => moduleOrder.indexOf(a.path) - moduleOrder.indexOf(b.path));


  // Render the script buttons dynamically
  const renderScriptButtons = (modulePath, scriptName) => {
    const scriptState = running[modulePath]?.[scriptName];
    const isRunning = scriptState?.isRunning;
    const url = scriptState?.url;
    
    const buttonClass = isRunning == 'starting' ? 'terminate' : isRunning === true
      ? url
        ? "terminate" // Script serves localhost, doesn't auto-terminate
        : "terminate" // Script auto-terminates
      : "";
  
    const buttonText = isRunning === "starting"
      ? `Stop ${scriptName}` // Display "Running <script name>" while starting
      : isRunning
      ? `Stop ${scriptName}` // Display "Stop" when the script is fully running
      : `Run ${scriptName}`; // Default text
  
    return (
      <div style={{ display: "flex", gap: "10px", justifyContent: "space-between", width: "100%" }}>
        <button
          className={buttonClass}
          onClick={() =>
            isRunning
              ? stopScript(modulePath, scriptName)
              : runScript(modulePath, scriptName)
          }
        >
          {buttonText}
        </button>
        {isRunning === true && url && (
          <button className="running" onClick={() => window.open(url, "_blank")}>Open</button>
        )}
      </div>
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
              <div
                className={`module-card ${dragOverTarget === module.path ? "drag-over" : ""}`}
                key={module.path}
                draggable
                onDragStart={(event) => handleDragStart(event, module.path)}
                onDragOver={(event) => handleDragOver(event, module.path)}
                onDrop={(event) => handleDrop(event, module.path)}
                onDragLeave={handleDragLeave}
              >
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