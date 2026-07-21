import { contextBridge, ipcRenderer } from "electron";

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

  // Update dialog
  onUpdateInfo: (cb: (data: { version: string; status: string }) => void) =>
    ipcRenderer.on("update:info", (_, data) => cb(data)),
  onUpdateProgress: (cb: (data: { percent: number }) => void) =>
    ipcRenderer.on("update:progress", (_, data) => cb(data)),
  updateLater: () => ipcRenderer.send("update:later"),
  updateRestart: () => ipcRenderer.send("update:restart"),
});
