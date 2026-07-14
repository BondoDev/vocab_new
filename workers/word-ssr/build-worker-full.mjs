// STAGING-ONLY build helper for the FULL-CORPUS Worker (src/index.full.ts).
// Separate from build-worker.mjs (the original 81-word sample's build
// helper, kept untouched). Runs the offline steps needed before
// `wrangler dev --config wrangler.full.toml` can run against fresh code:
//   1. regenerate full-corpus records from the real vocabulary (Node, offline)
//   2. publish those records (+ a copy of the client bundle) into assets-full/
//   3. pre-bundle the Worker entry via Vite (resolves import.meta.glob,
//      inlines npm deps, strips process.env.NODE_ENV references)
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

console.log("[1/3] Generating full-corpus records...");
execFileSync(process.execPath, [path.join(__dirname, "generate-full-corpus.mjs")], { stdio: "inherit" });

console.log("\n[2/3] Publishing records + client bundle into assets-full/...");
execFileSync(process.execPath, [path.join(__dirname, "publish-shards.mjs")], { stdio: "inherit" });

console.log("\n[3/3] Building Worker entry via Vite...");
const viteBin = path.join(rootDir, "node_modules", ".bin", "vite");
execFileSync(
  viteBin,
  [
    "build",
    "--config",
    path.join(__dirname, "vite.worker.config.mjs"),
    "--ssr",
    path.join(__dirname, "src", "index.full.ts"),
    "--outDir",
    path.join(__dirname, "worker-dist-full"),
  ],
  { stdio: "inherit", cwd: rootDir, shell: true },
);

console.log("\nDone. Run `npx wrangler dev --config wrangler.full.toml` from workers/word-ssr/ to test locally.");
