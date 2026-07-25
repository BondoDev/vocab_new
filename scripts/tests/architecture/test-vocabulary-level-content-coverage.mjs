// Guard: src/data/seo/vocabularyLevels/seo-cefr-content.json must exactly
// cover every registered vocabulary-level route — the cartesian product of
// SUPPORTED_UI_LANGUAGES x SUPPORTED_TARGET_LANGUAGES x SUPPORTED_LEVELS
// (src/data/seo/shared/slugs.ts) — with no duplicate or unexpected entry.
//
// Why this exists: every vocabulary-level route resolves through
// findSeoCefrPreviewItem() (devSeoCefrPreviewData.ts), which reads
// seo-cefr-content.json exclusively for both page content and metadata.
// The legacy src/data/seo/vocabularyLevels/{ui}/{target}.json matrix and its
// component-level fallback-loading pipeline have been removed (Phase 7 of
// the vocabulary-level legacy cleanup); seo-cefr-content.json is now the
// sole canonical content source, so this guard is what keeps its coverage
// complete going forward.
//
// Run: node scripts/tests/architecture/test-vocabulary-level-content-coverage.mjs
import assert from "node:assert/strict";
import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR, readJson } from "../../lib/compileTs.mjs";

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

const compiled = compileTsToCommonJs(".tmp-vocabulary-level-content-coverage", [
  path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
]);
const {
  SUPPORTED_UI_LANGUAGES,
  SUPPORTED_TARGET_LANGUAGES,
  SUPPORTED_LEVELS,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
} = compiled.require("src/data/seo/shared/slugs");

const uiSet = new Set(SUPPORTED_UI_LANGUAGES);
const targetSet = new Set(SUPPORTED_TARGET_LANGUAGES);
const levelSet = new Set(SUPPORTED_LEVELS);

// Same normalization devSeoCefrPreviewData.ts's normalizeTargetLanguage()
// performs (a seo-cefr-content.json entry's targetLanguage may be a UI-style
// code like "en" or an already-normalized slug like "english") — derived
// here from the actual production registry (the inverse of
// TARGET_LANGUAGE_TO_UI_LANGUAGE) rather than re-typed by hand.
const uiCodeToTargetSlug = {};
for (const [targetSlug, uiCode] of Object.entries(TARGET_LANGUAGE_TO_UI_LANGUAGE)) {
  uiCodeToTargetSlug[uiCode] = targetSlug;
}

function normalizeTargetLanguage(raw) {
  if (targetSet.has(raw)) return raw;
  if (uiCodeToTargetSlug[raw]) return uiCodeToTargetSlug[raw];
  return null;
}

const content = readJson("src/data/seo/vocabularyLevels/seo-cefr-content.json");

console.log("\n=== seo-cefr-content.json entry validity ===\n");

const invalidEntries = [];
const keyed = [];
content.forEach((entry, index) => {
  const uiLanguage = typeof entry?.uiLanguage === "string" ? entry.uiLanguage : "";
  const rawTargetLanguage = typeof entry?.targetLanguage === "string" ? entry.targetLanguage : "";
  const level = typeof entry?.level === "string" ? entry.level : "";
  const normalizedTarget = normalizeTargetLanguage(rawTargetLanguage);

  const problems = [];
  if (!uiLanguage) problems.push("missing/empty uiLanguage");
  else if (!uiSet.has(uiLanguage)) problems.push(`unsupported uiLanguage "${uiLanguage}"`);
  if (!rawTargetLanguage) problems.push("missing/empty targetLanguage");
  else if (!normalizedTarget) problems.push(`unsupported targetLanguage "${rawTargetLanguage}"`);
  if (!level) problems.push("missing/empty level");
  else if (!levelSet.has(level)) problems.push(`unsupported level "${level}"`);

  if (problems.length > 0) {
    invalidEntries.push(`index ${index}: ${problems.join(", ")}`);
    return;
  }

  keyed.push({ key: `${uiLanguage}|${normalizedTarget}|${level}`, index });
});

test("every entry has a valid, supported, non-empty uiLanguage/targetLanguage/level", () => {
  assert.deepEqual(
    invalidEntries.slice(0, 10),
    [],
    `${invalidEntries.length} invalid entr${invalidEntries.length === 1 ? "y" : "ies"} (showing up to 10): ${invalidEntries
      .slice(0, 10)
      .join("; ")}`,
  );
});

console.log("\n=== duplicate composite-key check ===\n");

const indicesByKey = new Map();
for (const { key, index } of keyed) {
  const indices = indicesByKey.get(key) ?? [];
  indices.push(index);
  indicesByKey.set(key, indices);
}
const duplicateKeys = [...indicesByKey.entries()].filter(([, indices]) => indices.length > 1);

test("no duplicate uiLanguage|targetLanguage|level combination exists", () => {
  assert.deepEqual(
    duplicateKeys.slice(0, 10).map(([key, indices]) => `${key} (indices ${indices.join(",")})`),
    [],
    `${duplicateKeys.length} duplicate key(s) (showing up to 10)`,
  );
});

console.log("\n=== exact cartesian-product coverage ===\n");

const expectedTotal =
  SUPPORTED_UI_LANGUAGES.length * SUPPORTED_TARGET_LANGUAGES.length * SUPPORTED_LEVELS.length;
const expectedKeys = new Set();
for (const ui of SUPPORTED_UI_LANGUAGES) {
  for (const target of SUPPORTED_TARGET_LANGUAGES) {
    for (const level of SUPPORTED_LEVELS) {
      expectedKeys.add(`${ui}|${target}|${level}`);
    }
  }
}

const actualKeys = new Set(keyed.map(({ key }) => key));
const missingKeys = [...expectedKeys].filter((key) => !actualKeys.has(key)).sort();
const unexpectedKeys = [...actualKeys].filter((key) => !expectedKeys.has(key)).sort();

test(`expected combination total is derived from registry lengths (currently ${expectedTotal})`, () => {
  assert.equal(
    expectedKeys.size,
    expectedTotal,
    "derived cartesian-product set size does not match the multiplied registry lengths",
  );
});

test("no expected combination is missing from seo-cefr-content.json", () => {
  assert.deepEqual(
    missingKeys.slice(0, 10),
    [],
    `${missingKeys.length} missing combination(s) (showing up to 10)`,
  );
});

test("no unexpected combination exists in seo-cefr-content.json", () => {
  assert.deepEqual(
    unexpectedKeys.slice(0, 10),
    [],
    `${unexpectedKeys.length} unexpected combination(s) (showing up to 10)`,
  );
});

test("actual unique-key set exactly equals the expected cartesian-product set", () => {
  assert.equal(actualKeys.size, expectedKeys.size);
  assert.deepEqual([...actualKeys].sort(), [...expectedKeys].sort());
});

console.log(`\nDerived expected combinations: ${expectedTotal}`);
console.log(`Actual valid unique combinations: ${actualKeys.size}`);

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

compiled.cleanup();

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-level content coverage guard passed");
}
