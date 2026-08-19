// Focused regression guard for making required account onboarding
// non-dismissible (2026-08-19): before this fix, AccountOnboardingDialog.tsx
// rendered its own "×" close button that called onOpenChange(false) directly,
// and the underlying Radix Dialog still closed on Escape/backdrop click too -
// any of the three let a user leave the "Finish your profile" popup with
// onboarding still incomplete while staying signed in, with no other guard
// anywhere in the app to catch that (see src/app/App.tsx: the dialog is the
// sole enforcement point, rendered on every route branch while authUserId
// exists and shouldOpenAccountOnboarding is true - see
// src/app/utils/accountProfile.ts).
//
// Source-text, not runtime, matching test-auth-dialog-hardening.mjs's own
// established precedent for this exact pair of files: App.tsx transitively
// imports src/lib/supabaseAuth.ts, which reads import.meta.env.VITE_SUPABASE_URL
// at module load - a Vite-only global that doesn't exist under plain `node`.
//
// Covers:
//   [1] the previous close path (custom "×" button) is gone, and Radix's own
//       Escape/outside-click dismissal is explicitly blocked
//   [2] Cancel registration exists, is wired to a real sign-out + public-page
//       redirect, and never deletes the account
//   [3] the render guard that blocks real isProtectedAccountPage content
//       (profile/newWordStudy/reviewWords) for a signed-out, still-loading,
//       or onboarding-incomplete user
//   [4] route-aware dialog visibility (2026-08-19 regression fix): an
//       intermediate version of this guard made AccountOnboardingDialog's
//       `open` prop depend only on isAccountOnboardingOpen, with no route
//       check - so it covered every page, including public ones like
//       Exercises, for any signed-in user with an incomplete profile. This
//       section covers the fix: the dialog now only opens on
//       isProtectedAccountPage, and the redirect effect that used to bounce
//       an incomplete user off a protected page (defeating "onboarding
//       blocks that protected content" - once redirected to the public
//       exerciseSelection page, the dialog didn't show there either) was
//       reverted to its original signed-out-only form. Also covers why no
//       separate "just signed up" signal was needed: every interactive
//       session-establishing flow (password login, password signup, Google
//       OAuth) already navigates straight to /profile on its own.
//
// Re-login-forces-onboarding coverage (shouldOpenAccountOnboarding, and
// useUserProfileLoad.ts's setIsAccountOnboardingOpen(...) call keyed on
// [authUserId]) already exists in test-profile-load-and-onboarding.mjs
// (sections [1] and [5]) and is reused here, not duplicated - see [4]
// below, which only pins that the dialog's `open` prop and the guard both
// still depend on that exact state.
//
// Run: node scripts/tests/account/test-onboarding-required-guard.mjs
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

// Normalizes CRLF to LF - several source files in this repo are checked out
// with CRLF line endings, which silently breaks any regex pattern here that
// spans a blank line. Matches test-auth-dialog-hardening.mjs's own helper.
function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8").replace(/\r\n/g, "\n");
}

// Strips both `//` line comments and `/* */` block comments - used only
// where a pattern must prove something about *live code order* (e.g. "the
// Cancel button renders after the Save button"), which this file's own
// explanatory comments would otherwise confuse: several of them mention
// "Cancel registration" ahead of the real button to explain the non-
// dismissible contract.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

console.log("\n=== Required account onboarding: non-dismissible + Cancel registration ===\n");

const onboardingDialog = read("src/app/components/dialogs/AccountOnboardingDialog.tsx");
const app = read("src/app/App.tsx");

console.log("--- [1] The previous dismissal paths are closed ---\n");

test("1. No custom close/'×' button remains in AccountOnboardingDialog.tsx", () => {
  assert.doesNotMatch(
    onboardingDialog,
    /aria-label="Close onboarding"/,
    "the dialog's own manual close button must be removed, not just visually hidden",
  );
  assert.doesNotMatch(
    onboardingDialog,
    /&times;/,
    "no literal × close glyph may remain anywhere in this dialog",
  );
});

test("2. The base ui/dialog.tsx built-in close (data-slot=dialog-close) stays hidden via the existing className rule - defense in depth, not the removal target itself", () => {
  assert.match(onboardingDialog, /\[&_\[data-slot=dialog-close\]\]:hidden/);
});

test("3. DialogContent explicitly blocks Escape-key dismissal", () => {
  assert.match(
    onboardingDialog,
    /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/,
  );
});

test("4. DialogContent explicitly blocks outside-click/focus (backdrop) dismissal via onInteractOutside - the single Radix event that covers both onPointerDownOutside and onFocusOutside", () => {
  assert.match(
    onboardingDialog,
    /onInteractOutside=\{\(event\) => event\.preventDefault\(\)\}/,
  );
});

test("5. Both dismissal-blocking handlers are on the same <DialogContent> that renders the onboarding form (not some other, unrelated dialog in this file)", () => {
  // Non-greedy up to a newline immediately followed by the tag's own
  // closing `>` - a bare `[\s\S]*?>` would instead stop at the first `>`
  // character it meets at all, which is the one inside each handler's own
  // `(event) => ...` arrow function.
  const contentMatch = onboardingDialog.match(/<DialogContent\b([\s\S]*?)\n\s*>/);
  assert.ok(contentMatch, "expected to find the DialogContent open tag");
  assert.match(contentMatch[1], /onEscapeKeyDown=/);
  assert.match(contentMatch[1], /onInteractOutside=/);
});

console.log("\n--- [2] Cancel registration: real sign-out, public redirect, no account deletion ---\n");

test("6. AccountOnboardingDialog accepts and renders an onCancelRegistration prop", () => {
  assert.match(onboardingDialog, /onCancelRegistration: \(\) => void;/);
  assert.match(onboardingDialog, /onClick=\{onCancelRegistration\}/);
});

test("7. The Cancel registration button exists, is visually quieter (ghost variant, no gradient) than the primary Save and continue button, and sits after it", () => {
  const cleaned = stripComments(onboardingDialog);
  const saveIdx = cleaned.indexOf('"Saving..." : "Save and continue"');
  const cancelIdx = cleaned.indexOf("Cancel registration");
  assert.ok(saveIdx > -1 && cancelIdx > -1, "expected both buttons to be found");
  assert.ok(cancelIdx > saveIdx, "Cancel registration must render after Save and continue");

  const buttonMatch = onboardingDialog.match(
    /<Button\s+type="button"\s+variant="ghost"\s+disabled=\{isSubmitting\}\s+onClick=\{onCancelRegistration\}[\s\S]*?>\s*Cancel registration\s*<\/Button>/,
  );
  assert.ok(buttonMatch, "expected a ghost-variant Cancel registration Button");
  assert.doesNotMatch(
    buttonMatch[0],
    /linear-gradient/,
    "the secondary action must not reuse the primary CTA's gradient styling",
  );
});

test("8. handleCancelAccountOnboarding exists in App.tsx and is wired into AccountOnboardingDialog's onCancelRegistration prop", () => {
  assert.match(app, /const handleCancelAccountOnboarding = async \(\) => \{/);
  assert.match(app, /onCancelRegistration=\{\(\) => void handleCancelAccountOnboarding\(\)\}/);
});

test("9. Cancelling closes the dialog locally, clears the in-app auth session, and calls the real GoTrue sign-out endpoint (signOutSupabase) - not merely a local flag flip", () => {
  const fnMatch = app.match(/const handleCancelAccountOnboarding = async \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleCancelAccountOnboarding must be found");
  const body = fnMatch[1];
  assert.match(body, /setIsAccountOnboardingOpen\(false\);/);
  assert.match(body, /setAccountOnboardingError\(null\);/);
  assert.match(body, /handleAuthSessionChange\(null\);/);
  assert.match(body, /await signOutSupabase\(currentSession\);/);
});

test("10. A sign-out network failure still navigates the user away (finally-block), mirroring handleProfileSignOut's own best-effort precedent - a flaky /auth/v1/logout call must never strand the user on the still-open dialog", () => {
  const fnMatch = app.match(/const handleCancelAccountOnboarding = async \(\) => \{([\s\S]*?)\n  \};/);
  const body = fnMatch[1];
  assert.match(body, /\} catch \(error\) \{[\s\S]*?\} finally \{\s*navigate\(ROUTES\.exerciseSelection\);\s*\}/);
});

test("11. Cancellation never calls a delete-account/Edge Function path - the account is left registered but incomplete, never destroyed", () => {
  const fnMatch = app.match(/const handleCancelAccountOnboarding = async \(\) => \{([\s\S]*?)\n  \};/);
  const body = fnMatch[1];
  assert.doesNotMatch(body, /delete-account/i);
  assert.doesNotMatch(body, /deleteAccount/);
});

console.log("\n--- [3] The protected-content render guard (App.tsx) ---\n");

test("12. isOnboardingRequiredForAuthedUser requires authUserId, isProfileLoaded, and isAccountOnboardingOpen all at once, deferring to an active password-recovery flow", () => {
  assert.match(
    app,
    /const isOnboardingRequiredForAuthedUser =\s*\n\s*Boolean\(authUserId\) &&\s*\n\s*isProfileLoaded &&\s*\n\s*isAccountOnboardingOpen &&\s*\n\s*!isPasswordRecoveryActive;/,
  );
});

test("13. isOnboardingRequiredForAuthedUser is false while the profile is still loading - 'not loaded yet' can never be misread as 'incomplete' because isProfileLoaded is a required (not merely a fallback) term in the AND chain", () => {
  const match = app.match(
    /const isOnboardingRequiredForAuthedUser =([\s\S]*?);/,
  );
  assert.ok(match, "expected to find isOnboardingRequiredForAuthedUser's definition");
  assert.match(match[1], /isProfileLoaded &&/);
});

test("14. isAccountProfileStillLoading is defined as exactly 'signed in, profile fetch not yet resolved' - distinct from, and computed independently of, the incomplete-onboarding state", () => {
  assert.match(
    app,
    /const isAccountProfileStillLoading = Boolean\(authUserId\) && !isProfileLoaded;/,
  );
});

test("15. isAccountOnboardingOpen's reopen-on-login decision (shouldOpenAccountOnboarding, keyed on authUserId) is untouched by this fix - already covered end-to-end by test-profile-load-and-onboarding.mjs", () => {
  const useUserProfileLoad = read("src/app/hooks/useUserProfileLoad.ts");
  assert.match(
    useUserProfileLoad,
    /setIsAccountOnboardingOpen\(\s*\n\s*shouldOpenAccountOnboarding\(hasSupabaseProfileRow, nextProfile\),\s*\n\s*\);/,
  );
  assert.match(useUserProfileLoad, /\}, \[authUserId\]\);/);
});

test("16. The render guard blocks isProtectedAccountPage content for signed-out, still-loading, and onboarding-required alike, and precedes every real per-page branch (profile/newWordStudy/reviewWords) in file order - so none of them can be reached without passing this check first", () => {
  const guardMatch = app.match(
    /if \(\s*\n\s*isProtectedAccountPage &&\s*\n\s*isAuthResolved &&\s*\n\s*\(!authUserId \|\| isAccountProfileStillLoading \|\| isOnboardingRequiredForAuthedUser\)\s*\n\s*\) \{([\s\S]*?)\n {2}\}/,
  );
  assert.ok(guardMatch, "expected the extended centralized render guard");
  assert.match(guardMatch[1], /<RouteLoadingFallback \/>/);
  assert.match(guardMatch[1], /\{accountOnboardingDialog\}/);

  const guardIdx = app.indexOf("if (\n    isProtectedAccountPage &&\n    isAuthResolved &&");
  const profileBranchIdx = app.indexOf('if (resolvedPage === "profile") {');
  const newWordStudyBranchIdx = app.indexOf('if (resolvedPage === "newWordStudy") {');
  const reviewWordsBranchIdx = app.indexOf('if (resolvedPage === "reviewWords") {');
  assert.ok(
    guardIdx > -1 &&
      guardIdx < profileBranchIdx &&
      guardIdx < newWordStudyBranchIdx &&
      guardIdx < reviewWordsBranchIdx,
    "the centralized guard must appear before all three protected-page branches in file order",
  );
});

test("17. A completed profile (isProfileLoaded true, isAccountOnboardingOpen false) makes every guard term false, so isProtectedAccountPage content falls through to its real branch unchanged - completing onboarding is what flips isAccountOnboardingOpen (via handleAccountOnboardingSubmit, tested in test-auth-dialog-hardening.mjs/section [3] above), with no separate/parallel 'access granted' flag for this guard to fall out of sync with", () => {
  // isOnboardingRequiredForAuthedUser and isAccountProfileStillLoading are
  // both derived directly from isProfileLoaded/isAccountOnboardingOpen on
  // every render - there is no cached/stale boolean anywhere else in the
  // file that could disagree with them once onboarding completes.
  const onboardingRequiredDefs = (app.match(/const isOnboardingRequiredForAuthedUser =/g) ?? []).length;
  const stillLoadingDefs = (app.match(/const isAccountProfileStillLoading = /g) ?? []).length;
  assert.equal(onboardingRequiredDefs, 1, "must be defined exactly once - no shadow/duplicate guard state");
  assert.equal(stillLoadingDefs, 1, "must be defined exactly once - no shadow/duplicate guard state");
});

test("18. The render guard itself is scoped strictly to isProtectedAccountPage - no public-route branch (language/explore/about/help/exam/practice/exerciseSelection/levelCategory) references either guard flag, so anonymous/public access is untouched", () => {
  const publicBranchPatterns = [
    /if \(resolvedPage === "practice"\) \{([\s\S]*?)\n {2}\}\n\n {2}if \(/,
    /if \(resolvedPage === "about"\) \{([\s\S]*?)\n {2}\}\n\n {2}if \(/,
    /if \(resolvedPage === "explore"\) \{([\s\S]*?)\n {2}\}\n\n {2}if \(/,
    /if \(resolvedPage === "exerciseSelection"\) \{([\s\S]*?)\n {2}\}\n\n {2}if \(/,
  ];
  for (const pattern of publicBranchPatterns) {
    const match = app.match(pattern);
    assert.ok(match, `expected to find branch for pattern ${pattern}`);
    assert.doesNotMatch(match[1], /isOnboardingRequiredForAuthedUser/);
    assert.doesNotMatch(match[1], /isAccountProfileStillLoading/);
  }
});

console.log("\n--- [4] Route-aware dialog visibility: public pages stay clear, protected pages still block ---\n");

test("19. AccountOnboardingDialog's `open` prop requires isProtectedAccountPage in addition to isOnboardingRequiredForAuthedUser - the exact fix for the regression (the dialog previously opened on any page, including public ones like Exercises, merely because the signed-in user's profile was incomplete)", () => {
  assert.match(
    app,
    /open=\{isProtectedAccountPage && isOnboardingRequiredForAuthedUser\}/,
  );
  assert.doesNotMatch(
    app,
    /open=\{isAccountOnboardingOpen && !isPasswordRecoveryActive\}/,
    "the old route-agnostic open condition must be fully gone, not left as a second/parallel path",
  );
});

test("20. Because isOnboardingRequiredForAuthedUser is shared, unmodified state (not duplicated for the dialog), an incomplete user on a public page (isProtectedAccountPage false) structurally cannot have the dialog open - there is no route-specific override that could special-case Exercises or any other public route back open", () => {
  // isProtectedAccountPage is a plain boolean (resolvedPage === "profile" |
  // "newWordStudy" | "reviewWords") computed once, near the top of the
  // component, and referenced by identifier both here and in the render
  // guard - not re-derived or duplicated for the dialog's own open prop.
  const isProtectedAccountPageDefs = (app.match(/const isProtectedAccountPage =/g) ?? []).length;
  assert.equal(isProtectedAccountPageDefs, 1, "isProtectedAccountPage must be defined exactly once and reused, never redefined for the dialog");
});

test("21. The redirect effect is back to its original signed-out-only form - it no longer redirects merely because onboarding is required, which is what let the dialog get bounced off the protected page to a public one where it would no longer show at all", () => {
  assert.match(
    app,
    /useEffect\(\(\) => \{\s*\n\s*if \(isAuthResolved && !authUserId && isProtectedAccountPage\) \{\s*\n\s*navigate\(ROUTES\.exerciseSelection, \{ replace: true \}\);\s*\n\s*\}\s*\n\s*\}, \[authUserId, isAuthResolved, isProtectedAccountPage, navigate\]\);/,
  );
  assert.doesNotMatch(
    app,
    /if \(!authUserId \|\| isOnboardingRequiredForAuthedUser\) \{\s*\n\s*navigate\(ROUTES\.exerciseSelection/,
    "the effect must never navigate away from a protected page merely because onboarding is required - that is the render guard + dialog's job, in place, not a redirect",
  );
});

test("22. No redirect loop: the redirect effect's own guard (isAuthResolved && !authUserId && isProtectedAccountPage) requires isProtectedAccountPage - once it navigates to exerciseSelection (a public route), isProtectedAccountPage becomes false on the next render, so the same effect cannot re-fire against its own destination", () => {
  const fnMatch = app.match(/useEffect\(\(\) => \{\s*\n\s*if \(isAuthResolved && !authUserId && isProtectedAccountPage\) \{([\s\S]*?)\n {2}\}, \[/);
  assert.ok(fnMatch, "expected the signed-out redirect effect");
  assert.match(fnMatch[1], /navigate\(ROUTES\.exerciseSelection, \{ replace: true \}\);/);
  // exerciseSelection is never itself isProtectedAccountPage - confirmed by
  // isProtectedAccountPage's own definition (test elsewhere in this file /
  // pageRouting.ts), so the destination this effect navigates to can never
  // satisfy the condition that triggered the navigation in the first place.
  const protectedPageDef = app.match(/const isProtectedAccountPage =([\s\S]*?);/)[1];
  assert.doesNotMatch(protectedPageDef, /"exerciseSelection"/);
});

console.log("\n--- [5] New-signup flow: still lands on /profile on its own, no separate signal needed ---\n");

// The task's key finding: no "just signed up" transient flag was needed.
// Every interactive session-establishing flow already navigates straight to
// /profile (a protected page) on success, so isOnboardingRequiredForAuthedUser
// combined with isProtectedAccountPage already reopens the dialog immediately
// after registration - without also trapping a *returning* incomplete user
// on public pages they merely browse to (no navigation happens for that
// case at all).

const header = read("src/app/components/layout/Header.tsx");

test("23. Password login success navigates to /profile via goToProfile('dashboard') - so logging into an existing incomplete account lands on a protected page, where the guard/dialog correctly apply, without any extra signal", () => {
  const loginBranch = header.match(/if \(authMode === "login"\) \{([\s\S]*?)\n {6}\}/);
  assert.ok(loginBranch, "expected the login branch in handlePasswordAuthSubmit");
  assert.match(loginBranch[1], /goToProfile\("dashboard"\);/);
});

test("24. Password signup-with-immediate-session success also navigates to /profile via goToProfile('dashboard') - this is what already delivers 'onboarding required immediately after registration' with no separate just-signed-up flag", () => {
  const signupSessionBranch = header.match(/if \(result\.session\) \{([\s\S]*?)\n {6}\}/);
  assert.ok(signupSessionBranch, "expected the result.session branch in handlePasswordAuthSubmit");
  assert.match(signupSessionBranch[1], /goToProfile\("dashboard"\);/);
});

test("25. Google OAuth's redirect completion also navigates to /profile (unless a password-recovery redirect) - the third and last interactive session-establishing path, completing the same pattern", () => {
  assert.match(
    app,
    /onSessionEstablished: \(session, context\) => \{\s*\n\s*handleAuthSessionChange\(session\);\s*\n\s*if \(!context\.recovery\) \{\s*\n\s*navigate\(`\$\{ROUTES\.profile\}\?section=dashboard`, \{ replace: true \}\);/,
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("onboarding-required-guard test passed");
}
