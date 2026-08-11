// Pure-function contract for My Lists Phase 2A: duplicate-name
// normalization (test items 1-3) and local search/sort (21-22). No test
// framework/DOM exists in this repository — matching
// test-vocabulary-favorite-state.mjs's precedent, this covers everything
// expressible as a pure function directly.
//
// Card/detail count aggregation (10-13) was superseded by the My Lists
// corrective phase: listCardMetrics.ts (Learning/Known/Mastered aggregates
// keyed by word_progress_id) no longer exists — cards now show only a real
// total word count via listWordCounts.ts, covered by
// test-my-lists-corrective-pure-logic.mjs instead. See supabase/README.md's
// "My Lists Corrective Phase" section.
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-my-lists-phase2a-pure-logic.mjs
import assert from "node:assert/strict";
import { normalizeListNameForComparison } from "../../../src/features/user-profile/sections/my-lists/listNameValidation.ts";
import {
  filterListsBySearchQuery,
  sortLists,
} from "../../../src/features/user-profile/sections/my-lists/listSearchSort.ts";

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

console.log("\n=== Duplicate-name normalization (mirrors the DB's lower(btrim(name))) ===\n");

test("1. Same normalized name (identical case/whitespace) normalizes identically", () => {
  assert.equal(normalizeListNameForComparison("Travel"), normalizeListNameForComparison("Travel"));
});

test("2. Case-only variant normalizes identically ('travel' vs 'Travel' vs 'TRAVEL')", () => {
  const a = normalizeListNameForComparison("travel");
  const b = normalizeListNameForComparison("Travel");
  const c = normalizeListNameForComparison("TRAVEL");
  assert.equal(a, b);
  assert.equal(b, c);
});

test("3. Leading/trailing whitespace variant normalizes identically (' TRAVEL ' / 'Travel   ')", () => {
  const a = normalizeListNameForComparison(" TRAVEL ");
  const b = normalizeListNameForComparison("Travel   ");
  const c = normalizeListNameForComparison("Travel");
  assert.equal(a, c);
  assert.equal(b, c);
});

test("3b. Internal whitespace is NOT collapsed — 'Difficult Words' and 'Difficult  Words' stay distinct", () => {
  assert.notEqual(
    normalizeListNameForComparison("Difficult Words"),
    normalizeListNameForComparison("Difficult  Words"),
  );
});

console.log("\n=== Local search/sort (21-22): operates on already-loaded lists only ===\n");

const LISTS = [
  { name: "Travel German", updatedAt: "2026-08-10T00:00:00.000Z" },
  { name: "Difficult Words", updatedAt: "2026-08-12T00:00:00.000Z" },
  { name: "Work Vocabulary", updatedAt: "2026-08-11T00:00:00.000Z" },
];

test("21. Search matches case-insensitively against list names", () => {
  assert.deepEqual(
    filterListsBySearchQuery(LISTS, "travel").map((l) => l.name),
    ["Travel German"],
  );
  assert.deepEqual(
    filterListsBySearchQuery(LISTS, "WORDS").map((l) => l.name),
    ["Difficult Words"],
  );
});

test("21b. An empty/whitespace-only query returns every list", () => {
  assert.equal(filterListsBySearchQuery(LISTS, "").length, 3);
  assert.equal(filterListsBySearchQuery(LISTS, "   ").length, 3);
});

test("21c. A query matching nothing returns an empty array, not the full list", () => {
  assert.deepEqual(filterListsBySearchQuery(LISTS, "zzz-no-match"), []);
});

test("22. Sort 'recentlyUpdated' orders by updatedAt descending", () => {
  const sorted = sortLists(LISTS, "recentlyUpdated");
  assert.deepEqual(sorted.map((l) => l.name), ["Difficult Words", "Work Vocabulary", "Travel German"]);
});

test("22b. Sort 'nameAsc' orders A→Z", () => {
  const sorted = sortLists(LISTS, "nameAsc");
  assert.deepEqual(sorted.map((l) => l.name), ["Difficult Words", "Travel German", "Work Vocabulary"]);
});

test("22c. Sort 'nameDesc' orders Z→A", () => {
  const sorted = sortLists(LISTS, "nameDesc");
  assert.deepEqual(sorted.map((l) => l.name), ["Work Vocabulary", "Travel German", "Difficult Words"]);
});

test("Sort never mutates the input array", () => {
  const copy = [...LISTS];
  sortLists(LISTS, "nameAsc");
  assert.deepEqual(LISTS, copy);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-phase2a-pure-logic guard passed");
}
