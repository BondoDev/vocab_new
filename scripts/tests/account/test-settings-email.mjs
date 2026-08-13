// Pure logic guard for Settings' inline email change row
// (src/app/utils/settingsEmail.ts) — covers normalizeEmailInput,
// isDuplicateEmailError, and getPendingEmailFromUser independently of any
// React rendering or live Supabase project (this repo has no component
// renderer and src/lib/accountEmailChange.ts/supabaseAuth.ts can't be
// loaded directly by Node — see test-settings-email-ui-contract.mjs's own
// header for that boundary).
//
// Run: node --experimental-strip-types scripts/tests/account/test-settings-email.mjs
import assert from "node:assert/strict";
import {
  getPendingEmailFromUser,
  isDuplicateEmailError,
  normalizeEmailInput,
} from "../../../src/app/utils/settingsEmail.ts";

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

console.log("\n=== normalizeEmailInput contract ===\n");

test("1. Surrounding whitespace is trimmed; casing is preserved (no invented normalization)", () => {
  assert.deepEqual(normalizeEmailInput("  User@Example.com  "), { ok: true, value: "User@Example.com" });
});

test("2. A well-formed address is accepted as-is", () => {
  assert.deepEqual(normalizeEmailInput("person@fluentstellar.app"), { ok: true, value: "person@fluentstellar.app" });
});

test("3. Empty and whitespace-only input is rejected with reason 'empty'", () => {
  assert.deepEqual(normalizeEmailInput(""), { ok: false, reason: "empty" });
  assert.deepEqual(normalizeEmailInput("   "), { ok: false, reason: "empty" });
});

test("4. Obviously malformed input is rejected with reason 'invalid' — no '@', no domain, no local part", () => {
  assert.deepEqual(normalizeEmailInput("not-an-email"), { ok: false, reason: "invalid" });
  assert.deepEqual(normalizeEmailInput("@example.com"), { ok: false, reason: "invalid" });
  assert.deepEqual(normalizeEmailInput("person@"), { ok: false, reason: "invalid" });
  assert.deepEqual(normalizeEmailInput("person@example"), { ok: false, reason: "invalid" });
  assert.deepEqual(normalizeEmailInput("person example.com"), { ok: false, reason: "invalid" });
});

test("5. Internal whitespace inside the address still fails (not just a bare trim-and-accept)", () => {
  assert.deepEqual(normalizeEmailInput("per son@example.com"), { ok: false, reason: "invalid" });
});

test("6. A reasonable plus-addressed / subdomain address is accepted — the regex is deliberately not overly restrictive", () => {
  assert.equal(normalizeEmailInput("person+tag@mail.example.co.uk").ok, true);
});

console.log("\n=== isDuplicateEmailError contract ===\n");

test("7. GoTrue's stable error_code ('email_exists', surfaced as .code) is recognized regardless of message text", () => {
  assert.equal(isDuplicateEmailError({ code: "email_exists", message: "some unrelated text" }), true);
});

test("8. A message-text fallback catches GoTrue's documented duplicate-email wording when no error_code is present", () => {
  assert.equal(isDuplicateEmailError({ message: "A user with this email address has already been registered" }), true);
  assert.equal(isDuplicateEmailError({ message: "Email address already in use" }), true);
});

test("9. An unrelated validation error (wrong shape, wrong code, unrelated message) is not misclassified as duplicate", () => {
  assert.equal(isDuplicateEmailError({ code: "validation_failed", message: "Password is too weak" }), false);
  assert.equal(isDuplicateEmailError({ message: "Unable to validate email address: invalid format" }), false);
});

test("10. Non-object / nullish input is handled safely (never throws)", () => {
  assert.equal(isDuplicateEmailError(null), false);
  assert.equal(isDuplicateEmailError(undefined), false);
  assert.equal(isDuplicateEmailError("email_exists"), false);
  assert.equal(isDuplicateEmailError(42), false);
});

console.log("\n=== getPendingEmailFromUser contract ===\n");

test("11. A user object with a non-empty new_email returns the trimmed pending address", () => {
  assert.equal(getPendingEmailFromUser({ email: "old@example.com", new_email: "new@example.com" }), "new@example.com");
  assert.equal(getPendingEmailFromUser({ new_email: "  new@example.com  " }), "new@example.com");
});

test("12. A user object with no pending change (absent/empty new_email) returns null", () => {
  assert.equal(getPendingEmailFromUser({ email: "old@example.com" }), null);
  assert.equal(getPendingEmailFromUser({ email: "old@example.com", new_email: "" }), null);
  assert.equal(getPendingEmailFromUser({ email: "old@example.com", new_email: "   " }), null);
});

test("13. Non-object / nullish input is handled safely (never throws, never invents a pending value)", () => {
  assert.equal(getPendingEmailFromUser(null), null);
  assert.equal(getPendingEmailFromUser(undefined), null);
  assert.equal(getPendingEmailFromUser("new@example.com"), null);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("Settings email-validation contract passed");
}
