import electronUpdater from "electron-updater";
import { BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { autoUpdater } = electronUpdater;
const isLinux = process.platform === "linux";

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

  const preloadCjs = path.join(__dirname, "preload.cjs");
  const preloadJs = path.join(__dirname, "preload.js");
  const preloadPath = fs.existsSync(preloadCjs) ? preloadCjs : preloadJs;
  updateDialog = new BrowserWindow({
    width: 520,
    height: 380,
    resizable: false,
    frame: true,
    skipTaskbar: true,
    center: true,
    backgroundColor: "#1a1d23",
    parent: mainWindowRef ?? undefined,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDialogHtmlAvailable()) {
    updateDialog.loadFile(dialogHtmlPath);
  } else {
    // Fallback uses theme colors (oklch red primary) and a fitting layout — same structure as update-dialog.html
    updateDialog.loadURL(
      `data:text/html,${encodeURIComponent(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        :root{--bg:oklch(0.16 0.01 260);--card:oklch(0.20 0.012 260);--primary:oklch(0.62 0.23 25);--primary-fg:oklch(0.99 0 0);--secondary:oklch(0.26 0.012 260);--muted:oklch(0.24 0.01 260);--muted-fg:oklch(0.70 0.012 260);--border:oklch(0.28 0.01 260);--radius:0.625rem}
        *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:var(--bg);color:oklch(0.98 0 0);display:flex;align-items:center;justify-content:center;min-height:100vh}
        .d{width:480px;max-width:92vw;padding:28px;background:var(--card);border-radius:var(--radius);border:1px solid var(--border);box-shadow:0 20px 60px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:18px}
        .h{display:flex;gap:14px;align-items:flex-start}.i{width:44px;height:44px;border-radius:10px;background:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0}.i svg{width:22px;height:22px;fill:var(--primary-fg)}
        .t{font-size:11px;font-weight:600;color:var(--muted-fg);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}.v{font-size:18px;font-weight:700}.dsc{font-size:13px;color:var(--muted-fg);line-height:1.6}
        .p{display:none}.p.on{display:block}.ph{display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px;color:var(--muted-fg)}.bar{width:100%;height:6px;background:var(--muted);border-radius:999px;overflow:hidden}.fill{height:100%;width:0%;background:var(--primary);border-radius:999px;transition:width 0.3s}
        .btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:4px}.b{padding:9px 16px;border-radius:calc(var(--radius) - 2px);border:1px solid transparent;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
        .b-skip{background:transparent;color:oklch(0.62 0.23 25);border-color:color-mix(in oklch, oklch(0.62 0.23 25) 30%, transparent);margin-right:auto}.b-sec{background:var(--secondary);color:oklch(0.98 0 0);border-color:var(--border)}.b-pri{background:var(--primary);color:var(--primary-fg)}.b-pri:disabled{opacity:0.45;cursor:not-allowed}
        </style></head><body><div class="d">
        <div class="h"><div class="i"><svg viewBox="0 0 24 24"><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1 14.5v-2h2v2h-2zm0-4V7h2v5.5h-2z"/></svg></div>
        <div style="flex:1"><div class="t">Update Available</div><div class="v" id="version">Checking…</div></div></div>
        <div class="dsc" id="description">A new version of CRAS is ready.</div>
        <div class="p" id="progress"><div class="ph"><span id="progress-text">Downloading…</span><span id="progress-percent">0%</span></div><div class="bar"><div class="fill" id="progress-fill"></div></div></div>
        <div class="btns"><button class="b b-skip" id="btn-skip">Skip this version</button><button class="b b-sec" id="btn-later" style="display:none">Later</button><button class="b b-pri" id="btn-restart" disabled>Restart & Install</button></div>
        </div><script>
        var v=document.getElementById('version'),d=document.getElementById('description'),p=document.getElementById('progress'),pp=document.getElementById('progress-percent'),pt=document.getElementById('progress-text'),pf=document.getElementById('progress-fill'),br=document.getElementById('btn-restart'),bl=document.getElementById('btn-later'),bs=document.getElementById('btn-skip');
        function s(){if(!window.electronAPI) return setTimeout(s,100);
        window.electronAPI.onUpdateInfo(function(a){v.textContent='v'+a.version;if(a.status==='downloaded'){d.textContent='Update downloaded and ready to install. Restart to apply.';p.classList.remove('on');br.disabled=false;bs.style.display='none';bl.style.display='inline-block';bl.textContent='Close';pf.style.width='100%';pp.textContent='100%';pt.textContent='Ready to install';}else{v.textContent='v'+a.version;d.textContent='Downloading update… You can continue working.';p.classList.add('on');br.disabled=true;}});
        window.electronAPI.onUpdateProgress(function(a){p.classList.add('on');pf.style.width=a.percent+'%';pp.textContent=a.percent+'%';pt.textContent=a.percent<100?'Downloading…':'Download complete';});
        br.addEventListener('click',function(e){e.preventDefault();if(!br.disabled) window.electronAPI.updateRestart();});
        bl.addEventListener('click',function(e){e.preventDefault();window.electronAPI.updateLater();});
        bs.addEventListener('click',function(e){e.preventDefault();window.electronAPI.updateSkip();});}
        s();<\/script></body></html>`)}`,
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

    // Linux: show native dialog, then download silently
    if (isLinux) {
      dialog.showMessageBox(mainWindowRef!, {
        type: "info",
        title: "Update Available",
        message: `A new version (${info.version}) is available.`,
        detail: "It will be downloaded in the background. You'll be prompted to install when it's ready.",
        buttons: ["Ok"],
      });
      autoUpdater.downloadUpdate().catch(() => {});
      return;
    }

    // Windows: show custom splash dialog
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
    // Linux: no progress dialog — runs silently in background
    if (isLinux) return;
    sendToDialog("update:progress", {
      percent: pct,
      transferred: progress.transferred,
      total: progress.total,
    });
    updateFallbackDialog(pct, `Downloading update... ${pct}%`);
  });

  autoUpdater.on("update-downloaded", () => {
    // Linux: prompt native dialog to restart
    if (isLinux) {
      dialog.showMessageBox(mainWindowRef!, {
        type: "info",
        title: "Update Ready",
        message: "Update has been downloaded.",
        detail: "The app will restart to install the update.",
        buttons: ["Restart Now", "Later"],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true);
      });
      return;
    }

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
