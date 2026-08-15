// Regression guard, applied preemptively: useProfileSharedMyLists.ts's fetch
// effect must use the same inFlightKeyRef-checked-fresh-at-resolution-time
// pattern useProfileSharedDailyStats.ts had to be fixed to use (see that
// file's own test-daily-stats-in-flight-result-application.mjs header for
// the full "stuck on loading forever" bug this pattern exists to prevent),
// not a per-effect-invocation `cancelled` closure. This hook's fetch effect
// has the exact same shape that caused that regression — its dependency
// array includes requestVersion/retryToken/invalidationVersion, each bumped
// by a separate state update from requestMyLists()/retryMyLists()/an
// external-mutation invalidation signal, not necessarily in the same commit
// as contextKey resolving — so it can legitimately re-run for the *same*
// contextKey while a fetch it already started (the lists request, or the
// dependent memberships request that follows it) is still in flight. A
// `cancelled`-closure/cleanup pair would mark that in-flight attempt
// cancelled on the intermediate re-run, and — because the in-flight dedup
// guard already stops a second, replacement fetch from starting — the
// discarded result would never be replaced, leaving myListsStatus stuck on
// "loading" forever even though the network requests themselves succeeded.
//
// Deliberately static/deterministic (Node stdlib only, no build, no
// network), matching every other architecture/data-flow guard in this repo.
//
// Run: node scripts/tests/architecture/test-my-lists-in-flight-result-application.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const SECTIONS_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections");

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

function stripLineComments(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const sharedHookPath = path.join(SECTIONS_DIR, "useProfileSharedMyLists.ts");
const sharedHookRaw = fs.readFileSync(sharedHookPath, "utf8");
const sharedHookLive = stripLineComments(sharedHookRaw);

// Isolate the main fetch effect specifically, by its exact dependency
// array, so these guards can't accidentally pass by matching the earlier
// invalidation-subscription effect (which legitimately has its own,
// unrelated cleanup) or one of the mutation-applier useCallbacks instead.
const effectMatch = sharedHookLive.match(
  /useEffect\(\(\) => \{\s*if \(!contextKey\) \{[\s\S]*?\n {2}\}, \[contextKey, targetLanguage, requestVersion, retryToken, invalidationVersion\]\);/,
);
assert.ok(effectMatch, "expected to locate the main fetch effect by its exact dependency array");
const effectBody = effectMatch[0];

console.log("\n=== No cancelled-closure/cleanup pattern in the fetch effect ===\n");

test("1. The main fetch effect never declares a `cancelled` closure variable", () => {
  assert.doesNotMatch(
    effectBody,
    /\bcancelled\b/,
    "a `cancelled`-style closure variable must not exist here — see this file's header for the exact regression it would reintroduce",
  );
});

test("2. The main fetch effect does not return a cleanup function", () => {
  // The separate, earlier invalidation-subscription effect legitimately
  // returns `return subscribeVocabularyListsChanged(...)` — only the main
  // fetch effect (isolated above by its own dependency array) must have no
  // cleanup at all.
  assert.doesNotMatch(
    effectBody,
    /return \(\) => \{/,
    "the main fetch effect must not return a cleanup function — result application must instead be gated on a fresh inFlightKeyRef check at resolution time",
  );
});

console.log("\n=== Result application is gated on inFlightKeyRef, checked fresh at resolution time ===\n");

test("3. inFlightKeyRef is armed (set to contextKey) synchronously before the async fetch IIFE starts", () => {
  const armIndex = effectBody.indexOf("inFlightKeyRef.current = contextKey;");
  const iifeIndex = effectBody.indexOf("void (async () => {");
  assert.ok(armIndex >= 0, "expected inFlightKeyRef.current = contextKey to be set in the fetch branch");
  assert.ok(iifeIndex > armIndex, "inFlightKeyRef must be armed before the async fetch IIFE starts, not inside it");
});

test("4. The lists fetch's own result is only used to proceed (not discarded) if inFlightKeyRef.current still equals contextKey, checked immediately after that await resolves", () => {
  const listsAwaitIndex = effectBody.indexOf("const lists = await readUserVocabularyLists(session, targetLanguage);");
  assert.ok(listsAwaitIndex >= 0, "expected the readUserVocabularyLists await call");
  const afterAwait = effectBody.slice(listsAwaitIndex, listsAwaitIndex + 200);
  assert.match(
    afterAwait,
    /if \(inFlightKeyRef\.current !== contextKey\) return;/,
    "must re-check inFlightKeyRef.current === contextKey immediately after the lists await, not a cancelled closure",
  );
});

test("5. The dependent memberships fetch's result is applied only if inFlightKeyRef.current still equals contextKey, checked after that await resolves", () => {
  const membershipsAwaitIndex = effectBody.indexOf("const memberships = await readUserVocabularyListMemberships(");
  assert.ok(membershipsAwaitIndex >= 0, "expected the readUserVocabularyListMemberships await call");
  const afterAwait = effectBody.slice(membershipsAwaitIndex, membershipsAwaitIndex + 300);
  assert.match(
    afterAwait,
    /if \(inFlightKeyRef\.current !== contextKey\) return;/,
    "must re-check inFlightKeyRef.current === contextKey immediately after the memberships await, not a cancelled closure",
  );
  const guardIndex = afterAwait.indexOf("if (inFlightKeyRef.current !== contextKey) return;");
  const setStateIndex = afterAwait.indexOf('setState({ key: contextKey, status: "ready", lists, memberships });');
  assert.ok(setStateIndex > guardIndex, "the ready setState must come after the inFlightKeyRef guard, not before it");
});

test("6. The catch branch also re-checks inFlightKeyRef.current === contextKey before applying an error state", () => {
  const catchIndex = effectBody.indexOf("} catch (error) {");
  assert.ok(catchIndex >= 0, "expected a catch branch");
  const catchBody = effectBody.slice(catchIndex, catchIndex + 700);
  assert.match(
    catchBody,
    /if \(inFlightKeyRef\.current !== contextKey\) return;/,
    "the catch branch must re-check inFlightKeyRef.current === contextKey, not a cancelled closure",
  );
});

test("7. The no-session branch applies its idle reset only if inFlightKeyRef.current still equals contextKey", () => {
  const noSessionIndex = effectBody.indexOf("if (!session) {");
  assert.ok(noSessionIndex >= 0, "expected the no-session branch");
  const noSessionBody = effectBody.slice(noSessionIndex, noSessionIndex + 300);
  assert.match(
    noSessionBody,
    /if \(inFlightKeyRef\.current === contextKey\) \{/,
    "the no-session branch must re-check inFlightKeyRef.current === contextKey, not a cancelled closure",
  );
});

test("8. inFlightKeyRef is only cleared in a finally block, guarded by an equality check against its own attempt's contextKey", () => {
  const finallyMatch = effectBody.match(/\} finally \{([\s\S]*?)\n {6}\}/);
  assert.ok(finallyMatch, "expected a finally block clearing inFlightKeyRef");
  assert.match(
    finallyMatch[1],
    /if \(inFlightKeyRef\.current === contextKey\) \{\s*inFlightKeyRef\.current = null;/,
    "finally must only clear inFlightKeyRef if it still points at this attempt's own contextKey — a newer attempt for the same key may have already taken over",
  );
});

console.log("\n=== The in-flight dedup guard (a correct, desired behavior) exists ===\n");

test("9. A same-key re-run while a fetch is already in flight returns early without starting a second fetch", () => {
  const dedupGuardIndex = effectBody.indexOf("if (inFlightKeyRef.current === contextKey) {");
  const armIndex = effectBody.indexOf("inFlightKeyRef.current = contextKey;");
  assert.ok(dedupGuardIndex >= 0 && dedupGuardIndex < armIndex, "the dedup guard must appear before the fetch branch arms inFlightKeyRef");
});

test("10. No console.debug diagnostic instrumentation was left behind in this file", () => {
  assert.doesNotMatch(sharedHookRaw, /console\.debug/, "temporary live-verification logging must be removed before commit");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-in-flight-result-application guard passed");
}
