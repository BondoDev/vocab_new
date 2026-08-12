// Contract guard for post-account-deletion local cleanup.
//
// Live bug this fixes: after a successful delete-account Edge Function
// call, App.tsx's handleAccountDeleted called the SAME signOutSupabase()
// path ordinary Sign Out uses, which POSTs to /auth/v1/logout with the
// caller's (now-orphaned) access token. Because the account no longer
// exists server-side at that point, GoTrue rejects that request with 403
// "User from sub claim in JWT does not exist" — a real, expected rejection
// for a genuinely deleted user, not a transient failure to retry past.
//
// Fix: a new clearLocalSupabaseSession() export (src/lib/supabaseAuth.ts)
// does only the local half of sign-out (storage clear + the same
// app-wide session-changed notification) with no network call at all;
// handleAccountDeleted (src/app/App.tsx) now calls that instead of
// signOutSupabase(). Ordinary user-triggered sign-out
// (handleProfileSignOut) is untouched and still calls signOutSupabase().
//
// Source-text guard, matching every other architecture/contract test in
// this repository — there is no component-rendering test runner (RTL/
// vitest) in this project.
//
// Run: node scripts/tests/account/test-post-account-deletion-cleanup.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
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

const supabaseAuthSource = read("src/lib/supabaseAuth.ts");
const appSource = read("src/app/App.tsx");
const settingsSectionSource = read("src/features/user-profile/sections/settings/SettingsSection.tsx");

console.log("\n=== supabaseAuth.ts: clearLocalSupabaseSession is a real, separate, local-only export ===\n");

test("1. clearLocalSupabaseSession is exported", () => {
  assert.match(supabaseAuthSource, /export function clearLocalSupabaseSession\(\): void \{/);
});

test("2. clearLocalSupabaseSession never calls /auth/v1/logout or supabaseRequest — no network call of any kind", () => {
  const fnMatch = supabaseAuthSource.match(/export function clearLocalSupabaseSession\(\): void \{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "expected to find clearLocalSupabaseSession's body");
  const body = fnMatch[1];
  assert.doesNotMatch(body, /auth\/v1\/logout/);
  assert.doesNotMatch(body, /supabaseRequest/);
  assert.doesNotMatch(body, /fetch\(/);
});

test("3. clearLocalSupabaseSession clears the stored session (storeSession(null)) and the PKCE verifier", () => {
  const fnMatch = supabaseAuthSource.match(/export function clearLocalSupabaseSession\(\): void \{([\s\S]*?)\n\}/);
  const body = fnMatch[1];
  assert.match(body, /storeSession\(null\)/);
  assert.match(body, /localStorage\.removeItem\(STORAGE_KEYS\.pkceVerifier\)/);
});

test("4. signOutSupabase (ordinary sign-out) still performs the real network /auth/v1/logout call, unchanged", () => {
  const fnMatch = supabaseAuthSource.match(/export async function signOutSupabase\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "expected to find signOutSupabase's body");
  assert.match(fnMatch[1], /auth\/v1\/logout/);
  assert.match(fnMatch[1], /session\?\.access_token/);
});

test("5. signOutSupabase's own local cleanup now delegates to clearLocalSupabaseSession — no duplicated storage-clearing logic", () => {
  const fnMatch = supabaseAuthSource.match(/export async function signOutSupabase\(([\s\S]*?)\n\}/);
  const body = fnMatch[1];
  assert.match(body, /clearLocalSupabaseSession\(\)/);
  // The old inline storeSession(null)/pkceVerifier-removal pair must not
  // also still live directly inside signOutSupabase's own body (it now
  // lives only inside clearLocalSupabaseSession, called once from here).
  const finallyBlockMatch = body.match(/finally \{([\s\S]*?)\}\s*$/);
  assert.ok(finallyBlockMatch, "expected a finally block");
  assert.doesNotMatch(finallyBlockMatch[1], /storeSession\(null\)/);
});

console.log("\n=== App.tsx: handleAccountDeleted never calls remote logout ===\n");

function extractFunctionBody(source, functionStartPattern) {
  const startIndex = source.search(functionStartPattern);
  assert.ok(startIndex > -1, `expected to find ${functionStartPattern}`);
  // Slice from the function's own declaration to the next top-level
  // `const handle...` or blank-line-separated declaration — good enough for
  // this file's own consistent formatting (verified against the real
  // function boundaries below).
  const rest = source.slice(startIndex);
  const endMatch = rest.match(/\n  const handle\w+ = /);
  return endMatch ? rest.slice(0, endMatch.index) : rest;
}

test("6. handleAccountDeleted exists and never calls signOutSupabase", () => {
  const body = extractFunctionBody(appSource, /const handleAccountDeleted = \(\) => \{/);
  assert.doesNotMatch(body, /signOutSupabase\(/);
});

test("7. handleAccountDeleted calls clearLocalSupabaseSession", () => {
  const body = extractFunctionBody(appSource, /const handleAccountDeleted = \(\) => \{/);
  assert.match(body, /clearLocalSupabaseSession\(\)/);
});

test("8. handleAccountDeleted flips in-memory auth state to signed-out (handleAuthSessionChange(null))", () => {
  const body = extractFunctionBody(appSource, /const handleAccountDeleted = \(\) => \{/);
  assert.match(body, /handleAuthSessionChange\(null\)/);
});

test("9. handleAccountDeleted clears the deleted account's cached profile (clearStoredUserProfile)", () => {
  const body = extractFunctionBody(appSource, /const handleAccountDeleted = \(\) => \{/);
  assert.match(body, /clearStoredUserProfile\(deletedUserId\)/);
  // Guarded by the id captured before cleanup — never a stale/undefined id.
  assert.match(body, /const deletedUserId = authUserId;/);
});

test("10. handleAccountDeleted navigates away to the same public route ordinary sign-out uses", () => {
  const body = extractFunctionBody(appSource, /const handleAccountDeleted = \(\) => \{/);
  assert.match(body, /navigate\(ROUTES\.exerciseSelection\)/);
});

test("11. A local-cleanup failure is caught, logged distinctly from a deletion failure, and never triggers a retry of deletion or of remote logout", () => {
  const body = extractFunctionBody(appSource, /const handleAccountDeleted = \(\) => \{/);
  assert.match(body, /catch \(error\) \{/);
  assert.match(body, /post-account-deletion local cleanup encountered an issue/);
  // Must not reuse the ordinary sign-out failure message (that would
  // conflate "deletion failed" with "cleanup after a successful deletion
  // hit a snag") and must not re-attempt signOutSupabase/deleteAccount from
  // inside the catch branch.
  assert.doesNotMatch(body, /signOutSupabase failed after account deletion/);
  const catchBlockMatch = body.match(/catch \(error\) \{([\s\S]*?)\}\s*finally/);
  assert.ok(catchBlockMatch, "expected a catch block before the finally block");
  assert.doesNotMatch(catchBlockMatch[1], /signOutSupabase\(|deleteAccount\(/);
});

test("12. Cleanup (clearStoredUserProfile + navigate) still runs even if clearLocalSupabaseSession throws (both live in the finally block)", () => {
  const body = extractFunctionBody(appSource, /const handleAccountDeleted = \(\) => \{/);
  const finallyMatch = body.match(/finally \{([\s\S]*?)\n  \};/);
  assert.ok(finallyMatch, "expected a finally block");
  assert.match(finallyMatch[1], /clearStoredUserProfile\(deletedUserId\)/);
  assert.match(finallyMatch[1], /navigate\(ROUTES\.exerciseSelection\)/);
});

console.log("\n=== Ordinary Sign Out is unchanged (regression guard) ===\n");

test("13. handleProfileSignOut (ordinary Sign Out) still calls signOutSupabase — untouched by this fix", () => {
  const body = extractFunctionBody(appSource, /const handleProfileSignOut = async \(\) => \{/);
  assert.match(body, /await signOutSupabase\(currentSession\)/);
  assert.doesNotMatch(body, /clearLocalSupabaseSession/);
});

test("14. handleProfileSignOut still navigates to the same public route as before", () => {
  const body = extractFunctionBody(appSource, /const handleProfileSignOut = async \(\) => \{/);
  assert.match(body, /navigate\(ROUTES\.exerciseSelection\)/);
});

console.log("\n=== SettingsSection.tsx: cleanup runs only after confirmed deletion success ===\n");

// handleConfirmDelete was refactored (Settings reauthentication phase,
// 2026-08-13) from a .then()/.catch() promise chain into an async/await
// try/catch/finally IIFE, to sequence an awaited reauthentication step
// before the delete call — see test-account-reauthentication.mjs for that
// phase's own full coverage. The behavioral guarantee these two tests
// verify (onAccountDeleted only ever fires on confirmed success; a failed
// attempt never closes the dialog) is unchanged; only the syntax shape is.
function handleConfirmDeleteTryCatchBody() {
  const match = settingsSectionSource.match(/const handleConfirmDelete = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(match, "expected a handleConfirmDelete function");
  const tryCatchMatch = match[0].match(/try \{([\s\S]*?)\} catch \(error\) \{([\s\S]*?)\} finally \{/);
  assert.ok(tryCatchMatch, "expected a try/catch/finally inside handleConfirmDelete");
  return { tryBody: tryCatchMatch[1], catchBody: tryCatchMatch[2] };
}

test("15. onAccountDeleted is invoked only from the try block after a successful deleteAccount() call, never from the catch block", () => {
  const { tryBody, catchBody } = handleConfirmDeleteTryCatchBody();
  const deleteCallIndex = tryBody.indexOf("await deleteAccount(sessionForDeletion)");
  const onAccountDeletedIndex = tryBody.indexOf("onAccountDeleted?.()");
  assert.ok(deleteCallIndex > -1 && onAccountDeletedIndex > -1, "expected both calls in the try block");
  assert.ok(deleteCallIndex < onAccountDeletedIndex, "onAccountDeleted must run only after deleteAccount resolves");
  assert.doesNotMatch(catchBody, /onAccountDeleted/);
});

test("16. A failed deleteAccount() (or reauthentication) call leaves isDeleteDialogOpen alone (still true) — the dialog stays open with the error visible, session/account state untouched", () => {
  const { catchBody } = handleConfirmDeleteTryCatchBody();
  assert.doesNotMatch(catchBody, /setIsDeleteDialogOpen\(false\)/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("post-account-deletion-cleanup guard failed");
  process.exit(1);
}

console.log("post-account-deletion-cleanup guard passed");
