// Behavioral tests for D-2 (single-flight Supabase session refresh).
//
// src/lib/singleFlight.ts is the exact, unmodified generic coordinator that
// src/lib/supabaseAuth.ts's refreshSupabaseSession wraps around the real
// GoTrue refresh request (see supabaseAuth.ts's own comment right above
// `const refreshSingleFlight = createSingleFlight<StoredSupabaseSession>();`).
// It has no imports at all, so — unlike supabaseAuth.ts itself, which reads
// import.meta.env at module load and can't be imported under plain Node,
// per the precedent documented in test-supabase-error-classification.mjs
// and test-complete-new-word-study-contract.mjs — it loads directly here
// and every concurrency claim below is proven by actually running it, not
// by regex.
//
// What this file cannot execute (same import.meta.env wall): the GoTrue
// HTTP call, session storage/event-dispatch, and the SupabaseRequestError
// vs. network-failure distinction inside performSupabaseSessionRefresh.
// Those are covered by the source-text assertions in the second half of
// this file, which prove the wiring - refreshSupabaseSession delegates to
// refreshSingleFlight.run() and performSupabaseSessionRefresh has exactly
// one call site - so the concurrency guarantees proven against the real
// coordinator above transfer to the real refresh path.
//
// Run: node --experimental-strip-types scripts/tests/lib/test-refresh-single-flight.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSingleFlight } from "../../../src/lib/singleFlight.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

// A promise whose resolve/reject can be triggered from outside, for
// precise control over when a simulated "refresh request" settles.
function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

console.log("\n=== createSingleFlight: the real, unmodified refresh coordinator ===\n");

await test("1. Two concurrent run() calls (the 'caller A / caller B, same stale session' scenario) trigger exactly one start()", async () => {
  const coordinator = createSingleFlight();
  const deferred = createDeferred();
  let startCalls = 0;
  const start = () => {
    startCalls += 1;
    return deferred.promise;
  };

  // Both "callers" call run() before the request settles - mirrors caller
  // A starting a refresh with R1 and caller B reaching refresh while A is
  // still running, both synchronously in the same tick.
  const resultA = coordinator.run(start);
  const resultB = coordinator.run(start);

  assert.equal(startCalls, 1, "start() (the real HTTP refresh request) must only be issued once");

  deferred.resolve({ access_token: "new-access-token", refresh_token: "R2" });
  const [a, b] = await Promise.all([resultA, resultB]);

  assert.equal(a, b, "both callers must resolve to the exact same value - B must reuse A's refreshed session, not its own stale R1");
  assert.deepEqual(a, { access_token: "new-access-token", refresh_token: "R2" });
});

await test("2. Three concurrent callers holding three different (stale) session closures still join the one attempt - object identity of the caller's own state never starts a second refresh", async () => {
  const coordinator = createSingleFlight();
  const deferred = createDeferred();
  const calls = { a: 0, b: 0, c: 0 };
  const startA = () => { calls.a += 1; return deferred.promise; };
  const startB = () => { calls.b += 1; return deferred.promise; };
  const startC = () => { calls.c += 1; return deferred.promise; };

  const pA = coordinator.run(startA);
  const pB = coordinator.run(startB);
  const pC = coordinator.run(startC);

  assert.deepEqual(calls, { a: 1, b: 0, c: 0 }, "only the first caller's start() may run - later callers' own start closures must never be invoked, regardless of what session/state they closed over");

  deferred.resolve("refreshed-session");
  const results = await Promise.all([pA, pB, pC]);
  assert.deepEqual(results, ["refreshed-session", "refreshed-session", "refreshed-session"]);
});

await test("3. Concurrent permanent rejection: start() called once, every caller observes the identical rejection", async () => {
  const coordinator = createSingleFlight();
  const deferred = createDeferred();
  let startCalls = 0;
  const start = () => {
    startCalls += 1;
    return deferred.promise;
  };

  const resultA = coordinator.run(start);
  const resultB = coordinator.run(start);
  const rejection = new Error("invalid_grant: Refresh Token Not Found");
  deferred.reject(rejection);

  const [settledA, settledB] = await Promise.allSettled([resultA, resultB]);
  assert.equal(startCalls, 1, "a real invalid-refresh-token rejection must not have triggered a second request");
  assert.equal(settledA.status, "rejected");
  assert.equal(settledB.status, "rejected");
  assert.equal(settledA.reason, rejection, "caller A must see the exact rejection reason");
  assert.equal(settledB.reason, rejection, "caller B must see the exact same rejection reason as caller A - consistent failure observation");
});

await test("4. Concurrent transient network failure: still exactly one start() call and both callers observe the same rejection (single-flight itself never swallows or duplicates the failure)", async () => {
  const coordinator = createSingleFlight();
  const deferred = createDeferred();
  let startCalls = 0;
  const start = () => {
    startCalls += 1;
    return deferred.promise;
  };

  const resultA = coordinator.run(start);
  const resultB = coordinator.run(start);
  const networkError = new TypeError("Failed to fetch");
  deferred.reject(networkError);

  const [settledA, settledB] = await Promise.allSettled([resultA, resultB]);
  assert.equal(startCalls, 1);
  assert.equal(settledA.reason, networkError);
  assert.equal(settledB.reason, networkError);
});

await test("5. After an in-flight attempt settles (success), a later call starts a genuinely new attempt - not a permanent cache", async () => {
  const coordinator = createSingleFlight();
  const firstDeferred = createDeferred();
  let firstCalls = 0;
  const firstStart = () => { firstCalls += 1; return firstDeferred.promise; };

  const first = coordinator.run(firstStart);
  firstDeferred.resolve("session-1");
  await first;

  let secondCalls = 0;
  const secondDeferred = createDeferred();
  const secondStart = () => { secondCalls += 1; return secondDeferred.promise; };
  const second = coordinator.run(secondStart);

  assert.equal(secondCalls, 1, "a call made after the prior attempt fully settled must start a real new request");
  secondDeferred.resolve("session-2");
  assert.equal(await second, "session-2");
});

await test("6. After a permanent rejection settles, a later retry starts a new attempt rather than reusing the failed Promise", async () => {
  const coordinator = createSingleFlight();
  const firstDeferred = createDeferred();
  const firstStart = () => firstDeferred.promise;

  const first = coordinator.run(firstStart);
  firstDeferred.reject(new Error("Refresh Token Not Found"));
  await assert.rejects(first);

  let retryCalls = 0;
  const retryDeferred = createDeferred();
  const retryStart = () => { retryCalls += 1; return retryDeferred.promise; };
  const retry = coordinator.run(retryStart);

  assert.equal(retryCalls, 1, "the retry must issue a real new request, not resolve/reject off the old failed attempt");
  retryDeferred.resolve("session-after-retry");
  assert.equal(await retry, "session-after-retry");
});

await test("7. A caller that reacts inside a .then() chained directly onto the in-flight Promise always sees the slot already cleared - proves the exact 'arrives right as it settles' race from the task is closed", async () => {
  const coordinator = createSingleFlight();
  const deferred = createDeferred();
  const firstStart = () => deferred.promise;

  const first = coordinator.run(firstStart);

  // The most adversarial ordering possible: this handler is attached
  // directly to the very Promise the coordinator stores internally, so it
  // fires at the earliest possible moment after settlement - exactly the
  // "immediately after the in-flight Promise settles but before/while the
  // reference is being cleared" scenario the task calls out.
  let secondCalls = 0;
  const secondDeferred = createDeferred();
  const chained = first.then(() => {
    const secondStart = () => { secondCalls += 1; return secondDeferred.promise; };
    return coordinator.run(secondStart);
  });

  deferred.resolve("session-1");
  secondDeferred.resolve("session-2");
  const chainedResult = await chained;

  assert.equal(secondCalls, 1, "the chained call must see the slot already cleared and start a real new attempt, never reuse the just-settled Promise");
  assert.equal(chainedResult, "session-2");
});

await test("8. Multiple callers piling onto an already-settled-but-still-in-cleanup attempt all still get exactly one start() (stress: 20 concurrent joiners)", async () => {
  const coordinator = createSingleFlight();
  const deferred = createDeferred();
  let startCalls = 0;
  const start = () => { startCalls += 1; return deferred.promise; };

  const results = Array.from({ length: 20 }, () => coordinator.run(start));
  assert.equal(startCalls, 1);
  deferred.resolve("shared-session");
  const settled = await Promise.all(results);
  assert.ok(settled.every((value) => value === "shared-session"));
});

console.log("\n=== Wiring: refreshSupabaseSession/ensureFreshSupabaseSession actually use the coordinator above ===\n");

const supabaseAuth = read("src/lib/supabaseAuth.ts");

await test("9. refreshSupabaseSession is implemented as a thin call into refreshSingleFlight.run() around performSupabaseSessionRefresh - no other code path can trigger a duplicate raw refresh request", () => {
  assert.match(
    supabaseAuth,
    /export function refreshSupabaseSession\(\s*session: StoredSupabaseSession,\s*\): Promise<StoredSupabaseSession> \{\s*[\s\S]*?return refreshSingleFlight\.run\(\(\) => performSupabaseSessionRefresh\(session\)\);\s*\}/,
  );
  const performCallSites = (supabaseAuth.match(/performSupabaseSessionRefresh\(/g) ?? []).length;
  // Exactly 2: the function's own declaration and its one call site inside
  // refreshSupabaseSession above.
  assert.equal(performCallSites, 2, "performSupabaseSessionRefresh must have exactly one call site (inside refreshSupabaseSession) besides its own declaration");
});

await test("10. Exactly one refreshSingleFlight coordinator exists at module scope (not re-created per call, which would defeat single-flight entirely)", () => {
  const matches = supabaseAuth.match(/createSingleFlight<StoredSupabaseSession>\(\)/g) ?? [];
  assert.equal(matches.length, 1, "createSingleFlight must be instantiated exactly once at module scope");
  assert.match(supabaseAuth, /const refreshSingleFlight = createSingleFlight<StoredSupabaseSession>\(\);/);
});

await test("11. ensureFreshSupabaseSession still delegates to refreshSupabaseSession unchanged, so it transitively goes through the same single-flight path with no separate logic of its own", () => {
  assert.match(
    supabaseAuth,
    /export async function ensureFreshSupabaseSession\(\s*session: StoredSupabaseSession,\s*\): Promise<StoredSupabaseSession> \{\s*if \(!isSessionExpiringSoon\(session\)\) \{\s*return session;\s*\}\s*\s*return refreshSupabaseSession\(session\);\s*\}/,
  );
});

await test("12. The real-rejection-clears-session vs. network-failure-preserves-session distinction inside performSupabaseSessionRefresh is untouched by the single-flight wrapper", () => {
  const fnMatch = supabaseAuth.match(/async function performSupabaseSessionRefresh\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "performSupabaseSessionRefresh must be found");
  const body = fnMatch[1];
  const storeNullCount = (body.match(/storeSession\(null\)/g) ?? []).length;
  assert.equal(storeNullCount, 2, "storeSession(null) must appear exactly twice: the missing-refresh-token guard and the SupabaseRequestError branch - unchanged from before D-2");
  assert.match(body, /if \(error instanceof SupabaseRequestError\) \{\s*storeSession\(null\);\s*\}/);
  assert.match(body, /storeSession\(hydratedSession\);\s*return hydratedSession \?\? mergedSession;/);
});

console.log("\n=== No consumer reimplements its own refresh mutex ===\n");

await test("13. userProfile.ts, newWordProgress.ts, learningDate.ts, and customPracticeProgress.ts only ever call the centralized helpers - none defines its own in-flight/mutex/promise-cache for refresh", () => {
  const consumers = {
    "src/lib/userProfile.ts": read("src/lib/userProfile.ts"),
    "src/lib/newWordProgress.ts": read("src/lib/newWordProgress.ts"),
    "src/lib/learningDate.ts": read("src/lib/learningDate.ts"),
    "src/lib/customPracticeProgress.ts": read("src/lib/customPracticeProgress.ts"),
  };
  for (const [file, source] of Object.entries(consumers)) {
    assert.doesNotMatch(source, /InFlight/i, `${file} must not define its own in-flight/mutex tracking for refresh`);
    assert.doesNotMatch(source, /createSingleFlight/, `${file} must not import or reimplement the single-flight primitive itself`);
    assert.match(source, /ensureFreshSupabaseSession\(session\)/, `${file} must still call the centralized ensureFreshSupabaseSession`);
    assert.match(source, /refreshSupabaseSession\(freshSession\)/, `${file} must still call the centralized refreshSupabaseSession on retry`);
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("refresh-single-flight guard passed");
}
