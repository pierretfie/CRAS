import { execSync, spawn } from "node:child_process";
import { dialog, shell, BrowserWindow } from "electron";
import process from "node:process";

/**
 * Check if pdflatex is available on the system.
 * Returns true if pdflatex is installed and accessible.
 */
export function isPdflatexAvailable(): boolean {
  try {
    const cmd = process.platform === "win32" ? "where pdflatex" : "which pdflatex";
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the recommended TeX installation command for the current platform.
 */
function getInstallCommand(): { command: string; url: string; description: string } {
  switch (process.platform) {
    case "linux":
      return {
        command: "sudo apt-get install -y texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended",
        url: "https://www.tug.org/texlive/acquire-netinstall.html",
        description:
          "Install TeX Live via your package manager:\n\n" +
          "sudo apt-get install -y texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended\n\n" +
          "Or download the installer from the TeX Live website.",
      };
    case "darwin":
      return {
        command: "brew install --cask mactex",
        url: "https://www.tug.org/mactex/",
        description:
          "Install MacTeX via Homebrew:\n\n" +
          "brew install --cask mactex\n\n" +
          "Or download from https://www.tug.org/mactex/",
      };
    case "win32":
      return {
        command: "",
        url: "https://www.tug.org/texlive/acquire-netinstall.html",
        description:
          "Download and install MiKTeX or TeX Live from:\n\n" +
          "https://miktex.org/download\n" +
          "or\n" +
          "https://www.tug.org/texlive/acquire-netinstall.html",
      };
    default:
      return {
        command: "",
        url: "https://www.tug.org/texlive/",
        description: "Please install a LaTeX distribution from https://www.tug.org/texlive/",
      };
  }
}

/**
 * Check for pdflatex and prompt the user to install if missing.
 * Returns true if pdflatex is available (either already installed or user installed it).
 */
export async function ensurePdflatex(parentWindow?: BrowserWindow | null): Promise<boolean> {
  if (isPdflatexAvailable()) {
    return true;
  }

  const installInfo = getInstallCommand();

  const result = await dialog.showMessageBox(parentWindow ?? BrowserWindow.getAllWindows()[0], {
    type: "warning",
    title: "LaTeX Not Found",
    message: "pdflatex is not installed",
    detail:
      "CRAS requires pdflatex to generate PDF reports.\n\n" +
      installInfo.description,
    buttons: ["Open Download Page", "I'll Install Later"],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    shell.openExternal(installInfo.url);
  }

  // Return false — caller should handle gracefully
  return false;
}

/**
 * Try to install pdflatex automatically (Linux only, requires sudo).
 * Returns true if installation succeeded, false otherwise.
 */
export async function tryAutoInstallPdflatex(parentWindow?: BrowserWindow | null): Promise<boolean> {
  if (process.platform !== "linux") {
    return false;
  }

  const result = await dialog.showMessageBox(parentWindow ?? BrowserWindow.getAllWindows()[0], {
    type: "question",
    title: "Install LaTeX?",
    message: "Would you like to install pdflatex automatically?",
    detail:
      "This requires administrator privileges (sudo).\n\n" +
      "Command: sudo apt-get install -y texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended",
    buttons: ["Install", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response !== 0) {
    return false;
  }

  return new Promise((resolve) => {
    const child = spawn(
      "bash",
      ["-c", "sudo apt-get update && sudo apt-get install -y texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended"],
      { stdio: "inherit" },
    );

    child.on("close", (code) => {
      if (code === 0 && isPdflatexAvailable()) {
        dialog.showMessageBox(parentWindow ?? BrowserWindow.getAllWindows()[0], {
          type: "info",
          title: "Installation Complete",
          message: "pdflatex has been installed successfully.",
          buttons: ["OK"],
        });
        resolve(true);
      } else {
        dialog.showMessageBox(parentWindow ?? BrowserWindow.getAllWindows()[0], {
          type: "error",
          title: "Installation Failed",
          message: "Failed to install pdflatex.",
          detail: "Please install manually using the instructions provided.",
          buttons: ["OK"],
        });
        resolve(false);
      }
    });

    child.on("error", () => {
      resolve(false);
    });
  });
}
