// Guards the operational/credential boundaries established by the
// 2026-07-16 indexing-operations audit (see
// docs/google-indexing-operations.md). Protects: sensitive files stay
// untracked, ignore rules cover them, the operational script lives at its
// documented path with a working package script, and no client-facing
// source references a credential filename or leaks a private var via a
// VITE_ prefix.
//
// Read-only. No network. No Google API calls. No credentials read. Node
// standard library only.
// Run: node scripts/tests/architecture/test-operational-security.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

function isTracked(relPath) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", relPath], {
      cwd: ROOT_DIR,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function walkFiles(dir, extensions, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, extensions, out);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
const gitignore = fs.readFileSync(path.join(ROOT_DIR, ".gitignore"), "utf8");

console.log("\n=== sensitive-file tracking guards ===\n");

test("service-account.json is not tracked by Git", () => {
  assert.equal(isTracked("service-account.json"), false, "service-account.json is tracked");
});

test(".env is not tracked by Git", () => {
  assert.equal(isTracked(".env"), false, ".env is tracked");
});

test("indexed-progress.json is not tracked at the legacy root path", () => {
  assert.equal(isTracked("indexed-progress.json"), false, "root indexed-progress.json is tracked");
});

test("migrated progress-state file is not tracked", () => {
  assert.equal(
    isTracked("scripts/operations/state/indexed-progress.json"),
    false,
    "scripts/operations/state/indexed-progress.json is tracked"
  );
});

console.log("\n=== ignore-rule coverage guards ===\n");

test(".gitignore covers service-account.json and variants", () => {
  assert.ok(gitignore.includes("service-account.json"), "missing exact service-account.json entry");
  assert.ok(gitignore.includes("service-account*.json"), "missing service-account*.json variant entry");
});

test(".gitignore covers .env and variants, but not .env.example", () => {
  const lines = gitignore.split(/\r?\n/).map((line) => line.trim());
  assert.ok(lines.includes(".env"), "missing exact .env entry");
  assert.ok(lines.includes(".env.*"), "missing .env.* variant entry");
  assert.ok(lines.includes("!.env.example"), "missing !.env.example exception");
});

test(".gitignore covers indexed-progress.json and the operational state directory", () => {
  assert.ok(gitignore.includes("indexed-progress.json"), "missing indexed-progress.json entry");
  assert.ok(
    gitignore.includes("scripts/operations/state/"),
    "missing scripts/operations/state/ entry"
  );
});

console.log("\n=== operational script location guards ===\n");

test("operational script exists at the documented path", () => {
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "scripts", "operations", "google-index.mjs")),
    "scripts/operations/google-index.mjs is missing"
  );
});

test("legacy root-level google-index.js no longer exists", () => {
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, "google-index.js")),
    "google-index.js still exists at the repo root"
  );
});

test("package.json google:index script points at the operational script", () => {
  assert.equal(
    pkg.scripts?.["google:index"],
    "node scripts/operations/google-index.mjs",
    `unexpected google:index script: ${pkg.scripts?.["google:index"]}`
  );
});

test("google:index is not wired into prebuild, build, or postinstall", () => {
  for (const hook of ["prebuild", "build", "postinstall"]) {
    const command = pkg.scripts?.[hook];
    if (!command) continue;
    assert.ok(
      !command.includes("google:index") && !command.includes("google-index"),
      `${hook} script must not invoke the indexing operator script: ${command}`
    );
  }
});

test("documentation exists at docs/google-indexing-operations.md", () => {
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "docs", "google-indexing-operations.md")),
    "docs/google-indexing-operations.md is missing"
  );
});

console.log("\n=== client-boundary guards ===\n");

const sourceFiles = walkFiles(path.join(ROOT_DIR, "src"), [".ts", ".tsx"]);

test("no client source file references a known credential filename", () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    if (/service-account(\*)?\.json/.test(content) || /indexed-progress\.json/.test(content)) {
      offenders.push(path.relative(ROOT_DIR, file));
    }
  }
  assert.deepEqual(offenders, [], `file(s) referencing a credential/state filename: ${offenders.join(", ")}`);
});

test("no private operational variable is declared with a VITE_ prefix", () => {
  const envExample = fs.readFileSync(path.join(ROOT_DIR, ".env.example"), "utf8");
  const offenders = envExample
    .split("\n")
    .filter((line) => /^VITE_/.test(line))
    .filter((line) => /GOOGLE|INDEXING|SERVICE_ACCOUNT|API_KEY|SECRET|TOKEN/i.test(line));
  assert.deepEqual(offenders, [], `VITE_-prefixed operational/secret variable(s) found: ${offenders.join(", ")}`);
});

test("no real-looking secret value appears in .env.example", () => {
  const envExample = fs.readFileSync(path.join(ROOT_DIR, ".env.example"), "utf8");
  assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(envExample), "private key marker found in .env.example");
  assert.ok(!/"private_key"\s*:/.test(envExample), "service-account JSON structure found in .env.example");
});

test("no credential file exists under public/ or workers/ asset directories", () => {
  const offenders = [];
  for (const dir of ["public", "workers"]) {
    const found = walkFiles(path.join(ROOT_DIR, dir), [".json"]).filter((f) =>
      /service-account/.test(path.basename(f))
    );
    offenders.push(...found.map((f) => path.relative(ROOT_DIR, f)));
  }
  assert.deepEqual(offenders, [], `credential file(s) found under build-input directories: ${offenders.join(", ")}`);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("operational-security guards passed");
}
