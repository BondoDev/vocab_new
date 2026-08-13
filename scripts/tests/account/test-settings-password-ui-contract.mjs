// Contract guard for Settings' inline password change row (SettingsSection.tsx)
// — a source-text guard, same precedent as test-settings-nickname-ui-contract.mjs/
// test-settings-email-ui-contract.mjs/test-account-reauthentication.mjs:
// SettingsSection.tsx is a React component and this repo has no component
// renderer in its test suite, so its behavioral shape is verified from
// source text instead of by mounting it. normalizeNewPasswordInput's own
// logic is covered independently and more thoroughly by
// test-settings-password.mjs; the shared reauthentication primitives
// (reauthenticateForAccountDeletion, isPasswordAccount,
// updateSupabaseAuthUserPassword) are covered by
// test-account-reauthentication.mjs and are not re-verified here since
// neither accountDeletion.ts nor supabaseAuth.ts was modified for this task.
//
// Run: node scripts/tests/account/test-settings-password-ui-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8").replace(/\r\n/g, "\n");
}

// Strips `//` line comments — used only where a pattern must prove
// something about *live code*, not about what this file's own explanatory
// comments happen to mention in prose (e.g. this component's own comments
// legitimately say "never a direct auth.users write" and "...retry without
// re-entering everything" when explaining what the code deliberately does
// NOT do). Same technique test-settings-email-ui-contract.mjs uses.
function stripLineComments(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

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

const source = read("src/features/user-profile/sections/settings/SettingsSection.tsx");

console.log("\n=== Settings password row: display/edit shape ===\n");

test("1. The password row renders a fixed masked placeholder, never the real password or its length", () => {
  assert.match(source, /<span className="settings-row__value" aria-hidden="true">\s*\n\s*••••••••\s*\n\s*<\/span>/);
});

test("2. A Change action exists, is gated by canChangePassword (Google accounts never get it), and requires a session", () => {
  assert.match(source, /onClick=\{handleStartEditPassword\}/);
  assert.match(source, /\{canChangePassword \? \(/);
  assert.match(source, /ref=\{passwordChangeButtonRef\}[\s\S]{0,120}disabled=\{!authSession\}/);
});

test("3. canChangePassword reuses accountDeletion.ts's existing isPasswordAccount — no second, parallel provider check", () => {
  assert.match(source, /const canChangePassword = isPasswordAccount\(authSession\);/);
});

test("4. A Google-linked account sees an explanatory message instead of a Change action, never a fake/disabled password field", () => {
  assert.match(source, /\{!canChangePassword \? \(/);
  assert.match(source, /passwordManagedByGoogle/);
});

test("5. Edit mode renders three distinct, labeled password fields — current, new, confirm — each type=\"password\" with correct autocomplete semantics", () => {
  const currentField = source.match(/<Input\s+id="settings-current-password-input"[\s\S]*?\/>/);
  assert.ok(currentField, "expected the current-password <Input>");
  assert.match(currentField[0], /type="password"/);
  assert.match(currentField[0], /autoComplete="current-password"/);
  assert.match(source, /<Label htmlFor="settings-current-password-input">/);

  const newField = source.match(/<Input\s+id="settings-new-password-input"[\s\S]*?\/>/);
  assert.ok(newField, "expected the new-password <Input>");
  assert.match(newField[0], /type="password"/);
  assert.match(newField[0], /autoComplete="new-password"/);
  assert.match(source, /<Label htmlFor="settings-new-password-input">/);

  const confirmField = source.match(/<Input\s+id="settings-confirm-password-input"[\s\S]*?\/>/);
  assert.ok(confirmField, "expected the confirm-password <Input>");
  assert.match(confirmField[0], /type="password"/);
  assert.match(confirmField[0], /autoComplete="new-password"/);
  assert.match(source, /<Label htmlFor="settings-confirm-password-input">/);
});

console.log("\n=== Fields start empty every time edit mode is entered; Cancel makes no backend call ===\n");

test("6. handleStartEditPassword clears all three fields before entering edit mode (never prefilled/stale)", () => {
  const match = source.match(/const handleStartEditPassword = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(match, "handleStartEditPassword must exist");
  assert.match(match[1], /setCurrentPasswordDraft\(""\)/);
  assert.match(match[1], /setNewPasswordDraft\(""\)/);
  assert.match(match[1], /setConfirmPasswordDraft\(""\)/);
  assert.match(match[1], /setIsEditingPassword\(true\)/);
});

test("7. Cancel clears all three fields and exits edit mode — no reauthentication/password-update call in its own handler", () => {
  const match = source.match(/const handleCancelEditPassword = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(match, "handleCancelEditPassword must exist");
  assert.match(match[1], /setIsEditingPassword\(false\)/);
  assert.match(match[1], /setCurrentPasswordDraft\(""\)/);
  assert.match(match[1], /setNewPasswordDraft\(""\)/);
  assert.match(match[1], /setConfirmPasswordDraft\(""\)/);
  assert.doesNotMatch(match[1], /reauthenticateForAccountDeletion|updateSupabaseAuthUserPassword/);
});

console.log("\n=== Save is disabled until every requirement is met; reuses the canonical password policy ===\n");

test("8. canSavePassword requires editing + a password account + a non-empty current password + a locally valid new password + a matching confirmation + not already saving", () => {
  assert.match(
    source,
    /const canSavePassword =\s*\n\s*isEditingPassword && canChangePassword && currentPasswordDraft\.length > 0 && newPasswordValidation\.ok &&\s*\n\s*confirmPasswordDraft === newPasswordDraft && !isSavingPassword;/,
  );
});

test("9. normalizeNewPasswordInput (not a second, ad hoc validation rule) governs new-password validity", () => {
  assert.match(source, /import \{ normalizeNewPasswordInput \} from "\.\.\/\.\.\/\.\.\/\.\.\/app\/utils\/settingsPassword"/);
  assert.match(source, /const newPasswordValidation = normalizeNewPasswordInput\(newPasswordDraft\);/);
});

test("10. A mismatched confirmation is detected against the raw draft (never a trimmed/normalized copy) and blocks Save", () => {
  assert.match(
    source,
    /const isPasswordConfirmMismatch = confirmPasswordDraft\.length > 0 && confirmPasswordDraft !== newPasswordDraft;/,
  );
});

test("11. The Save button's disabled prop is wired to canSavePassword", () => {
  assert.match(source, /onClick=\{handleSavePassword\} disabled=\{!canSavePassword\}/);
});

console.log("\n=== Save reauthenticates before ever touching the password, in the correct order ===\n");

function handleSavePasswordBody() {
  const match = source.match(/const handleSavePassword = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(match, "handleSavePassword must exist");
  return match[0];
}

test("12. handleSavePassword bails out immediately while invalid or already saving (duplicate-submission guard)", () => {
  const body = handleSavePasswordBody();
  assert.match(body, /if \(!canSavePassword \|\| !authSession \|\| !newPasswordValidation\.ok \|\| isSavingPassword\) \{\s*\n\s*return;\s*\n\s*\}/);
  assert.match(body, /setIsSavingPassword\(true\)/);
});

test("13. Current-password reauthentication happens strictly before the password-update call, and the update uses the freshly-reauthenticated session, never the possibly-stale authSession prop", () => {
  const body = handleSavePasswordBody();
  const reauthIndex = body.search(/const freshSession = await reauthenticateForAccountDeletion\(authSession, currentPasswordDraft\);/);
  const updateIndex = body.search(/await updateSupabaseAuthUserPassword\(freshSession, newPasswordValidation\.value\);/);
  assert.ok(reauthIndex > -1 && updateIndex > -1, "expected both calls to exist");
  assert.ok(reauthIndex < updateIndex, "reauthentication must be awaited before the password update is ever called");
  assert.doesNotMatch(body, /updateSupabaseAuthUserPassword\(authSession/);
});

test("14. The password-update call uses the existing Supabase Auth helper (updateSupabaseAuthUserPassword) — no direct auth.users write, no Admin API", () => {
  assert.match(source, /import \{ updateSupabaseAuthUserPassword \} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/supabaseAuth"/);
  const body = stripLineComments(handleSavePasswordBody());
  assert.doesNotMatch(body, /auth\.users|service_role|SUPABASE_SERVICE_ROLE_KEY|supabase\.auth\.admin/i);
});

test("15. A wrong current password (ReauthenticationError) never reaches the password-update call — the reauthentication branch returns before it", () => {
  const body = handleSavePasswordBody();
  const catchBlockMatch = body.match(/if \(error instanceof ReauthenticationError\) \{([\s\S]*?)\n\s{8}\}\n/);
  assert.ok(catchBlockMatch, "expected a dedicated ReauthenticationError branch");
  assert.match(catchBlockMatch[1], /setPasswordSaveError\(t\(PASSWORD_REAUTHENTICATION_ERROR_MESSAGE_KEYS\[error\.reason\]\)\)/);
  assert.match(catchBlockMatch[1], /return;/);
  assert.doesNotMatch(catchBlockMatch[1], /updateSupabaseAuthUserPassword/);
});

test("16. Every ReauthenticationErrorReason maps to its own translation key — none silently falls through to a raw/undefined message", () => {
  const mapMatch = source.match(/const PASSWORD_REAUTHENTICATION_ERROR_MESSAGE_KEYS[\s\S]*?= \{([\s\S]*?)\};/);
  assert.ok(mapMatch, "expected the PASSWORD_REAUTHENTICATION_ERROR_MESSAGE_KEYS map");
  for (const reason of ["invalid_credentials", "identity_mismatch", "network", "backend_rejected"]) {
    assert.match(mapMatch[1], new RegExp(`${reason}:`));
  }
  assert.match(mapMatch[1], /invalid_credentials: "userProfile\.settingsSection\.account\.passwordCurrentIncorrect"/);
});

test("17. Errors from the password-update step itself are sanitized through describeSupabaseError/resolveSupabaseErrorMessageKey — never a raw Supabase/GoTrue message shown to the user", () => {
  assert.match(source, /describeSupabaseError\("updateSupabaseAuthUserPassword", error\)/);
  assert.match(
    source,
    /resolveSupabaseErrorMessageKey\(\s*\n\s*diagnostics\.category,\s*\n\s*"userProfile\.settingsSection\.account\.passwordSaveError",\s*\n\s*\)/,
  );
});

console.log("\n=== Success clears every field and exits edit mode; failure never leaves a false 'saved' state ===\n");

test("18. A successful change clears current/new/confirm, exits edit mode, and shows the existing toast pattern — never a page reload", () => {
  const body = handleSavePasswordBody();
  const successMatch = body.match(/await updateSupabaseAuthUserPassword\(freshSession, newPasswordValidation\.value\);([\s\S]*?)\} catch/);
  assert.ok(successMatch, "expected the success block after the password-update call");
  const successBody = successMatch[1];
  assert.match(successBody, /setIsEditingPassword\(false\)/);
  assert.match(successBody, /setCurrentPasswordDraft\(""\)/);
  assert.match(successBody, /setNewPasswordDraft\(""\)/);
  assert.match(successBody, /setConfirmPasswordDraft\(""\)/);
  assert.match(successBody, /showPasswordToast\(t\("userProfile\.settingsSection\.account\.passwordChangedToast"\)\)/);
  assert.doesNotMatch(successBody, /window\.location|location\.reload/);
});

test("19. The typed current password is cleared in the finally block of every save attempt (success or failure alike)", () => {
  const body = handleSavePasswordBody();
  const finallyMatch = body.match(/\} finally \{([\s\S]*?)\n\s{4}\}\)\(\);/);
  assert.ok(finallyMatch, "expected a finally block");
  assert.match(finallyMatch[1], /setIsSavingPassword\(false\)/);
  assert.match(finallyMatch[1], /setCurrentPasswordDraft\(""\)/);
});

test("20. Duplicate submission is prevented while saving: all three inputs and Cancel are directly disabled via isSavingPassword, and Save is disabled via canSavePassword (which itself requires !isSavingPassword)", () => {
  const editBlockMatch = source.match(/\{isEditingPassword \? \(([\s\S]*?)\) : \(/);
  assert.ok(editBlockMatch, "expected the password edit-mode JSX block");
  const disabledCount = (editBlockMatch[1].match(/disabled=\{isSavingPassword\}/g) || []).length;
  assert.equal(disabledCount, 4, `expected the 3 inputs + Cancel (4 controls) gated directly on isSavingPassword, found ${disabledCount}`);
  assert.match(editBlockMatch[1], /onClick=\{handleSavePassword\} disabled=\{!canSavePassword\}/);
});

test("21. No automatic retry loop exists around the password save (a single try/catch, never a retry/setTimeout re-invocation)", () => {
  const body = stripLineComments(handleSavePasswordBody());
  assert.doesNotMatch(body, /setTimeout\(/);
  assert.doesNotMatch(body, /retry/i);
});

console.log("\n=== Password lifetime: never persisted outside temporary component state ===\n");

test("22. No password-bearing state is ever written to localStorage/sessionStorage in this component", () => {
  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*[Pp]assword/);
  assert.doesNotMatch(source, /sessionStorage\.setItem\([^)]*[Pp]assword/);
});

test("23. No password value is ever passed to console.* in this component", () => {
  const consoleCalls = [...source.matchAll(/console\.\w+\([^;]*\)/gs)];
  for (const call of consoleCalls) {
    assert.doesNotMatch(call[0], /currentPasswordDraft|newPasswordDraft|confirmPasswordDraft/, `a console call references a password draft: ${call[0].slice(0, 100)}`);
  }
});

test("24. The three password drafts are the only password-value state in this component (besides the pre-existing deletePassword) — no fourth, redundant copy (error/loading state is excluded, it never holds a password value)", () => {
  const stateDecls = [...source.matchAll(/const \[(\w+), set\w+\]\s*=\s*useState[^;]*;/g)].map((m) => m[1]);
  const passwordValueStates = stateDecls.filter(
    (name) => /password/i.test(name) && (name.endsWith("Draft") || name === "deletePassword"),
  );
  assert.deepEqual(
    passwordValueStates.sort(),
    ["confirmPasswordDraft", "currentPasswordDraft", "deletePassword", "newPasswordDraft"].sort(),
  );
});

console.log("\n=== Nickname/email behavior untouched; row sits directly below Email ===\n");

test("25. The password row is declared after the email Toast and before the Languages section — directly below Email as specified", () => {
  const emailToastIndex = source.indexOf('<Toast message={emailToast} />');
  const passwordRowIndex = source.indexOf('settings-password-row');
  const languagesSectionIndex = source.indexOf('{/* ---- Languages ---- */}');
  assert.ok(emailToastIndex > -1 && passwordRowIndex > -1 && languagesSectionIndex > -1);
  assert.ok(emailToastIndex < passwordRowIndex, "password row must come after the email Toast");
  assert.ok(passwordRowIndex < languagesSectionIndex, "password row must come before the Languages section");
});

test("26. The nickname and email edit rows' own state/handlers are untouched by this task (still present, unchanged names)", () => {
  assert.match(source, /const \[nicknameDraft, setNicknameDraft\] = useState\(userProfile\.nickname\);/);
  assert.match(source, /const handleSaveNickname = \(\) => \{/);
  assert.match(source, /const \[emailDraft, setEmailDraft\] = useState\(email\);/);
  assert.match(source, /const handleSaveEmail = \(\) => \{/);
});

test("27. Nothing in the password flow forces a page reload/navigation", () => {
  const body = handleSavePasswordBody();
  assert.doesNotMatch(body, /window\.location/);
  assert.doesNotMatch(body, /location\.reload/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("settings-password-ui-contract tests failed");
  process.exit(1);
} else {
  console.log("Settings password change row UI contract passed");
}
