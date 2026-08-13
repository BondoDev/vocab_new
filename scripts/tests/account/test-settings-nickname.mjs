// Pure logic guard for Settings' inline nickname edit row
// (src/app/utils/settingsNickname.ts) — covers normalizeNicknameInput's own
// contract independent of any React rendering (this repo has no component
// renderer in its test suite; see test-daily-goal-selector-contract.mjs's
// own header for why component behavior is instead covered by a source-text
// contract test — test-settings-nickname-ui-contract.mjs's job here).
//
// Run: node --experimental-strip-types scripts/tests/account/test-settings-nickname.mjs
import assert from "node:assert/strict";
import { NICKNAME_MAX_LENGTH, normalizeNicknameInput } from "../../../src/app/utils/settingsNickname.ts";

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

console.log("\n=== normalizeNicknameInput contract ===\n");

test("1. NICKNAME_MAX_LENGTH matches the backend's own cap (user_profiles_nickname_length_check / update_user_nickname)", () => {
  assert.equal(NICKNAME_MAX_LENGTH, 40);
});

test("2. Surrounding whitespace is trimmed; internal spacing, casing, and value are preserved", () => {
  const result = normalizeNicknameInput("  Bondo  ");
  assert.deepEqual(result, { ok: true, value: "Bondo" });
});

test("3. Internal spacing is preserved exactly (not collapsed)", () => {
  const result = normalizeNicknameInput("  Bondo   Dev  ");
  assert.deepEqual(result, { ok: true, value: "Bondo   Dev" });
});

test("4. Casing is never changed (no lowercasing)", () => {
  const result = normalizeNicknameInput("BONDO");
  assert.equal(result.ok, true);
  assert.equal(result.value, "BONDO");
});

test("5. Unicode names are accepted and preserved as-is (not restricted to ASCII)", () => {
  for (const name of ["Þórdís", "Müller", "Соня", "王芳", "José"]) {
    const result = normalizeNicknameInput(name);
    assert.equal(result.ok, true, `${name} should be accepted`);
    assert.equal(result.value, name);
  }
});

test("6. Empty and whitespace-only input is rejected with reason 'empty'", () => {
  assert.deepEqual(normalizeNicknameInput(""), { ok: false, reason: "empty" });
  assert.deepEqual(normalizeNicknameInput("   "), { ok: false, reason: "empty" });
  assert.deepEqual(normalizeNicknameInput("\t\n"), { ok: false, reason: "empty" });
});

test("7. A nickname over 40 characters (after trim) is rejected with reason 'tooLong'", () => {
  const tooLong = "a".repeat(41);
  assert.deepEqual(normalizeNicknameInput(tooLong), { ok: false, reason: "tooLong" });
  assert.deepEqual(normalizeNicknameInput(`  ${"a".repeat(41)}  `), { ok: false, reason: "tooLong" });
});

test("8. Exactly 40 characters (after trim) is accepted — the boundary itself is valid", () => {
  const exactly40 = "a".repeat(40);
  const result = normalizeNicknameInput(exactly40);
  assert.deepEqual(result, { ok: true, value: exactly40 });
});

test("9. A nickname that does not start with a letter is rejected with reason 'invalid' — same rule onboarding already applies", () => {
  assert.deepEqual(normalizeNicknameInput("123Bondo"), { ok: false, reason: "invalid" });
  assert.deepEqual(normalizeNicknameInput("_Bondo"), { ok: false, reason: "invalid" });
  assert.deepEqual(normalizeNicknameInput("!Bondo"), { ok: false, reason: "invalid" });
});

test("10. A Unicode letter at the start is accepted (the 'starts with a letter' rule is not ASCII-only)", () => {
  assert.equal(normalizeNicknameInput("Ünal").ok, true);
  assert.equal(normalizeNicknameInput("Ω-mega").ok, true);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("Settings nickname-validation contract passed");
}
