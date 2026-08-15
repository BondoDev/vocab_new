// Architecture guard for Fetch-audit Phase 2A of the profile-section
// data-fetch optimization: useProfileSharedProgressData.ts's learning-date
// effect must issue exactly one get_current_learning_date RPC per fresh
// (authUserId) context, even though the effect has no lazy "already
// requested" gate at all (unlike useProfileSharedDailyStats.ts's
// request()-gated design — see test-daily-stats-shared-ownership.mjs) and
// fires its fetch unconditionally every time it runs.
//
// Real live-network verification (a real authenticated session, driven
// with Playwright against `npm run dev`) found that on a fresh
// authenticated load this effect legitimately re-runs multiple times for
// the *same* authUserId before settling — useUserProfileLoad's own effect
// briefly reports isProfileLoaded as true (its "signed-out visitor,
// trivially known" branch, from the render where authUserId is still null)
// one render before authUserId resolves, then flips isProfileLoaded back to
// false once it starts genuinely loading that user's profile, then true
// again once the load finishes — reaching the fetch branch twice and firing
// two real get_current_learning_date requests for the identical context.
//
// This guard also proves the fix does not merely suppress the duplicate
// *request* while accidentally leaving the date stuck in "loading" forever:
// an earlier attempt at this fix gated result-application on the
// standard per-effect-invocation `cancelled` closure, which React's own
// cleanup-on-every-rerun behavior marks true for the in-flight attempt the
// moment the intermediate isProfileLoaded-false render happens — discarding
// a perfectly valid, about-to-succeed response. The shipped fix instead
// gates result-application on inFlightDateKeyRef matching the attempt's own
// requestKey, which only a genuine authUserId change invalidates.
//
// ROUND 2 (root-cause investigation, 2026-08-15): live network capture
// proved the Phase 2A fix above closes only the *concurrent* duplicate —
// two effect runs racing while one is genuinely still in flight. A second,
// *sequential* duplicate survived: nothing checked whether a same-context
// re-run (isProfileLoaded/authUserId re-settling to values a fetch had
// already successfully resolved for) had anything new to fetch at all, so
// every such re-run fired its own complete, fully redundant request —
// reproduced live in 9 of 12, then 7 of 12 (after a first, incomplete fix
// attempt that removed `timezone` as a dependency but didn't add this
// gate), fresh cold starts. The shipped fix adds an "already settled" gate,
// checked via loadedDateKeyRef/loadedDateRetryTokenRef/
// loadedDateInvalidationVersionRef (refs, always synchronously current) —
// deliberately never dateState.status, which live capture also proved can
// still read "loading" for a render or two after the refs a same-tick
// re-run needs are already correct. `timezone` was removed as a raw effect
// dependency entirely (a cold-load hydration transition of that prop —
// from an empty placeholder to its real persisted value — was never a
// legitimate reason to refetch, since get_current_learning_date takes no
// client-supplied timezone parameter at all); a real, successful
// update_user_timezone save now fires the explicit
// notifyLearningDateChanged() signal instead, verified live to still
// produce exactly one fresh request per successful save. 24/24 fresh cold
// starts were clean after this fix (0 duplicates), reproducing 100% of the
// time before it across two independent 12-run sweeps.
//
// Deliberately static/deterministic (Node stdlib only, no build, no
// network) so it stays cheap to run in CI and can't rot into a flaky check,
// matching every other architecture/data-flow guard in this repo (see
// test-daily-stats-shared-ownership.mjs, which this guard is a direct
// sibling of). The live reproduction/verification itself (Playwright
// against a real authenticated session) is not repeated here — see the
// investigation's own report for the full request timelines.
//
// Run: node scripts/tests/architecture/test-learning-date-in-flight-dedup.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

const hookPath = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "useProfileSharedProgressData.ts");
const hookSource = fs.readFileSync(hookPath, "utf8");

// Isolates just the learning-date effect's body (the first useEffect in the
// file, ending at its own dependency array) — the file declares more than
// one effect, and the later word-progress effect deliberately keeps its own
// unrelated `cancelled`-closure pattern (out of scope for this phase).
const dateEffectMatch = hookSource.match(
  /useEffect\(\(\) => \{([\s\S]*?)\}, \[authUserId, isProfileLoaded, dateRetryToken, dateInvalidationVersion\]\);/,
);

console.log("\n=== Learning-date in-flight dedup guards ===\n");

test("1. The learning-date effect exists with its current dependency array (authUserId, isProfileLoaded, dateRetryToken, dateInvalidationVersion) — timezone is deliberately NOT a dependency (round 2 fix)", () => {
  assert.ok(dateEffectMatch, "expected the learning-date effect (ending in the exact dependency array) to exist");
  assert.doesNotMatch(hookSource, /}, \[authUserId, isProfileLoaded, timezone, dateRetryToken\]\);/, "the old timezone-watching dependency array must be gone");
});

test("1b. timezone is no longer a parameter of useProfileSharedProgressData at all — the hook's params interface has exactly authUserId/isProfileLoaded/targetLanguage", () => {
  const paramsMatch = hookSource.match(/export interface UseProfileSharedProgressDataParams \{([\s\S]*?)\}/);
  assert.ok(paramsMatch, "expected UseProfileSharedProgressDataParams to exist");
  assert.doesNotMatch(paramsMatch[1], /timezone/, "timezone must not remain a param of this hook");
  assert.match(paramsMatch[1], /authUserId: string \| null;/);
  assert.match(paramsMatch[1], /isProfileLoaded: boolean;/);
  assert.match(paramsMatch[1], /targetLanguage: string;/);
});

test("1c. UserProfileDashboardPage no longer passes timezone into useProfileSharedProgressData", () => {
  const dashboardPagePath = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "UserProfileDashboardPage.tsx");
  const dashboardSource = fs.readFileSync(dashboardPagePath, "utf8");
  const callMatch = dashboardSource.match(/= useProfileSharedProgressData\(\{([\s\S]*?)\}\);/);
  assert.ok(callMatch, "expected the useProfileSharedProgressData(...) call site");
  assert.doesNotMatch(callMatch[1], /timezone/, "the call site must not pass a timezone prop anymore");
});

const effectBody = dateEffectMatch ? dateEffectMatch[1] : "";

test("2. An inFlightDateKeyRef exists, distinct from loadedDateKeyRef", () => {
  assert.match(hookSource, /const inFlightDateKeyRef = useRef<string \| null>\(null\);/);
  assert.match(hookSource, /const loadedDateKeyRef = useRef<string \| null>\(null\);/);
});

test("3. A request is skipped (no fetch) when inFlightDateKeyRef already names the current requestKey", () => {
  const guardMatch = effectBody.match(/if \(inFlightDateKeyRef\.current === requestKey\) \{([\s\S]*?)\}/);
  assert.ok(guardMatch, "expected an early-return guard comparing inFlightDateKeyRef.current to requestKey");
  assert.match(guardMatch[1], /return;/, "the in-flight guard must return before starting a new fetch");
  // The guard must appear before the fetch is armed/started.
  const guardIndex = effectBody.indexOf(guardMatch[0]);
  const armIndex = effectBody.indexOf("inFlightDateKeyRef.current = requestKey;");
  assert.ok(guardIndex >= 0 && armIndex > guardIndex, "the in-flight guard must run before inFlightDateKeyRef is armed for a new attempt");
});

console.log("\n=== Round 2: the \"already settled\" gate (the actual sequential-duplicate fix) ===\n");

test("3b. loadedDateRetryTokenRef/loadedDateInvalidationVersionRef exist, initialized from the live state values", () => {
  assert.match(hookSource, /const loadedDateRetryTokenRef = useRef\(dateRetryToken\);/);
  assert.match(hookSource, /const loadedDateInvalidationVersionRef = useRef\(dateInvalidationVersion\);/);
});

test("3c. A same-context re-run is skipped entirely (no fetch, no state change) when dateRetryToken and dateInvalidationVersion both still match what the last successful fetch already satisfied", () => {
  const skipMatch = effectBody.match(
    /if \(\s*isSameContext &&\s*dateRetryToken === loadedDateRetryTokenRef\.current &&\s*dateInvalidationVersion === loadedDateInvalidationVersionRef\.current\s*\) \{([\s\S]*?)\}/,
  );
  assert.ok(skipMatch, "expected the already-settled gate comparing isSameContext + both token refs");
  assert.match(skipMatch[1], /return;/, "the already-settled gate must return before touching inFlightDateKeyRef or starting a fetch");
  // Must run before the fetch is armed, and must NOT gate on dateState.status
  // (proven live to lag behind the refs by a render or two — see this
  // file's own header).
  const gateIndex = effectBody.indexOf(skipMatch[0]);
  const armIndex = effectBody.indexOf("inFlightDateKeyRef.current = requestKey;");
  assert.ok(gateIndex >= 0 && armIndex > gateIndex, "the already-settled gate must run before inFlightDateKeyRef is armed");
  assert.doesNotMatch(skipMatch[0], /dateState\.status/, "the already-settled gate must not read dateState.status — only the always-synchronous refs");
});

test("3d. A successful fetch records the retry/invalidation signature it satisfied, in the same place it records loadedDateKeyRef", () => {
  const successBlock = effectBody.match(/const todayISO = await getCurrentLearningDate\(session\);([\s\S]*?)\} catch/);
  assert.ok(successBlock, "expected the success path following the getCurrentLearningDate call");
  assert.match(successBlock[1], /loadedDateKeyRef\.current = requestKey;/);
  assert.match(successBlock[1], /loadedDateRetryTokenRef\.current = dateRetryToken;/);
  assert.match(successBlock[1], /loadedDateInvalidationVersionRef\.current = dateInvalidationVersion;/);
});

test("3e. A background-refresh failure does NOT record a new satisfied signature (so a later retry-token bump is never mistaken for already-settled)", () => {
  const catchBlock = effectBody.match(/\} catch \(error\) \{([\s\S]*?)\}\)\(\);/);
  assert.ok(catchBlock, "expected the catch (error) branch");
  assert.doesNotMatch(catchBlock[1], /loadedDateRetryTokenRef\.current = /);
  assert.doesNotMatch(catchBlock[1], /loadedDateInvalidationVersionRef\.current = /);
});

test("3f. notifyLearningDateChanged/subscribeLearningDateChanged exist as a dedicated channel in sharedProgressInvalidation.ts, mirroring the other narrow signals", () => {
  const invalidationPath = path.join(ROOT_DIR, "src", "lib", "sharedProgressInvalidation.ts");
  const invalidationSource = fs.readFileSync(invalidationPath, "utf8");
  assert.match(invalidationSource, /export function notifyLearningDateChanged\(\): void \{/);
  assert.match(invalidationSource, /export function subscribeLearningDateChanged\(listener: Listener\): \(\) => void \{/);
});

test("3g. The learning-date effect subscribes to subscribeLearningDateChanged and bumps dateInvalidationVersion, mirroring the sibling word-progress effect's own subscribeWordProgressChanged pattern in this same file", () => {
  assert.match(
    hookSource,
    /useEffect\(\(\) => \{\s*\n\s*return subscribeLearningDateChanged\(\(\) => \{\s*\n\s*setDateInvalidationVersion\(\(version\) => version \+ 1\);\s*\n\s*\}\);\s*\n\s*\}, \[\]\);/,
  );
});

test("3h. SettingsSection's handleSaveTimezone fires notifyLearningDateChanged() only from its real success branch (updated + value matches), never from its catch/failure branch", () => {
  const settingsPath = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "settings", "SettingsSection.tsx");
  const settingsSource = fs.readFileSync(settingsPath, "utf8");
  const saveMatch = settingsSource.match(/const handleSaveTimezone = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(saveMatch, "expected handleSaveTimezone to exist");
  const thenMatch = saveMatch[0].match(/\.then\(\(result\) => \{([\s\S]*?)\}\)\s*\n\s*\.catch/);
  assert.ok(thenMatch, "expected handleSaveTimezone's .then success branch");
  assert.match(thenMatch[1], /notifyLearningDateChanged\(\);/);
  const catchMatch = saveMatch[0].match(/\.catch\(\(error\) => \{([\s\S]*?)\}\)\s*\n\s*\.finally/);
  assert.ok(catchMatch, "expected handleSaveTimezone's .catch branch");
  assert.doesNotMatch(catchMatch[1], /notifyLearningDateChanged/, "a failed timezone save must never fire this signal");
});

test("3i. useUserProfileLoad's first-time initializeUserTimezone success also fires notifyLearningDateChanged() (the same real persisted-timezone-change event as an explicit Settings save)", () => {
  const loadHookPath = path.join(ROOT_DIR, "src", "app", "hooks", "useUserProfileLoad.ts");
  const loadHookSource = fs.readFileSync(loadHookPath, "utf8");
  assert.match(loadHookSource, /import \{ notifyLearningDateChanged \} from "\.\.\/\.\.\/lib\/sharedProgressInvalidation";/);
  const initMatch = loadHookSource.match(/void initializeUserTimezone\(session, detectedTimezone\)\s*\n\s*\.then\(\(result\) => \{([\s\S]*?)\}\)\s*\n\s*\.catch/);
  assert.ok(initMatch, "expected initializeUserTimezone's .then success branch");
  assert.match(initMatch[1], /notifyLearningDateChanged\(\);/);
});

console.log("\n=== Phase 2A: the original concurrent-duplicate guards, unchanged ===\n");

test("4. requestKey is authUserId alone, not authUserId+timezone — get_current_learning_date takes no client timezone parameter", () => {
  assert.match(effectBody, /const requestKey = authUserId;/);
  const learningDateSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "learningDate.ts"), "utf8");
  const fnMatch = learningDateSource.match(/export async function getCurrentLearningDate\(([\s\S]*?)\)/);
  assert.ok(fnMatch, "getCurrentLearningDate must exist");
  assert.doesNotMatch(fnMatch[1], /timezone/i, "getCurrentLearningDate must take no timezone parameter — it resolves the server-side value at call time");
});

test('5. A successful fetch\'s result is applied only if inFlightDateKeyRef still names this attempt\'s requestKey — never gated on a `cancelled` closure', () => {
  const successBlock = effectBody.match(/const todayISO = await getCurrentLearningDate\(session\);([\s\S]*?)\} catch/);
  assert.ok(successBlock, "expected the success path following the getCurrentLearningDate call");
  assert.match(
    successBlock[1],
    /if \(inFlightDateKeyRef\.current !== requestKey\) return;/,
    "the success path must bail out based on inFlightDateKeyRef, not a per-invocation cancelled flag",
  );
  assert.match(successBlock[1], /setDateState\(\{ status: "ready", todayISO \}\);/);
  // The classic effect-cleanup `cancelled` closure pattern must not appear
  // anywhere in this specific effect's body — that pattern is exactly what
  // caused the fix's first (reverted-before-shipping) attempt to leave the
  // date stuck in "loading" forever after the intermediate
  // isProfileLoaded-false render (see this file's own header).
  assert.doesNotMatch(effectBody, /let cancelled = false;/, "the learning-date effect must not use a per-invocation `cancelled` closure");
  assert.doesNotMatch(effectBody, /if \(cancelled\) return;/);
});

test("6. The in-flight marker is cleared once a settling attempt is applied (success, error, or no-session) so a later genuine retry/context-change is never permanently blocked", () => {
  const clears = (effectBody.match(/inFlightDateKeyRef\.current = null;/g) || []).length;
  // Expected at three settle points: the no-session branch, the success
  // branch, and the catch (error) branch — plus the two hard-reset branches
  // (!authUserId and, deliberately, NOT !isProfileLoaded — see test 8).
  assert.ok(clears >= 3, `expected inFlightDateKeyRef to be cleared at every settle point, found ${clears} clear site(s)`);
});

test("7. A genuine account change (!authUserId) hard-resets both loadedDateKeyRef and inFlightDateKeyRef", () => {
  const noAuthBranch = effectBody.match(/if \(!authUserId\) \{([\s\S]*?)\}/);
  assert.ok(noAuthBranch, "expected an explicit !authUserId branch");
  assert.match(noAuthBranch[1], /loadedDateKeyRef\.current = null;/);
  assert.match(noAuthBranch[1], /inFlightDateKeyRef\.current = null;/);
  assert.match(noAuthBranch[1], /status: "unavailable"/);
});

test("8. A same-user profile-reload window (!isProfileLoaded) resets loadedDateKeyRef but deliberately leaves inFlightDateKeyRef untouched", () => {
  const noProfileBranch = effectBody.match(/if \(!isProfileLoaded\) \{([\s\S]*?)\n    \}/);
  assert.ok(noProfileBranch, "expected an explicit !isProfileLoaded branch");
  assert.match(noProfileBranch[1], /loadedDateKeyRef\.current = null;/);
  assert.doesNotMatch(
    noProfileBranch[1],
    /inFlightDateKeyRef\.current = null;/,
    "the !isProfileLoaded branch must not clear inFlightDateKeyRef — a request already in flight for the same authUserId, started on an earlier render, remains the one attempt whose result should still be applied once isProfileLoaded settles back to true",
  );
});

test("9. getCurrentLearningDate is still called exactly once (one live call site) in this file — the fix adds guarding logic, not a second reader", () => {
  const stripped = hookSource
    .split("\n")
    .map((line) => line.replace(/\/\/.*/, ""))
    .join("\n");
  const callCount = (stripped.match(/getCurrentLearningDate\(/g) || []).length;
  assert.equal(callCount, 1, `expected exactly one live getCurrentLearningDate( call site, found ${callCount}`);
});

test("10. The word-progress effect (readUserWordProgress) is untouched — still uses its own local cancelled-closure pattern, no inFlightDateKeyRef-style ref introduced there", () => {
  const progressEffectMatch = hookSource.match(
    /useEffect\(\(\) => \{(?:(?!useEffect)[\s\S])*?readUserWordProgress[\s\S]*?\}, \[([^\]]*)\]\);/,
  );
  assert.ok(progressEffectMatch, "the word-progress effect must still exist, calling readUserWordProgress within its own body");
  assert.match(progressEffectMatch[0], /let cancelled = false;/, "the word-progress effect must keep its own unchanged cancelled-closure pattern");
  assert.doesNotMatch(progressEffectMatch[0], /inFlightProgressKeyRef|inFlightDateKeyRef/, "this phase must not extend in-flight deduplication to the word-progress effect — out of scope");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("learning-date-in-flight-dedup guard passed");
}
