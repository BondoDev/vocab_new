// Focused guard for the pure Favorites local-state helpers in
// src/features/user-profile/sections/vocabulary/vocabularyFavoriteState.ts.
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-vocabulary-favorite-state.mjs
import assert from "node:assert/strict";
import {
  adjustFavoritesCount,
  applyFavoriteToggle,
  canStartFavoriteToggle,
} from "../../../src/features/user-profile/sections/vocabulary/vocabularyFavoriteState.ts";

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
  { id: "1", isFavorite: false, word: "Hallo" },
  { id: "2", isFavorite: true, word: "Haus" },
];

console.log("\n=== applyFavoriteToggle ===\n");

test("1. Successful toggle updates only the targeted row's local data", () => {
  const next = applyFavoriteToggle(ROWS, "1", true);
  assert.equal(next.find((r) => r.id === "1").isFavorite, true);
  assert.equal(next.find((r) => r.id === "2").isFavorite, true, "row 2 must be untouched");
  assert.equal(next.find((r) => r.id === "2"), ROWS[1], "untouched row keeps the same reference");
});

test("2. A failed toggle reverts by re-applying the original value", () => {
  const optimistic = applyFavoriteToggle(ROWS, "1", true);
  assert.equal(optimistic.find((r) => r.id === "1").isFavorite, true);
  const reverted = applyFavoriteToggle(optimistic, "1", false);
  assert.equal(reverted.find((r) => r.id === "1").isFavorite, false);
  assert.deepEqual(reverted, ROWS);
});

test("3. Toggling an unknown row id leaves every row unchanged", () => {
  const next = applyFavoriteToggle(ROWS, "does-not-exist", true);
  assert.deepEqual(next, ROWS);
});

console.log("\n=== adjustFavoritesCount ===\n");

test("4. Favoriting increments the count", () => {
  assert.equal(adjustFavoritesCount(3, false, true), 4);
});

test("5. Unfavoriting decrements the count", () => {
  assert.equal(adjustFavoritesCount(3, true, false), 2);
});

test("6. No-op toggle (same before/after) leaves the count unchanged", () => {
  assert.equal(adjustFavoritesCount(3, true, true), 3);
  assert.equal(adjustFavoritesCount(3, false, false), 3);
});

test("7. Count never goes negative", () => {
  assert.equal(adjustFavoritesCount(0, true, false), 0);
});

console.log("\n=== canStartFavoriteToggle ===\n");

test("8. A row with no in-flight request can start a toggle", () => {
  assert.equal(canStartFavoriteToggle(new Set(), "1"), true);
});

test("9. A row already in flight cannot start a duplicate/rapid-repeat toggle", () => {
  assert.equal(canStartFavoriteToggle(new Set(["1"]), "1"), false);
});

test("10. An in-flight request for a different row does not block this one (serialized per-row, not globally)", () => {
  assert.equal(canStartFavoriteToggle(new Set(["2"]), "1"), true);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-favorite-state guard passed");
}
