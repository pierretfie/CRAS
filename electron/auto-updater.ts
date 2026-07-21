import electronUpdater from "electron-updater";
import { BrowserWindow, dialog } from "electron";
import log from "electron-log";

const { autoUpdater } = electronUpdater;

// Configure logging for auto-updater
autoUpdater.logger = log;

/**
 * Initialize auto-update checking.
 * Call this once after the main window is created.
 */
export function initAutoUpdate(mainWindow: BrowserWindow): void {
  // Check for updates on startup (after a short delay so the app loads first)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);

  // Check for updates every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdate] Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[AutoUpdate] Update available: ${info.version}`);
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `A new version (${info.version}) is available.`,
      detail: "It will be downloaded in the background. You'll be prompted to install when it's ready.",
      buttons: ["OK"],
    });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[AutoUpdate] App is up to date");
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(`[AutoUpdate] Download progress: ${Math.round(progress.percent)}%`);
    mainWindow.setProgressBar(progress.percent / 100);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[AutoUpdate] Update downloaded: ${info.version}`);
    mainWindow.setProgressBar(-1);

    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: "A new version has been downloaded.",
        detail: "Would you like to restart and install the update now?",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdate] Error:", err);
  });
}

/**
 * Manually check for updates (e.g., from a menu item).
 */
export function checkForUpdates(): void {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("[AutoUpdate] Manual check failed:", err);
  });
}
