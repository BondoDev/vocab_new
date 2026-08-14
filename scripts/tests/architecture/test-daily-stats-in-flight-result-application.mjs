// Regression guard for the shared-daily-stats "stuck on loading forever"
// bug: useProfileSharedDailyStats.ts's useLazyKeyedRows fetch effect used to
// gate result application (and the no-session early-idle) on a per-effect-
// invocation `cancelled` closure set true by a `return () => { cancelled =
// true; }` cleanup. Because this effect's dependency array includes
// requestVersion/retryToken/invalidationVersion — each bumped by a separate
// state update from request()/retry()/an invalidation signal, not
// necessarily in the same commit as contextKey resolving — the effect can
// legitimately re-run for the *same* contextKey while a fetch it already
// started is still in flight (see inFlightKeyRef's own comment in the
// source for the concrete race: contextKey resolving from null and
// request()'s requestVersion bump can each independently re-run this
// effect for the same freshly-armed key). React calls the *previous*
// invocation's cleanup on every such re-run, not only on unmount — so that
// re-run's cleanup marked the one real in-flight fetch's own `cancelled`
// closure true before it ever resolved. Because inFlightKeyRef already
// stops the second effect run from starting a *replacement* fetch (a
// correct, still-desired guard — see test-daily-stats-shared-ownership.mjs
// guard 4), the discarded result was never replaced: dailyStatsStatus /
// vocabularyGrowthStatus stayed "loading" forever, even though the network
// request itself succeeded. This was confirmed live: both
// user_daily_stats and read_vocabulary_growth_events resolved 200 with a
// valid body, but the Dashboard/Learning UI stayed on skeletons
// permanently.
//
// The fix mirrors useProfileSharedProgressData.ts's learning-date effect:
// no `cancelled` closure/cleanup at all — every point that applies a
// fetch's result instead re-checks, fresh, whether inFlightKeyRef.current
// still equals the contextKey this attempt owns. A same-key re-run of the
// effect returns early (without touching inFlightKeyRef) before ever
// reaching the fetch branch, so the ref keeps identifying "am I still the
// attempt that owns this context" correctly across any number of harmless
// intermediate re-runs, and is only ever pointed elsewhere by a genuine
// context change or a new attempt (retry/invalidation) that has actually
// taken over.
//
// This guard checks the *specific* mechanism, not just that the bug's
// symptom is absent — it fails if a `cancelled`-style closure/cleanup
// pattern is reintroduced into this effect, not only if the resulting
// hang can be observed some other way (which a static guard can't observe
// at all; see the fetch-audit report for this fix for the live Playwright
// verification that actually exercised the race).
//
// Deliberately static/deterministic (Node stdlib only, no build, no
// network), matching every other architecture/data-flow guard in this repo
// — see test-daily-stats-shared-ownership.mjs, which this guard is a
// direct sibling of and does not duplicate (that guard covers shared
// ownership/laziness/cache-key/invalidation-wiring; this one covers only
// the in-flight-result-application lifecycle bug).
//
// Run: node --experimental-strip-types scripts/tests/architecture/test-daily-stats-in-flight-result-application.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const SECTIONS_DIR = path.join(SRC_DIR, "features", "user-profile", "sections");

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

// Same CRLF-safe line-comment strip as test-daily-stats-shared-ownership.mjs
// — this file's own header prose mentions `cancelled` by name (explaining
// what must NOT be present), which would otherwise false-fail guard 1
// below if comments weren't excluded first.
function stripLineComments(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const sharedHookPath = path.join(SECTIONS_DIR, "useProfileSharedDailyStats.ts");
const sharedHookRaw = fs.readFileSync(sharedHookPath, "utf8");
const sharedHookLive = stripLineComments(sharedHookRaw);

// Isolate the useLazyKeyedRows function body specifically — the guards
// below must not accidentally pass by matching something in
// useProfileSharedDailyStats (the public wrapper) instead.
const factoryMatch = sharedHookLive.match(
  /function useLazyKeyedRows<TRow>\(\{[\s\S]*?\n\}\n\nexport function useProfileSharedDailyStats/,
);
assert.ok(factoryMatch, "expected to locate the useLazyKeyedRows function body");
const factoryBody = factoryMatch[0];

console.log("\n=== No cancelled-closure/cleanup pattern in the fetch effect ===\n");

test("1. useLazyKeyedRows never declares a `cancelled` closure variable", () => {
  assert.doesNotMatch(
    factoryBody,
    /\bcancelled\b/,
    "a `cancelled`-style closure variable must not exist — this is the exact mechanism that caused fetch results to be silently discarded (see this file's header)",
  );
});

test("2. The fetch effect's main useEffect callback does not return a cleanup function", () => {
  // The invalidation-subscription effect (a separate, earlier useEffect in
  // this same hook) legitimately returns a cleanup — `return
  // subscribeInvalidation(...)`. Only the main fetch effect (the one
  // depending on requestVersion/retryToken/invalidationVersion) must have
  // no `return () => { ... }` cleanup at all.
  const mainEffectMatch = factoryBody.match(
    /useEffect\(\(\) => \{\s*if \(!contextKey\) \{[\s\S]*?\n {2}\}, \[contextKey, targetLanguage, requestVersion, retryToken, invalidationVersion, fetchRows, label\]\);/,
  );
  assert.ok(mainEffectMatch, "expected to locate the main fetch effect by its exact dependency array");
  assert.doesNotMatch(
    mainEffectMatch[0],
    /return \(\) => \{/,
    "the main fetch effect must not return a cleanup function — result application must instead be gated on a fresh inFlightKeyRef check at resolution time",
  );
});

console.log("\n=== Result application is gated on inFlightKeyRef, checked fresh at resolution time ===\n");

test("3. inFlightKeyRef is armed (set to contextKey) synchronously before the async fetch IIFE starts", () => {
  const armIndex = factoryBody.indexOf("inFlightKeyRef.current = contextKey;");
  const iifeIndex = factoryBody.indexOf("void (async () => {");
  assert.ok(armIndex >= 0, "expected inFlightKeyRef.current = contextKey to be set in the fetch branch");
  assert.ok(iifeIndex > armIndex, "inFlightKeyRef must be armed before the async fetch IIFE starts, not inside it");
});

test("4. A successful fetch applies its result only if inFlightKeyRef.current still equals contextKey, checked after the await resolves", () => {
  const awaitIndex = factoryBody.indexOf("const rows = await fetchRows(session, targetLanguage);");
  assert.ok(awaitIndex >= 0, "expected the fetchRows await call");
  const afterAwait = factoryBody.slice(awaitIndex, awaitIndex + 400);
  assert.match(
    afterAwait,
    /if \(inFlightKeyRef\.current !== contextKey\) return;/,
    "the success branch must re-check inFlightKeyRef.current === contextKey immediately after the await, not a cancelled closure",
  );
  const guardIndex = afterAwait.indexOf("if (inFlightKeyRef.current !== contextKey) return;");
  const setStateIndex = afterAwait.indexOf('setState({ key: contextKey, status: "ready", rows });');
  assert.ok(setStateIndex > guardIndex, "the ready setState must come after the inFlightKeyRef guard, not before it");
});

test("5. The catch branch also re-checks inFlightKeyRef.current === contextKey before applying an error state", () => {
  const catchIndex = factoryBody.indexOf("} catch (error) {");
  assert.ok(catchIndex >= 0, "expected a catch branch");
  const catchBody = factoryBody.slice(catchIndex, catchIndex + 700);
  assert.match(
    catchBody,
    /if \(inFlightKeyRef\.current !== contextKey\) return;/,
    "the catch branch must re-check inFlightKeyRef.current === contextKey, not a cancelled closure",
  );
});

test("6. The no-session branch applies its idle reset only if inFlightKeyRef.current still equals contextKey", () => {
  const noSessionIndex = factoryBody.indexOf("if (!session) {");
  assert.ok(noSessionIndex >= 0, "expected the no-session branch");
  const noSessionBody = factoryBody.slice(noSessionIndex, noSessionIndex + 300);
  assert.match(
    noSessionBody,
    /if \(inFlightKeyRef\.current === contextKey\) \{/,
    "the no-session branch must re-check inFlightKeyRef.current === contextKey, not a cancelled closure",
  );
});

test("7. inFlightKeyRef is only cleared in a finally block, guarded by an equality check against its own attempt's contextKey", () => {
  const finallyMatch = factoryBody.match(/\} finally \{([\s\S]*?)\n {6}\}/);
  assert.ok(finallyMatch, "expected a finally block clearing inFlightKeyRef");
  assert.match(
    finallyMatch[1],
    /if \(inFlightKeyRef\.current === contextKey\) \{\s*inFlightKeyRef\.current = null;/,
    "finally must only clear inFlightKeyRef if it still points at this attempt's own contextKey — a newer attempt for the same key may have already taken over",
  );
});

console.log("\n=== The pre-existing in-flight dedup guard (a correct, still-desired behavior) is untouched ===\n");

test("8. A same-key re-run while a fetch is already in flight still returns early without starting a second fetch", () => {
  const dedupGuardMatches = factoryBody.match(/if \(inFlightKeyRef\.current === contextKey\) \{\s*\n\s*return;\s*\n\s*\}/g) || [];
  assert.ok(
    dedupGuardMatches.length >= 1,
    "the in-flight dedup guard (inFlightKeyRef.current === contextKey => return) must still exist ahead of the fetch branch",
  );
  const dedupGuardIndex = factoryBody.indexOf("if (inFlightKeyRef.current === contextKey) {");
  const armIndex = factoryBody.indexOf("inFlightKeyRef.current = contextKey;");
  assert.ok(dedupGuardIndex >= 0 && dedupGuardIndex < armIndex, "the dedup guard must appear before the fetch branch arms inFlightKeyRef");
});

test("9. No console.debug diagnostic instrumentation was left behind in this file", () => {
  assert.doesNotMatch(sharedHookRaw, /console\.debug/, "temporary live-verification logging must be removed before commit");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("daily-stats-in-flight-result-application guard passed");
}
