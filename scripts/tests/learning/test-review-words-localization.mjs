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

for (const fileName of LOCALE_FILES) {
  test(`${fileName} reviewWords values are all non-empty strings`, () => {
    const data = parsed.get(fileName);
    for (const [key, value] of Object.entries(data.reviewWords)) {
      assert.equal(typeof value, "string", `${fileName}: reviewWords.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: reviewWords.${key} is empty`);
    }
  });
}

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
