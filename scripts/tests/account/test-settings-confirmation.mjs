// Pure logic guard for Settings' two typed destructive confirmations
// (src/app/utils/settingsConfirmation.ts) — covers the Reset/Delete
// confirmation-validity contract independent of any dialog UI.
//
// Run: node --experimental-strip-types scripts/tests/account/test-settings-confirmation.mjs
import assert from "node:assert/strict";
import {
  DELETE_CONFIRMATION_WORD,
  isDeleteConfirmationValid,
  isResetConfirmationValid,
  RESET_CONFIRMATION_WORD,
} from "../../../src/app/utils/settingsConfirmation.ts";

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

console.log("\n=== Settings typed-confirmation contract ===\n");

test("1. The confirmation words are the exact literal strings shown in the dialogs' own copy", () => {
  assert.equal(RESET_CONFIRMATION_WORD, "RESET");
  assert.equal(DELETE_CONFIRMATION_WORD, "DELETE");
});

test("2. An exact match is valid for both Reset and Delete", () => {
  assert.equal(isResetConfirmationValid("RESET"), true);
  assert.equal(isDeleteConfirmationValid("DELETE"), true);
});

test("3. Surrounding whitespace is trimmed before comparing", () => {
  assert.equal(isResetConfirmationValid("  RESET  "), true);
  assert.equal(isDeleteConfirmationValid("\tDELETE\n"), true);
});

test("4. Comparison is case-sensitive — a lowercase/mixed-case attempt stays invalid", () => {
  assert.equal(isResetConfirmationValid("reset"), false);
  assert.equal(isResetConfirmationValid("Reset"), false);
  assert.equal(isDeleteConfirmationValid("delete"), false);
  assert.equal(isDeleteConfirmationValid("Delete"), false);
});

test("5. Empty, partial, and unrelated input are all invalid", () => {
  assert.equal(isResetConfirmationValid(""), false);
  assert.equal(isResetConfirmationValid("RES"), false);
  assert.equal(isResetConfirmationValid("RESETX"), false);
  assert.equal(isDeleteConfirmationValid(""), false);
  assert.equal(isDeleteConfirmationValid("DEL"), false);
  assert.equal(isDeleteConfirmationValid("DELETEX"), false);
});

test("6. Internal whitespace (not just leading/trailing) still fails to match", () => {
  assert.equal(isResetConfirmationValid("RE SET"), false);
  assert.equal(isDeleteConfirmationValid("DE LETE"), false);
});

test("7. Typing the target language's own name never satisfies either confirmation (word-only, not language-name based)", () => {
  assert.equal(isResetConfirmationValid("German"), false);
  assert.equal(isResetConfirmationValid("Deutsch"), false);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("Settings typed-confirmation contract passed");
}
