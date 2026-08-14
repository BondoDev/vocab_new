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
// Deliberately static/deterministic (Node stdlib only, no build, no
// network) so it stays cheap to run in CI and can't rot into a flaky check,
// matching every other architecture/data-flow guard in this repo (see
// test-daily-stats-shared-ownership.mjs, which this guard is a direct
// sibling of).
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
  /useEffect\(\(\) => \{([\s\S]*?)\}, \[authUserId, isProfileLoaded, timezone, dateRetryToken\]\);/,
);

console.log("\n=== Learning-date in-flight dedup guards ===\n");

test("1. The learning-date effect exists with its documented dependency array unchanged (authUserId, isProfileLoaded, timezone, dateRetryToken)", () => {
  assert.ok(dateEffectMatch, "expected the learning-date effect (ending in the exact dependency array) to exist");
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
