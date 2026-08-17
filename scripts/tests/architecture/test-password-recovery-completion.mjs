// Focused guard for the D-1 password-recovery-completion flow (Set new
// password dialog + the redirect/session plumbing behind it).
//
// Source-text, not runtime: src/lib/supabaseAuth.ts reads
// import.meta.env.VITE_SUPABASE_URL at module load, which is a Vite-only
// global TypeScript refuses to even compile under CommonJS ("import.meta"
// is ESM-only) - the same constraint documented in
// scripts/tests/learning/test-complete-new-word-study-contract.mjs and
// scripts/tests/architecture/test-supabase-error-handling.mjs. Every file
// touched by this task (supabaseAuth.ts itself, and everything that
// transitively imports it - Header.tsx, App.tsx, PasswordRecoveryDialog.tsx,
// useSupabaseAuthRedirect.ts) inherits that constraint, so this guard is
// deliberately a precise source-text check rather than a behavioral one.
//
// Run: node scripts/tests/architecture/test-password-recovery-completion.mjs
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

// Normalizes CRLF to LF: this repo's working tree checks some source files
// out with CRLF line endings, which silently breaks a `\n\n`-style
// (blank-line) regex anchor - a CRLF blank line is actually `\r\n\r\n`, with
// a stray \r sitting between the two LFs the pattern expects adjacent.
function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8").replace(/\r\n/g, "\n");
}

console.log("\n=== Password recovery completion guards ===\n");

const supabaseAuth = read("src/lib/supabaseAuth.ts");
const header = read("src/app/components/layout/Header.tsx");
const appTsx = read("src/app/App.tsx");
const recoveryDialog = read("src/app/components/dialogs/PasswordRecoveryDialog.tsx");
const redirectHook = read("src/app/hooks/useSupabaseAuthRedirect.ts");

console.log("--- src/lib/supabaseAuth.ts: redirect classification ---\n");

test("1. handleSupabaseAuthRedirect's result type carries a `recovery: boolean` flag", () => {
  assert.match(
    supabaseAuth,
    /export interface SupabaseAuthRedirectResult \{[\s\S]*?recovery: boolean;[\s\S]*?\}/,
    "SupabaseAuthRedirectResult must declare recovery: boolean",
  );
  assert.match(
    supabaseAuth,
    /export async function handleSupabaseAuthRedirect\(\): Promise<SupabaseAuthRedirectResult>/,
  );
});

test("2. The hash-token branch (GoTrue's verified recovery redirect shape) derives recovery from type=recovery, not a hardcoded value", () => {
  const branchMatch = supabaseAuth.match(
    /if \(hashAccessToken && hashRefreshToken\) \{([\s\S]*?recovery: isRecovery \};)/,
  );
  assert.ok(branchMatch, "hash-token branch must be found");
  const body = branchMatch[1];
  assert.match(
    body,
    /const isRecovery = hashParams\.get\("type"\) === "recovery";/,
    "must read type=recovery from the hash fragment (GoTrue's verified implicit-flow recovery redirect shape)",
  );
  assert.match(
    body,
    /recovery: isRecovery/,
    "the returned result must carry the derived recovery flag",
  );
});

test("3. Ordinary (non-recovery) redirect branches always report recovery: false - the not-yet-loaded guard, error, no-verifier, PKCE code exchange, and the no-op fallback", () => {
  const literalFalseCount = (supabaseAuth.match(/recovery: false/g) ?? []).length;
  assert.equal(
    literalFalseCount,
    5,
    "expected exactly 5 branches (guard clause, error, no-verifier, PKCE code exchange, fallback) to return recovery: false - got a different count, check every non-hash-token return path",
  );
});

console.log("\n--- src/lib/supabaseAuth.ts: URL cleanup ---\n");

test("4. clearAuthParamsFromUrl strips both auth query params and the entire hash (where GoTrue puts type=recovery/access_token/refresh_token)", () => {
  const fnMatch = supabaseAuth.match(/function clearAuthParamsFromUrl\(\) \{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "clearAuthParamsFromUrl must exist");
  const body = fnMatch[1];
  assert.match(body, /url\.searchParams\.delete\("code"\)/);
  assert.match(body, /url\.searchParams\.delete\("error"\)/);
  assert.match(body, /url\.searchParams\.delete\("type"\)/, "must also strip a query-string type param defensively");
  assert.match(body, /url\.hash = ""/, "must clear the entire hash fragment, not just known keys");
});

test("5. The recovery (hash-token) branch calls clearAuthParamsFromUrl() before returning, same as every other consumed-redirect branch", () => {
  const branchMatch = supabaseAuth.match(
    /if \(hashAccessToken && hashRefreshToken\) \{([\s\S]*?recovery: isRecovery \};)/,
  );
  assert.match(branchMatch[1], /clearAuthParamsFromUrl\(\);/);
});

test("6. Invalid/expired recovery links (GoTrue's error_description redirect) are handled safely: cleaned up and returned as a typed error, never thrown", () => {
  // D-5 (a later, separate task) widened this branch's condition to also
  // catch error/error_code without a description - see
  // test-auth-dialog-hardening.mjs for that behavior specifically. This
  // test only re-confirms the property that still matters for D-1/D-2:
  // a recovery-flavored error_description redirect is still cleaned up
  // and returned as a safe, typed, never-thrown error.
  const branchMatch = supabaseAuth.match(
    /if \(errorDescription \|\| oauthError \|\| oauthErrorCode\) \{([\s\S]*?)\n  \}\n\n  if \(authCode\)/,
  );
  assert.ok(branchMatch, "error-description branch must be found");
  const body = branchMatch[1];
  assert.match(body, /clearAuthParamsFromUrl\(\);/);
  assert.match(body, /error: errorDescription\s*\?\s*decodeURIComponent\(errorDescription\)/);
  assert.match(body, /recovery: false,/);
});

console.log("\n--- src/lib/supabaseAuth.ts: PKCE/OAuth path is unchanged ---\n");

test("7. signInWithGoogleOAuth still drives the PKCE authorize request unchanged (code_challenge/s256, stored verifier)", () => {
  const fnMatch = supabaseAuth.match(/export async function signInWithGoogleOAuth\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "signInWithGoogleOAuth must exist");
  assert.match(fnMatch[0], /authorizeUrl\.searchParams\.set\("code_challenge_method", "s256"\)/);
  assert.match(fnMatch[0], /window\.localStorage\.setItem\(STORAGE_KEYS\.pkceVerifier, verifier\)/);
});

test("8. exchangeCodeForSession still exchanges via grant_type=pkce with the stored verifier and clears it after use", () => {
  const fnMatch = supabaseAuth.match(/async function exchangeCodeForSession\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "exchangeCodeForSession must exist");
  assert.match(fnMatch[0], /\/auth\/v1\/token\?grant_type=pkce/);
  assert.match(fnMatch[0], /auth_code: code/);
  assert.match(fnMatch[0], /code_verifier: verifier/);
  assert.match(fnMatch[0], /window\.localStorage\.removeItem\(STORAGE_KEYS\.pkceVerifier\)/);
});

test("9. The code branch still gates on a stored PKCE verifier before exchanging, and still reports recovery: false either way", () => {
  const branchMatch = supabaseAuth.match(
    /if \(authCode\) \{([\s\S]*?changed: true, session, error: null, recovery: false \};)/,
  );
  assert.ok(branchMatch, "authCode branch must be found");
  assert.match(branchMatch[1], /if \(!getStoredPkceVerifier\(\)\) \{/);
  assert.match(branchMatch[1], /recovery: false[\s\S]*recovery: false/, "both the no-verifier and exchanged-session returns must report recovery: false");
});

console.log("\n--- src/lib/supabaseAuth.ts: password-update helper ---\n");

test("10. updateSupabaseAuthUserPassword uses the verified GoTrue 'update user' contract: PUT /auth/v1/user, Bearer access token, { password } body", () => {
  const fnMatch = supabaseAuth.match(
    /export async function updateSupabaseAuthUserPassword\(([\s\S]*?)\n\}/,
  );
  assert.ok(fnMatch, "updateSupabaseAuthUserPassword must exist");
  const body = fnMatch[1];
  assert.match(body, /"\/auth\/v1\/user"/);
  assert.match(body, /method: "PUT"/);
  assert.match(body, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(body, /JSON\.stringify\(\{\s*password,?\s*\}\)/);
});

test("11. updateSupabaseAuthUserPassword takes a session, never a caller-supplied user ID, and never routes by user id", () => {
  const signatureMatch = supabaseAuth.match(
    /export async function updateSupabaseAuthUserPassword\(([^)]*)\)/,
  );
  assert.ok(signatureMatch, "updateSupabaseAuthUserPassword signature must be found");
  assert.doesNotMatch(
    signatureMatch[1],
    /user_?id/i,
    "must not accept a userId/user_id parameter",
  );
  assert.equal(
    signatureMatch[1].trim().replace(/\s+/g, " "),
    "session: StoredSupabaseSession, password: string,",
    "signature must be exactly (session, password) - no extra identity parameter",
  );
  const fnMatch = supabaseAuth.match(
    /export async function updateSupabaseAuthUserPassword\(([\s\S]*?)\n\}/,
  );
  assert.doesNotMatch(
    fnMatch[1],
    /\/auth\/v1\/user\/\$/,
    "the request path must stay the literal current-user endpoint, never templated with an id",
  );
});

test("12. The password-update helper reuses the existing hand-written supabaseRequest client - no @supabase/supabase-js import anywhere in the file", () => {
  assert.doesNotMatch(supabaseAuth, /@supabase\/supabase-js/);
  const fnMatch = supabaseAuth.match(
    /export async function updateSupabaseAuthUserPassword\(([\s\S]*?)\n\}/,
  );
  assert.match(fnMatch[1], /return supabaseRequest<SupabaseAuthUser>\(/);
});

console.log("\n--- Single recovery-state owner (no duplicate redirect handling) ---\n");

test("13. Header.tsx no longer imports or calls handleSupabaseAuthRedirect - AppContent is the sole caller", () => {
  assert.doesNotMatch(header, /handleSupabaseAuthRedirect/, "Header.tsx must not reference handleSupabaseAuthRedirect at all");
});

test("14. AppContent calls useSupabaseAuthRedirect unconditionally (every route, not just practice/exam)", () => {
  assert.match(appTsx, /const \{[\s\S]*?\} = useSupabaseAuthRedirect\(\{[\s\S]*?onSessionEstablished:[\s\S]*?handleAuthSessionChange\(session\);[\s\S]*?\}\);/);
  assert.doesNotMatch(
    appTsx,
    /resolvedPage !== "practice" && resolvedPage !== "exam"/,
    "the old route-scoped redirect effect must be gone - practice/exam pages need recovery handling too, since Header isn't mounted there",
  );
});

test("15. The recovery dialog is rendered on every route AppContent can return, including headerless ones (practice/exam) - same fan-out as accountOnboardingDialog", () => {
  const onboardingUsages = (appTsx.match(/\{accountOnboardingDialog\}/g) ?? []).length;
  const recoveryUsages = (appTsx.match(/\{passwordRecoveryDialog\}/g) ?? []).length;
  assert.ok(onboardingUsages >= 20, "sanity check: accountOnboardingDialog's own fan-out must still be wide");
  assert.equal(
    recoveryUsages,
    onboardingUsages,
    "passwordRecoveryDialog must be appended everywhere accountOnboardingDialog is, so headerless routes (practice/exam) render it too",
  );
});

test("16. Recovery-active state is in-memory React state only (useState), not persisted - so a page refresh can never reopen it independent of the (already-cleared) URL", () => {
  assert.match(redirectHook, /const \[isPasswordRecoveryActive, setIsPasswordRecoveryActive\] = useState\(false\);/);
  assert.doesNotMatch(redirectHook, /localStorage/, "recovery-active must not be written to localStorage/sessionStorage");
  assert.doesNotMatch(recoveryDialog, /localStorage/);
});

test("16b. AccountOnboardingDialog and PasswordRecoveryDialog can never both be interactively open: onboarding's `open` prop is gated by !isPasswordRecoveryActive, recovery stays the higher-priority modal", () => {
  const onboardingBlockMatch = appTsx.match(
    /const accountOnboardingDialog = authUserId \? \(([\s\S]*?)\n  \) : null;/,
  );
  assert.ok(onboardingBlockMatch, "accountOnboardingDialog definition must be found");
  assert.match(
    onboardingBlockMatch[1],
    /open=\{isAccountOnboardingOpen && !isPasswordRecoveryActive\}/,
    "AccountOnboardingDialog's open prop must be gated off isPasswordRecoveryActive",
  );
  // PasswordRecoveryDialog's own `open` prop must stay driven purely by
  // isPasswordRecoveryActive - recovery must never be gated by onboarding
  // state (recovery is the higher-priority state, not a peer).
  const recoveryOpenMatch = appTsx.match(/<PasswordRecoveryDialog\s+open=\{([^}]*)\}/);
  assert.ok(recoveryOpenMatch, "passwordRecoveryDialog's PasswordRecoveryDialog element must be found");
  assert.equal(
    recoveryOpenMatch[1].trim(),
    "isPasswordRecoveryActive",
    "PasswordRecoveryDialog's open prop must be exactly isPasswordRecoveryActive - not further conditioned on onboarding state",
  );
});

test("16c. The gate only affects rendering/visibility, never the underlying isAccountOnboardingOpen state or the profile load feeding it: App.tsx never calls setIsAccountOnboardingOpen(...) itself (only passes it through as onOpenChange), and useUserProfileLoad's own open-decision logic stays unaware of recovery", () => {
  assert.doesNotMatch(
    appTsx,
    /setIsAccountOnboardingOpen\(/,
    "App.tsx must never itself invoke setIsAccountOnboardingOpen - it may only pass the setter through (onOpenChange={setIsAccountOnboardingOpen}), so recovery can't clear/lose the flag",
  );
  const useUserProfileLoad = read("src/app/hooks/useUserProfileLoad.ts");
  assert.doesNotMatch(
    useUserProfileLoad,
    /isPasswordRecoveryActive|PasswordRecovery/,
    "useUserProfileLoad must stay unaware of recovery mode - profile loading and onboarding-completeness rules are untouched, only the rendered dialog is gated",
  );
  assert.match(
    useUserProfileLoad,
    /setIsAccountOnboardingOpen\(\s*shouldOpenAccountOnboarding\(/,
    "onboarding-completeness rules (shouldOpenAccountOnboarding) must still be the sole decider of isAccountOnboardingOpen - unchanged by this fix",
  );
});

console.log("\n--- Dialog: validation, submission, and lifecycle ---\n");

test("17. Mismatched confirmation is rejected before the network call: the equality check appears before updateSupabaseAuthUserPassword in submit order", () => {
  const handlerMatch = recoveryDialog.match(/const handleSubmit = async \([\s\S]*?\n  \};/);
  assert.ok(handlerMatch, "handleSubmit must be found");
  const body = handlerMatch[0];
  const mismatchIdx = body.indexOf("newPassword !== confirmPassword");
  const callIdx = body.indexOf("updateSupabaseAuthUserPassword(session, newPassword)");
  assert.ok(mismatchIdx !== -1, "must check newPassword !== confirmPassword");
  assert.ok(callIdx !== -1, "must call updateSupabaseAuthUserPassword");
  assert.ok(mismatchIdx < callIdx, "the mismatch check must run before the network call");
  assert.match(body, /if \(newPassword !== confirmPassword\) \{\s*setError\([^)]*\);\s*return;\s*\}/);
});

test("18. Non-empty validation and a minimum length consistent with FluentStellar's live password policy both gate submission before the network call — sourced from the shared settingsPassword.ts constant, not a locally re-declared one", () => {
  const handlerMatch = recoveryDialog.match(/const handleSubmit = async \([\s\S]*?\n  \};/);
  const body = handlerMatch[0];
  assert.match(body, /if \(!newPassword \|\| !confirmPassword\) \{/);
  assert.match(
    recoveryDialog,
    /import \{ PASSWORD_MIN_LENGTH \} from "\.\.\/\.\.\/utils\/settingsPassword";/,
  );
  assert.doesNotMatch(recoveryDialog, /const MIN_PASSWORD_LENGTH/, "must not re-declare its own copy of the minimum");
  assert.match(body, /newPassword\.length < PASSWORD_MIN_LENGTH/);
});

test("19. Duplicate submission is guarded: an in-flight submit short-circuits before any validation or network call runs again", () => {
  const handlerMatch = recoveryDialog.match(/const handleSubmit = async \([\s\S]*?\n  \};/);
  const body = handlerMatch[0];
  const preventDefaultIdx = body.indexOf("event.preventDefault();");
  const guardIdx = body.indexOf("if (isSubmitting) {");
  const setErrorNullIdx = body.indexOf("setError(null);");
  assert.ok(preventDefaultIdx !== -1 && guardIdx !== -1 && setErrorNullIdx !== -1);
  assert.ok(preventDefaultIdx < guardIdx, "preventDefault must run first");
  assert.ok(guardIdx < setErrorNullIdx, "the isSubmitting guard must short-circuit before any validation/state reset runs");
  assert.match(body, /if \(isSubmitting\) \{\s*return;\s*\}/);
});

test("20. Success sets a success state and only exits recovery via an explicit user action (Continue), never automatically", () => {
  assert.match(recoveryDialog, /setIsSuccess\(true\);/);
  assert.doesNotMatch(recoveryDialog, /useEffect[\s\S]*?isSuccess[\s\S]*?onSuccess/, "must not auto-call onSuccess from an effect");
  assert.match(recoveryDialog, /onClick=\{onSuccess\}/, "the Continue button must be the only trigger for onSuccess");
});

test("21. Successful password update exits recovery mode and routes into the normal profile flow", () => {
  const onSuccessMatch = appTsx.match(/onSuccess=\{\(\) => \{([\s\S]*?)\}\}/);
  assert.ok(onSuccessMatch, "passwordRecoveryDialog's onSuccess handler must be found");
  assert.match(onSuccessMatch[1], /exitPasswordRecovery\(\);/);
  assert.match(onSuccessMatch[1], /navigate\(ROUTES\.profile\);/);
});

test("22. A failed update keeps recovery mode and the session intact: the catch block only sets an error, never calls onSuccess/exitPasswordRecovery and never clears the session", () => {
  const handlerMatch = recoveryDialog.match(/const handleSubmit = async \([\s\S]*?\n  \};/);
  const body = handlerMatch[0];
  const catchMatch = body.match(/\} catch \(submitError\) \{([\s\S]*?)\} finally/);
  assert.ok(catchMatch, "catch block must be found");
  assert.doesNotMatch(catchMatch[1], /onSuccess/);
  assert.doesNotMatch(catchMatch[1], /setIsSuccess/);
  assert.match(catchMatch[1], /setError\(/);
});

test("23. An expired/invalid recovery session (no access token) fails safely inside the dialog instead of crashing on a null session", () => {
  const handlerMatch = recoveryDialog.match(/const handleSubmit = async \([\s\S]*?\n  \};/);
  assert.match(handlerMatch[0], /if \(!session\?\.access_token\) \{/);
});

test("24. The dialog cannot be dismissed by accident: no close button, and outside-click/Escape are suppressed - the only way out is the Continue button on success", () => {
  assert.match(recoveryDialog, /\[&_\[data-slot=dialog-close\]\]:hidden/);
  assert.match(recoveryDialog, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(recoveryDialog, /onPointerDownOutside=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(recoveryDialog, /onOpenChange=\{\(\) => \{/);
});

console.log("\n--- Accessibility ---\n");

test("25. Both fields are labeled via htmlFor/id, error uses role=\"alert\", success uses a polite live region", () => {
  assert.match(recoveryDialog, /htmlFor="recovery-new-password"[\s\S]*?id="recovery-new-password"/);
  assert.match(recoveryDialog, /htmlFor="recovery-confirm-password"[\s\S]*?id="recovery-confirm-password"/);
  assert.match(recoveryDialog, /role="alert"/);
  assert.match(recoveryDialog, /role="status"\s+aria-live="polite"/);
});

test("26. The form submits on Enter (a real <form onSubmit>, not a bare div/button-only handler)", () => {
  assert.match(recoveryDialog, /<form className="[^"]*" onSubmit=\{handleSubmit\}>/);
  assert.match(recoveryDialog, /<Button\s+type="submit"/);
});

console.log("\n--- Scope: token-refresh concurrency and unrelated auth cleanup are untouched ---\n");

test("27. refreshSupabaseSession / ensureFreshSupabaseSession are untouched by this task (out of scope for D-1)", () => {
  assert.match(
    supabaseAuth,
    /AUTH_SESSION_CHANGED_EVENT this fires flips useAuthSession's/,
    "the pre-existing refresh-concurrency comment block must be untouched",
  );
  assert.match(supabaseAuth, /authUserId to null app-wide, so callers see "signed out" instead of/);
  assert.match(supabaseAuth, /export async function ensureFreshSupabaseSession\(/);
});

test("28. Neither Header.tsx nor App.tsx changed sign-out, Google OAuth submit, or ordinary email login/signup wiring", () => {
  assert.match(header, /await signOutSupabase\(currentSession\);/);
  assert.match(header, /await signInWithGoogleOAuth\(redirectTo\);/);
  assert.match(header, /const session = await signInWithPassword\(authEmail\.trim\(\), authPassword\);/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("password-recovery-completion guard passed");
}
