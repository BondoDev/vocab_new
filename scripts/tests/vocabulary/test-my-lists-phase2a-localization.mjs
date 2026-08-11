// Localization contract for My Lists Phase 2A's new
// userProfile.myListsSection.* keys (item 25 of the Phase 2A test list) —
// mirrors test-my-lists-localization.mjs's Phase 1 precedent exactly:
// every one of the 7 supported interface files stays valid JSON and
// defines the same key set as English, with non-empty values, and the
// exact verbatim (do-not-reword) strings supplied for this task.
//
// Plain `node` (no TypeScript involved).
//
// Run: node scripts/tests/vocabulary/test-my-lists-phase2a-localization.mjs
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

console.log("\n=== myListsSection Phase 2A key contract ===\n");

const parsed = new Map();
for (const fileName of LOCALE_FILES) {
  test(`${fileName} is valid JSON`, () => {
    const raw = fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8");
    parsed.set(fileName, JSON.parse(raw));
  });
}

const PHASE2A_NEW_KEYS = [
  "renameError",
  "deleteError",
  "duplicateNameError",
  "wordsUnit",
  "rename",
  "delete",
  "card.viewList",
  "renameModal.title",
  "renameModal.submit",
  "deleteDialog.title",
  "deleteDialog.description",
  "detail.backToMyLists",
  "detail.emptyState",
  "detail.addedColumn",
  "search.placeholder",
  "search.ariaLabel",
  "sort.ariaLabel",
  "sort.recentlyUpdated",
  "sort.nameAsc",
  "sort.nameDesc",
].sort();

const englishSection = parsed.get("english_interface.json")?.userProfile?.myListsSection;
const englishKeys = flattenKeys(englishSection ?? {});

test("25a. Every Phase 2A key is present in English", () => {
  for (const key of PHASE2A_NEW_KEYS) {
    assert.ok(englishKeys.includes(key), `english_interface.json is missing myListsSection.${key}`);
  }
});

for (const fileName of LOCALE_FILES) {
  test(`25. ${fileName} myListsSection key set matches English exactly (Phase 1 + Phase 2A)`, () => {
    const section = parsed.get(fileName)?.userProfile?.myListsSection;
    assert.ok(section, `${fileName} is missing userProfile.myListsSection`);
    assert.deepEqual(flattenKeys(section), englishKeys, `${fileName} myListsSection keys differ from English`);
  });

  test(`${fileName} every Phase 2A key has a non-empty string value`, () => {
    const section = parsed.get(fileName).userProfile.myListsSection;
    for (const key of PHASE2A_NEW_KEYS) {
      const value = key.split(".").reduce((node, part) => node?.[part], section);
      assert.equal(typeof value, "string", `${fileName}: myListsSection.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: myListsSection.${key} is empty`);
    }
  });
}

console.log("\n=== Verbatim, do-not-reword translations as supplied by the Phase 2A brief ===\n");

// Only the concepts the Phase 2A brief actually supplied literal English
// text for (duplicateNameError, deleteDialog.title/description) are pinned
// verbatim in English here; every other new string (Rename/Delete/Save/
// Back to My Lists/Search lists/sort labels/etc.) was supplied as a
// required *concept*, not an exact sentence, so only its presence/reuse is
// checked elsewhere in this file — matching test-my-lists-localization.mjs's
// own "only pin what was actually supplied verbatim" precedent.
test("English duplicateNameError matches the exact supplied sentence", () => {
  assert.equal(
    parsed.get("english_interface.json").userProfile.myListsSection.duplicateNameError,
    "A list with this name already exists.",
  );
});

test("English deleteDialog.title/description match the exact supplied sentences", () => {
  const deleteDialog = parsed.get("english_interface.json").userProfile.myListsSection.deleteDialog;
  assert.equal(deleteDialog.title, "Delete list?");
  assert.equal(
    deleteDialog.description,
    "Deleting this list will remove the list and its word memberships. Your vocabulary progress will not be affected.",
  );
});

test("English detail.backToMyLists / detail.emptyState / search.placeholder match the exact supplied phrases", () => {
  const section = parsed.get("english_interface.json").userProfile.myListsSection;
  assert.equal(section.detail.backToMyLists, "Back to My Lists");
  assert.equal(section.detail.emptyState, "No words in this list yet.");
  assert.equal(section.search.placeholder, "Search lists");
});

test("English sort labels match the exact supplied phrases", () => {
  const sort = parsed.get("english_interface.json").userProfile.myListsSection.sort;
  assert.equal(sort.recentlyUpdated, "Recently updated");
  assert.equal(sort.nameAsc, "Name A–Z");
  assert.equal(sort.nameDesc, "Name Z–A");
});

test("English card.viewList / rename / delete / renameModal.submit match the exact supplied phrases", () => {
  const section = parsed.get("english_interface.json").userProfile.myListsSection;
  assert.equal(section.card.viewList, "View List");
  assert.equal(section.rename, "Rename");
  assert.equal(section.delete, "Delete");
  assert.equal(section.renameModal.title, "Rename List");
  assert.equal(section.renameModal.submit, "Save");
});

console.log("\n=== Reuse over duplication ===\n");

test("Learning/Known/Mastered labels are reused from vocabularySection rather than redefined under myListsSection", () => {
  const englishRoot = parsed.get("english_interface.json").userProfile;
  assert.equal(englishRoot.vocabularySection.table.statuses.learning, "Learning");
  assert.equal(englishRoot.vocabularySection.table.statuses.known, "Known");
  assert.equal(englishRoot.vocabularySection.table.statuses.mastered, "Mastered");
  assert.ok(
    !("statuses" in (englishRoot.myListsSection ?? {})),
    "myListsSection must not redefine its own Learning/Known/Mastered category labels",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-phase2a-localization guard passed");
}
