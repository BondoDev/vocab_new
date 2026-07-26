// Deterministic guard for every import.meta.glob boundary documented in
// docs/import-boundaries.md. Protects the *file-matching contract* each glob
// depends on (expected directory, expected filename convention, expected
// count, eager/lazy status) independently of the SEO/Worker regression
// suites, which mostly protect rendered *output* rather than the glob match
// set itself.
//
// This intentionally does not re-check things already covered elsewhere:
//   - workers/word-ssr/tests/test-worker-bundle-size.mjs already asserts
//     WordSeoPageView.tsx has no import.meta.glob and no vocabulary-*.js
//     chunk reaches the Worker bundle.
//   - scripts/tests/routing/test-level-browse-preview-completeness.mjs already asserts
//     the exact 42-key match set for level-browse-preview/*.json.
//
// Run: node scripts/tests/architecture/test-import-boundaries.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

const compiled = compileTsToCommonJs(".tmp-import-boundaries", [
  path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
]);
const { SUPPORTED_TARGET_LANGUAGES, SUPPORTED_LEVELS } = compiled.require("src/data/seo/shared/slugs");

function readdirJson(relDir) {
  const abs = path.join(ROOT_DIR, relDir);
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function assertExactMatchSet(label, relDir, expectedFiles) {
  const expected = [...expectedFiles].sort();
  const actual = readdirJson(relDir);
  const missing = expected.filter((f) => !actual.includes(f));
  const unexpected = actual.filter((f) => !expected.includes(f));
  assert.deepEqual(missing, [], `${label}: missing expected file(s): ${missing.join(", ")}`);
  assert.deepEqual(
    unexpected,
    [],
    `${label}: unexpected file(s) present (would silently enter the glob): ${unexpected.join(", ")}`,
  );
}

console.log("\n=== import.meta.glob match-set guards ===\n");

test("src/data/vocabulary/*/vocabulary.json — exactly one file per target language", () => {
  const abs = path.join(ROOT_DIR, "src", "data", "vocabulary");
  const dirs = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepEqual(dirs, [...SUPPORTED_TARGET_LANGUAGES].sort());
  for (const lang of SUPPORTED_TARGET_LANGUAGES) {
    assert.ok(
      fs.existsSync(path.join(abs, lang, "vocabulary.json")),
      `missing src/data/vocabulary/${lang}/vocabulary.json`,
    );
  }
});

test("src/data/interface/*.json — exactly one file per supported language", () => {
  assertExactMatchSet(
    "src/data/interface",
    "src/data/interface",
    SUPPORTED_TARGET_LANGUAGES.map((lang) => `${lang}_interface.json`),
  );
});

test("src/data/seo/wordPages/word-hub-pages/*.json — exactly one file per target language", () => {
  assertExactMatchSet(
    "src/data/seo/wordPages/word-hub-pages",
    "src/data/seo/wordPages/word-hub-pages",
    SUPPORTED_TARGET_LANGUAGES.map((lang) => `${lang}.json`),
  );
});

test("src/data/seo/wordPages/word-browse-shards/*.json — exactly one file per language x CEFR level", () => {
  const expected = SUPPORTED_TARGET_LANGUAGES.flatMap((lang) =>
    SUPPORTED_LEVELS.map((level) => `${lang}-${level}.json`),
  );
  assertExactMatchSet("src/data/seo/wordPages/word-browse-shards", "src/data/seo/wordPages/word-browse-shards", expected);
});

test("src/data/seo/verbLists/shared/common100VerbLookup/*.json — exactly one file per target language", () => {
  assertExactMatchSet(
    "src/data/seo/verbLists/shared/common100VerbLookup",
    "src/data/seo/verbLists/shared/common100VerbLookup",
    SUPPORTED_TARGET_LANGUAGES.map((lang) => `${lang}.json`),
  );
});

console.log("\n=== eager/lazy contract guards ===\n");

// [consumer relative path, glob pattern substring, required option substring or null for "must stay lazy"]
const EAGER_LAZY_CONTRACT = [
  ["workers/word-ssr/src/render-entry.tsx", "../../../src/data/interface/*.json", "eager: true"],
  ["src/entry-server.tsx", "./data/vocabulary/*/vocabulary.json", null],
  ["src/entry-server.tsx", "./data/interface/*.json", null],
  ["src/data/seo/wordPages/wordHubData.ts", "./word-hub-pages/*.json", "eager: true"],
  ["src/data/seo/wordPages/wordBrowseSearchData.ts", "./word-browse-shards/*.json", null],
  ["src/data/seo/verbLists/common100Verbs/common100VerbList.ts", "../shared/common100VerbLookup/*.json", "eager: true"],
  ["src/app/pages/word-pages/detail/WordSeoPage.tsx", "../../../../data/vocabulary/*/vocabulary.json", null],
  ["src/app/pages/vocabulary/VocabularyLevelPage.tsx", "../../../data/vocabulary/*/vocabulary.json", null],
  ["src/data/seo/vocabularyLevels/levelBrowseWords.ts", "./level-browse-preview/*.json", null],
];

for (const [relFile, patternSubstring, requiredOption] of EAGER_LAZY_CONTRACT) {
  test(`${relFile}: "${patternSubstring}" is ${requiredOption ? "eager" : "lazy"} as expected`, () => {
    const source = fs.readFileSync(path.join(ROOT_DIR, relFile), "utf8");
    const escaped = patternSubstring.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const callMatch = new RegExp(`import\\.meta\\.glob\\(\\s*["']${escaped}["'][\\s\\S]{0,80}?\\)`).exec(source);
    assert.ok(callMatch, `could not find import.meta.glob("${patternSubstring}") in ${relFile}`);
    const hasEager = /eager\s*:\s*true/.test(callMatch[0]);
    if (requiredOption) {
      assert.ok(hasEager, `expected { eager: true } but glob call is lazy: ${callMatch[0]}`);
    } else {
      assert.ok(!hasEager, `expected a lazy glob but found { eager: true }: ${callMatch[0]}`);
    }
  });
}

console.log("\n=== consumer relative-path resolution guards ===\n");

test("render-entry.tsx's ../../../src/data/interface resolves to the real src/data/interface directory", () => {
  const consumerDir = path.join(ROOT_DIR, "workers", "word-ssr", "src");
  const resolved = path.resolve(consumerDir, "..", "..", "..", "src", "data", "interface");
  assert.equal(resolved, path.join(ROOT_DIR, "src", "data", "interface"));
  assert.ok(fs.existsSync(resolved), `resolved path does not exist: ${resolved}`);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

compiled.cleanup();

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("import-boundary guards passed");
}
