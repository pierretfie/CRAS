/**
 * electron-builder afterPack hook.
 * Runs after the app is packed but before distribution.
 * Used to verify pdflatex availability and include any needed binaries.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export default async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;

  console.log(`[afterPack] Packed for ${electronPlatformName} → ${appOutDir}`);

  // Check if pdflatex is available on the build machine
  try {
    const cmd = electronPlatformName === "win32" ? "where pdflatex" : "which pdflatex";
    execSync(cmd, { stdio: "ignore" });
    console.log("[afterPack] pdflatex found on build machine");
  } catch {
    console.warn(
      "[afterPack] WARNING: pdflatex not found on build machine. " +
      "PDF generation will require pdflatex to be installed on the target machine."
    );
  }

  // For Linux builds, we could bundle a minimal TeX installation here
  // For now, we rely on the user having TeX installed or using the auto-installer
}
