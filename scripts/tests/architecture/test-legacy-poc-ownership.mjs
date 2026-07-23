// Deterministic guard proving the obsolete poc/cloudflare-word-renderer/
// prototype (deleted 2026-07-15; see `git log --diff-filter=D --summary --
// poc/cloudflare-word-renderer/` for the removal commit and prior contents)
// stays deleted and does not silently regain a reference somewhere in the
// tracked tree.
//
// Also guards the obsolete 81-word sample Worker pipeline under
// workers/word-ssr/ (src/index.ts + wrangler.toml + its own build/generation
// scripts and fixture data), removed after Phase 9 of the workers/word-ssr/
// cleanup found it had no package-script, CI, or production dependency —
// see `git log --diff-filter=D --summary -- workers/word-ssr/src/index.ts`
// for the removal commit. Same regression concern as the POC above: prove
// it stays deleted and the surviving full-corpus Worker pipeline stays
// intact.
//
// Read-only. No network. No browser. Node standard library only.
// Run: node scripts/tests/architecture/test-legacy-poc-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..", "..", "..");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

const DELETED_DIR = "poc/cloudflare-word-renderer";
const REFERENCE_PATTERN = /cloudflare-word-renderer/;

// Files allowed to intentionally name the deleted path — they document its
// removal rather than depending on it.
const ALLOWED_SELF_REFERENCES = new Set([
  path.join(ROOT_DIR, "scripts", "tests", "architecture", "test-legacy-poc-ownership.mjs"),
  path.join(ROOT_DIR, "docs", "architecture.md"),
  path.join(ROOT_DIR, "scripts", "tests", "architecture", "test-architecture-documentation.mjs"),
]);

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "server-build",
  "worker-dist",
  "worker-dist-full",
  "assets-full",
  ".wrangler",
  ".vercel",
  ".compiled",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2",
  ".ttf", ".otf", ".eot", ".bin", ".pdf", ".zip",
]);

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".github" && entry.name !== ".gitignore") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, results);
    } else if (!BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(abs);
    }
  }
  return results;
}

console.log("\n=== legacy Cloudflare word-renderer POC ownership ===\n");

test(`${DELETED_DIR}/ does not exist`, () => {
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, DELETED_DIR)), `${DELETED_DIR}/ was recreated`);
});

test("top-level poc/ directory does not exist", () => {
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, "poc")), "poc/ was recreated");
});

test("no tracked file references the deleted POC path (outside the removal doc and this guard)", () => {
  const offenders = [];
  for (const file of walk(ROOT_DIR)) {
    if (ALLOWED_SELF_REFERENCES.has(file)) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (REFERENCE_PATTERN.test(content)) {
      offenders.push(path.relative(ROOT_DIR, file));
    }
  }
  assert.deepEqual(offenders, [], `stale reference(s) to the deleted POC found in: ${offenders.join(", ")}`);
});

test("package.json has no script referencing the deleted POC", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const scripts = Object.values(pkg.scripts || {});
  const offenders = scripts.filter((cmd) => REFERENCE_PATTERN.test(cmd));
  assert.deepEqual(offenders, [], `package.json script(s) reference the deleted POC: ${offenders.join(", ")}`);
});

test("package.json declares no workspace entry for the deleted prototype", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages ?? [];
  const offenders = workspaces.filter((w) => w.includes("poc"));
  assert.deepEqual(offenders, [], `workspace entr(y/ies) reference "poc": ${offenders.join(", ")}`);
});

test("production Worker directory workers/word-ssr/ exists", () => {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, "workers", "word-ssr")), "workers/word-ssr/ is missing");
});

test("build:word-worker:full targets workers/word-ssr", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const buildScript = pkg.scripts?.["build:word-worker:full"];
  assert.ok(buildScript, "build:word-worker:full script is missing");
  const scriptFile = buildScript.match(/node\s+(\S+)/)?.[1];
  assert.ok(scriptFile, `could not parse script file from: ${buildScript}`);
  const scriptContent = fs.readFileSync(path.join(ROOT_DIR, scriptFile), "utf8");
  assert.ok(/workers\/word-ssr/.test(scriptContent), "build:word-worker:full does not reference workers/word-ssr");
});

console.log("\n=== obsolete 81-word sample Worker pipeline ownership ===\n");

const DELETED_SAMPLE_PATHS = [
  "workers/word-ssr/build/build-worker.mjs",
  "workers/word-ssr/generation/generate-staging-records.mjs",
  "workers/word-ssr/src/index.ts",
  "workers/word-ssr/config/wrangler.toml",
  "workers/word-ssr/data/word-pages.english.a1.json",
  "workers/word-ssr/data/aliases.english.a1.json",
  "workers/word-ssr/data/browse-shard.english-a1.json",
  "workers/word-ssr/data/manifest.json",
  "workers/word-ssr/data/client-assets.json",
];

for (const relPath of DELETED_SAMPLE_PATHS) {
  test(`${relPath} does not exist`, () => {
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, relPath)), `${relPath} was recreated`);
  });
}

const SURVIVING_FULL_PIPELINE_PATHS = [
  "workers/word-ssr/build/build-worker-full.mjs",
  "workers/word-ssr/src/index.full.ts",
  "workers/word-ssr/config/wrangler.full.toml",
  "workers/word-ssr/config/wrangler.production.toml",
];

for (const relPath of SURVIVING_FULL_PIPELINE_PATHS) {
  test(`${relPath} still exists`, () => {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, relPath)), `${relPath} is missing`);
  });
}

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("legacy POC ownership guard passed");
}
