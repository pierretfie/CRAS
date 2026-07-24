import electronUpdater from "electron-updater";
import { BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { autoUpdater } = electronUpdater;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let updateDialog: BrowserWindow | null = null;
let updateVersion = "";
let mainWindowRef: BrowserWindow | null = null;
let skippedVersions: Set<string> = new Set();

const dialogHtmlPath = path.join(__dirname, "update-dialog.html");
const SKIP_FILE = path.join(__dirname, ".skip-update");

function isDialogHtmlAvailable(): boolean {
  try {
    return fs.existsSync(dialogHtmlPath);
  } catch {
    return false;
  }
}

function sendToDialog(channel: string, ...args: unknown[]) {
  if (updateDialog && !updateDialog.isDestroyed()) {
    updateDialog.webContents.send(channel, ...args);
  }
}

function updateFallbackDialog(percent: number, status: string) {
  if (!updateDialog || updateDialog.isDestroyed()) return;
  if (!isDialogHtmlAvailable()) {
    updateDialog.webContents.executeJavaScript(
      `document.getElementById('bar').style.width='${percent}%';document.getElementById('status').textContent='${status}';`,
    );
  }
}

function createUpdateDialog(): BrowserWindow {
  if (updateDialog && !updateDialog.isDestroyed()) {
    updateDialog.focus();
    return updateDialog;
  }

  updateDialog = new BrowserWindow({
    width: 460,
    height: 320,
    resizable: false,
    frame: true,
    skipTaskbar: true,
    center: true,
    backgroundColor: "#1a1a2e",
    parent: mainWindowRef ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDialogHtmlAvailable()) {
    updateDialog.loadFile(dialogHtmlPath);
  } else {
    updateDialog.loadURL(
      `data:text/html,${encodeURIComponent(`<html><body style="font-family:system-ui;padding:30px;background:#1a1a2e;color:#fff;text-align:center;">
        <h3 style="margin:0 0 12px;">Update Available</h3>
        <p id="status" style="color:#aaa;margin:0 0 20px;">Preparing download...</p>
        <div style="background:#333;border-radius:4px;height:6px;margin-bottom:20px;overflow:hidden;">
          <div id="bar" style="background:#4ec9b0;height:100%;width:0%;transition:width 0.3s;"></div>
        </div>
        <button id="btn" onclick="window.electronAPI?.updateRestart?.()" style="display:none;padding:10px 24px;background:#4ec9b0;color:#000;border:none;border-radius:6px;font-size:14px;cursor:pointer;">Restart & Install</button>
        <button onclick="window.electronAPI?.updateLater?.()" style="padding:10px 24px;background:transparent;color:#888;border:1px solid #444;border-radius:6px;font-size:14px;cursor:pointer;margin-left:8px;">Later</button>
      </body></html>`)}`,
    );
  }

  updateDialog.on("closed", () => { updateDialog = null; });
  return updateDialog;
}

// ── Later / Skip ────────────────────────────────────────────────────────────
// "Later" dismisses the dialog. If download hasn't finished, it keeps downloading
// in the background so the update is ready on next launch.
ipcMain.on("update:later", () => {
  if (updateDialog && !updateDialog.isDestroyed()) {
    updateDialog.close();
  }
});

// ── Skip this version ──────────────────────────────────────────────────────
ipcMain.on("update:skip", () => {
  if (updateVersion) {
    skippedVersions.add(updateVersion);
    try { fs.writeFileSync(SKIP_FILE, updateVersion); } catch {}
  }
  if (updateDialog && !updateDialog.isDestroyed()) {
    updateDialog.close();
  }
});

ipcMain.on("update:restart", () => {
  autoUpdater.quitAndInstall(false, true);
});

export function initAutoUpdate(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  // Load previously skipped version
  try {
    if (fs.existsSync(SKIP_FILE)) {
      const v = fs.readFileSync(SKIP_FILE, "utf-8").trim();
      if (v) skippedVersions.add(v);
    }
  } catch {}

  // Check after 10s, then every 4 hours
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);

  autoUpdater.on("update-available", (info) => {
    // Skip if user chose to skip this version
    if (skippedVersions.has(info.version)) return;

    updateVersion = info.version;
    const dlg = createUpdateDialog();

    dlg.webContents.on("did-finish-load", () => {
      dlg.webContents.send("update:info", {
        version: info.version,
        status: "available",
      });
    });

    // Start download
    autoUpdater.downloadUpdate().catch(() => {});
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent);
    sendToDialog("update:progress", {
      percent: pct,
      transferred: progress.transferred,
      total: progress.total,
    });
    updateFallbackDialog(pct, `Downloading update... ${pct}%`);
  });

  autoUpdater.on("update-downloaded", () => {
    sendToDialog("update:info", {
      version: updateVersion,
      status: "downloaded",
    });
    if (!isDialogHtmlAvailable() && updateDialog && !updateDialog.isDestroyed()) {
      updateDialog.webContents.executeJavaScript(
        `document.getElementById('btn').style.display='inline-block';document.getElementById('status').textContent='Update ready! Click Restart & Install.';document.getElementById('bar').style.width='100%';`,
      );
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdater]", err.message);
  });
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch(() => {});
}
