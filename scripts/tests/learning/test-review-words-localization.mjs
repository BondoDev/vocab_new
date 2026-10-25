// Focused localization-contract guard for Review Words. Confirms every one
// of the 7 supported interface files stays valid JSON and defines the exact
// same `reviewWords.*` key set as English (no missing/extra keys, no
// production-visible copy silently falling back to another language) —
// plus a couple of route/content sanity checks the requirement called out
// by name. Plain `node` (no TypeScript stripping needed: these are JSON
// files only).
//
// Run: node scripts/tests/learning/test-review-words-localization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");

const LOCALE_FILES = [
  "english_interface.json",
  "german_interface.json",
  "spanish_interface.json",
  "french_interface.json",
  "italian_interface.json",
  "portuguese_interface.json",
  "russian_interface.json",
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

console.log("\n=== reviewWords localization contract ===\n");

const parsed = new Map();
for (const fileName of LOCALE_FILES) {
  test(`${fileName} is valid JSON`, () => {
    const raw = fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8");
    parsed.set(fileName, JSON.parse(raw));
  });
}

const englishKeys = Object.keys(parsed.get("english_interface.json")?.reviewWords ?? {}).sort();

test("english_interface.json defines a non-empty reviewWords section", () => {
  assert.ok(englishKeys.length > 0);
});

for (const fileName of LOCALE_FILES) {
  if (fileName === "english_interface.json") continue;
  test(`${fileName} reviewWords key set matches English exactly`, () => {
    const data = parsed.get(fileName);
    assert.ok(data?.reviewWords, `${fileName} is missing a top-level "reviewWords" section`);
    const keys = Object.keys(data.reviewWords).sort();
    assert.deepEqual(keys, englishKeys, `${fileName} reviewWords keys differ from English`);
  });
}

// reviewWords.continuous (continuous reviewing) is the one nested group: it
// holds count strings whose plural categories differ by language (Russian
// adds _few/_many), which a flat English-parity key set can't express.
const NESTED_GROUPS = new Set(["continuous"]);

for (const fileName of LOCALE_FILES) {
  test(`${fileName} reviewWords values are all non-empty strings`, () => {
    const data = parsed.get(fileName);
    for (const [key, value] of Object.entries(data.reviewWords)) {
      const entries = NESTED_GROUPS.has(key) ? Object.entries(value ?? {}).map(([k, v]) => [`${key}.${k}`, v]) : [[key, value]];
      for (const [path, text] of entries) {
        assert.equal(typeof text, "string", `${fileName}: reviewWords.${path} is not a string`);
        assert.ok(text.trim().length > 0, `${fileName}: reviewWords.${path} is empty`);
      }
    }
  });
}

// Every reviewWords key the review screens actually render must resolve in
// every language (the lookup shows the raw key path on a miss). Plain keys
// are read from the components' source; plural bases (formatCount calls)
// must resolve for the category Intl.PluralRules picks, falling back to
// _other exactly as utils/formatCount.ts does.
const REVIEW_DIR = path.join(ROOT_DIR, "src", "features", "review-words");
const REVIEW_SOURCES = ["ReviewWordsPreparation.tsx", "ReviewSession.tsx", "ReviewSessionComplete.tsx"].map((name) =>
  fs.readFileSync(path.join(REVIEW_DIR, name), "utf8"),
).join("\n");
const reviewPluralBases = [
  ...new Set([...REVIEW_SOURCES.matchAll(/formatCount\(\s*t,\s*uiLanguage,\s*"(reviewWords\.[A-Za-z0-9_.]+)"/g)].map((m) => m[1])),
];
const reviewPlainKeys = [
  ...new Set(
    [...REVIEW_SOURCES.matchAll(/"(reviewWords\.[A-Za-z0-9_.]+)"/g)]
      .map((m) => m[1])
      .filter((key) => !reviewPluralBases.includes(key)),
  ),
];
const LOCALE_CODES = {
  "english_interface.json": "en",
  "german_interface.json": "de",
  "spanish_interface.json": "es",
  "french_interface.json": "fr",
  "italian_interface.json": "it",
  "portuguese_interface.json": "pt",
  "russian_interface.json": "ru",
};
const lookup = (root, key) => key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), root);

test("review screens reference continuous-review keys (sanity check of the source scan)", () => {
  assert.ok(reviewPlainKeys.includes("reviewWords.continuous.finishButton"));
  assert.ok(reviewPluralBases.includes("reviewWords.continuous.finishedSubtitle"));
});

for (const fileName of LOCALE_FILES) {
  test(`${fileName}: every reviewWords key used by the review screens resolves (incl. plural forms)`, () => {
    const data = parsed.get(fileName);
    for (const key of reviewPlainKeys) {
      const value = lookup(data, key);
      assert.ok(typeof value === "string" && value.trim().length > 0, `missing "${key}"`);
    }
    const rules = new Intl.PluralRules(LOCALE_CODES[fileName]);
    for (const base of reviewPluralBases) {
      assert.ok(lookup(data, `${base}_other`), `missing "${base}_other"`);
      for (const count of [0, 1, 2, 3, 5, 11, 21, 22, 25, 101]) {
        const template = lookup(data, `${base}_${rules.select(count)}`) ?? lookup(data, `${base}_other`);
        assert.ok(template.includes("{count}"), `"${base}" form for ${count} lacks {count}`);
      }
    }
  });
}

test("russian_interface.json has few/many forms for the review summary sentence", () => {
  const data = parsed.get("russian_interface.json");
  for (const category of ["one", "few", "many"]) {
    assert.ok(lookup(data, `reviewWords.continuous.finishedSubtitle_${category}`), `missing _${category}`);
  }
});

test("english_interface.json reuses the existing modeCards Review Words button label", () => {
  const data = parsed.get("english_interface.json");
  const buttonLabel = data?.userProfile?.learningSection?.modeCards?.modes?.reviewWords?.buttonLabel;
  assert.equal(buttonLabel, "Start Review");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("review-words-localization guard passed");
}
