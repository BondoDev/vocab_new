// Pure-function contract for the My Lists corrective phase: status
// resolution (listWordStatus.ts), status/search filtering
// (listWordFiltering.ts), word-count aggregation (listWordCounts.ts), and
// full-vocabulary concept enumeration (resolveVocabularyWordData.ts's
// listResolvableConceptIds). No test framework/DOM exists in this
// repository — matching test-my-lists-phase2a-pure-logic.mjs's own
// precedent, this covers everything expressible as a pure function
// directly.
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-my-lists-corrective-pure-logic.mjs
import assert from "node:assert/strict";
import { resolveListWordStatus } from "../../../src/features/user-profile/sections/my-lists/listWordStatus.ts";
import {
  filterListWordRowsByStatus,
  filterListWordRowsBySearch,
} from "../../../src/features/user-profile/sections/my-lists/listWordFiltering.ts";
import {
  computeListWordCountsByListId,
  getListWordCount,
} from "../../../src/features/user-profile/sections/my-lists/listWordCounts.ts";
import { listResolvableConceptIds } from "../../../src/data/vocabulary/resolveVocabularyWordData.ts";

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

console.log("\n=== resolveListWordStatus: notStudied is a first-class status, not a fallback error ===\n");

test("No word_state (undefined/null) resolves to 'notStudied' — never throws, never guesses a category", () => {
  assert.equal(resolveListWordStatus(undefined), "notStudied");
  assert.equal(resolveListWordStatus(null), "notStudied");
});

test("seen/learning word_state resolves to 'learning' (same mapping the Vocabulary page already uses)", () => {
  assert.equal(resolveListWordStatus("seen"), "learning");
  assert.equal(resolveListWordStatus("learning"), "learning");
});

test("familiar/strong word_state resolves to 'known'", () => {
  assert.equal(resolveListWordStatus("familiar"), "known");
  assert.equal(resolveListWordStatus("strong"), "known");
});

test("mastered word_state resolves to 'mastered'", () => {
  assert.equal(resolveListWordStatus("mastered"), "mastered");
});

console.log("\n=== listWordFiltering: status + search filtering over notStudied-inclusive rows ===\n");

const ROWS = [
  { conceptId: "A1-00001", targetWord: "Hallo", translation: "Hello", status: "notStudied" },
  { conceptId: "A1-00002", targetWord: "Haus", translation: "House", status: "learning" },
  { conceptId: "A1-00003", targetWord: "Baum", translation: "Tree", status: "known" },
  { conceptId: "A1-00004", targetWord: "Berg", translation: "Mountain", status: "mastered" },
];

test("'all' returns every row unfiltered", () => {
  assert.equal(filterListWordRowsByStatus(ROWS, "all").length, 4);
});

test("'notStudied' returns only rows with no progress", () => {
  const result = filterListWordRowsByStatus(ROWS, "notStudied");
  assert.deepEqual(result.map((r) => r.conceptId), ["A1-00001"]);
});

test("'learning'/'known'/'mastered' each return exactly their own status", () => {
  assert.deepEqual(filterListWordRowsByStatus(ROWS, "learning").map((r) => r.conceptId), ["A1-00002"]);
  assert.deepEqual(filterListWordRowsByStatus(ROWS, "known").map((r) => r.conceptId), ["A1-00003"]);
  assert.deepEqual(filterListWordRowsByStatus(ROWS, "mastered").map((r) => r.conceptId), ["A1-00004"]);
});

test("Search matches target word or translation, case-insensitively", () => {
  assert.deepEqual(filterListWordRowsBySearch(ROWS, "haus").map((r) => r.conceptId), ["A1-00002"]);
  assert.deepEqual(filterListWordRowsBySearch(ROWS, "TREE").map((r) => r.conceptId), ["A1-00003"]);
});

test("An empty/whitespace-only search returns every row", () => {
  assert.equal(filterListWordRowsBySearch(ROWS, "").length, 4);
  assert.equal(filterListWordRowsBySearch(ROWS, "   ").length, 4);
});

test("Search never throws on a missing/null translation", () => {
  const rows = [{ conceptId: "x", targetWord: "Wort", translation: null, status: "notStudied" }];
  assert.doesNotThrow(() => filterListWordRowsBySearch(rows, "word"));
});

console.log("\n=== listWordCounts: real total counts, no fake/aggregate data ===\n");

test("A membership always counts as exactly one list word, independent of any progress state", () => {
  const memberships = [
    { listId: "list-1" },
    { listId: "list-1" },
    { listId: "list-2" },
  ];
  const byList = computeListWordCountsByListId(memberships);
  assert.equal(getListWordCount(byList, "list-1"), 2);
  assert.equal(getListWordCount(byList, "list-2"), 1);
});

test("A list with no memberships (or none loaded yet) returns a real 0, never undefined", () => {
  assert.equal(getListWordCount(computeListWordCountsByListId([]), "list-never-loaded"), 0);
});

test("Counts never bleed between lists", () => {
  const memberships = [{ listId: "list-1" }, { listId: "list-1" }, { listId: "list-1" }];
  const byList = computeListWordCountsByListId(memberships);
  assert.equal(getListWordCount(byList, "list-1"), 3);
  assert.equal(getListWordCount(byList, "list-2"), 0);
});

console.log("\n=== listResolvableConceptIds: full concept enumeration, not just studied words ===\n");

test("Returns every concept id with a usable word_lemma, in first-occurrence order", () => {
  const entries = [
    { concept_id: "A1-00001", word_lemma: "Hallo" },
    { concept_id: "A1-00002", word_lemma: "Haus" },
    { concept_id: "A1-00003", word_lemma: "-" }, // unusable placeholder lemma
  ];
  assert.deepEqual(listResolvableConceptIds(entries), ["A1-00001", "A1-00002"]);
});

test("Duplicate concept_id entries keep only the first occurrence", () => {
  const entries = [
    { concept_id: "A1-00001", word_lemma: "Hallo" },
    { concept_id: "A1-00001", word_lemma: "Hallo (duplicate)" },
  ];
  assert.deepEqual(listResolvableConceptIds(entries), ["A1-00001"]);
});

test("An entry with an empty/blank word_lemma is skipped", () => {
  const entries = [
    { concept_id: "A1-00001", word_lemma: "" },
    { concept_id: "A1-00002", word_lemma: "   " },
    { concept_id: "A1-00003", word_lemma: "Real" },
  ];
  assert.deepEqual(listResolvableConceptIds(entries), ["A1-00003"]);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-corrective-pure-logic guard passed");
}
