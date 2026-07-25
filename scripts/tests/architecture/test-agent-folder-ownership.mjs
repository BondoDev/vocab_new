// Guards the local agent-tool-folder boundaries established by the
// 2026-07-16 audit (see docs/architecture.md, "Local-only state"). Protects: .agents/,
// .claude/, and .codex/ never carry tracked files, the tracked .gitignore
// covers all three, canonical instructions stay in AGENTS.md, and no
// credential-looking file sits under any of the three folders.
//
// Read-only. No network. No credentials read. Node standard library only.
// Run: node scripts/tests/architecture/test-agent-folder-ownership.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..", "..", "..");
const AGENT_FOLDERS = [".agents", ".claude", ".codex"];

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

function trackedFilesUnder(relDir) {
  try {
    const out = execFileSync("git", ["ls-files", relDir], {
      cwd: ROOT_DIR,
      stdio: "pipe",
    }).toString("utf8");
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, out);
    } else {
      out.push(abs);
    }
  }
  return out;
}

const gitignore = fs.readFileSync(path.join(ROOT_DIR, ".gitignore"), "utf8");
const gitignoreLines = gitignore.split(/\r?\n/).map((line) => line.trim());

console.log("\n=== agent-tool-folder tracking guards ===\n");

for (const folder of AGENT_FOLDERS) {
  test(`no tracked file exists under ${folder}/`, () => {
    const tracked = trackedFilesUnder(folder);
    assert.deepEqual(tracked, [], `tracked file(s) found under ${folder}/: ${tracked.join(", ")}`);
  });
}

console.log("\n=== .gitignore coverage guards ===\n");

for (const folder of AGENT_FOLDERS) {
  test(`.gitignore covers ${folder}/`, () => {
    assert.ok(
      gitignoreLines.includes(`${folder}/`) || gitignoreLines.includes(folder),
      `missing ${folder}/ entry in .gitignore`
    );
  });
}

console.log("\n=== canonical instruction guards ===\n");

test("AGENTS.md exists at the repository root", () => {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, "AGENTS.md")), "AGENTS.md is missing");
});

test("docs/architecture.md documents .agents/.claude/.codex as local-only ignored state", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "docs", "architecture.md"), "utf8");
  assert.ok(
    /\.agents\/.*\.claude\/.*\.codex\//.test(content) || /\.codex\/[\s\S]{0,400}AGENTS\.md/i.test(content),
    "docs/architecture.md no longer documents the .agents/.claude/.codex local-state contract"
  );
});

test("no repository documentation instructs contributors to commit local agent state", () => {
  const docFiles = walkFiles(path.join(ROOT_DIR, "docs")).filter((f) => f.endsWith(".md"));
  const offenders = [];
  for (const file of docFiles) {
    const content = fs.readFileSync(file, "utf8");
    if (/git add .*\.(agents|claude|codex)\b/i.test(content)) {
      offenders.push(path.relative(ROOT_DIR, file));
    }
  }
  assert.deepEqual(offenders, [], `doc(s) instructing to commit agent-tool state: ${offenders.join(", ")}`);
});

console.log("\n=== credential-safety guards ===\n");

test("no credential-looking file exists under .agents/, .claude/, or .codex/", () => {
  const offenders = [];
  for (const folder of AGENT_FOLDERS) {
    const files = walkFiles(path.join(ROOT_DIR, folder));
    for (const file of files) {
      const base = path.basename(file).toLowerCase();
      if (/credential|secret|token|auth\.json|\.pem$|\.key$|api[-_]?key/.test(base)) {
        offenders.push(path.relative(ROOT_DIR, file));
      }
    }
  }
  assert.deepEqual(offenders, [], `credential-looking file(s) found: ${offenders.join(", ")}`);
});

console.log("\n=== package-script boundary guards ===\n");

test("no package script depends on .agents/, .claude/, or .codex/ contents", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const offenders = [];
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (/\.(agents|claude|codex)\//.test(command)) {
      offenders.push(`${name}: ${command}`);
    }
  }
  assert.deepEqual(offenders, [], `script(s) depending on agent-tool folders: ${offenders.join(", ")}`);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("agent-folder-ownership guards passed");
}
