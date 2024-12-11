import React, { useEffect, useState } from "react";
import "./App.css";

const WS_BASE = "ws://localhost:4000";
const API_BASE = "http://localhost:4000/api";

function App() {
  const [modules, setModules] = useState([]);
  const [apps, setApps] = useState([]);

  const [running, setRunning] = useState({});
  const [search, setSearch] = useState("");
  const [selectedModules, setSelectedModules] = useState([]);
  const [selectedApps, setSelectedApps] = useState([]);
  const [moduleOrder, setModuleOrder] = useState([]);
  const [appOrder, setAppOrder] = useState([]);
  const [dragOverTarget, setDragOverTarget] = useState(null);


  useEffect(() => {
    loadModuleOrder();
    loadAppOrder();
    fetchModules();
    fetchApps();
    fetchRunningScripts();
    loadSelectedModules();
    loadSelectedApps();
    setupWebSocket();
  }, []);

  useEffect(() => {
    setModuleOrder(selectedModules);
  }, [selectedModules]);

  useEffect(() => {
    setAppOrder(selectedApps);
  }, [selectedApps]);

  useEffect(() => {
    saveAppOrder(appOrder);
  }, [appOrder]);

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

  const saveAppOrder = (appOrder) => {
    localStorage.setItem("appOrder", JSON.stringify(appOrder));
  } 

  const loadAppOrder = () => {
    const savedOrder = JSON.parse(localStorage.getItem("appOrder")) || [];
    setAppOrder(savedOrder);
  };

  const loadSelectedModules = () => {
    const savedModules = JSON.parse(localStorage.getItem("selectedModules")) || [];
    setSelectedModules(savedModules);
  };

  const saveSelectedModules = (updatedModules) => {
    localStorage.setItem("selectedModules", JSON.stringify(updatedModules));
  };

  const loadSelectedApps = () => {
    const savedApps = JSON.parse(localStorage.getItem("selectedApps")) || [];
    setSelectedApps(savedApps);
  };

  const saveSelectedApps = (updatedApps) => {
    localStorage.setItem("selectedApps", JSON.stringify(updatedApps));
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

      if (message.type === "install-progress") {
        console.log(`Installation progress for ${message.directory}: ${message.message}`);
      }

      if (message.type === "link-progress") {
        console.log(`Linking progress for ${message.directory}: ${message.message}`);
      }

    };

    return () => ws.close();
  };

  const fetchModules = async () => {
    const response = await fetch(`${API_BASE}/modules`);
    const data = await response.json();
    console.log("fetched modules: ", data);
    setModules(data);
  };

  const fetchApps = async () => {
    const response = await fetch(`${API_BASE}/apps`);
    const data = await response.json();
    console.log("fetched apps: ",data);
    setApps(data);
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

  const toggleModuleSelection = (modulePath) => {
    const updatedSelection = selectedModules.includes(modulePath)
      ? selectedModules.filter((path) => path !== modulePath)
      : [...selectedModules, modulePath];

    setSelectedModules(updatedSelection);
    saveSelectedModules(updatedSelection);
  };

  const toggleAppSelection = (appPath) => {
    const updatedSelection = selectedApps.includes(appPath)
      ? selectedApps.filter((path) => path !== appPath)
      : [...selectedApps, appPath];

    setSelectedApps(updatedSelection);
    saveSelectedApps(updatedSelection);
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

  const filteredApps = apps.filter((app) =>
    app.name.toLowerCase().includes(search.toLowerCase())
  );

  const displayedApps = apps
  .filter((app) => appOrder.includes(app.path))
  .sort((a, b) => appOrder.indexOf(a.path) - appOrder.indexOf(b.path));


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

  const renderModuleSideList = () => {
    return (
      <>
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
        </>
    );
  }

  const renderAppSideList = () => {
    return (
      <>
        <div className="select-all-container">
            <label>
            Select All Apps
            <input
                className="select-all-checkbox"
                type="checkbox"
                checked={filteredApps.every((app) => selectedApps.includes(app.path)) && filteredApps.length > 0}
                onChange={(e) => {
                const allFilteredPaths = filteredApps.map((app) => app.path);
                if (e.target.checked) {
                    const updatedSelection = [...new Set([...selectedApps, ...allFilteredPaths])];
                    console.log("checked updatedSelection ", updatedSelection);

                    setSelectedApps(updatedSelection);
                    saveSelectedApps(updatedSelection);
                } else {
                    const updatedSelection = selectedApps.filter((path) => !allFilteredPaths.includes(path));
                    console.log("not checked updatedSelection ", updatedSelection);

                    setSelectedApps(updatedSelection);
                    saveSelectedApps(updatedSelection);
                }
                }}
            />
            </label>
          </div>
          <ul>
            {filteredApps.map((app) => (
              <li key={app.path}>
                <label className={selectedApps.includes(app.path) ? "selected" : ""} >
                  <input
                    className="module-checkbox"
                    type="checkbox"
                    checked={selectedApps.includes(app.path)}
                    onChange={() => toggleAppSelection(app.path)}
                  />
                  {app.name}
                </label>
              </li>
            ))}
          </ul>
        </>
    );
  }

  const renderModules = () => {
    return (
      <>
        <h2>Modules</h2>
        <div className="modules">
            {displayedModules.map((module) => (
              <div
                className={`card ${dragOverTarget === module.path ? "drag-over" : ""}`}
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
      </>
    );
  };

  const renderApps = () => {
    return (
      <>
        <h2>Apps</h2>
        <div className="modules">
            {displayedApps.map((app) => (
              <div
                className={`card ${dragOverTarget === app.path ? "drag-over" : ""}`}
                key={app.path}
                draggable
                onDragStart={(event) => handleDragStart(event, app.path)}
                onDragOver={(event) => handleDragOver(event, app.path)}
                onDrop={(event) => handleDrop(event, app.path)}
                onDragLeave={handleDragLeave}
              >
                <h2>{app.name}</h2>
                <p>Path: {app.path.substring(app.path.indexOf("/Apps"))}</p>
                <h3>Scripts</h3>
                <ul>
                  {Object.entries(app.scripts).map(([scriptName]) => (
                    <li key={scriptName}>{renderScriptButtons(app.path, scriptName)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
      </>
    );
  };

  const installDependencies = async (target) => {
    let paths = [];
  
    if (target === "modules") {
      paths = modules.map((module) => module.path);
    } else if (target === "apps") {
      paths = apps.map((app) => app.path);
    } else if (target === "selectedModules") {
      paths = selectedModules;
    } else if (target === "selectedApps") {
      paths = selectedApps;
    }
  
    if (paths.length === 0) {
      // alert("No paths to install dependencies for.");
      return;
    }
  
    try {
      const response = await fetch(`${API_BASE}/install-dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
  
      const data = await response.json();
      if (data.success) {
        alert("Dependencies installed successfully.");
        console.log("Installation results:", data.results);
      } else {
        alert("Some installations failed.");
        console.error(data.error);
      }
    } catch (error) {
      alert("Error installing dependencies.");
      console.error(error);
    }
  };

  const switchToLocalFiles = async (target) => {
    let paths = [];
  
    if (target === "modules") {
      paths = modules.map((module) => module.path);
      console.log("modules", paths);
    } else if (target === "selectedModules") {
      paths = selectedModules;
      console.log("modules", selectedModules);

    }

    paths.concat(apps.map((app) => app.path));
  
    if (paths.length === 0) {
      alert("No paths to link.");
      return;
    }
  
    try {
      const response = await fetch(`${API_BASE}/switch-to-local-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
  
      const data = await response.json();
      if (data.success) {
        alert("Modules successfully linked.");
        console.log("Linking results:", data);
      } else {
        alert("Some linking operations failed.");
        console.error(data.error);
      }
    } catch (error) {
      alert("Error during linking.");
      console.error(error);
    }
  };

  const renderGlobalCommands = () => {
    return (
      <>
        <h2>Global Commands</h2>
        <ul>
          <li>
            {/* <button onClick={ () => installDependencies("modules")}>
              NPM I All Modules 
            </button>
            <button onClick={ () => installDependencies("apps")}>
              NPM I All Apps
            </button> */}
            <button className="command-button" onClick={ () => installDependencies("selectedModules")}>
              npm i Selected Modules
            </button>
            <button className="command-button" onClick={ () => installDependencies("selectedApps")}>
              npm i Selected Apps
            </button>

            <button className="command-button" onClick={ () => switchToLocalFiles("selectedModules")}>
              use local files modules
            </button>
            <button className="command-button" onClick={ () => switchToLocalFiles("selectedApps")}>
              use local files apps
            </button>
          </li>
        </ul>
      </>
    );
  };

  return (
    <div className="App">
      
      <div className="content">
        <aside className="side-panel">
          {/* <header>
              <h1>Menu</h1>
          </header> */}
          {renderGlobalCommands()}
          <input
            className="search-input"
            type="text"
            placeholder="Search modules or apps"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {renderModuleSideList()}
          {renderAppSideList()}
        </aside>
        <main>
          {renderModules()}
          {renderApps()}
          
        </main>
      </div>
    </div>
  );
}

export default App;