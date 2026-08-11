// Pure-function contract for Practice List (My Lists Phase 3):
// buildQuantityOptions/getDefaultQuantityOption (quantity-choice presets)
// and selectListPracticeWords (random/list-order sampling). No test
// framework/DOM exists in this repository — matching
// test-my-lists-corrective-pure-logic.mjs's own precedent.
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-practice-list-selection.mjs
import assert from "node:assert/strict";
import {
  buildPracticeListSetupSummary,
  buildQuantityOptions,
  getDefaultQuantityOption,
  selectListPracticeWords,
} from "../../../src/features/user-profile/sections/my-lists/practiceListSelection.ts";

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

function membershipsOfSize(size) {
  return Array.from({ length: size }, (_, index) => ({
    wordId: `word-${index}`,
    createdAt: new Date(2026, 0, 1 + index).toISOString(),
  }));
}

console.log("\n=== Quantity options (test items 1-7) ===\n");

test("1. 0 words -> no practice (empty options array)", () => {
  assert.deepEqual(buildQuantityOptions(0), []);
});

test("2. 1 word -> All 1 only", () => {
  assert.deepEqual(buildQuantityOptions(1), [{ kind: "all", value: 1 }]);
});

test("3. 7 words -> All 7 only", () => {
  assert.deepEqual(buildQuantityOptions(7), [{ kind: "all", value: 7 }]);
});

test("4. 10 words -> avoids the meaningless '10 == All 10' duplicate — only All 10 shown", () => {
  assert.deepEqual(buildQuantityOptions(10), [{ kind: "all", value: 10 }]);
});

test("5. 15 words -> 10 / All 15", () => {
  assert.deepEqual(buildQuantityOptions(15), [
    { kind: "fixed", value: 10 },
    { kind: "all", value: 15 },
  ]);
});

test("6. 25 words -> 10 / 20 / All 25", () => {
  assert.deepEqual(buildQuantityOptions(25), [
    { kind: "fixed", value: 10 },
    { kind: "fixed", value: 20 },
    { kind: "all", value: 25 },
  ]);
});

test("7. 42 words -> 10 / 20 / 30 / All 42", () => {
  assert.deepEqual(buildQuantityOptions(42), [
    { kind: "fixed", value: 10 },
    { kind: "fixed", value: 20 },
    { kind: "fixed", value: 30 },
    { kind: "all", value: 42 },
  ]);
});

test("No fixed option is ever >= the list size (never a meaningless/impossible choice)", () => {
  for (const size of [1, 5, 9, 10, 11, 20, 21, 30, 31, 42, 100]) {
    const options = buildQuantityOptions(size);
    for (const option of options) {
      assert.ok(option.value <= size, `option ${JSON.stringify(option)} exceeds list size ${size}`);
      if (option.kind === "fixed") {
        assert.ok(option.value < size, `fixed option ${option.value} must be strictly less than list size ${size}`);
      }
    }
  }
});

console.log("\n=== Default quantity choice ===\n");

test("Preferred default is 10 when the list has at least 10 words", () => {
  assert.deepEqual(getDefaultQuantityOption(buildQuantityOptions(42)), { kind: "fixed", value: 10 });
  assert.deepEqual(getDefaultQuantityOption(buildQuantityOptions(15)), { kind: "fixed", value: 10 });
});

test("Preferred default is All when the list has fewer than 10 words", () => {
  assert.deepEqual(getDefaultQuantityOption(buildQuantityOptions(7)), { kind: "all", value: 7 });
  assert.deepEqual(getDefaultQuantityOption(buildQuantityOptions(1)), { kind: "all", value: 1 });
});

test("Default is All (not a phantom '10') for an exactly-10-word list, since '10' isn't offered there", () => {
  assert.deepEqual(getDefaultQuantityOption(buildQuantityOptions(10)), { kind: "all", value: 10 });
});

test("A zero-word list has no default (null, not a fabricated option)", () => {
  assert.equal(getDefaultQuantityOption(buildQuantityOptions(0)), null);
});

console.log("\n=== Random selection (test items 8-10, 13-14) ===\n");

test("8/13. Random 10 from a 42-word list returns exactly 10 unique word ids", () => {
  const memberships = membershipsOfSize(42);
  const result = selectListPracticeWords(memberships, 10, "random", () => 0.5);
  assert.equal(result.length, 10);
  assert.equal(new Set(result).size, 10, "no duplicate word ids in one session");
});

test("9. Random selection only ever returns word ids present in the given memberships — nothing invented", () => {
  const memberships = membershipsOfSize(15);
  const validIds = new Set(memberships.map((m) => m.wordId));
  const result = selectListPracticeWords(memberships, 15, "random", Math.random);
  for (const id of result) {
    assert.ok(validIds.has(id), `${id} is not a real list member`);
  }
});

test("10. Random + All shuffles every word (order differs from list order for a large-enough list, deterministically with a fixed non-trivial randomFn)", () => {
  const memberships = membershipsOfSize(10);
  const listOrderIds = memberships.map((m) => m.wordId);
  // A non-constant deterministic sequence — enough entropy across 10
  // elements to reliably produce a different order than input order.
  const sequence = [0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4, 0.5];
  let cursor = 0;
  const randomFn = () => sequence[cursor++ % sequence.length];
  const shuffled = selectListPracticeWords(memberships, 10, "random", randomFn);
  assert.equal(shuffled.length, 10);
  assert.equal(new Set(shuffled).size, 10);
  assert.notDeepEqual(shuffled, listOrderIds, "Random + All must actually shuffle, not silently return list order");
});

test("14. Deterministic with an injected randomFn — same inputs, same randomFn sequence, same output every time", () => {
  const memberships = membershipsOfSize(20);
  const randomFn = () => 0.42;
  const first = selectListPracticeWords(memberships, 10, "random", randomFn);
  const second = selectListPracticeWords(memberships, 10, "random", randomFn);
  assert.deepEqual(first, second);
});

console.log("\n=== List order selection (test items 11-12) ===\n");

test("11. List order preserves created_at ascending order, regardless of the input array's own order", () => {
  const memberships = membershipsOfSize(5);
  const shuffledInput = [memberships[3], memberships[0], memberships[4], memberships[1], memberships[2]];
  const result = selectListPracticeWords(shuffledInput, 5, "listOrder");
  assert.deepEqual(result, memberships.map((m) => m.wordId));
});

test("12. List order + 20 takes exactly the first 20 (by created_at) from a larger list", () => {
  const memberships = membershipsOfSize(42);
  const result = selectListPracticeWords(memberships, 20, "listOrder");
  assert.deepEqual(result, memberships.slice(0, 20).map((m) => m.wordId));
});

test("List order never sorts alphabetically — an out-of-alphabetical-order created_at sequence stays in created_at order", () => {
  const memberships = [
    { wordId: "zebra", createdAt: "2026-01-01T00:00:00.000Z" },
    { wordId: "apple", createdAt: "2026-01-02T00:00:00.000Z" },
    { wordId: "mango", createdAt: "2026-01-03T00:00:00.000Z" },
  ];
  const result = selectListPracticeWords(memberships, 3, "listOrder");
  assert.deepEqual(result, ["zebra", "apple", "mango"]);
});

console.log("\n=== Edge cases: quantity clamping, zero/one word ===\n");

test("A quantity greater than the list size is clamped to the list size (defensive, even though callers only ever pass an option's own value)", () => {
  const memberships = membershipsOfSize(5);
  assert.equal(selectListPracticeWords(memberships, 999, "listOrder").length, 5);
  assert.equal(selectListPracticeWords(memberships, 999, "random").length, 5);
});

test("A single-word list is fully practiceable (no 4-word minimum enforced by this module)", () => {
  const memberships = membershipsOfSize(1);
  assert.deepEqual(selectListPracticeWords(memberships, 1, "listOrder"), ["word-0"]);
  assert.deepEqual(selectListPracticeWords(memberships, 1, "random", () => 0), ["word-0"]);
});

test("An empty membership list returns an empty selection, never throws", () => {
  assert.deepEqual(selectListPracticeWords([], 10, "random"), []);
  assert.deepEqual(selectListPracticeWords([], 10, "listOrder"), []);
});

console.log("\n=== Summary derivation ===\n");

test("buildPracticeListSetupSummary reflects the chosen quantity/order/exercise count", () => {
  const summary = buildPracticeListSetupSummary({ kind: "fixed", value: 20 }, "random", 3);
  assert.deepEqual(summary, { wordCount: 20, order: "random", exerciseCount: 3 });
});

test("buildPracticeListSetupSummary reports 0 words when no quantity is chosen yet", () => {
  const summary = buildPracticeListSetupSummary(null, "listOrder", 5);
  assert.equal(summary.wordCount, 0);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("practice-list-selection guard passed");
}
