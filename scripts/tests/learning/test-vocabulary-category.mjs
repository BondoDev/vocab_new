// Focused guard for the pure backend-state -> user-facing-category mapping
// and summary-count computation in src/data/learning/vocabularyCategory.ts.
// Import-free (only a type-only import, erased at runtime) so it loads
// directly via Node's native TypeScript stripping.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-vocabulary-category.mjs
import assert from "node:assert/strict";
import {
  computeVocabularyCounts,
  mapWordStateToVocabularyCategory,
} from "../../../src/data/learning/vocabularyCategory.ts";

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

console.log("\n=== mapWordStateToVocabularyCategory ===\n");

test("1. seen -> learning", () => assert.equal(mapWordStateToVocabularyCategory("seen"), "learning"));
test("2. learning -> learning", () => assert.equal(mapWordStateToVocabularyCategory("learning"), "learning"));
test("3. familiar -> known", () => assert.equal(mapWordStateToVocabularyCategory("familiar"), "known"));
test("4. strong -> known", () => assert.equal(mapWordStateToVocabularyCategory("strong"), "known"));
test("5. mastered -> mastered", () => assert.equal(mapWordStateToVocabularyCategory("mastered"), "mastered"));

console.log("\n=== computeVocabularyCounts ===\n");

test("6. Correct Learning/Known/Mastered counts across a mixed row set", () => {
  const rows = [
    { wordState: "seen", isFavorite: false },
    { wordState: "learning", isFavorite: false },
    { wordState: "familiar", isFavorite: false },
    { wordState: "strong", isFavorite: false },
    { wordState: "mastered", isFavorite: false },
    { wordState: "mastered", isFavorite: false },
  ];
  const counts = computeVocabularyCounts(rows);
  assert.equal(counts.learning, 2);
  assert.equal(counts.known, 2);
  assert.equal(counts.mastered, 2);
  assert.equal(counts.total, 6);
});

test("7. Favorites overlap correctly with every category (independent axis)", () => {
  const rows = [
    { wordState: "seen", isFavorite: true },
    { wordState: "familiar", isFavorite: true },
    { wordState: "mastered", isFavorite: true },
    { wordState: "mastered", isFavorite: false },
  ];
  const counts = computeVocabularyCounts(rows);
  assert.equal(counts.favorites, 3);
  assert.equal(counts.mastered, 2);
  assert.equal(counts.learning, 1);
  assert.equal(counts.known, 1);
});

test("8. Empty row set produces all-zero counts (new user, no words yet)", () => {
  const counts = computeVocabularyCounts([]);
  assert.deepEqual(counts, { learning: 0, known: 0, mastered: 0, favorites: 0, total: 0 });
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-category guard passed");
}
