// Deterministic guard for generated/duplicated data ownership, documented in
// docs/generated-data.md. Complements scripts/test-import-boundaries.mjs
// (which guards the *shape* import.meta.glob and related loaders depend on)
// by guarding *ownership drift*: dead artifacts silently reappearing, build
// output getting committed, and public/ mirrors losing their documentation.
//
// Run: node scripts/test-generated-data-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compileTsToCommonJs, ROOT_DIR } from "./seo-baseline/lib/compileTs.mjs";

const __filename = fileURLToPath(import.meta.url);
void __filename;

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

const compiled = compileTsToCommonJs(".tmp-generated-data-ownership", [
  path.join(ROOT_DIR, "src", "data", "seo", "slugs.ts"),
]);
const { SUPPORTED_UI_LANGUAGES, SUPPORTED_TARGET_LANGUAGES, SUPPORTED_LEVELS } =
  compiled.require("src/data/seo/slugs");

function gitLsFiles(relDir) {
  try {
    const out = execFileSync("git", ["ls-files", relDir], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    });
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function gitIgnoreCheck(relPath) {
  try {
    execFileSync("git", ["check-ignore", "-q", relPath], { cwd: ROOT_DIR });
    return true;
  } catch (err) {
    if (err.status === 1) return false;
    throw err;
  }
}

console.log("\n=== dead-artifact regression guards ===\n");

test("public/vocabularyLevels/index.ts does not exist (removed 2026-07-15 — was dead code, nothing imported it)", () => {
  const p = path.join(ROOT_DIR, "public", "vocabularyLevels", "index.ts");
  assert.ok(!fs.existsSync(p), `${p} exists — the dead orphaned loader was reintroduced`);
});

test("scripts/cleanup-word-build-artifacts.mjs no longer targets the removed public/vocabularyLevels/index.ts artifact", () => {
  const scriptPath = path.join(ROOT_DIR, "scripts", "cleanup-word-build-artifacts.mjs");
  const text = fs.readFileSync(scriptPath, "utf8");
  assert.ok(
    !text.includes("vocabularyLevels"),
    "cleanup-word-build-artifacts.mjs still references vocabularyLevels — the obsolete deletion branch for the removed index.ts was reintroduced",
  );
});

test("no source file imports public/vocabularyLevels as a module", () => {
  const searchDirs = ["src", "workers", "scripts"];
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        const text = fs.readFileSync(abs, "utf8");
        if (/from\s+["'].*public\/vocabularyLevels/.test(text) || /require\(["'].*public\/vocabularyLevels/.test(text)) {
          offenders.push(abs);
        }
      }
    }
  }
  for (const d of searchDirs) walk(path.join(ROOT_DIR, d));
  assert.deepEqual(offenders, [], `unexpected import of public/vocabularyLevels found in: ${offenders.join(", ")}`);
});

console.log("\n=== public/ static-asset hygiene ===\n");

test("no raw .ts/.tsx source files exist anywhere under public/", () => {
  const publicDir = path.join(ROOT_DIR, "public");
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.tsx?$/.test(entry.name)) offenders.push(path.relative(ROOT_DIR, abs));
    }
  }
  walk(publicDir);
  assert.deepEqual(offenders, [], `raw TypeScript source found under public/ (Vite ships it as static output verbatim): ${offenders.join(", ")}`);
});

console.log("\n=== src/data/vocabularyLevels/ completeness ===\n");

test("src/data/vocabularyLevels/ has exactly one JSON file per UI-language x target-language pair", () => {
  const baseDir = path.join(ROOT_DIR, "src", "data", "vocabularyLevels");
  const expected = [];
  for (const ui of SUPPORTED_UI_LANGUAGES) {
    for (const target of SUPPORTED_TARGET_LANGUAGES) {
      expected.push(`${ui}/${target}.json`);
    }
  }
  const missing = [];
  for (const rel of expected) {
    if (!fs.existsSync(path.join(baseDir, rel))) missing.push(rel);
  }
  assert.deepEqual(missing, [], `missing vocabulary-level file(s): ${missing.join(", ")}`);

  const actualDirs = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  assert.deepEqual(actualDirs, [...SUPPORTED_UI_LANGUAGES].sort(), "unexpected UI-language folder(s) under src/data/vocabularyLevels");

  for (const ui of actualDirs) {
    const files = fs
      .readdirSync(path.join(baseDir, ui))
      .filter((f) => f.endsWith(".json"))
      .sort();
    assert.deepEqual(
      files,
      SUPPORTED_TARGET_LANGUAGES.map((t) => `${t}.json`).sort(),
      `src/data/vocabularyLevels/${ui} has an unexpected file set`,
    );
  }
});

test("all src/data/vocabularyLevels/*.json files parse and have no duplicate normalized level keys", () => {
  const baseDir = path.join(ROOT_DIR, "src", "data", "vocabularyLevels");
  for (const ui of SUPPORTED_UI_LANGUAGES) {
    for (const target of SUPPORTED_TARGET_LANGUAGES) {
      const filePath = path.join(baseDir, ui, `${target}.json`);
      const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(raw);
      }, `${path.relative(ROOT_DIR, filePath)} is not valid JSON`);
      const levelKeys = Object.keys(parsed.levels ?? {});
      const normalized = levelKeys.map((k) => k.toLowerCase());
      const dupes = normalized.filter((k, i) => normalized.indexOf(k) !== i);
      assert.deepEqual(dupes, [], `${path.relative(ROOT_DIR, filePath)} has duplicate normalized level key(s): ${dupes.join(", ")}`);
      const unexpectedLevels = levelKeys.filter((k) => !SUPPORTED_LEVELS.includes(k));
      assert.deepEqual(unexpectedLevels, [], `${path.relative(ROOT_DIR, filePath)} has unexpected level key(s): ${unexpectedLevels.join(", ")}`);
    }
  }
});

test("no malformed vocabulary-level filenames (unexpected casing or extension) under src/ or public/ vocabularyLevels", () => {
  const offenders = [];
  for (const root of ["src/data/vocabularyLevels", "public/vocabularyLevels"]) {
    const baseDir = path.join(ROOT_DIR, ...root.split("/"));
    if (!fs.existsSync(baseDir)) continue;
    for (const ui of fs.readdirSync(baseDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      if (!SUPPORTED_UI_LANGUAGES.includes(ui.name)) {
        offenders.push(`${root}/${ui.name} (unexpected UI-language folder name)`);
        continue;
      }
      for (const file of fs.readdirSync(path.join(baseDir, ui.name))) {
        const expectedName = SUPPORTED_TARGET_LANGUAGES.map((t) => `${t}.json`);
        if (!expectedName.includes(file)) {
          offenders.push(`${root}/${ui.name}/${file}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `malformed vocabulary-level filename(s): ${offenders.join(", ")}`);
});

console.log("\n=== generated directory presence ===\n");

for (const dir of [
  "src/data/seo/word-hub-pages",
  "src/data/seo/word-browse-shards",
  "src/data/seo/level-browse-preview",
  "src/data/verbListLookup",
  "public/sitemaps",
]) {
  test(`${dir} exists and is committed to git`, () => {
    const abs = path.join(ROOT_DIR, ...dir.split("/"));
    assert.ok(fs.existsSync(abs), `${dir} does not exist`);
    const tracked = gitLsFiles(dir);
    assert.ok(tracked.length > 0, `${dir} has no files tracked by git — expected a committed generated source directory`);
  });
}

console.log("\n=== Worker build-output directories stay ignored and untracked ===\n");

for (const dir of [
  "workers/word-ssr/data/full-corpus",
  "workers/word-ssr/assets-full",
  "workers/word-ssr/worker-dist-full",
  "dist",
  "server-build",
]) {
  test(`${dir} is gitignored and has no tracked files`, () => {
    assert.ok(gitIgnoreCheck(dir), `${dir} is not covered by .gitignore`);
    const tracked = gitLsFiles(dir);
    assert.deepEqual(tracked, [], `${dir} has tracked file(s) that should be build output: ${tracked.join(", ")}`);
  });
}

console.log("\n=== ownership documentation completeness ===\n");

test("docs/generated-data.md exists and names every high-risk directory", () => {
  const docPath = path.join(ROOT_DIR, "docs", "generated-data.md");
  assert.ok(fs.existsSync(docPath), "docs/generated-data.md is missing");
  const text = fs.readFileSync(docPath, "utf8");
  const requiredMentions = [
    "src/data/vocabularyLevels",
    "public/vocabularyLevels",
    "src/data/seo/word-hub-pages",
    "src/data/seo/word-browse-shards",
    "src/data/seo/level-browse-preview",
    "public/seo/level-browse-preview",
    "src/data/verbListLookup",
    "public/sitemaps",
    "workers/word-ssr/data/full-corpus",
    "workers/word-ssr/assets-full",
    "workers/word-ssr/worker-dist-full",
  ];
  const missing = requiredMentions.filter((m) => !text.includes(m));
  assert.deepEqual(missing, [], `docs/generated-data.md does not mention: ${missing.join(", ")}`);
});

test("public/seo/level-browse-preview/ has an explicitly documented ownership status", () => {
  const docPath = path.join(ROOT_DIR, "docs", "generated-data.md");
  const text = fs.readFileSync(docPath, "utf8");
  const idx = text.indexOf("public/seo/level-browse-preview");
  assert.ok(idx !== -1, "public/seo/level-browse-preview is not documented");
  const nearby = text.slice(idx, idx + 600).toLowerCase();
  assert.ok(
    /obsolete|dead|orphan|unresolved|future cleanup/.test(nearby),
    "public/seo/level-browse-preview is mentioned but its ownership status is not clearly classified nearby",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

compiled.cleanup();

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("generated-data ownership guards passed");
}
