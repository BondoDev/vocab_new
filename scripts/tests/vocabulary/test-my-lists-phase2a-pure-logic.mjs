// Pure-function contract for My Lists Phase 2A: duplicate-name
// normalization (test items 1-3), card/detail count aggregation (10-13),
// and local search/sort (21-22). No test framework/DOM exists in this
// repository — matching test-vocabulary-favorite-state.mjs's precedent,
// this covers everything expressible as a pure function directly.
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-my-lists-phase2a-pure-logic.mjs
import assert from "node:assert/strict";
import { normalizeListNameForComparison } from "../../../src/features/user-profile/sections/my-lists/listNameValidation.ts";
import {
  computeListCardMetricsByListId,
  getListCardMetrics,
} from "../../../src/features/user-profile/sections/my-lists/listCardMetrics.ts";
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

console.log("\n=== List card/detail metrics (10-13): real counts, no fake data, no second category system ===\n");

const WORD_STATE_BY_ID = new Map([
  ["p1", "seen"], // -> learning
  ["p2", "learning"], // -> learning
  ["p3", "familiar"], // -> known
  ["p4", "strong"], // -> known
  ["p5", "mastered"], // -> mastered
]);

test("10. Total count matches exactly the number of memberships with a resolvable word state", () => {
  const memberships = [
    { listId: "list-1", wordProgressId: "p1" },
    { listId: "list-1", wordProgressId: "p3" },
    { listId: "list-1", wordProgressId: "p5" },
  ];
  const metrics = getListCardMetrics(computeListCardMetricsByListId(memberships, WORD_STATE_BY_ID), "list-1");
  assert.equal(metrics.total, 3);
});

test("11. Learning count = seen + learning states (the existing category mapping, not a new one)", () => {
  const memberships = [
    { listId: "list-1", wordProgressId: "p1" }, // seen -> learning
    { listId: "list-1", wordProgressId: "p2" }, // learning -> learning
    { listId: "list-1", wordProgressId: "p3" }, // familiar -> known
  ];
  const metrics = getListCardMetrics(computeListCardMetricsByListId(memberships, WORD_STATE_BY_ID), "list-1");
  assert.equal(metrics.learning, 2);
  assert.equal(metrics.known, 1);
});

test("12. Known count = familiar + strong states", () => {
  const memberships = [
    { listId: "list-1", wordProgressId: "p3" }, // familiar
    { listId: "list-1", wordProgressId: "p4" }, // strong
  ];
  const metrics = getListCardMetrics(computeListCardMetricsByListId(memberships, WORD_STATE_BY_ID), "list-1");
  assert.equal(metrics.known, 2);
});

test("13. Mastered count = mastered state only", () => {
  const memberships = [
    { listId: "list-1", wordProgressId: "p5" },
    { listId: "list-1", wordProgressId: "p4" },
  ];
  const metrics = getListCardMetrics(computeListCardMetricsByListId(memberships, WORD_STATE_BY_ID), "list-1");
  assert.equal(metrics.mastered, 1);
  assert.equal(metrics.known, 1);
});

test("Metrics are computed per-list — one list's memberships never bleed into another's counts", () => {
  const memberships = [
    { listId: "list-1", wordProgressId: "p1" },
    { listId: "list-2", wordProgressId: "p5" },
  ];
  const byList = computeListCardMetricsByListId(memberships, WORD_STATE_BY_ID);
  assert.equal(getListCardMetrics(byList, "list-1").total, 1);
  assert.equal(getListCardMetrics(byList, "list-2").total, 1);
  assert.equal(getListCardMetrics(byList, "list-1").mastered, 0);
  assert.equal(getListCardMetrics(byList, "list-2").mastered, 1);
});

test("Before membership/progress data resolves (or a stale progress id), a list falls back to real all-zero counts — never a fake placeholder", () => {
  const metrics = getListCardMetrics(computeListCardMetricsByListId([], WORD_STATE_BY_ID), "list-never-loaded");
  assert.deepEqual(metrics, { total: 0, learning: 0, known: 0, mastered: 0 });

  const staleMetrics = getListCardMetrics(
    computeListCardMetricsByListId([{ listId: "list-1", wordProgressId: "does-not-exist" }], WORD_STATE_BY_ID),
    "list-1",
  );
  assert.deepEqual(staleMetrics, { total: 0, learning: 0, known: 0, mastered: 0 });
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
