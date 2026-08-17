// Focused guard for the compact auth-cleanup batch: D-3 (unified Login <->
// Sign Up mode reset), D-4 + E-2 (safe classified auth error messages, no
// signup-enumeration leak), D-5 (OAuth redirect error/error_code fallback),
// F-1 (auth/onboarding/language-confirm live-region announcements), F-3
// (AccountOnboardingDialog description), D-7 (safe sign-out diagnostics),
// D-8 (auth handler reentrancy guards).
//
// Source-text, not runtime: Header.tsx imports src/lib/supabaseAuth.ts
// (transitively) and src/lib/supabaseError.ts, and supabaseAuth.ts itself
// reads import.meta.env.VITE_SUPABASE_URL at module load - a Vite-only
// global that doesn't exist under plain `node`, so neither file (nor
// anything importing them) can be runtime-imported here. Same constraint
// documented in test-password-recovery-completion.mjs and
// test-refresh-single-flight.mjs; this guard follows their precedent.
//
// Run: node scripts/tests/architecture/test-auth-dialog-hardening.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

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

// Normalizes CRLF to LF: several source files in this repo are checked out
// with CRLF line endings, which silently breaks any regex pattern here
// that spans a blank line (`\n\n` expects two adjacent LFs, but a CRLF
// blank line is actually `\r\n\r\n` - a stray \r sits between the two LFs).
// Normalizing once here keeps every pattern below written the same way
// regardless of the file's on-disk line-ending convention.
function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8").replace(/\r\n/g, "\n");
}

// Strips `//` line comments before matching - used only where a pattern
// must prove something about *live code*, not about what this task's own
// explanatory comments happen to mention in prose (e.g. this file's
// comments legitimately say "error.message" and "already registered" when
// explaining what NOT to do).
function stripLineComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

console.log("\n=== Auth dialog hardening guards ===\n");

const header = read("src/app/components/layout/Header.tsx");
const supabaseAuth = read("src/lib/supabaseAuth.ts");
const onboardingDialog = read("src/app/components/dialogs/AccountOnboardingDialog.tsx");
const languageConfirmDialog = read("src/app/components/dialogs/AccountLanguageConfirmDialog.tsx");
const recoveryDialog = read("src/app/components/dialogs/PasswordRecoveryDialog.tsx");
const englishLocale = JSON.parse(read("src/data/interface/english_interface.json"));

console.log("--- D-3: unified Login <-> Sign Up mode transitions ---\n");

test("1. setAuthMode is only ever called from inside the one shared switchAuthMode helper - every other transition routes through it", () => {
  const rawSetAuthModeCalls = (header.match(/setAuthMode\(/g) ?? []).length;
  assert.equal(rawSetAuthModeCalls, 1, "setAuthMode( must appear exactly once in the whole file - inside switchAuthMode's own body");
  const helperMatch = header.match(/const switchAuthMode = \(mode: "login" \| "signup"\) => \{([\s\S]*?)\n  \};/);
  assert.ok(helperMatch, "switchAuthMode helper must be found");
  assert.match(helperMatch[1], /setAuthMode\(mode\);/);
});

test("2. switchAuthMode clears stale error/info and the password fields - never leaves a prior mode's password/confirm-password or message behind", () => {
  const helperMatch = header.match(/const switchAuthMode = \(mode: "login" \| "signup"\) => \{([\s\S]*?)\n  \};/);
  const body = helperMatch[1];
  assert.match(body, /setAuthPassword\(""\);/);
  assert.match(body, /setAuthConfirmPassword\(""\);/);
  assert.match(body, /setAuthError\(null\);/);
  assert.match(body, /setAuthInfo\(null\);/);
});

test("3. Every Login <-> Sign Up transition site calls switchAuthMode: opening the dialog fresh (both modes), the in-dialog footer mode-switch buttons, the signup-success hand-off to login, and the redirect-error forced-login-mode path", () => {
  const switchCallSites = (header.match(/switchAuthMode\(/g) ?? []).length;
  // openLoginDialog, openSignupDialog, the authRedirectError effect, the
  // signup-success-without-session branch, and the footer "Log in" button
  // (openSignupDialog itself already covers the footer "Sign up" button).
  assert.equal(switchCallSites, 5, `expected exactly 5 switchAuthMode(...) call sites, found ${switchCallSites}`);

  assert.match(header, /const openLoginDialog = \(\) => \{\s*switchAuthMode\("login"\);/);
  assert.match(header, /const openSignupDialog = \(\) => \{\s*switchAuthMode\("signup"\);/);
  assert.match(header, /onClick=\{\(\) => switchAuthMode\("login"\)\}/, "the in-dialog footer 'Log in' button must route through switchAuthMode, not a bare setAuthMode call");
});

test("4. Opening Login and opening Sign Up share the same reset contract - both call switchAuthMode as their very first step", () => {
  const openLoginBody = header.match(/const openLoginDialog = \(\) => \{([\s\S]*?)\n  \};/)[1];
  const openSignupBody = header.match(/const openSignupDialog = \(\) => \{([\s\S]*?)\n  \};/)[1];
  assert.ok(openLoginBody.trim().startsWith('switchAuthMode("login");'));
  assert.ok(openSignupBody.trim().startsWith('switchAuthMode("signup");'));
});

console.log("\n--- D-4 + E-2: safe, classified auth error messages ---\n");

test("5. Header.tsx never renders a raw error.message - only through resolveAuthErrorMessage's classify/describe/translate pipeline", () => {
  assert.doesNotMatch(
    stripLineComments(header),
    /error\.message/,
    "no live code path may reference error.message directly (comments explaining this are fine, but no code)",
  );
  assert.doesNotMatch(
    header,
    /setAuthError\(\s*error instanceof Error/,
    "the old 'error instanceof Error ? error.message : ...' raw-message-leak pattern must be fully gone",
  );
});

test("6. resolveAuthErrorMessage reuses the shared classifier/translator infrastructure (classifySupabaseError, resolveSupabaseErrorMessageKey) - no parallel error system", () => {
  assert.match(header, /import \{\s*classifySupabaseError,\s*describeSupabaseError,\s*resolveSupabaseErrorMessageKey,\s*\} from "\.\.\/\.\.\/\.\.\/lib\/supabaseError";/);
  const fnMatch = header.match(/function resolveAuthErrorMessage\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "resolveAuthErrorMessage must be found");
  assert.match(fnMatch[1], /classifySupabaseError\(error\)/);
  assert.match(fnMatch[1], /describeSupabaseError\(operation, error\)/);
  assert.match(fnMatch[1], /resolveSupabaseErrorMessageKey\(category, operationFallbackKey\)/);
});

test("7. Google, login, signup, and forgot-password failures all resolve their message through resolveAuthErrorMessage - none hand-rolls its own message", () => {
  const callSites = (header.match(/resolveAuthErrorMessage\(/g) ?? []).length;
  // 4 total: the function's own declaration plus 3 real call sites (Google
  // auth, the shared login/signup catch, and forgot password).
  assert.equal(callSites, 4, "expected 1 declaration + 3 call sites");
  assert.match(header, /resolveAuthErrorMessage\("Google sign-in", error, "auth\.googleError", t\)/);
  assert.match(header, /resolveAuthErrorMessage\(authMode === "login" \? "login" : "signup", error, fallbackKey, t\)/);
  assert.match(header, /resolveAuthErrorMessage\("forgot password", error, "auth\.forgotPasswordError", t\)/);
});

test("8. Signup failures use a dedicated neutral fallback key, distinct from login's - the two must never be conflatable back into one generic message that could hint at which one is enumeration-sensitive by its own separateness being removed carelessly later", () => {
  assert.match(
    header,
    /const fallbackKey = authMode === "login" \? "auth\.loginError" : "auth\.signupError";/,
  );
});

test("9. The signup-success-without-session branch shows a neutral, translated 'check your email' message - never claims the account was created, and never branches on identities/user fields", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  assert.ok(submitFnMatch, "handlePasswordAuthSubmit must be found");
  const body = stripLineComments(submitFnMatch[0]);
  assert.doesNotMatch(body, /identities/i, "must not inspect the signup response's identities field to decide what to show");
  assert.doesNotMatch(body, /already registered|already exists/i, "must not contain enumeration-revealing copy in live code (comments explaining the reasoning are fine)");
  assert.doesNotMatch(body, /Account created/i, "must never claim the account was created - it may already exist (including a Google-only account)");
  assert.match(body, /setAuthInfo\(t\("auth\.signupCheckEmail"\)\);/);
});

test("10. Session-returning signup follows the exact same authenticated-success path as login: sets the session, notifies the parent, closes the dialog, and resets the form", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  const sessionBranchMatch = submitFnMatch[0].match(
    /if \(result\.session\) \{([\s\S]*?)\n {6}\}/,
  );
  assert.ok(sessionBranchMatch, "the result.session branch must be found");
  const body = sessionBranchMatch[1];
  assert.match(body, /setAuthSession\(result\.session\);/);
  assert.match(body, /onAuthSessionChange\?\.\(result\.session\);/);
  assert.match(body, /setIsAuthDialogOpen\(false\);/);
  assert.match(body, /resetAuthForm\(\);/);
  assert.match(body, /return;/);
});

test("11. No-session signup never navigates and never closes the auth dialog - it only switches mode (still open) and shows the info message, exactly like every other switchAuthMode transition", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  // Everything between the result.session branch's closing and the catch
  // block is the no-session path.
  const noSessionMatch = submitFnMatch[0].match(
    /if \(result\.session\) \{[\s\S]*?\n {6}\}\n\n([\s\S]*?)\n {4}\} catch/,
  );
  assert.ok(noSessionMatch, "the no-session path must be found");
  const body = stripLineComments(noSessionMatch[1]);
  assert.doesNotMatch(body, /navigate\(/i, "must not navigate anywhere without a real session");
  assert.doesNotMatch(body, /onProfile/i, "must not route to the profile/dashboard without a real session");
  assert.doesNotMatch(body, /setIsAuthDialogOpen/, "must not open or close the dialog itself - switchAuthMode only changes mode, the dialog stays open");
  assert.match(body, /switchAuthMode\("login"\);/);
});

test("12. No-session signup never establishes a session or notifies the parent - onboarding (driven solely by a real authUserId, see useUserProfileLoad.ts) cannot be triggered merely by attempting signup", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  const noSessionMatch = submitFnMatch[0].match(
    /if \(result\.session\) \{[\s\S]*?\n {6}\}\n\n([\s\S]*?)\n {4}\} catch/,
  );
  const body = noSessionMatch[1];
  assert.doesNotMatch(body, /setAuthSession\(/, "must not set a session for a no-session signup result");
  assert.doesNotMatch(body, /onAuthSessionChange/, "must not notify the parent of a session change - there is no session");
  const useUserProfileLoad = read("src/app/hooks/useUserProfileLoad.ts");
  assert.match(
    useUserProfileLoad,
    /\}, \[authUserId\]\);/,
    "onboarding's own open-decision effect must still be keyed solely on authUserId, unaffected by this fix",
  );
});

test("13. The new auth.* locale keys (including the neutral no-session copy) exist, are non-empty, and never reveal whether the submitted email already exists - defined consistently across all 7 locales", () => {
  const LOCALE_FILES = [
    "english_interface.json",
    "german_interface.json",
    "spanish_interface.json",
    "french_interface.json",
    "italian_interface.json",
    "portuguese_interface.json",
    "russian_interface.json",
  ];
  const REQUIRED_KEYS = [
    "loginError",
    "loginUnconfirmedEmail",
    "signupError",
    "forgotPasswordError",
    "googleError",
    "signupCheckEmail",
    "passwordRequirementHint",
    "passwordRequirementMetSr",
    "passwordRequirementNotMetSr",
    "passwordsMatch",
    "passwordsDoNotMatch",
  ].sort();
  for (const fileName of LOCALE_FILES) {
    const data = JSON.parse(read(`src/data/interface/${fileName}`));
    assert.ok(data.auth, `${fileName} is missing a top-level "auth" section`);
    assert.deepEqual(Object.keys(data.auth).sort(), REQUIRED_KEYS, `${fileName} auth keys differ from the required set`);
    for (const [key, value] of Object.entries(data.auth)) {
      assert.equal(typeof value, "string", `${fileName}: auth.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: auth.${key} is empty`);
    }
  }
  assert.doesNotMatch(
    englishLocale.auth.signupError,
    /email|exist|registered/i,
    "the English signup-error copy must stay neutral about account existence",
  );
  assert.doesNotMatch(
    englishLocale.auth.signupCheckEmail,
    /exist|registered|already have an email|found/i,
    "the English no-session copy must never reveal whether the email already exists",
  );
  assert.doesNotMatch(
    englishLocale.auth.signupCheckEmail,
    /account created|created your account/i,
    "the English no-session copy must never claim the account was created",
  );
});

console.log("\n--- Unconfirmed-email login: distinct message, no enumeration weakening ---\n");

test("13b. The login catch branches on classifySupabaseError(error) === \"email_not_confirmed\", guarded to login mode only, before ever reaching resolveAuthErrorMessage's generic fallback", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  const catchMatch = submitFnMatch[0].match(/\} catch \(error\) \{([\s\S]*?)\n {4}\} finally/);
  assert.ok(catchMatch, "handlePasswordAuthSubmit's catch block must be found");
  const body = catchMatch[1];
  assert.match(
    body,
    /if \(authMode === "login" && classifySupabaseError\(error\) === "email_not_confirmed"\) \{/,
    "must classify via the shared classifier, never by sniffing error.message text",
  );
  assert.match(body, /setAuthError\(t\("auth\.loginUnconfirmedEmail"\)\);/);
  // The branch's own else must still fall through to the exact same
  // resolveAuthErrorMessage call every other login/signup failure uses -
  // this is an addition alongside the existing pipeline, not a parallel one.
  assert.match(body, /\} else \{\s*setAuthError\(resolveAuthErrorMessage\(authMode === "login" \? "login" : "signup", error, fallbackKey, t\)\);\s*\}/);
});

test("13c. The unconfirmed-email branch is scoped to login mode only - signup never takes it, so it cannot become a second signup-enumeration surface", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  const catchMatch = submitFnMatch[0].match(/\} catch \(error\) \{([\s\S]*?)\n {4}\} finally/);
  assert.match(catchMatch[1], /authMode === "login" && classifySupabaseError\(error\)/);
});

test("13d. auth.loginUnconfirmedEmail is a distinct key from auth.loginError in every locale, and its English copy names email verification without reusing the generic incorrect-credentials wording", () => {
  assert.notEqual(englishLocale.auth.loginError, englishLocale.auth.loginUnconfirmedEmail);
  assert.match(englishLocale.auth.loginUnconfirmedEmail, /verify|confirm/i);
  assert.doesNotMatch(englishLocale.auth.loginUnconfirmedEmail, /incorrect/i);
});

console.log("\n--- D-5: OAuth/auth redirect error fallback ---\n");

test("14. handleSupabaseAuthRedirect's error branch now also triggers on bare `error`/`error_code` (no error_description required)", () => {
  assert.match(supabaseAuth, /const oauthError = url\.searchParams\.get\("error"\);/);
  assert.match(supabaseAuth, /const oauthErrorCode = url\.searchParams\.get\("error_code"\);/);
  assert.match(supabaseAuth, /if \(errorDescription \|\| oauthError \|\| oauthErrorCode\) \{/);
});

test("15. That branch still cleans up the URL and returns a safe fallback when no description is present, while preserving the richer description when one exists", () => {
  const branchMatch = supabaseAuth.match(
    /if \(errorDescription \|\| oauthError \|\| oauthErrorCode\) \{([\s\S]*?)\n  \}\n\n  if \(authCode\)/,
  );
  assert.ok(branchMatch, "the widened error branch must be found");
  const body = branchMatch[1];
  assert.match(body, /clearAuthParamsFromUrl\(\);/);
  assert.match(body, /error: errorDescription\s*\?\s*decodeURIComponent\(errorDescription\)\s*:\s*"Authentication failed\. Please try again\."/);
  assert.match(body, /recovery: false,/);
});

test("16. The safe fallback text is never derived from the raw error/error_code values themselves (no string interpolation of oauthError/oauthErrorCode into the returned message)", () => {
  const branchMatch = supabaseAuth.match(
    /if \(errorDescription \|\| oauthError \|\| oauthErrorCode\) \{([\s\S]*?)\n  \}\n\n  if \(authCode\)/,
  );
  assert.doesNotMatch(branchMatch[1], /\$\{oauthError/, "must not interpolate the raw error param into the message");
  assert.doesNotMatch(branchMatch[1], /\$\{oauthErrorCode/, "must not interpolate the raw error_code param into the message");
});

test("17. OAuth success (implicit hash-token branch) and password recovery detection are untouched by the D-5 change", () => {
  assert.match(
    supabaseAuth,
    /if \(hashAccessToken && hashRefreshToken\) \{[\s\S]*?const isRecovery = hashParams\.get\("type"\) === "recovery";[\s\S]*?recovery: isRecovery \};/,
  );
});

test("18. PKCE/Google OAuth code-exchange behavior is untouched by the D-5 change", () => {
  assert.match(supabaseAuth, /async function exchangeCodeForSession\(code: string\) \{/);
  assert.match(supabaseAuth, /grant_type=pkce/);
  assert.match(supabaseAuth, /if \(!getStoredPkceVerifier\(\)\) \{/);
});

console.log("\n--- F-1: live-region/alert semantics ---\n");

test("19. Header.tsx's auth error is role=\"alert\" and its info/success message is a polite status live region", () => {
  assert.match(
    header,
    /\{authError \? \(\s*<div\s*\n\s*role="alert"\s*\n\s*className="rounded-xl border border-red-200 bg-red-50[^"]*"\s*\n\s*>\s*\{authError\}/,
  );
  assert.match(
    header,
    /\{authInfo \? \(\s*<div\s*\n\s*role="status"\s*\n\s*aria-live="polite"\s*\n\s*className="rounded-xl border border-emerald-200 bg-emerald-50[^"]*"\s*\n\s*>\s*\{authInfo\}/,
  );
});

test("20. AccountOnboardingDialog's error message is role=\"alert\"", () => {
  assert.match(
    onboardingDialog,
    /\{error \? \(\s*<div\s*\n\s*role="alert"\s*\n\s*className="rounded-2xl border border-red-200 bg-red-50[^"]*"\s*\n\s*>\s*\{error\}/,
  );
});

test("21. AccountLanguageConfirmDialog's error message is role=\"alert\"", () => {
  assert.match(
    languageConfirmDialog,
    /\{error \? \(\s*<div\s*\n\s*role="alert"\s*\n\s*className="rounded-md border border-red-200 bg-red-50[^"]*"\s*\n\s*>\s*\{error\}/,
  );
});

test("22. PasswordRecoveryDialog's D-1 accessibility (role=\"alert\" error, role=\"status\" success) is unchanged - no regression", () => {
  assert.match(recoveryDialog, /role="alert"/);
  assert.match(recoveryDialog, /role="status"\s*\n\s*aria-live="polite"/);
});

console.log("\n--- F-3: AccountOnboardingDialog description ---\n");

test("23. AccountOnboardingDialog renders a DialogDescription (imported from the shared ui/dialog module, same Radix pattern used elsewhere)", () => {
  assert.match(onboardingDialog, /import \{\s*Dialog,\s*DialogContent,\s*DialogDescription,\s*DialogHeader,\s*DialogTitle,\s*\} from "\.\.\/ui\/dialog";/);
  assert.match(onboardingDialog, /<DialogDescription[^>]*>/);
});

console.log("\n--- D-7: safe sign-out failure diagnostics ---\n");

test("24. handleSignOut's catch block logs via describeSupabaseError and never calls setAuthError or reopens the dialog", () => {
  const fnMatch = header.match(/const handleSignOut = async \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleSignOut must be found");
  const catchMatch = fnMatch[1].match(/\} catch \(error\) \{([\s\S]*?)\} finally/);
  assert.ok(catchMatch, "handleSignOut's catch block must be found");
  const catchBody = catchMatch[1];
  assert.match(catchBody, /describeSupabaseError\("sign out", error\)/);
  assert.doesNotMatch(catchBody, /setAuthError/, "must not write into authError - the dialog is already closed by this point, so nothing would render it");
  assert.doesNotMatch(catchBody, /setIsAuthDialogOpen\(true\)/, "must not reopen the auth dialog just to show a logout failure");
});

test("25. handleSignOut's local sign-out/session-clearing behavior (session clear, dialog/menu close, onSignedOut) is unchanged", () => {
  const fnMatch = header.match(/const handleSignOut = async \(\) => \{([\s\S]*?)\n  \};/);
  const body = fnMatch[1];
  assert.match(body, /setAuthSession\(null\);/);
  assert.match(body, /onAuthSessionChange\?\.\(null\);/);
  assert.match(body, /setIsAuthDialogOpen\(false\);/);
  assert.match(body, /await signOutSupabase\(currentSession\);/);
  assert.match(body, /onSignedOut\?\.\(\);/);
});

console.log("\n--- D-8: auth handler reentrancy guards ---\n");

test("26. handleGoogleAuth, handlePasswordAuthSubmit, and handleForgotPassword each guard against re-entry with an isAuthSubmitting check before doing any work", () => {
  const guardPattern = /if \(isAuthSubmitting\) \{\s*return;\s*\}/;

  const googleFn = header.match(/const handleGoogleAuth = async \(\) => \{([\s\S]*?)\n  \};/)[1];
  assert.match(googleFn, guardPattern);

  const submitFn = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/)[0];
  assert.match(submitFn, guardPattern);
  // Must guard before the disabled-button-redundant work starts, i.e.
  // before the first setAuthError/setAuthInfo reset in the function body.
  assert.ok(
    submitFn.indexOf("if (isAuthSubmitting) {") < submitFn.indexOf("setAuthError(null)"),
    "the reentrancy guard must run before any state is touched",
  );

  const forgotFn = header.match(/const handleForgotPassword = async \(\) => \{([\s\S]*?)\n  \};/)[1];
  assert.match(forgotFn, guardPattern);
});

test("27. The disabled-button protection on the submit/Google/forgot-password controls is still present alongside the new reentrancy guards", () => {
  assert.match(header, /disabled=\{isAuthSubmitting\}/);
  const disabledCount = (header.match(/disabled=\{isAuthSubmitting\}/g) ?? []).length;
  assert.ok(disabledCount >= 4, "expected the Google button, email/password inputs, forgot-password link, and submit button to all still disable on isAuthSubmitting");
});

console.log("\n--- Scope: D-2 single-flight refresh is untouched ---\n");

// Test 28 here used to be a diff-based scope guard asserting
// "PasswordRecoveryDialog.tsx (D-1) is byte-identical to before this batch -
// not part of this task's diff", checked via `git diff --name-only HEAD`.
// That was a one-time regression guard for the specific historical D-1..D-8
// batch this file documents (see the file header above) - it asserted no
// real property of the code, only that nobody had touched the file *in that
// one diff*. Once that batch shipped, the assertion had no way to ever pass
// again for any later, legitimate edit to PasswordRecoveryDialog.tsx (e.g.
// the 2026-08-18 password-minimum-length change, which centralized its
// MIN_PASSWORD_LENGTH constant into settingsPassword.ts and correctly
// touched this exact file) - removed rather than narrowed, since a
// diff-emptiness check has no meaningful narrower form. The real invariant
// it was guarding as a side effect - D-1's actual accessibility/validation
// behavior - is still independently covered by test-password-recovery-
// completion.mjs, which asserts PasswordRecoveryDialog.tsx's behavior from
// its source directly rather than from the fact that its diff is empty.
test("28. refreshSupabaseSession/refreshSingleFlight (D-2) are untouched - single-flight refresh behavior is unchanged", () => {
  assert.match(supabaseAuth, /const refreshSingleFlight = createSingleFlight<StoredSupabaseSession>\(\);/);
  assert.match(
    supabaseAuth,
    /export function refreshSupabaseSession\(\s*session: StoredSupabaseSession,\s*\): Promise<StoredSupabaseSession> \{\s*[\s\S]*?return refreshSingleFlight\.run\(\(\) => performSupabaseSessionRefresh\(session\)\);\s*\}/,
  );
});

console.log("\n--- Signup password requirements (2026-08-18): shared minimum, live hint, no invented complexity ---\n");

test("29. Signup's length gate imports PASSWORD_MIN_LENGTH from settingsPassword.ts - the same shared constant Settings and Password Recovery use, never a second literal", () => {
  assert.match(header, /import \{ PASSWORD_MIN_LENGTH \} from "\.\.\/\.\.\/utils\/settingsPassword";/);
  assert.match(header, /if \(authPassword\.length < PASSWORD_MIN_LENGTH\) \{/);
});

test("30. The length gate runs strictly before the password-match check and before signUpWithPassword is ever called - an invalid-length signup never reaches GoTrue", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  assert.ok(submitFnMatch, "handlePasswordAuthSubmit must be found");
  const body = submitFnMatch[0];
  const lengthIdx = body.search(/if \(authPassword\.length < PASSWORD_MIN_LENGTH\) \{/);
  const mismatchIdx = body.search(/if \(authPassword !== authConfirmPassword\) \{/);
  const signUpIdx = body.search(/await signUpWithPassword\(\{/);
  assert.ok(lengthIdx > -1 && mismatchIdx > -1 && signUpIdx > -1, "expected all three to be found");
  assert.ok(lengthIdx < mismatchIdx, "length check must run before the match check");
  assert.ok(mismatchIdx < signUpIdx, "match check must run before signUpWithPassword");
});

test("31. The length gate is scoped to signup mode only - login keeps its unchanged 'password is required' check with no minimum length applied", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  const body = submitFnMatch[0];
  const signupBlockMatch = body.match(/if \(authMode === "signup"\) \{([\s\S]*?)\n {4}\}\n/);
  assert.ok(signupBlockMatch, "expected the authMode === 'signup' block");
  assert.match(signupBlockMatch[1], /authPassword\.length < PASSWORD_MIN_LENGTH/);
  const preSignupBlock = body.slice(0, body.indexOf('if (authMode === "signup")'));
  assert.doesNotMatch(preSignupBlock, /PASSWORD_MIN_LENGTH/, "the shared login/signup 'password is required' check above the signup block must stay length-agnostic");
});

test("32. The signup length-gate error reuses the existing Settings passwordTooShort translation key rather than a new, duplicate hardcoded string", () => {
  assert.match(header, /setAuthError\(t\("userProfile\.settingsSection\.account\.passwordTooShort"\)\);/);
});

test("33. The signup password field renders a live requirement hint (signup mode only), driven by a PASSWORD_MIN_LENGTH-derived boolean, never a second hardcoded minimum", () => {
  assert.match(header, /const isSignupPasswordLengthValid = authPassword\.length >= PASSWORD_MIN_LENGTH;/);
  assert.match(header, /id="auth-password-requirement"/);
  assert.match(header, /t\("auth\.passwordRequirementHint"\)/);
});

test("34. The password input is described by the requirement hint via aria-describedby (signup mode only) - not an aria-live region, so the status is never re-announced on every keystroke", () => {
  assert.match(
    header,
    /aria-describedby=\{authMode === "signup" \? "auth-password-requirement" : undefined\}/,
  );
  const startIdx = header.indexOf('id="auth-password-requirement"');
  assert.ok(startIdx > -1, "expected the requirement hint paragraph");
  const endIdx = header.indexOf("</p>", startIdx);
  const hintBlock = header.slice(startIdx, endIdx);
  assert.doesNotMatch(hintBlock, /aria-live/);
});

test("35. The met/not-met distinction is never conveyed by color alone: a different icon shape renders per state (CheckCircle2 vs. Circle), plus a visually-hidden status word", () => {
  const startIdx = header.indexOf('id="auth-password-requirement"');
  const endIdx = header.indexOf("</p>", startIdx);
  const hintBlock = header.slice(startIdx, endIdx);
  assert.match(hintBlock, /<CheckCircle2 size=\{14\} aria-hidden="true" \/>/);
  assert.match(hintBlock, /<Circle size=\{14\} aria-hidden="true" \/>/);
  assert.match(hintBlock, /className="sr-only"/);
  assert.match(hintBlock, /t\("auth\.passwordRequirementMetSr"\)/);
  assert.match(hintBlock, /t\("auth\.passwordRequirementNotMetSr"\)/);
});

test("36. The untouched/empty field never shows the 'not yet met' status to assistive tech - only once the user has actually started typing", () => {
  const startIdx = header.indexOf('id="auth-password-requirement"');
  const endIdx = header.indexOf("</p>", startIdx);
  const hintBlock = header.slice(startIdx, endIdx);
  assert.match(hintBlock, /hasStartedTypingAuthPassword\s*\n\s*\? t\("auth\.passwordRequirementNotMetSr"\)\s*\n\s*: ""/);
});

test("37. No invented password-complexity requirements exist in the signup UI copy - only the shared length minimum, matching the live Supabase policy (length-only, no character-class rules)", () => {
  const startIdx = header.indexOf('id="auth-password-requirement"');
  const endIdx = header.indexOf("</p>", startIdx);
  const hintBlock = header.slice(startIdx, endIdx);
  assert.doesNotMatch(hintBlock, /uppercase|lowercase|number|digit|symbol|special character/i);
  for (const key of ["passwordRequirementHint", "passwordRequirementMetSr", "passwordRequirementNotMetSr"]) {
    assert.doesNotMatch(englishLocale.auth[key], /uppercase|lowercase|number|digit|symbol|special character/i);
  }
});

test("38. The pre-existing confirm-password field and its mismatch check are untouched by this task", () => {
  assert.match(header, /id="auth-confirm-password"/);
  assert.match(header, /setAuthError\("Passwords do not match\."\);/);
});

console.log("\n--- Live confirm-password match feedback (2026-08-18) ---\n");

function confirmStatusBlock() {
  const startIdx = header.indexOf('id="auth-confirm-password-status"');
  assert.ok(startIdx > -1, "expected the confirm-password status paragraph");
  const endIdx = header.indexOf("</p>", startIdx);
  return header.slice(startIdx, endIdx);
}

test("39. confirmPasswordMatchState is derived directly from authPassword/authConfirmPassword - no extra useState introduced for it", () => {
  assert.match(
    header,
    /const confirmPasswordMatchState: "neutral" \| "mismatch" \| "match" = !authConfirmPassword\s*\n\s*\? "neutral"\s*\n\s*: authPassword === authConfirmPassword\s*\n\s*\? "match"\s*\n\s*: "mismatch";/,
  );
  assert.doesNotMatch(header, /const \[confirmPasswordMatchState/, "must not be its own useState - derived, not synchronized");
});

test("40. An empty confirm-password field is neutral: no status paragraph renders and the input keeps its default border - never judged before the user has typed anything", () => {
  assert.match(header, /\{confirmPasswordMatchState !== "neutral" \? \(/);
  const inputBlockMatch = header.match(/<Input\s+id="auth-confirm-password"[\s\S]*?\/>/);
  assert.ok(inputBlockMatch, "expected the confirm-password Input");
  assert.match(inputBlockMatch[0], /"border-\[#ded7ef\] bg-white\/90"/, "the neutral/default branch must fall back to the field's original border color");
});

test("41. Two empty values are never read as a successful match: the ternary checks !authConfirmPassword (empty confirm) before the equality check ever runs, so authPassword === authConfirmPassword's own '' === '' case is structurally unreachable", () => {
  assert.match(
    header,
    /const confirmPasswordMatchState: "neutral" \| "mismatch" \| "match" = !authConfirmPassword\s*\n\s*\? "neutral"/,
  );
});

test("42. A non-empty mismatch renders a red/error border on the confirm-password input plus a red status row with an XCircle icon and the passwordsDoNotMatch text", () => {
  const inputBlockMatch = header.match(/<Input\s+id="auth-confirm-password"[\s\S]*?\/>/);
  assert.match(inputBlockMatch[0], /confirmPasswordMatchState === "mismatch"\s*\n\s*\? "border-red-300 bg-white\/90"/);
  const statusBlock = confirmStatusBlock();
  assert.match(statusBlock, /<XCircle size=\{14\} aria-hidden="true" \/>/);
  assert.match(statusBlock, /t\("auth\.passwordsDoNotMatch"\)/);
});

test("43. An exact match renders a green/success border on the confirm-password input plus a green status row with a CheckCircle2 icon and the passwordsMatch text", () => {
  const inputBlockMatch = header.match(/<Input\s+id="auth-confirm-password"[\s\S]*?\/>/);
  assert.match(inputBlockMatch[0], /confirmPasswordMatchState === "match"\s*\n\s*\? "border-emerald-300 bg-white\/90"/);
  const statusBlock = confirmStatusBlock();
  assert.match(statusBlock, /<CheckCircle2 size=\{14\} aria-hidden="true" \/>/);
  assert.match(statusBlock, /t\("auth\.passwordsMatch"\)/);
});

test("44. The match/mismatch status is never conveyed by color alone: a different icon renders per state (CheckCircle2 vs. XCircle) and the visible text itself names the state, not just the color", () => {
  const statusBlock = confirmStatusBlock();
  assert.match(statusBlock, /confirmPasswordMatchState === "match" \? \(/);
  assert.match(statusBlock, /<CheckCircle2 size=\{14\} aria-hidden="true" \/>/);
  assert.match(statusBlock, /<XCircle size=\{14\} aria-hidden="true" \/>/);
});

test("45. The confirm-password input references its status text via aria-describedby (only once there is a status to describe) - not an aria-live region, matching the password-requirement hint's own established pattern", () => {
  const inputBlockMatch = header.match(/<Input\s+id="auth-confirm-password"[\s\S]*?\/>/);
  assert.match(
    inputBlockMatch[0],
    /aria-describedby=\{\s*\n\s*confirmPasswordMatchState !== "neutral" \? "auth-confirm-password-status" : undefined\s*\n\s*\}/,
  );
  const statusBlock = confirmStatusBlock();
  assert.doesNotMatch(statusBlock, /aria-live/);
});

test("46. The submit-time mismatch guard is untouched and still runs independently of the live hint - a mismatched signup is still blocked before any GoTrue call", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  const body = submitFnMatch[0];
  const mismatchIdx = body.search(/if \(authPassword !== authConfirmPassword\) \{/);
  const signUpIdx = body.search(/await signUpWithPassword\(\{/);
  assert.ok(mismatchIdx > -1 && signUpIdx > -1 && mismatchIdx < signUpIdx, "the guard must still exist and still run before signUpWithPassword");
  assert.doesNotMatch(body, /confirmPasswordMatchState/, "the submit-time guard must keep using the raw values directly, never the display-only derived state, as its source of truth");
});

test("47. A matching-but-too-short password is not silently accepted: the length gate and the confirm-match state are two independent checks, and the length gate still runs first in the submit handler regardless of what confirmPasswordMatchState would show", () => {
  const submitFnMatch = header.match(/const handlePasswordAuthSubmit = async[\s\S]*?\n  \};/);
  const body = submitFnMatch[0];
  const lengthIdx = body.search(/if \(authPassword\.length < PASSWORD_MIN_LENGTH\) \{/);
  const mismatchIdx = body.search(/if \(authPassword !== authConfirmPassword\) \{/);
  assert.ok(lengthIdx > -1 && mismatchIdx > -1 && lengthIdx < mismatchIdx, "the length gate must still run before the match check, unaffected by this task");
  assert.doesNotMatch(header, /isSignupPasswordLengthValid[\s\S]{0,80}confirmPasswordMatchState|confirmPasswordMatchState[\s\S]{0,80}isSignupPasswordLengthValid/, "the two derived states must never be combined into one merged status");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("auth-dialog-hardening guard passed");
}
