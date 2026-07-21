import electronUpdater from "electron-updater";
import { BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { autoUpdater } = electronUpdater;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let updateDialog: BrowserWindow | null = null;
let updateVersion = "";

function createUpdateDialog(): BrowserWindow {
  if (updateDialog && !updateDialog.isDestroyed()) {
    updateDialog.focus();
    return updateDialog;
  }

  updateDialog = new BrowserWindow({
    width: 460,
    height: 320,
    resizable: false,
    frame: false,
    transparent: false,
    modal: true,
    skipTaskbar: true,
    center: true,
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  updateDialog.loadFile(path.join(__dirname, "update-dialog.html"));
  updateDialog.on("closed", () => { updateDialog = null; });

  return updateDialog;
}

function sendToDialog(channel: string, ...args: unknown[]) {
  if (updateDialog && !updateDialog.isDestroyed()) {
    updateDialog.webContents.send(channel, ...args);
  }
}

ipcMain.on("update:later", () => {
  updateDialog?.close();
});

ipcMain.on("update:restart", () => {
  autoUpdater.quitAndInstall(false, true);
});

export function initAutoUpdate(mainWindow: BrowserWindow): void {
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);

  autoUpdater.on("update-available", (info) => {
    updateVersion = info.version;
    const dialog = createUpdateDialog();
    dialog.webContents.on("did-finish-load", () => {
      dialog.webContents.send("update:info", {
        version: info.version,
        status: "available",
      });
    });

    autoUpdater.downloadUpdate().catch(() => {});
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToDialog("update:progress", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    sendToDialog("update:info", {
      version: updateVersion,
      status: "downloaded",
    });
  });

  autoUpdater.on("error", () => {});
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch(() => {});
}
