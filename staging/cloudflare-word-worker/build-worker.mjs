// STAGING-ONLY build helper. Runs the two offline steps needed before
// `wrangler dev`/`wrangler deploy --dry-run` can run against fresh code:
//   1. regenerate compact records from the real vocabulary (Node, offline)
//   2. pre-bundle the Worker entry via Vite (resolves import.meta.glob,
//      inlines npm deps, strips process.env.NODE_ENV references)
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

console.log("[1/2] Generating staging records...");
execFileSync(process.execPath, [path.join(__dirname, "generate-staging-records.mjs")], {
  stdio: "inherit",
});

console.log("\n[2/2] Building Worker entry via Vite...");
const viteBin = path.join(rootDir, "node_modules", ".bin", "vite");
execFileSync(
  viteBin,
  [
    "build",
    "--config",
    path.join(__dirname, "vite.worker.config.mjs"),
    "--ssr",
    path.join(__dirname, "src", "index.ts"),
    "--outDir",
    path.join(__dirname, "worker-dist"),
  ],
  { stdio: "inherit", cwd: rootDir, shell: true },
);

console.log("\nDone. Run `npx wrangler dev` from staging/cloudflare-word-worker/ to test locally.");
