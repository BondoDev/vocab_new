// Deterministic guard proving guidelines/ stays human-guidance-only.
//
// Context: guidelines/seo_level_test_content.json, guidelines/seo-cefr-content.json,
// and guidelines/seo-cefr-placeholder.html were discovered (2026-07-15 audit) to be
// live production data/dead artifacts sitting in a directory meant only for AI
// assistant instructions. The two JSON files were moved to src/data/seo/levelTests/ and
// src/data/seo/ respectively; the HTML file was deleted. The durable
// "guidelines/ is human-guidance-only" rule now lives in docs/architecture.md
// (the relocated files' provenance is recorded in git history).
//
// Read-only. No network. No browser. Node standard library only.
// Run: node scripts/tests/architecture/test-guidelines-ownership.mjs
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

const GUIDELINES_DIR = path.join(ROOT_DIR, "guidelines");

const OLD_PATHS = [
  path.join(ROOT_DIR, "guidelines", "seo_level_test_content.json"),
  path.join(ROOT_DIR, "guidelines", "seo-cefr-content.json"),
  path.join(ROOT_DIR, "guidelines", "seo-cefr-placeholder.html"),
];

const NEW_PATHS = [
  path.join(ROOT_DIR, "src", "data", "seo", "levelTests", "seo_level_test_content.json"),
  path.join(ROOT_DIR, "src", "data", "seo", "vocabularyLevels", "seo-cefr-content.json"),
];

// Only the old guidelines/-prefixed path is a "stale reference" — the bare
// basenames (e.g. "seo_level_test_content.json") legitimately live on in the
// new import statements and file paths after the move, since the files kept
// their filenames and only changed directory.
const OLD_PATH_PATTERN = /guidelines[\\/](seo_level_test_content\.json|seo-cefr-content\.json|seo-cefr-placeholder\.html)/;

// Files allowed to intentionally name the old guidelines/ paths — they
// document the relocation rather than depending on it.
const ALLOWED_SELF_REFERENCES = new Set([
  path.join(ROOT_DIR, "scripts", "tests", "architecture", "test-guidelines-ownership.mjs"),
  path.join(ROOT_DIR, "docs", "generated-data.md"),
  path.join(ROOT_DIR, "docs", "import-boundaries.md"),
]);

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "server-build",
  "worker-dist",
  "worker-dist-full",
  "assets-full",
  "full-corpus",
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

console.log("\n=== guidelines/ folder ownership ===\n");

test("guidelines/Guidelines.md exists", () => {
  assert.ok(
    fs.existsSync(path.join(GUIDELINES_DIR, "Guidelines.md")),
    "guidelines/Guidelines.md is missing",
  );
});

test("guidelines/ contains only Guidelines.md", () => {
  const entries = fs.readdirSync(GUIDELINES_DIR, { withFileTypes: true });
  const offenders = entries
    .filter((entry) => !(entry.isFile() && entry.name === "Guidelines.md"))
    .map((entry) => entry.name);
  assert.deepEqual(
    offenders,
    [],
    `guidelines/ has non-guidance entries: ${offenders.join(", ")}`,
  );
});

test("no .json or .html file exists anywhere under guidelines/", () => {
  const offenders = walk(GUIDELINES_DIR).filter((file) =>
    [".json", ".html"].includes(path.extname(file).toLowerCase()),
  );
  assert.deepEqual(
    offenders.map((f) => path.relative(ROOT_DIR, f)),
    [],
    `data/markup file(s) found under guidelines/: ${offenders.join(", ")}`,
  );
});

test("the three old guidelines/ data paths are absent", () => {
  const offenders = OLD_PATHS.filter((p) => fs.existsSync(p)).map((p) =>
    path.relative(ROOT_DIR, p),
  );
  assert.deepEqual(offenders, [], `old path(s) still exist: ${offenders.join(", ")}`);
});

test("moved authoritative files exist at their new locations", () => {
  const missing = NEW_PATHS.filter((p) => !fs.existsSync(p)).map((p) =>
    path.relative(ROOT_DIR, p),
  );
  assert.deepEqual(missing, [], `expected relocated file(s) missing: ${missing.join(", ")}`);
});

test("src/data/seo/levelTests/index.ts imports the relocated JSON, not the old guidelines/ path", () => {
  const file = path.join(ROOT_DIR, "src", "data", "seo", "levelTests", "index.ts");
  const content = fs.readFileSync(file, "utf8");
  assert.ok(
    /from\s+["']\.\/seo_level_test_content\.json["']/.test(content),
    "src/data/seo/levelTests/index.ts does not import ./seo_level_test_content.json",
  );
  assert.ok(!OLD_PATH_PATTERN.test(content), "src/data/seo/levelTests/index.ts still references guidelines/");
});

test("devSeoCefrPreviewData.ts imports the relocated JSON, not the old guidelines/ path", () => {
  const file = path.join(
    ROOT_DIR,
    "src",
    "app",
    "pages",
    "vocabulary",
    "devSeoCefrPreviewData.ts",
  );
  const content = fs.readFileSync(file, "utf8");
  assert.ok(
    /from\s+["']\.\.\/\.\.\/\.\.\/data\/seo\/vocabularyLevels\/seo-cefr-content\.json["']/.test(content),
    "devSeoCefrPreviewData.ts does not import ../../../data/seo/vocabularyLevels/seo-cefr-content.json",
  );
  assert.ok(!OLD_PATH_PATTERN.test(content), "devSeoCefrPreviewData.ts still references guidelines/");
});

test("scripts/generation/generate-sitemap.mjs reads the relocated level-test JSON, not the old guidelines/ path", () => {
  const file = path.join(ROOT_DIR, "scripts", "generation", "generate-sitemap.mjs");
  const content = fs.readFileSync(file, "utf8");
  assert.ok(
    /path\.join\(\s*ROOT_DIR,\s*"src",\s*"data",\s*"seo",\s*"levelTests",\s*"seo_level_test_content\.json"\s*\)/.test(
      content,
    ),
    "generate-sitemap.mjs does not read src/data/seo/levelTests/seo_level_test_content.json",
  );
  assert.ok(!OLD_PATH_PATTERN.test(content), "generate-sitemap.mjs still references guidelines/");
});

test("no tracked file references the old guidelines/ data paths (outside this guard and its doc)", () => {
  const offenders = [];
  for (const file of walk(ROOT_DIR)) {
    if (ALLOWED_SELF_REFERENCES.has(file)) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (OLD_PATH_PATTERN.test(content)) {
      offenders.push(path.relative(ROOT_DIR, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `stale reference(s) to the old guidelines/ data paths found in: ${offenders.join(", ")}`,
  );
});

test("package.json has no script referencing the old guidelines/ data paths", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const scripts = Object.values(pkg.scripts || {});
  const offenders = scripts.filter((cmd) => OLD_PATH_PATTERN.test(cmd));
  assert.deepEqual(
    offenders,
    [],
    `package.json script(s) reference the old guidelines/ data paths: ${offenders.join(", ")}`,
  );
});

test("docs/architecture.md documents guidelines/ as human-guidance-only", () => {
  const file = path.join(ROOT_DIR, "docs", "architecture.md");
  assert.ok(fs.existsSync(file), "docs/architecture.md is missing");
  const content = fs.readFileSync(file, "utf8");
  assert.ok(
    /human-guidance-only/i.test(content),
    "docs/architecture.md does not state guidelines/ is human-guidance-only",
  );
});

console.log(`\n───────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`───────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("guidelines ownership guard passed");
}
