# DEV Module Dashboard

A web-based dashboard to manage and execute scripts from `package.json` files across multiple modules in a structured directory. The configuration and setup have been simplified to allow easy customization of the modules directory path.

---

## Features

- **Search Modules:** Quickly find modules using the search bar.
- **Select All:** Select or deselect all filtered modules with a single checkbox.
- **Run/Stop Scripts:** Run or stop `npm` scripts directly from the dashboard.
- **Persistent Selections:** Selected modules are remembered even after a page reload.
- **Configurable Modules Path:** Specify the location of the modules directory via `config.json`.

---

## Project Structure

```plaintext
root/
├── server.js        # Backend server file
├── config.json      # Configuration file to set the modules path
├── frontend/
│   ├── src/         # React application source code
│   ├── public/      # Public assets for the frontend
│   ├── build/       # Build files generated after running `npm run build`
```

---

## Prerequisites

Ensure you have the following installed on your machine:

- **Node.js** (v16 or later)
- **npm** (v8 or later)

---

## Setup

1. **Edit Configuration:**
   Open the `config.json` file and set the `modulesPath` to the absolute or relative path of your modules directory:
   ```json
   {
       "modulesPath": "/absolute/path/to/modules"
   }
   ```

2. **Install Dependencies:**
   - Navigate to the root folder and install dependencies:
     ```bash
     npm install
     ```

   - Navigate to the `frontend` folder and install dependencies:
     ```bash
     cd frontend
     npm install
     ```

3. **Build the Frontend:**
   Inside the `frontend` folder, build the React application:
   ```bash
   npm run build
   ```

4. **Start the Server:**
   From the root folder, run:
   ```bash
   node server.js
   ```

5. **Access the Dashboard:**
   Open your browser and navigate to:
   ```
   http://localhost:4000
   ```

---

## Directory Configuration

The modules directory is configured via `config.json`. Ensure the `modulesPath` is correctly set to point to your desired modules directory.

**Example directory structure for modules:**
```plaintext
Modules/
├── Category1/
│   ├── Module1/
│   │   ├── package.json
│   ├── Module2/
│       ├── package.json
├── Category2/
│   ├── Module3/
│       ├── package.json
```

---

## API Endpoints

### 1. `/api/modules` (GET)
- **Description:** Retrieves all modules with their respective `scripts`.
- **Response Example:**
  ```json
  [
    {
      "name": "module1",
      "path": "/path/to/module1",
      "scripts": {
        "start": "node index.js",
        "test": "jest"
      }
    }
  ]
  ```

### 2. `/api/running-scripts` (GET)
- **Description:** Retrieves a list of currently running scripts.
- **Response Example:**
  ```json
  [
    {
      "modulePath": "/path/to/module1",
      "script": "start"
    }
  ]
  ```

### 3. `/api/run-script` (POST)
- **Description:** Starts a script for a specified module.
- **Request Body Example:**
  ```json
  {
      "modulePath": "/path/to/module1",
      "script": "start"
  }
  ```

### 4. `/api/stop-script` (POST)
- **Description:** Stops a running script for a specified module.
- **Request Body Example:**
  ```json
  {
      "modulePath": "/path/to/module1"
  }
  ```

---

## Frontend Usage

### Selecting Modules

1. **Search:** Use the search bar in the side panel to filter modules by name.
2. **Select All:** Use the "Select All Modules" checkbox to select or deselect all filtered modules.
3. **Individual Selection:** Use individual checkboxes to select specific modules.

### Running/Stopping Scripts

1. After selecting modules, their details appear in the main content area.
2. Click the **Run** button to start a script. The button will change to **Stop**.
3. Click the **Stop** button to terminate the running script.

---

## Known Issues and Future Improvements

- **Script Errors:** Ensure the modules have valid `package.json` files with scripts defined.
- **Process Persistence:** Running scripts do not persist if the server restarts.

---
