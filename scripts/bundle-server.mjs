import { build } from "esbuild";
import { mkdirSync, existsSync, cpSync } from "node:fs";

const outdir = "release/server-single";
if (!existsSync(outdir)) mkdirSync(outdir, { recursive: true });

// Copy client assets to release/public/ for the entry.mjs static file server
const publicDir = "release/public";
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
cpSync("dist/client", publicDir, { recursive: true });
console.log(`Copied client assets → ${publicDir}/`);

await build({
  entryPoints: ["dist/server/server.js"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: `${outdir}/server.mjs`,
  // Bundle EVERYTHING — no external deps needed
  packages: "bundle",
  target: "node20",
  sourcemap: false,
  minify: false,
  treeShaking: true,
  // Handle Node.js built-in modules
  external: [],
  banner: {
    js: `
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
`,
  },
  // Define globals for Node.js ESM
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  logLevel: "info",
});

console.log(`\nBundled server → ${outdir}/server.mjs`);
