/**
 * Type declarations for the Electron API exposed via preload.ts.
 * Add this to your tsconfig.json "types" or import it where needed.
 */

export interface ElectronAPI {
  /** Get the app version from package.json */
  getVersion: () => Promise<string>;
  /** Get the current platform: "darwin", "linux", or "win32" */
  getPlatform: () => Promise<string>;
  /** Check if running in development mode */
  isDev: () => Promise<boolean>;

  /** Quit the application */
  quit: () => Promise<void>;
  /** Open Chrome DevTools (dev mode only) */
  openDevTools: () => Promise<void>;

  /** Check if pdflatex is installed */
  checkLatex: () => Promise<boolean>;
  /** Attempt to auto-install pdflatex (Linux only) */
  installLatex: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
