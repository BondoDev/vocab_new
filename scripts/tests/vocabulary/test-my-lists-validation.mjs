// Pure-function contract for the Create List dialog's name validation
// (src/features/user-profile/sections/my-lists/listNameValidation.ts).
// Covers the My Lists Phase 1 brief's validation requirements directly —
// trim, reject empty, reject whitespace-only, enforce the 80-character
// maximum — without mounting any React component (no test framework/DOM
// exists in this repository; see test-vocabulary-favorite-state.mjs for
// the same pure-function-only precedent this file follows).
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-my-lists-validation.mjs
import assert from "node:assert/strict";
import {
  LIST_NAME_MAX_LENGTH,
  validateListName,
} from "../../../src/features/user-profile/sections/my-lists/listNameValidation.ts";

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

console.log("\n=== My Lists — list name validation contract ===\n");

test("1. LIST_NAME_MAX_LENGTH is 80, matching the migration's CHECK constraint and RPC guard", () => {
  assert.equal(LIST_NAME_MAX_LENGTH, 80);
});

test("2. An empty string is rejected", () => {
  assert.deepEqual(validateListName(""), { ok: false, reason: "empty" });
});

test("3. A whitespace-only string is rejected as empty (not accepted as a valid name)", () => {
  assert.deepEqual(validateListName("   "), { ok: false, reason: "empty" });
  assert.deepEqual(validateListName("\t\n  "), { ok: false, reason: "empty" });
});

test("4. Leading/trailing whitespace is trimmed from an otherwise-valid name", () => {
  const result = validateListName("  Travel German  ");
  assert.deepEqual(result, { ok: true, name: "Travel German" });
});

test("5. Internal whitespace is preserved (only the ends are trimmed)", () => {
  const result = validateListName("  Difficult   Words  ");
  assert.deepEqual(result, { ok: true, name: "Difficult   Words" });
});

test("6. A name at exactly the 80-character limit (after trimming) is accepted", () => {
  const name = "a".repeat(80);
  assert.deepEqual(validateListName(`  ${name}  `), { ok: true, name });
});

test("7. A name over the 80-character limit (after trimming) is rejected as too long", () => {
  const name = "a".repeat(81);
  assert.deepEqual(validateListName(name), { ok: false, reason: "tooLong" });
});

test("8. Trailing whitespace alone does not push a borderline name over the limit (limit applies to the trimmed name)", () => {
  const name = "a".repeat(80);
  assert.deepEqual(validateListName(`${name}          `), { ok: true, name });
});

test("9. A short, ordinary name is accepted unchanged", () => {
  assert.deepEqual(validateListName("Travel German"), { ok: true, name: "Travel German" });
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-validation guard passed");
}
