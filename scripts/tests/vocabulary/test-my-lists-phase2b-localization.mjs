// Localization contract for My Lists Phase 2B's new
// userProfile.myListsSection.* keys (item 26 of the Phase 2B brief) —
// mirrors test-my-lists-phase2a-localization.mjs's precedent exactly:
// every one of the 7 supported interface files stays valid JSON and
// defines the same key set as English, with non-empty values, and the
// exact verbatim (do-not-reword) strings supplied for this task.
//
// Plain `node` (no TypeScript involved).
//
// Run: node scripts/tests/vocabulary/test-my-lists-phase2b-localization.mjs
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

function flattenKeys(obj, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const path_ = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenKeys(value, path_));
    } else {
      out.push(path_);
    }
  }
  return out.sort();
}

console.log("\n=== myListsSection Phase 2B key contract ===\n");

const parsed = new Map();
for (const fileName of LOCALE_FILES) {
  test(`${fileName} is valid JSON`, () => {
    const raw = fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8");
    parsed.set(fileName, JSON.parse(raw));
  });
}

const PHASE2B_NEW_KEYS = [
  "addWords",
  "addWordsError",
  "removeFromList",
  "removedFromList",
  "removeError",
  "searchWords",
  "statusAll",
  "viewWordDetails",
  "detail.emptyStateDescription",
  "detail.noMatch",
  "detail.sortRecentlyAdded",
  "detail.sortNameAsc",
  "picker.alreadyAdded",
  "picker.wordSelected",
  "picker.wordsSelected",
  "picker.addSelected",
  "picker.addWord",
  "picker.addWords",
].sort();

const englishSection = parsed.get("english_interface.json")?.userProfile?.myListsSection;
const englishKeys = flattenKeys(englishSection ?? {});

test("26a. Every Phase 2B key is present in English", () => {
  for (const key of PHASE2B_NEW_KEYS) {
    assert.ok(englishKeys.includes(key), `english_interface.json is missing myListsSection.${key}`);
  }
});

for (const fileName of LOCALE_FILES) {
  test(`26. ${fileName} myListsSection key set matches English exactly (Phase 1 + 2A + 2B)`, () => {
    const section = parsed.get(fileName)?.userProfile?.myListsSection;
    assert.ok(section, `${fileName} is missing userProfile.myListsSection`);
    assert.deepEqual(flattenKeys(section), englishKeys, `${fileName} myListsSection keys differ from English`);
  });

  test(`${fileName} every Phase 2B key has a non-empty string value`, () => {
    const section = parsed.get(fileName).userProfile.myListsSection;
    for (const key of PHASE2B_NEW_KEYS) {
      const value = key.split(".").reduce((node, part) => node?.[part], section);
      assert.equal(typeof value, "string", `${fileName}: myListsSection.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: myListsSection.${key} is empty`);
    }
  });

  test(`${fileName} interpolated picker strings keep their {count} token`, () => {
    const picker = parsed.get(fileName).userProfile.myListsSection.picker;
    assert.ok(picker.wordSelected.includes("{count}"), `${fileName}: picker.wordSelected is missing {count}`);
    assert.ok(picker.wordsSelected.includes("{count}"), `${fileName}: picker.wordsSelected is missing {count}`);
    assert.ok(picker.addWord.includes("{count}"), `${fileName}: picker.addWord is missing {count}`);
    assert.ok(picker.addWords.includes("{count}"), `${fileName}: picker.addWords is missing {count}`);
    // addSelected is the zero-selection fallback — deliberately has no count.
    assert.ok(!picker.addSelected.includes("{count}"), `${fileName}: picker.addSelected must not interpolate a count`);
  });
}

console.log("\n=== Verbatim, do-not-reword translations as supplied by the Phase 2B brief ===\n");

// Only the concepts the Phase 2B brief supplied literal English text for
// are pinned verbatim here; every other new string was supplied as a
// required *concept* (e.g. "Add selected", "word selected"), not an exact
// full sentence, so only its presence/interpolation shape is checked above
// — matching test-my-lists-phase2a-localization.mjs's own precedent.
test("English required-concept strings match the brief exactly", () => {
  const section = parsed.get("english_interface.json").userProfile.myListsSection;
  assert.equal(section.addWords, "Add Words");
  assert.equal(section.searchWords, "Search words");
  assert.equal(section.statusAll, "All");
  assert.equal(section.picker.alreadyAdded, "Already added");
  assert.equal(section.picker.addSelected, "Add selected");
  assert.equal(section.detail.emptyState, "No words in this list yet.");
  assert.equal(
    section.detail.emptyStateDescription,
    "Add words from your vocabulary to start building this list.",
  );
  assert.equal(section.detail.noMatch, "No matching words");
  assert.equal(section.removeFromList, "Remove from list");
  assert.equal(section.removedFromList, "Removed from list");
  assert.equal(section.detail.addedColumn, "Added");
  assert.equal(section.detail.sortRecentlyAdded, "Recently added");
  assert.equal(section.detail.sortNameAsc, "Word A–Z");
  assert.equal(section.viewWordDetails, "View word details");
  assert.equal(section.detail.backToMyLists, "Back to My Lists");
});

console.log("\n=== Reuse over duplication ===\n");

test("Learning/Known/Mastered and the Word/Translation/Level/Status/Added columns are reused from vocabularySection, not redefined under myListsSection", () => {
  const englishRoot = parsed.get("english_interface.json").userProfile;
  assert.equal(englishRoot.vocabularySection.table.statuses.learning, "Learning");
  assert.equal(englishRoot.vocabularySection.table.statuses.known, "Known");
  assert.equal(englishRoot.vocabularySection.table.statuses.mastered, "Mastered");
  assert.equal(englishRoot.vocabularySection.table.columns.word, "Word");
  assert.equal(englishRoot.vocabularySection.table.columns.translation, "Translation");
  assert.equal(englishRoot.vocabularySection.table.columns.level, "Level");
  assert.equal(englishRoot.vocabularySection.table.columns.status, "Status");
  const myListsSection = englishRoot.myListsSection;
  assert.ok(!("statuses" in myListsSection), "myListsSection must not redefine Learning/Known/Mastered");
  assert.ok(!("columns" in myListsSection), "myListsSection must not redefine Word/Translation/Level/Status column labels");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-phase2b-localization guard passed");
}
