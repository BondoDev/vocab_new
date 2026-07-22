// Deterministic guard for generated/duplicated data ownership, documented in
// docs/generated-data.md. Complements scripts/tests/architecture/test-import-boundaries.mjs
// (which guards the *shape* import.meta.glob and related loaders depend on)
// by guarding *ownership drift*: dead artifacts silently reappearing, build
// output getting committed, and public/ mirrors losing their documentation.
//
// Run: node scripts/tests/architecture/test-generated-data-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compileTsToCommonJs, ROOT_DIR } from "../../lib/compileTs.mjs";

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
  path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
]);
const { SUPPORTED_UI_LANGUAGES, SUPPORTED_TARGET_LANGUAGES, SUPPORTED_LEVELS } =
  compiled.require("src/data/seo/shared/slugs");

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

function walkFiles(absDir, predicate = () => true) {
  const results = [];
  if (!fs.existsSync(absDir)) return results;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (predicate(abs)) {
        results.push(abs);
      }
    }
  }
  walk(absDir);
  return results;
}

console.log("\n=== dead-artifact regression guards ===\n");

test("public/vocabularyLevels/index.ts does not exist (removed 2026-07-15 — was dead code, nothing imported it)", () => {
  const p = path.join(ROOT_DIR, "public", "vocabularyLevels", "index.ts");
  assert.ok(!fs.existsSync(p), `${p} exists — the dead orphaned loader was reintroduced`);
});

test("scripts/build/cleanup-word-build-artifacts.mjs no longer targets the removed public/vocabularyLevels/index.ts artifact", () => {
  const scriptPath = path.join(ROOT_DIR, "scripts", "build", "cleanup-word-build-artifacts.mjs");
  const text = fs.readFileSync(scriptPath, "utf8");
  assert.ok(
    !text.includes("vocabularyLevels"),
    "cleanup-word-build-artifacts.mjs still references vocabularyLevels — the obsolete deletion branch for the removed index.ts was reintroduced",
  );
});

test("public/seo/level-browse-preview/ does not exist (removed 2026-07-15 — obsolete public mirror)", () => {
  const p = path.join(ROOT_DIR, "public", "seo", "level-browse-preview");
  assert.ok(!fs.existsSync(p), `${p} exists — the obsolete public level-browse-preview mirror was reintroduced`);
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

console.log("\n=== src/data/seo/vocabularyLevels/ completeness ===\n");

test("src/data/seo/vocabularyLevels/ has exactly one JSON file per UI-language x target-language pair", () => {
  const baseDir = path.join(ROOT_DIR, "src", "data", "seo", "vocabularyLevels");
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

  // level-browse-preview/ is other CEFR vocabulary-level SEO data co-located
  // under vocabularyLevels/, not a UI-language folder — excluded here.
  const actualDirs = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "level-browse-preview")
    .map((e) => e.name)
    .sort();
  assert.deepEqual(actualDirs, [...SUPPORTED_UI_LANGUAGES].sort(), "unexpected UI-language folder(s) under src/data/seo/vocabularyLevels");

  for (const ui of actualDirs) {
    const files = fs
      .readdirSync(path.join(baseDir, ui))
      .filter((f) => f.endsWith(".json"))
      .sort();
    assert.deepEqual(
      files,
      SUPPORTED_TARGET_LANGUAGES.map((t) => `${t}.json`).sort(),
      `src/data/seo/vocabularyLevels/${ui} has an unexpected file set`,
    );
  }
});

test("all src/data/seo/vocabularyLevels/*.json files parse and have no duplicate normalized level keys", () => {
  const baseDir = path.join(ROOT_DIR, "src", "data", "seo", "vocabularyLevels");
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
  for (const root of ["src/data/seo/vocabularyLevels", "public/vocabularyLevels"]) {
    const baseDir = path.join(ROOT_DIR, ...root.split("/"));
    if (!fs.existsSync(baseDir)) continue;
    for (const ui of fs.readdirSync(baseDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      // level-browse-preview/ is other CEFR vocabulary-level SEO data
      // co-located under src/data/seo/vocabularyLevels/, not a UI-language folder.
      if (root === "src/data/seo/vocabularyLevels" && ui.name === "level-browse-preview") {
        continue;
      }
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

console.log("\n=== vocabulary-level public mirror synchronization ===\n");

test("scripts/generation/sync-vocabulary-levels.mjs exists", () => {
  const p = path.join(ROOT_DIR, "scripts", "generation", "sync-vocabulary-levels.mjs");
  assert.ok(fs.existsSync(p), "scripts/generation/sync-vocabulary-levels.mjs is missing");
});

test("package.json exposes sync:vocabulary-levels and check:vocabulary-levels-sync scripts", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  assert.equal(
    pkg.scripts?.["sync:vocabulary-levels"],
    "node scripts/generation/sync-vocabulary-levels.mjs",
    "package.json is missing (or has changed) the sync:vocabulary-levels script",
  );
  assert.equal(
    pkg.scripts?.["check:vocabulary-levels-sync"],
    "node scripts/generation/sync-vocabulary-levels.mjs --check",
    "package.json is missing (or has changed) the check:vocabulary-levels-sync script",
  );
});

test("public/vocabularyLevels/ mirror passes a read-only sync check (no writes)", () => {
  assert.doesNotThrow(() => {
    execFileSync("node", [path.join(ROOT_DIR, "scripts", "generation", "sync-vocabulary-levels.mjs"), "--check"], {
      cwd: ROOT_DIR,
      stdio: "pipe",
    });
  }, "npm run check:vocabulary-levels-sync failed — public/vocabularyLevels/ has drifted from src/data/seo/vocabularyLevels/; run npm run sync:vocabulary-levels");
});

test("docs/generated-data.md documents the synchronization command and build policy", () => {
  const text = fs.readFileSync(path.join(ROOT_DIR, "docs", "generated-data.md"), "utf8");
  assert.ok(text.includes("sync:vocabulary-levels"), "docs/generated-data.md does not mention sync:vocabulary-levels");
  assert.ok(
    text.includes("check:vocabulary-levels-sync"),
    "docs/generated-data.md does not mention check:vocabulary-levels-sync",
  );
});

console.log("\n=== src/data/seo/vocabularyLevels/level-browse-preview/ ownership ===\n");

test("src/data/seo/vocabularyLevels/level-browse-preview/ has exactly one valid JSON file per target-language x CEFR-level pair", () => {
  const baseDir = path.join(ROOT_DIR, "src", "data", "seo", "vocabularyLevels", "level-browse-preview");
  const expectedKeys = [];
  for (const target of SUPPORTED_TARGET_LANGUAGES) {
    for (const level of SUPPORTED_LEVELS) {
      expectedKeys.push(`${target}-${level}`);
    }
  }

  const files = fs
    .readdirSync(baseDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  assert.deepEqual(
    files,
    expectedKeys.map((key) => `${key}.json`).sort(),
    "src/data/seo/vocabularyLevels/level-browse-preview has an unexpected file set",
  );

  const seenKeys = new Set();
  const malformed = [];
  for (const file of files) {
    const match = file.match(/^([a-z]+)-(a1|a2|b1|b2|c1|c2)\.json$/);
    if (!match) {
      malformed.push(file);
      continue;
    }
    const [, targetLanguage, level] = match;
    const key = `${targetLanguage}-${level}`;
    assert.ok(!seenKeys.has(key), `duplicate level-browse-preview key: ${key}`);
    seenKeys.add(key);

    const filePath = path.join(baseDir, file);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    assert.equal(parsed.targetLanguage, targetLanguage, `${file} targetLanguage does not match filename`);
    assert.equal(parsed.level, level.toUpperCase(), `${file} level does not match filename`);
    assert.equal(typeof parsed.totalWords, "number", `${file} totalWords is not a number`);
    assert.equal(typeof parsed.totalPages, "number", `${file} totalPages is not a number`);
    assert.ok(Array.isArray(parsed.words), `${file} words is not an array`);
    assert.ok(parsed.words.length > 0, `${file} words is empty`);
    for (const [index, word] of parsed.words.entries()) {
      assert.equal(typeof word?.concept_id, "string", `${file} words[${index}].concept_id is not a string`);
      assert.equal(typeof word?.word_lemma, "string", `${file} words[${index}].word_lemma is not a string`);
    }
  }

  assert.deepEqual(malformed, [], `malformed level-browse-preview filename(s): ${malformed.join(", ")}`);
  assert.deepEqual([...seenKeys].sort(), expectedKeys.sort(), "unexpected level-browse-preview logical key set");
});

test("no runtime source fetches the removed public level-browse-preview URL", () => {
  const runtimeDirs = ["src", "workers", "scripts"];
  const offenders = [];
  const runtimePattern =
    /fetch\(\s*["'`]\/seo\/level-browse-preview|new Request\(\s*["'`]\/seo\/level-browse-preview|XMLHttpRequest[\s\S]{0,300}seo\/level-browse-preview|axios[\s\S]{0,300}seo\/level-browse-preview|new URL\([\s\S]{0,300}seo\/level-browse-preview|import\(\s*["'`]\/seo\/level-browse-preview/;
  for (const dir of runtimeDirs) {
    for (const file of walkFiles(path.join(ROOT_DIR, dir), (abs) => /\.(ts|tsx|mjs|js|jsx)$/.test(abs))) {
      const rel = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
      if (rel === "scripts/tests/architecture/test-generated-data-ownership.mjs") continue;
      const text = fs.readFileSync(file, "utf8");
      if (runtimePattern.test(text) || text.includes("public/seo/level-browse-preview")) {
        offenders.push(rel);
      }
    }
  }
  assert.deepEqual(offenders, [], `removed public level-browse-preview URL is still referenced by runtime source: ${offenders.join(", ")}`);
});

console.log("\n=== generated directory presence ===\n");

for (const dir of [
  "src/data/seo/wordPages/word-hub-pages",
  "src/data/seo/wordPages/word-browse-shards",
  "src/data/seo/vocabularyLevels/level-browse-preview",
  "src/data/seo/verbLists/common100Verbs/verbListLookup",
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
    "src/data/seo/vocabularyLevels",
    "public/vocabularyLevels",
    "src/data/seo/wordPages/word-hub-pages",
    "src/data/seo/wordPages/word-browse-shards",
    "src/data/seo/vocabularyLevels/level-browse-preview",
    "src/data/seo/verbLists/common100Verbs/verbListLookup",
    "public/sitemaps",
    "workers/word-ssr/data/full-corpus",
    "workers/word-ssr/assets-full",
    "workers/word-ssr/worker-dist-full",
  ];
  const missing = requiredMentions.filter((m) => !text.includes(m));
  assert.deepEqual(missing, [], `docs/generated-data.md does not mention: ${missing.join(", ")}`);
});

test("docs/generated-data.md documents src/data/seo/vocabularyLevels/level-browse-preview as authoritative and the public mirror as removed", () => {
  const docPath = path.join(ROOT_DIR, "docs", "generated-data.md");
  const text = fs.readFileSync(docPath, "utf8");
  const sourceIdx = text.indexOf("`src/data/seo/vocabularyLevels/level-browse-preview/` is authoritative");
  assert.ok(sourceIdx !== -1, "src/data/seo/vocabularyLevels/level-browse-preview is not documented");
  const sourceNearby = text.slice(sourceIdx, sourceIdx + 1000).toLowerCase();
  assert.ok(
    /authoritative/.test(sourceNearby) && /42/.test(sourceNearby) && /levelbrowsewords\.ts/.test(sourceNearby),
    "src/data/seo/vocabularyLevels/level-browse-preview is documented without its authoritative 42-file loader contract",
  );

  const publicIdx = text.indexOf("The former `public/seo/level-browse-preview/` tree was removed");
  assert.ok(publicIdx !== -1, "removed public/seo/level-browse-preview mirror is not documented");
  const publicNearby = text.slice(publicIdx, publicIdx + 1200).toLowerCase();
  assert.ok(
    text.includes("## `public/seo/level-browse-preview/` — resolved obsolete duplicate"),
    "public/seo/level-browse-preview section does not classify the mirror as obsolete",
  );
  assert.ok(
    /removed/.test(publicNearby) && /no\s+direct\s+public\s+fetch\s+contract/.test(publicNearby),
    "public/seo/level-browse-preview is documented without its removed/obsolete/no-public-fetch status",
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
