import { build } from "esbuild";
import { mkdirSync, existsSync, cpSync, rmSync } from "node:fs";

const outdir = "release/server-single";
if (!existsSync(outdir)) mkdirSync(outdir, { recursive: true });

// Clean stale client assets before copying
const publicDir = "release/public";
if (existsSync(publicDir)) rmSync(publicDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });
cpSync(".output/public", publicDir, { recursive: true });
console.log(`Copied client assets → ${publicDir}/`);

// Fix incomplete tslib tracing by Nitro — replace with full copy
const tslibTarget = ".output/server/node_modules/tslib";
if (existsSync(tslibTarget)) rmSync(tslibTarget, { recursive: true });
cpSync("node_modules/tslib", tslibTarget, { recursive: true });

await build({
  entryPoints: [".output/server/index.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: `${outdir}/entry.mjs`,
  // Bundle EVERYTHING — no external deps needed
  packages: "bundle",
  target: "node20",
  sourcemap: false,
  minify: false,
  treeShaking: true,
  // Handle Node.js built-in modules
  external: [],
  nodePaths: ["node_modules"],
  // Define globals for Node.js ESM
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  logLevel: "info",
});

console.log(`\nBundled server → ${outdir}/server.mjs`);
