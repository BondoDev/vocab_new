// Localization guard for the Study New Words completion screen
// (src/features/study-new-words/NewWordStudyComplete.tsx). The translation
// lookup returns the raw key path on a miss, so a key missing from any one
// interface file shows up as text like "studyNewWords.complete.title" for
// that UI language. This reads the keys straight from the component source
// (plain t("...") calls and formatCount(..., "base", ...) plural bases) so
// the check can't drift from what the screen renders, then for all seven
// interface files asserts:
// - every plain key resolves to a non-empty string;
// - every plural base resolves for the plural category Intl.PluralRules
//   picks for a spread of counts (falling back to `_other`, exactly as the
//   component does), uses only known placeholders, and contains {count};
// - Russian defines its own few/many forms where the count is grammatical.
//
// Run: node scripts/tests/learning/test-new-word-study-complete-localization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");
const COMPONENT_PATH = path.join(ROOT_DIR, "src", "features", "study-new-words", "NewWordStudyComplete.tsx");

const LOCALES = [
  ["english_interface.json", "en"],
  ["german_interface.json", "de"],
  ["spanish_interface.json", "es"],
  ["french_interface.json", "fr"],
  ["italian_interface.json", "it"],
  ["portuguese_interface.json", "pt"],
  ["russian_interface.json", "ru"],
];
const SAMPLE_COUNTS = [0, 1, 2, 3, 4, 5, 11, 12, 15, 21, 22, 25, 30, 45, 101];
const ALLOWED_PLACEHOLDERS = new Set(["count", "language", "languageLower"]);
// Plural bases whose Russian wording changes with the count (not the
// plural-neutral "Показать все слова ({count})" style).
const RUSSIAN_GRAMMATICAL_BASES = [
  "studyNewWords.complete.subtitle",
  "studyNewWords.complete.reviewDueDescription",
];

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

function lookup(root, key) {
  let node = root;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

console.log("\n=== Study New Words completion localization ===\n");

const source = fs.readFileSync(COMPONENT_PATH, "utf8");
const pluralBases = [
  ...new Set([...source.matchAll(/formatCount\(\s*t,\s*uiLanguage,\s*"([A-Za-z0-9_.]+)"/g)].map((m) => m[1])),
];
// Plain t("...") calls, plus every "studyNewWords.complete.*" literal that
// isn't a plural base — this also covers keys picked by a condition, e.g.
// t(isFavorite ? "…removeFromFavorites" : "…addToFavorites").
const plainKeys = [
  ...new Set([
    ...[...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"\)/g)].map((m) => m[1]),
    ...[...source.matchAll(/"(studyNewWords\.complete\.[A-Za-z0-9_]+)"/g)]
      .map((m) => m[1])
      .filter((key) => !pluralBases.includes(key)),
  ]),
];

test("component exposes the expected translation calls", () => {
  assert.ok(plainKeys.includes("studyNewWords.complete.title"), "title key not found in component source");
  assert.ok(plainKeys.includes("studyNewWords.returnToLearningButton"), "return key not found in component source");
  assert.ok(pluralBases.includes("studyNewWords.complete.subtitle"), "plural bases not found in component source");
});

for (const [fileName, code] of LOCALES) {
  const data = JSON.parse(fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8"));
  const rules = new Intl.PluralRules(code);

  test(`${fileName}: every plain completion key resolves`, () => {
    for (const key of plainKeys) {
      const value = lookup(data, key);
      assert.ok(typeof value === "string" && value.trim().length > 0, `missing or empty "${key}"`);
    }
  });

  test(`${fileName}: every plural base resolves with valid placeholders`, () => {
    for (const base of pluralBases) {
      assert.ok(lookup(data, `${base}_other`), `missing "${base}_other" (required fallback form)`);
      for (const count of SAMPLE_COUNTS) {
        const template = lookup(data, `${base}_${rules.select(count)}`) ?? lookup(data, `${base}_other`);
        assert.ok(template.includes("{count}"), `"${base}" form for ${count} has no {count}`);
        for (const [, name] of template.matchAll(/\{(\w+)\}/g)) {
          assert.ok(ALLOWED_PLACEHOLDERS.has(name), `"${base}" uses unknown placeholder {${name}}`);
        }
      }
    }
  });

  test(`${fileName}: language names used by the screen exist`, () => {
    for (const lang of ["en", "de", "es", "fr", "it", "pt", "ru"]) {
      assert.ok(lookup(data, `languageNames.${lang}`), `missing languageNames.${lang}`);
    }
  });
}

test("russian_interface.json defines few/many forms for count-dependent text", () => {
  const data = JSON.parse(fs.readFileSync(path.join(INTERFACE_DIR, "russian_interface.json"), "utf8"));
  for (const base of RUSSIAN_GRAMMATICAL_BASES) {
    for (const category of ["one", "few", "many"]) {
      assert.ok(lookup(data, `${base}_${category}`), `missing "${base}_${category}"`);
    }
  }
});

console.log(`\n─────────────────────────────────────────\n  ${passed} passed, ${failed} failed\n─────────────────────────────────────────\n`);
if (failed > 0) process.exit(1);
console.log("new-word-study-complete localization guard passed");
