import { execSync, spawn } from "node:child_process";
import { dialog, shell, BrowserWindow } from "electron";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import http from "node:http";

// MiKTeX packages required by CRAS PDF templates
const REQUIRED_MIKTEX_PACKAGES = [
  "geometry",
  "xcolor",
  "titlesec",
  "fancyhdr",
  "booktabs",
  "tabularx",
  "graphicx",
  "enumitem",
  "hyperref",
  "parskip",
  "colortbl",
];

const MIKTEX_INSTALLER_URL =
  "https://miktex.org/download/ctan/systems/win32/miktex/setup/windows-x64/basic-miktex-25.12-x64.exe";

const MIKTEX_INSTALL_DIR = path.join(
  process.env.ProgramFiles || "C:\\Program Files",
  "MiKTeX",
);

/**
 * Check if pdflatex is available on the system.
 */
export function isPdflatexAvailable(): boolean {
  // First check PATH
  try {
    const cmd = process.platform === "win32" ? "where pdflatex" : "which pdflatex";
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    // Not in PATH — check common MiKTeX install location
    if (process.platform === "win32") {
      const miktexPdflatex = path.join(
        process.env.ProgramFiles || "C:\\Program Files",
        "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe",
      );
      if (fs.existsSync(miktexPdflatex)) {
        // Add to PATH so child processes can find it
        const miktexBin = path.dirname(miktexPdflatex);
        process.env.PATH = miktexBin + ";" + (process.env.PATH || "");
        return true;
      }
    }
    return false;
  }
}

/**
 * Check if MiKTeX is installed by looking for mpm.exe or pdflatex in MiKTeX dir.
 */
function isMiKTeXInstalled(): boolean {
  if (process.platform !== "win32") return false;
  const mpm = path.join(MIKTEX_INSTALL_DIR, "miktex", "bin", "x64", "mpm.exe");
  return fs.existsSync(mpm);
}

/**
 * Get the miktex package manager binary path.
 */
function getMpmPath(): string {
  return path.join(MIKTEX_INSTALL_DIR, "miktex", "bin", "x64", "mpm.exe");
}

/**
 * Get the initexmf binary path.
 */
function getInitexmfPath(): string {
  return path.join(MIKTEX_INSTALL_DIR, "miktex", "bin", "x64", "initexmf.exe");
}

/**
 * Get the pdflatex binary path in MiKTeX.
 */
function getPdflatexPath(): string {
  return path.join(MIKTEX_INSTALL_DIR, "miktex", "bin", "x64", "pdflatex.exe");
}

/**
 * Download a file from a URL to a local path.
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const request = protocol.get(url, { headers: { "User-Agent": "CRAS/1.0" } }, (response) => {
      // Handle redirects
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
      file.on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
    request.on("error", reject);
    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error("Download timed out"));
    });
  });
}

/**
 * Run a command and return stdout.
 */
function runCommand(cmd: string, args: string[], options?: { timeout?: number }): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: options?.timeout,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on("error", () => {
      resolve({ stdout, stderr: "Failed to spawn process", code: 1 });
    });
  });
}

/**
 * Install MiKTeX silently on Windows.
 */
async function installMiKTeXSilently(parentWindow?: BrowserWindow | null): Promise<boolean> {
  const win = parentWindow ?? BrowserWindow.getAllWindows()[0];

  // Ask user for permission
  const result = await dialog.showMessageBox(win, {
    type: "question",
    title: "Install MiKTeX?",
    message: "CRAS needs MiKTeX (~140 MB) to generate PDF reports.",
    detail:
      "MiKTeX will be downloaded and installed silently. This takes about 1-2 minutes.\n\n" +
      "Location: " + MIKTEX_INSTALL_DIR,
    buttons: ["Install MiKTeX", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response !== 0) return false;

  // Show progress window
  const progressWin = new BrowserWindow({
    width: 420,
    height: 180,
    parent: win,
    modal: true,
    resizable: false,
    closable: true,
    title: "Installing MiKTeX",
    webPreferences: { nodeIntegration: false },
  });
  // Prevent closing during install — will be re-enabled on completion
  let installDone = false;
  progressWin.on("close", (e) => {
    if (!installDone) e.preventDefault();
  });
  progressWin.setMenuBarVisibility(false);
  progressWin.loadURL(
    `data:text/html,${encodeURIComponent(`
      <html><body style="font-family:system-ui;padding:30px;background:#1e1e1e;color:#fff;text-align:center;">
        <h3 style="margin:0 0 10px;">Installing MiKTeX...</h3>
        <p style="color:#aaa;margin:0;" id="status">Downloading installer (~140 MB)...</p>
        <div style="background:#333;border-radius:4px;height:6px;margin-top:16px;overflow:hidden;">
          <div id="bar" style="background:#4ec9b0;height:100%;width:0%;transition:width 0.3s;"></div>
        </div>
      </body></html>
    `)}`,
  );

  const updateProgress = (pct: number, msg: string) => {
    if (!progressWin.isDestroyed()) {
      progressWin.webContents.executeJavaScript(
        `document.getElementById('bar').style.width='${pct}%';document.getElementById('status').textContent='${msg}';`,
      );
    }
  };

  try {
    // 1. Download installer
    const installerDir = path.join(process.env.TEMP || process.env.TMP || ".", "cras-miktex-install");
    if (!fs.existsSync(installerDir)) fs.mkdirSync(installerDir, { recursive: true });
    const installerPath = path.join(installerDir, "basic-miktex-25.12-x64.exe");

    if (!fs.existsSync(installerPath)) {
      updateProgress(10, "Downloading MiKTeX installer (~140 MB)...");
      await downloadFile(MIKTEX_INSTALLER_URL, installerPath);
    }

    updateProgress(50, "Installing MiKTeX silently...");

    // 2. Run silent install with correct MiKTeX flags
    const installResult = await runCommand(installerPath, [
      "--unattended",
      "--common-install", MIKTEX_INSTALL_DIR,
      "--auto-install=yes",
      "--shared",
      "--paper-size=A4",
    ], { timeout: 300000 });

    if (installResult.code !== 0) {
      throw new Error(`MiKTeX installer failed (code ${installResult.code}): ${installResult.stderr}`);
    }

    // 3. Refresh PATH so we can find mpm
    const miktexBin = path.join(MIKTEX_INSTALL_DIR, "miktex", "bin", "x64");
    process.env.PATH = miktexBin + ";" + (process.env.PATH || "");

    updateProgress(70, "Configuring MiKTeX...");

    // 4. Configure MiKTeX: auto-install packages silently, never prompt
    const initexmf = getInitexmfPath();
    if (fs.existsSync(initexmf)) {
      // AutoInstall=1 means download missing packages without asking
      await runCommand(initexmf, ["--set-config-value=[MPM]AutoInstall=1"], { timeout: 30000 });
      // Console log level 0 = quiet, no prompts
      await runCommand(initexmf, ["--set-config-value=[Core]SharedSetup=1"], { timeout: 30000 });
    }

    updateProgress(80, "Pre-installing LaTeX packages...");

    // 5. Pre-install packages by compiling a test doc that uses them all.
    //    This is more reliable than mpm --install because MiKTeX package names
    //    don't always match LaTeX \usepackage names.
    const testTex = `\\documentclass{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{xcolor}
\\usepackage{titlesec}
\\usepackage{fancyhdr}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{graphicx}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{parskip}
\\usepackage{colortbl}
\\begin{document}
Test \\tableofcontents
\\begin{tabular}{lcr} a & b & c \\end{tabular}
\\end{document}`;
    const testDir = path.join(process.env.TEMP || process.env.TMP || ".", "cras-latex-test");
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const testFile = path.join(testDir, "test.tex");
    fs.writeFileSync(testFile, testTex);

    // Compile 3 times (TOC needs extra passes) — MiKTeX will auto-install any missing packages
    const pdflatex = getPdflatexPath();
    const pdflatexCmd = fs.existsSync(pdflatex) ? pdflatex : "pdflatex";
    for (let pass = 0; pass < 3; pass++) {
      updateProgress(85 + pass * 5, `Compiling test document (pass ${pass + 1}/3)...`);
      await runCommand(pdflatexCmd, ["-interaction=nonstopmode", "-halt-on-error", testFile], { timeout: 120000 });
    }

    // Clean up test files
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}

    updateProgress(100, "Installation complete!");

    // Clean up installer
    try { fs.rmSync(installerDir, { recursive: true, force: true }); } catch {}

    // Verify pdflatex works
    const verified = isPdflatexAvailable();
    if (verified) {
      await dialog.showMessageBox(win, {
        type: "info",
        title: "MiKTeX Installed",
        message: "MiKTeX and all required packages are ready.",
        buttons: ["OK"],
      });
    } else {
      // pdflatex might need PATH refresh — try the full path
      console.log("[LaTeX] pdflatex not in PATH but MiKTeX installed at:", MIKTEX_INSTALL_DIR);
    }

    return verified;
  } catch (err) {
    console.error("[LaTeX] MiKTeX install failed:", err);
    await dialog.showMessageBox(win, {
      type: "error",
      title: "Installation Failed",
      message: "MiKTeX installation failed.",
      detail: String(err),
      buttons: ["OK"],
    });
    return false;
  } finally {
    installDone = true;
    if (!progressWin.isDestroyed()) progressWin.close();
  }
}

/**
 * Check for pdflatex and prompt the user to install if missing.
 * On Windows, offers automatic MiKTeX installation.
 * Returns true if pdflatex is available.
 */
export async function ensurePdflatex(parentWindow?: BrowserWindow | null): Promise<boolean> {
  if (isPdflatexAvailable()) {
    // pdflatex found — ensure packages are installed (silently, no UI)
    if (process.platform === "win32") {
      await ensurePackagesInstalled();
    }
    return true;
  }

  // On Windows, try automatic MiKTeX install
  if (process.platform === "win32") {
    return installMiKTeXSilently(parentWindow);
  }

  // Linux/Mac: show manual instructions
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

  return false;
}

/**
 * Ensure all required LaTeX packages are installed (Windows/MiKTeX only).
 * Compiles a test document that uses all required packages — MiKTeX auto-installs anything missing.
 * Runs silently with no UI.
 */
async function ensurePackagesInstalled(): Promise<void> {
  const initexmf = getInitexmfPath();

  // Configure MiKTeX to auto-install silently
  if (fs.existsSync(initexmf)) {
    await runCommand(initexmf, ["--set-config-value=[MPM]AutoInstall=1"], { timeout: 30000 });
  }

  const testTex = `\\documentclass{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{xcolor}
\\usepackage{titlesec}
\\usepackage{fancyhdr}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{graphicx}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{parskip}
\\usepackage{colortbl}
\\begin{document}
Test \\tableofcontents
\\begin{tabular}{lcr} a & b & c \\end{tabular}
\\end{document}`;

  const testDir = path.join(process.env.TEMP || process.env.TMP || ".", "cras-latex-pkgcheck");
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  const testFile = path.join(testDir, "test.tex");
  fs.writeFileSync(testFile, testTex);

  const pdflatex = getPdflatexPath();
  const pdflatexCmd = fs.existsSync(pdflatex) ? pdflatex : "pdflatex";

    // Compile up to 3 times — each pass may trigger auto-install of more packages
    for (let pass = 0; pass < 3; pass++) {
      await runCommand(pdflatexCmd, ["-interaction=nonstopmode", "-halt-on-error", "--enable-installer", testFile], { timeout: 120000 });
    }

  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
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
          "Install MacTeX via Homebrew:\n\nbrew install --cask mactex\n\nOr download from https://www.tug.org/mactex/",
      };
    case "win32":
      return {
        command: "",
        url: "https://miktex.org/download",
        description:
          "Download and install MiKTeX from:\n\nhttps://miktex.org/download",
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
 * Try to install pdflatex automatically (Linux only, requires sudo).
 */
export async function tryAutoInstallPdflatex(parentWindow?: BrowserWindow | null): Promise<boolean> {
  if (process.platform !== "linux") return false;

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

  if (result.response !== 0) return false;

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

    child.on("error", () => resolve(false));
  });
}
