// Contract guard for Settings' inline email change row (SettingsSection.tsx,
// src/lib/accountEmailChange.ts, src/lib/supabaseAuth.ts's
// updateSupabaseAuthUserEmail) — a source-text guard, same precedent as
// test-settings-nickname-ui-contract.mjs/test-account-reauthentication.mjs:
// these files import supabaseAuth.ts (import.meta.env at module load) or
// are a .tsx React component, so none of them can be runtime-imported by a
// bundler-free Node script. normalizeEmailInput/isDuplicateEmailError/
// getPendingEmailFromUser's own logic is covered independently and more
// thoroughly by test-settings-email.mjs.
//
// Run: node scripts/tests/architecture/test-settings-email-ui-contract.mjs
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
// comments happen to mention in prose (e.g. accountEmailChange.ts's header
// legitimately says "never touches auth.users directly" and "not a
// user_profiles write" when explaining what this module deliberately does
// NOT do).
function stripLineComments(source) {
  return source
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

const settingsSection = read("src/features/user-profile/sections/settings/SettingsSection.tsx");
const accountEmailChange = read("src/lib/accountEmailChange.ts");
const supabaseAuth = read("src/lib/supabaseAuth.ts");
const settingsEmail = read("src/app/utils/settingsEmail.ts");

console.log("\n=== Settings email row: display/edit shape ===\n");

test("1. The Account section renders the confirmed session email (never a second, independently-owned email value)", () => {
  assert.match(settingsSection, /<span className="settings-row__value">\{email \|\| "—"\}<\/span>/);
});

test("2. A Change action exists, is gated by canChangeEmail (Google accounts never get it), and requires a session", () => {
  assert.match(settingsSection, /onClick=\{handleStartEditEmail\}/);
  assert.match(settingsSection, /\{canChangeEmail \? \(/);
  assert.match(settingsSection, /disabled=\{!authSession\}[\s\S]{0,80}aria-label=\{t\("userProfile\.settingsSection\.account\.changeEmail"\)\}/);
});

test("3. Edit mode prefills the input with the current confirmed email, not a stale/empty draft", () => {
  assert.match(settingsSection, /const handleStartEditEmail = \(\) => \{\s*\n\s*setEmailDraft\(email\);/);
});

test("4. The input is type=email with a proper autocomplete hint and is associated with the row's own label", () => {
  assert.match(settingsSection, /type="email"/);
  assert.match(settingsSection, /autoComplete="email"/);
  assert.match(settingsSection, /aria-labelledby="settings-email-label"/);
  assert.match(settingsSection, /id="settings-email-label"/);
});

console.log("\n=== Cancel restores display mode without a backend call ===\n");

test("5. Cancel resets the draft to the confirmed email and exits edit mode — no Auth call in its own handler", () => {
  const cancelMatch = settingsSection.match(/const handleCancelEditEmail = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(cancelMatch, "handleCancelEditEmail must exist");
  assert.match(cancelMatch[1], /setIsEditingEmail\(false\)/);
  assert.match(cancelMatch[1], /setEmailDraft\(email\)/);
  assert.doesNotMatch(cancelMatch[1], /updateAccountEmail/);
});

console.log("\n=== Save is disabled when unchanged, invalid, pending, or for a Google account ===\n");

test("6. canSaveEmail requires editing + a session + a password account + a valid draft + a real change + not already saving", () => {
  assert.match(
    settingsSection,
    /const canSaveEmail =\s*\n\s*isEditingEmail && Boolean\(authSession\) && canChangeEmail && emailValidation\.ok &&\s*\n\s*!isEmailUnchanged && !isSavingEmail;/,
  );
});

test("7. isEmailUnchanged compares the normalized draft against the confirmed session email", () => {
  assert.match(settingsSection, /const isEmailUnchanged = emailValidation\.ok && emailValidation\.value === email;/);
});

test("8. The Save button's disabled prop is wired to canSaveEmail", () => {
  assert.match(settingsSection, /onClick=\{handleSaveEmail\} disabled=\{!canSaveEmail\}/);
});

test("9. normalizeEmailInput (not a second, ad hoc validation rule) governs validity", () => {
  assert.match(settingsSection, /normalizeEmailInput/);
  assert.match(settingsSection, /const emailValidation = normalizeEmailInput\(emailDraft\);/);
});

console.log("\n=== Save calls the narrow Auth email-update helper ===\n");

test("10. handleSaveEmail calls updateAccountEmail with the normalized value, not the raw draft", () => {
  assert.match(settingsSection, /import \{ updateAccountEmail \} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/accountEmailChange"/);
  assert.match(settingsSection, /updateAccountEmail\(authSession, emailValidation\.value\)/);
});

test("11. accountEmailChange.ts calls updateSupabaseAuthUserEmail (GoTrue's real Update User endpoint) — no direct auth.users write, no Admin API, no service-role key in live code", () => {
  const code = stripLineComments(accountEmailChange);
  assert.match(code, /updateSupabaseAuthUserEmail\(session, email\)/);
  assert.doesNotMatch(code, /auth\.users/);
  assert.doesNotMatch(code, /service_role/i);
  assert.doesNotMatch(code, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(code, /supabase\.auth\.admin/);
});

test("12. supabaseAuth.ts's updateSupabaseAuthUserEmail uses PUT /auth/v1/user with a Bearer session token — the same endpoint/shape as its password/metadata siblings, never a user id in the request", () => {
  const fnMatch = supabaseAuth.match(/export async function updateSupabaseAuthUserEmail\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "updateSupabaseAuthUserEmail must exist in supabaseAuth.ts");
  assert.match(fnMatch[1], /"\/auth\/v1\/user"/);
  assert.match(fnMatch[1], /method: "PUT"/);
  assert.match(fnMatch[1], /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(fnMatch[1], /body: JSON\.stringify\(\{\s*\n\s*email,\s*\n\s*\}\)/);
  assert.doesNotMatch(fnMatch[1], /user_id|userId/i);
});

test("13. This project's real double_confirm_changes=true behavior is what the wrapper documents/relies on (not an assumed immediate replacement)", () => {
  assert.match(supabaseAuth, /double_confirm_changes = true/);
  assert.match(accountEmailChange, /double_confirm_changes/);
});

test("14. accountEmailChange.ts folds the response into the app's existing session architecture via adoptSupabaseSession — no second, parallel session/email store", () => {
  assert.match(accountEmailChange, /import \{ adoptSupabaseSession, updateSupabaseAuthUserEmail, type StoredSupabaseSession \} from "\.\/supabaseAuth"/);
  assert.match(accountEmailChange, /adoptSupabaseSession\(nextSession\)/);
});

console.log("\n=== Duplicate email is detected and sanitized; confirmed email is preserved on failure ===\n");

// Scoped to handleSaveEmail's own body first (not a bare `.catch((error) =>`
// search) — the file also contains an earlier, identically-shaped
// `.catch((error) => { ... })` for the nickname save flow, and a lazy
// regex searching the whole file would match from THAT catch's opening
// brace through to email's .finally, silently swallowing everything in
// between (languages/timezone/etc.) as "the catch body".
const handleSaveEmailMatch = settingsSection.match(/const handleSaveEmail = \(\) => \{[\s\S]*?\n  \};/);
assert.ok(handleSaveEmailMatch, "handleSaveEmail must exist");
const handleSaveEmailSource = handleSaveEmailMatch[0];
const emailCatchMatch = handleSaveEmailSource.match(/\.catch\(\(error\) => \{([\s\S]*?)\}\)\s*\n\s*\.finally\(/);
assert.ok(emailCatchMatch, "handleSaveEmail's .catch branch must exist");
const emailCatchBody = emailCatchMatch[1];

test("15. A duplicate-email failure shows the dedicated sanitized message, checked before the generic classifier", () => {
  assert.match(emailCatchBody, /isDuplicateEmailError\(error\)/);
  assert.match(emailCatchBody, /emailChangeDuplicate/);
  // The duplicate branch must come before the generic describeSupabaseError
  // fallback, not after (never diluted into a generic message).
  const duplicateIndex = emailCatchBody.indexOf("isDuplicateEmailError(error)");
  const genericIndex = emailCatchBody.indexOf("describeSupabaseError(");
  assert.ok(duplicateIndex >= 0 && genericIndex > duplicateIndex, "duplicate check must run before the generic classifier");
});

test("16. A failed save never touches authSession/adoptSupabaseSession/writeStoredUserProfile — the confirmed email is left exactly as it was", () => {
  assert.doesNotMatch(emailCatchBody, /adoptSupabaseSession/);
  assert.doesNotMatch(emailCatchBody, /writeStoredUserProfile/);
  assert.doesNotMatch(emailCatchBody, /setIsEditingEmail\(false\)/);
});

test("17. Errors are sanitized through describeSupabaseError/resolveSupabaseErrorMessageKey — never a raw Supabase/Postgres/GoTrue message shown to the user", () => {
  assert.match(settingsSection, /describeSupabaseError\("updateAccountEmail", error\)/);
  assert.match(
    settingsSection,
    /resolveSupabaseErrorMessageKey\(\s*\n\s*diagnostics\.category,\s*\n\s*"userProfile\.settingsSection\.account\.emailSaveError",\s*\n\s*\)/,
  );
});

console.log("\n=== Pending-confirmation state, success feedback, and duplicate-submission prevention ===\n");

test("18. The pending address is derived directly from the live session's own new_email field — never a second local 'is pending' store", () => {
  assert.match(settingsSection, /const pendingEmail = getPendingEmailFromUser\(authSession\?\.user\);/);
  // Only one email-value-bearing useState besides the draft: none named
  // "pendingEmail" backed by its own setter.
  assert.doesNotMatch(settingsSection, /const \[pendingEmail, set\w+\] = useState/);
});

test("19. A pending change is shown with an accessible status region, and the success toast is phrased as pending, never as already updated", () => {
  assert.match(settingsSection, /role="status" className="settings-email-pending"/);
  assert.match(settingsSection, /emailChangePendingLabel/);
  assert.match(settingsSection, /showEmailToast\(t\("userProfile\.settingsSection\.account\.emailChangePending"\)\);/);
});

test("20. Duplicate submission is prevented: handleSaveEmail bails out while already saving, and Save/Cancel/input are disabled while saving", () => {
  assert.match(settingsSection, /if \(!canSaveEmail \|\| !authSession \|\| !emailValidation\.ok \|\| isSavingEmail\) \{/);
  assert.match(settingsSection, /setIsSavingEmail\(true\)/);
  assert.match(settingsSection, /disabled=\{isSavingEmail\}/);
});

test("21. No automatic retry loop exists around the email save (a single .catch, never a retry/setTimeout re-invocation)", () => {
  const saveFnMatch = settingsSection.match(/const handleSaveEmail = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(saveFnMatch, "handleSaveEmail must exist");
  assert.doesNotMatch(saveFnMatch[0], /setTimeout\(/);
  assert.doesNotMatch(saveFnMatch[0], /retry/i);
});

console.log("\n=== Google-account behavior ===\n");

test("22. canChangeEmail reuses accountDeletion.ts's existing isPasswordAccount — no second, parallel provider check", () => {
  assert.match(settingsSection, /import \{[\s\S]*?\bisPasswordAccount\b[\s\S]*?\} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/accountDeletion"/);
  assert.match(settingsSection, /const canChangeEmail = isPasswordAccount\(authSession\);/);
});

test("23. A Google-linked account sees an explanatory message instead of a Change action, and never a fake/disabled Change button pretending to work", () => {
  assert.match(settingsSection, /\{!canChangeEmail \? \(/);
  assert.match(settingsSection, /emailUnavailableGoogle/);
  // The Change button itself is conditionally omitted, not merely
  // disabled, for a Google account (see test 2's `{canChangeEmail ? (` gate).
});

console.log("\n=== No page reload; nickname behavior untouched ===\n");

test("24. Nothing in this component ever forces a page reload/navigation as part of the email flow", () => {
  assert.doesNotMatch(settingsSection, /window\.location/);
  assert.doesNotMatch(settingsSection, /location\.reload/);
});

test("25. The nickname edit row's own state/handlers are untouched by this task (still present, unchanged names)", () => {
  assert.match(settingsSection, /const \[nicknameDraft, setNicknameDraft\] = useState\(userProfile\.nickname\);/);
  assert.match(settingsSection, /const handleSaveNickname = \(\) => \{/);
  assert.match(settingsSection, /updateUserNickname\(authSession, nicknameValidation\.value\)/);
});

test("26. No Settings component issues a direct REST write against user_profiles for the email flow, and email is never sent as a user_profiles field in live code", () => {
  assert.doesNotMatch(settingsSection, /\/rest\/v1\/user_profiles["'`]/);
  assert.doesNotMatch(stripLineComments(settingsEmail), /user_profiles/);
  assert.doesNotMatch(stripLineComments(accountEmailChange), /user_profiles/);
});

test("27. No database migration was added for this task (Email is Auth-owned; no schema change was required)", () => {
  const migrationsDir = path.join(ROOT_DIR, "supabase", "migrations");
  const newEmailMigrations = fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql") && /email/i.test(entry) && !/nickname/i.test(entry));
  assert.deepEqual(newEmailMigrations, [], `unexpected email-related migration file(s): ${newEmailMigrations.join(", ")}`);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("settings-email-ui-contract tests failed");
  process.exit(1);
} else {
  console.log("Settings email change row UI contract passed");
}
