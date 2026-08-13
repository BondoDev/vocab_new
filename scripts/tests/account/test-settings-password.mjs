// Pure logic guard for Settings' inline password change row
// (src/app/utils/settingsPassword.ts) — covers normalizeNewPasswordInput's
// own contract independently of any React rendering or live Supabase
// project, same precedent as test-settings-nickname.mjs/
// test-settings-email.mjs.
//
// Run: node --experimental-strip-types scripts/tests/account/test-settings-password.mjs
import assert from "node:assert/strict";
import { PASSWORD_MIN_LENGTH, normalizeNewPasswordInput } from "../../../src/app/utils/settingsPassword.ts";

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

console.log("\n=== normalizeNewPasswordInput contract ===\n");

test("1. PASSWORD_MIN_LENGTH matches PasswordRecoveryDialog.tsx's own MIN_PASSWORD_LENGTH (reused, not reinvented)", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 6);
});

test("2. Empty input is rejected with reason 'empty'", () => {
  assert.deepEqual(normalizeNewPasswordInput(""), { ok: false, reason: "empty" });
});

test("3. A password shorter than the minimum is rejected with reason 'tooShort'", () => {
  assert.deepEqual(normalizeNewPasswordInput("abc"), { ok: false, reason: "tooShort" });
  assert.deepEqual(normalizeNewPasswordInput("12345"), { ok: false, reason: "tooShort" });
});

test("4. A password exactly at the minimum length is accepted — the boundary itself is valid", () => {
  assert.deepEqual(normalizeNewPasswordInput("abcdef"), { ok: true, value: "abcdef" });
});

test("5. A longer, well-formed password is accepted as-is", () => {
  assert.deepEqual(normalizeNewPasswordInput("correct horse battery staple"), {
    ok: true,
    value: "correct horse battery staple",
  });
});

test("6. Whitespace-only input under the minimum is still rejected as 'tooShort', not silently trimmed to 'empty'", () => {
  assert.deepEqual(normalizeNewPasswordInput("   "), { ok: false, reason: "tooShort" });
});

test("7. Leading/trailing whitespace the user intentionally typed is preserved exactly, never trimmed (unlike email/nickname)", () => {
  const result = normalizeNewPasswordInput("  secret  ");
  assert.deepEqual(result, { ok: true, value: "  secret  " });
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("Settings password-validation contract passed");
}
