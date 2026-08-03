// Focused guard for the pure tab/search filtering logic in
// src/features/user-profile/sections/vocabulary/vocabularyFiltering.ts.
// Import-free at runtime (only type-only imports, erased by the stripper),
// so it loads directly via Node's native TypeScript stripping.
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-vocabulary-filtering.mjs
import assert from "node:assert/strict";
import {
  countVocabularyRowsForTab,
  filterVocabularyRowsByTab,
  filterVocabularyRowsBySearch,
} from "../../../src/features/user-profile/sections/vocabulary/vocabularyFiltering.ts";

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

const ROWS = [
  { id: "1", category: "learning", isFavorite: true, targetWord: "Hallo", translation: "Hello" },
  { id: "2", category: "learning", isFavorite: false, targetWord: "Haus", translation: "House" },
  { id: "3", category: "known", isFavorite: false, targetWord: "Baum", translation: "Tree" },
  { id: "4", category: "known", isFavorite: true, targetWord: "Auto", translation: "Car" },
  { id: "5", category: "mastered", isFavorite: false, targetWord: "Wasser", translation: "Water" },
];

console.log("\n=== filterVocabularyRowsByTab ===\n");

test("1. All Words returns every row", () => {
  assert.equal(filterVocabularyRowsByTab(ROWS, "all").length, 5);
});

test("2. Learning tab returns only learning-category rows", () => {
  const result = filterVocabularyRowsByTab(ROWS, "learning");
  assert.deepEqual(result.map((r) => r.id), ["1", "2"]);
});

test("3. Known tab returns only known-category rows", () => {
  const result = filterVocabularyRowsByTab(ROWS, "known");
  assert.deepEqual(result.map((r) => r.id), ["3", "4"]);
});

test("4. Mastered tab returns only mastered-category rows", () => {
  const result = filterVocabularyRowsByTab(ROWS, "mastered");
  assert.deepEqual(result.map((r) => r.id), ["5"]);
});

test("5. Favorites tab returns only isFavorite rows regardless of category", () => {
  const result = filterVocabularyRowsByTab(ROWS, "favorites");
  assert.deepEqual(
    result.map((r) => r.id).sort(),
    ["1", "4"],
  );
});

test("6. countVocabularyRowsForTab matches filterVocabularyRowsByTab's length for every tab", () => {
  for (const tab of ["all", "learning", "known", "mastered", "favorites"]) {
    assert.equal(countVocabularyRowsForTab(ROWS, tab), filterVocabularyRowsByTab(ROWS, tab).length);
  }
});

console.log("\n=== filterVocabularyRowsBySearch ===\n");

test("7. Case-insensitive target-word match", () => {
  const result = filterVocabularyRowsBySearch(ROWS, "HALLO");
  assert.deepEqual(result.map((r) => r.id), ["1"]);
});

test("8. Translation match", () => {
  const result = filterVocabularyRowsBySearch(ROWS, "car");
  assert.deepEqual(result.map((r) => r.id), ["4"]);
});

test("9. Trimmed input (surrounding whitespace ignored)", () => {
  const result = filterVocabularyRowsBySearch(ROWS, "   baum   ");
  assert.deepEqual(result.map((r) => r.id), ["3"]);
});

test("10. Empty/whitespace-only search returns every row unfiltered", () => {
  assert.equal(filterVocabularyRowsBySearch(ROWS, "").length, 5);
  assert.equal(filterVocabularyRowsBySearch(ROWS, "   ").length, 5);
});

test("11. No-match search returns an empty array, not an error", () => {
  assert.deepEqual(filterVocabularyRowsBySearch(ROWS, "zzz-no-such-word"), []);
});

test("12. Missing/null translation never throws and is treated as unmatched", () => {
  const rowsWithMissingTranslation = [
    { id: "6", category: "learning", isFavorite: false, targetWord: "Vogel", translation: null },
    { id: "7", category: "learning", isFavorite: false, targetWord: "Fisch" },
  ];
  assert.doesNotThrow(() => filterVocabularyRowsBySearch(rowsWithMissingTranslation, "anything"));
  const matchByWord = filterVocabularyRowsBySearch(rowsWithMissingTranslation, "vogel");
  assert.deepEqual(matchByWord.map((r) => r.id), ["6"]);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-filtering guard passed");
}
