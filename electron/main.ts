import { app, BrowserWindow, ipcMain, shell, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, fork, type ChildProcess } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import { initAutoUpdate } from "./auto-updater.js";
import { ensurePdflatex, isPdflatexAvailable, tryAutoInstallPdflatex } from "./latex-installer.js";

// ─── ESM equivalents for __dirname ────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Single instance lock ─────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Global state ─────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let serverPort = 0;
const isDev = !app.isPackaged;

// ─── Find an available port ───────────────────────────────────────────────────
function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

// ─── Wait for server to be ready ──────────────────────────────────────────────
function waitForServer(
  url: string,
  maxRetries = 60,
  intervalMs = 500,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // Server not ready yet
      }
      retries++;
      if (retries >= maxRetries) {
        reject(new Error(`Server did not start within ${maxRetries * intervalMs / 1000}s`));
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

// ─── Start the TanStack Start server ─────────────────────────────────────────
async function startServer(): Promise<number> {
  const port = await findAvailablePort();

  if (isDev) {
    console.log(`[Electron] Starting Vite dev server on port ${port}...`);

    serverProcess = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
      },
      stdio: "inherit",
    });

    serverProcess.on("error", (err) => {
      console.error("[Electron] Failed to start dev server:", err);
    });

    serverProcess.on("exit", (code) => {
      console.log(`[Electron] Dev server exited with code ${code}`);
      serverProcess = null;
    });

    await waitForServer(`http://127.0.0.1:${port}`);
    console.log(`[Electron] Dev server ready on port ${port}`);
  } else {
    // Production: run the bundled server
    const serverPath = path.join(process.resourcesPath, "server", "entry.mjs");

    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server not found at ${serverPath}`);
    }

    console.log(`[Electron] Starting production server from ${serverPath}...`);

    // Load .env from resources if it exists
    const envPath = path.join(process.resourcesPath, ".env");
    const envOverrides: Record<string, string> = {};
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        envOverrides[key] = value;
      }
    }

    // Use port 0 so the OS picks a free port — avoids race conditions
    const actualPortPromise = new Promise<number>((resolve) => {
      const onOutput = (data: string) => {
        const match = data.match(/PORT:(\d+)/);
        if (match) {
          resolve(parseInt(match[1], 10));
        }
      };
      const onExit = () => resolve(0);

      if (process.platform === "win32") {
        // Windows: use child_process.fork() which uses Electron's bundled Node.js
        // (no FD_SETSIZE issue on Windows, safe to use Electron's Node.js)
        const proc = fork(serverPath, [], {
          cwd: path.join(process.resourcesPath),
          env: {
            ...envOverrides,
            PORT: "0",
            HOST: "127.0.0.1",
            NODE_ENV: "production",
          },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        proc.stdout?.on("data", (data) => {
          const str = data.toString();
          console.log("[Server]", str.trim());
          onOutput(str);
        });
        proc.stderr?.on("data", (data) => console.error("[Server]", data.toString().trim()));
        proc.on("message", (msg: Record<string, unknown>) => {
          if (msg && msg.type === "port" && typeof msg.port === "number") {
            onOutput(`PORT:${msg.port}`);
          }
        });
        proc.on("error", (err) => console.error("[Electron] Server error:", err.message));
        proc.on("exit", (code, signal) => {
          console.log(`[Electron] Server exited code=${code} signal=${signal}`);
          serverProcess = null;
        });
        serverProcess = proc;
        // Fallback: if no PORT message arrives, use waitForServer
        setTimeout(() => onExit(), 2000);
      } else {
        // Linux/Mac: use system node (avoids Electron's FD_SETSIZE limit)
        console.log("[Electron] Using system node: node");
        const proc = spawn("node", [serverPath], {
          detached: true,
          cwd: path.join(process.resourcesPath),
          env: {
            ...envOverrides,
            PORT: "0",
            HOST: "127.0.0.1",
            NODE_ENV: "production",
            PATH: process.env.PATH,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        proc.stdout?.on("data", (data) => {
          const str = data.toString();
          console.log("[Server]", str.trim());
          onOutput(str);
        });
        proc.stderr?.on("data", (data) => console.error("[Server]", data.toString().trim()));
        proc.on("error", (err) => console.error("[Electron] Server error:", err.message));
        proc.on("exit", (code, signal) => {
          console.log(`[Electron] Server exited code=${code} signal=${signal}`);
          serverProcess = null;
        });
        serverProcess = proc;
        // Fallback: if no PORT: message arrives, use waitForServer
        setTimeout(() => onExit(), 2000);
      }
    });

    // Wait for server to report its port (or timeout)
    serverPort = await actualPortPromise;
    if (serverPort === 0) {
      console.log("[Electron] Did not receive PORT message, waiting for server...");
      await waitForServer(`http://127.0.0.1:${port}`);
      serverPort = port;
    }
    console.log(`[Electron] Production server ready on port ${serverPort}`);
  }

  return serverPort;
}

// ─── Stop the server ─────────────────────────────────────────────────────────
function stopServer(): void {
  if (serverProcess) {
    console.log("[Electron] Stopping server...");
    if (process.platform !== "win32") {
      try {
        process.kill(-serverProcess.pid!, "SIGTERM");
      } catch {
        serverProcess.kill("SIGTERM");
      }
    } else {
      serverProcess.kill("SIGTERM");
    }

    setTimeout(() => {
      if (serverProcess) {
        if (process.platform !== "win32") {
          try {
            process.kill(-serverProcess.pid!, "SIGKILL");
          } catch {
            serverProcess.kill("SIGKILL");
          }
        } else {
          serverProcess.kill("SIGKILL");
        }
        serverProcess = null;
      }
    }, 5000);
  }
}

// ─── Create the main window ──────────────────────────────────────────────────
async function createWindow(): Promise<void> {
  // Start the server first
  serverPort = await startServer();

  // Create the browser window
  const iconPath = isDev
    ? path.join(__dirname, "..", "src", "assets", "cras_logo.png")
    : path.join(process.resourcesPath, "icon.png");

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "CRAS - Conversion Rate Analytics System",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: true,
  });

  const url = `http://127.0.0.1:${serverPort}`;
  await mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Check pdflatex AFTER window exists so dialogs have a parent
  if (!isPdflatexAvailable()) {
    await ensurePdflatex(mainWindow);
  }

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Initialize auto-update (production only)
  if (!isDev) {
    initAutoUpdate(mainWindow);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopServer();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  stopServer();
});

// ─── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:quit", () => app.quit());
ipcMain.handle("app:open-devtools", () => mainWindow?.webContents.openDevTools());
ipcMain.handle("app:is-dev", () => isDev);
ipcMain.handle("app:get-platform", () => process.platform);
ipcMain.handle("app:check-latex", () => isPdflatexAvailable());
ipcMain.handle("app:install-latex", async () => {
  return tryAutoInstallPdflatex(mainWindow);
});
