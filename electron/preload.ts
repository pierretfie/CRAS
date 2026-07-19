import { contextBridge, ipcRenderer } from "electron";

// ─── Expose protected methods to the renderer ────────────────────────────────
contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getVersion: () => ipcRenderer.invoke("app:version"),
  getPlatform: () => ipcRenderer.invoke("app:get-platform"),
  isDev: () => ipcRenderer.invoke("app:is-dev"),

  // App control
  quit: () => ipcRenderer.invoke("app:quit"),
  openDevTools: () => ipcRenderer.invoke("app:open-devtools"),

  // LaTeX
  checkLatex: () => ipcRenderer.invoke("app:check-latex"),
  installLatex: () => ipcRenderer.invoke("app:install-latex"),
});
