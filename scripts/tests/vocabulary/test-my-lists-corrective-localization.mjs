// Localization contract for the My Lists corrective phase: the new
// "notStudied" key across all 7 UI languages, with the exact translations
// the brief specified, plus confirmation that Learning/Known/Mastered are
// still reused from the existing vocabularySection keys (never duplicated
// under myListsSection).
//
// Run: node scripts/tests/vocabulary/test-my-lists-corrective-localization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");

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

// Exact translations specified by the corrective phase brief.
const EXPECTED_NOT_STUDIED = {
  english_interface: "Not studied",
  german_interface: "Noch nicht gelernt",
  spanish_interface: "Aún no estudiada",
  french_interface: "Pas encore étudié",
  italian_interface: "Non ancora studiata",
  portuguese_interface: "Ainda não estudada",
  russian_interface: "Ещё не изучено",
};

function loadLocale(fileBaseName) {
  return JSON.parse(fs.readFileSync(path.join(INTERFACE_DIR, `${fileBaseName}.json`), "utf8"));
}

console.log("\n=== 29. All 7 locales have the exact 'notStudied' translation ===\n");

for (const [fileBaseName, expected] of Object.entries(EXPECTED_NOT_STUDIED)) {
  test(`${fileBaseName}: userProfile.myListsSection.notStudied === "${expected}"`, () => {
    const locale = loadLocale(fileBaseName);
    const actual = locale?.userProfile?.myListsSection?.notStudied;
    assert.equal(actual, expected);
  });
}

console.log("\n=== Reused keys: Learning/Known/Mastered are NOT duplicated under myListsSection ===\n");

for (const fileBaseName of Object.keys(EXPECTED_NOT_STUDIED)) {
  test(`${fileBaseName}: myListsSection has no own learning/known/mastered keys — vocabularySection.table.statuses is reused`, () => {
    const locale = loadLocale(fileBaseName);
    const myLists = locale?.userProfile?.myListsSection;
    assert.ok(myLists, "myListsSection must exist");
    assert.equal(myLists.learning, undefined);
    assert.equal(myLists.known, undefined);
    assert.equal(myLists.mastered, undefined);
    const statuses = locale?.userProfile?.vocabularySection?.table?.statuses;
    assert.ok(statuses?.learning && statuses?.known && statuses?.mastered, "vocabularySection.table.statuses must still exist for reuse");
  });
}

console.log("\n=== Picker/list-detail keys this phase relies on already exist in all 7 locales ===\n");

const REQUIRED_MY_LISTS_KEYS = [
  "statusAll",
  "addWords",
  "searchWords",
  "removeFromList",
  "removedFromList",
  "notStudied",
];
const REQUIRED_PICKER_KEYS = ["alreadyAdded", "wordSelected", "wordsSelected", "addSelected", "addWord", "addWords"];
const REQUIRED_DETAIL_KEYS = ["noMatch", "addedColumn"];

for (const fileBaseName of Object.keys(EXPECTED_NOT_STUDIED)) {
  test(`${fileBaseName}: every required myListsSection/picker/detail key is present and non-empty`, () => {
    const locale = loadLocale(fileBaseName);
    const myLists = locale?.userProfile?.myListsSection;
    for (const key of REQUIRED_MY_LISTS_KEYS) {
      assert.ok(typeof myLists?.[key] === "string" && myLists[key].length > 0, `myListsSection.${key} must be a non-empty string`);
    }
    for (const key of REQUIRED_PICKER_KEYS) {
      assert.ok(typeof myLists?.picker?.[key] === "string" && myLists.picker[key].length > 0, `myListsSection.picker.${key} must be a non-empty string`);
    }
    for (const key of REQUIRED_DETAIL_KEYS) {
      assert.ok(typeof myLists?.detail?.[key] === "string" && myLists.detail[key].length > 0, `myListsSection.detail.${key} must be a non-empty string`);
    }
  });
}

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-corrective-localization guard passed");
}
