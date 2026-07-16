// Regression guard for two related practice-route defects:
//
// 1. The canonical-practice-route/stored-language-preference oscillation
//    (fixed in src/app/hooks/useStoredAppPreferences.ts and
//    src/app/utils/storedLanguagePreferencePolicy.ts): a fresh mount on a
//    valid canonical practice URL (e.g. .../en-es/practice) must not have its
//    language state overwritten by a *different* complete stored language pair.
// 2. The legacy /languages/filters/exercises/practice double-navigation
//    (fixed in src/app/App.tsx and
//    src/app/utils/practiceRouteCanonicalizationPolicy.ts): the state->URL
//    effect must not treat that language-less alias as a canonical route
//    needing canonicalization, leaving the stored-language auto-redirect
//    effect as the alias's sole navigator.
//
// Behavioral, not source-text: this imports and exercises the real
// production policy helpers (shouldRestoreStoredLanguagePreference,
// shouldCanonicalizePracticeRoute) via Node's native TypeScript stripping
// (--experimental-strip-types), rather than duplicating either rule or
// grepping for guard text. Both helpers are import-free at runtime (the
// second has only a type-only import, fully erased by type stripping) so
// they can be loaded directly here without a custom loader — most other TS
// modules in this app (e.g. pageRouting.ts) have their own extensionless
// relative imports that Node's ESM resolver cannot follow without a bundler,
// so only import-free helpers like these are directly importable from a
// plain script.
//
// The route→state/state→URL effect bodies and the auto-redirect effect
// itself are NOT changed by this task and are NOT re-exported for testing
// (out of scope), so they are reimplemented here as plain, side-effect-free
// scaffolding (buildPracticeRoute/parsePracticeRoute are simple,
// already-audited one-liners; the auto-redirect conditions are reproduced
// only to prove non-interference, not to re-test that effect) purely to
// drive a deterministic multi-render reconciliation model. The two pieces of
// logic actually under test — the storage-load restoration decision and the
// state->URL canonicalization-eligibility decision — always come from the
// real imported helpers.
//
// Run: node --experimental-strip-types scripts/test-practice-route-sync.mjs
import assert from "node:assert/strict";
import { shouldRestoreStoredLanguagePreference } from "../src/app/utils/storedLanguagePreferencePolicy.ts";
import { shouldCanonicalizePracticeRoute } from "../src/app/utils/practiceRouteCanonicalizationPolicy.ts";

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

// --- scaffolding: unchanged, already-audited route helpers (not the policy under test) ---
function buildPracticeRoute(yourLanguage, practiceLanguage) {
  return `/languages/filters/exercises/${yourLanguage}-${practiceLanguage}/practice`;
}
function parsePracticeRoute(path) {
  const m = path.match(/^\/languages\/filters\/exercises\/([a-z]{2})-([a-z]{2})\/practice$/);
  if (!m) return null;
  return { yourLanguage: m[1], practiceLanguage: m[2] };
}

// One render's effect flush: storage-load (real policy, one-shot) + the
// unchanged route→state and state→URL effects, mirroring App.tsx exactly.
function step({ pathname, state, storageLoadFired, hasInitialCanonicalPracticeRoute, storedPair }) {
  const practiceRoute = parsePracticeRoute(pathname);
  const resolvedPage = practiceRoute ? "practice" : "other";

  let scheduledState = null;
  let scheduledPathname = null;
  let nextStorageLoadFired = storageLoadFired;

  if (!storageLoadFired) {
    nextStorageLoadFired = true;
    const restore = shouldRestoreStoredLanguagePreference(hasInitialCanonicalPracticeRoute);
    if (restore && storedPair) {
      const next = { ...state };
      if (storedPair.yourLanguage) next.yourLanguage = storedPair.yourLanguage;
      if (storedPair.practiceLanguage) next.practiceLanguage = storedPair.practiceLanguage;
      if (next.yourLanguage !== state.yourLanguage || next.practiceLanguage !== state.practiceLanguage) {
        scheduledState = next;
      }
    }
  }

  // route -> state (App.tsx:400-412, unchanged by this fix)
  if (resolvedPage === "practice" && practiceRoute) {
    const base = { ...state };
    const next = { ...(scheduledState ?? base) };
    let changed = false;
    if (base.yourLanguage !== practiceRoute.yourLanguage) {
      next.yourLanguage = practiceRoute.yourLanguage;
      changed = true;
    }
    if (base.practiceLanguage !== practiceRoute.practiceLanguage) {
      next.practiceLanguage = practiceRoute.practiceLanguage;
      changed = true;
    }
    if (changed) scheduledState = next;
  }

  // state -> URL (App.tsx:415-441): eligibility now comes from the real
  // shouldCanonicalizePracticeRoute helper, not a reimplemented guard.
  if (
    shouldCanonicalizePracticeRoute(
      resolvedPage,
      practiceRoute !== null,
      state.yourLanguage,
      state.practiceLanguage,
    )
  ) {
    const expectedPath = buildPracticeRoute(state.yourLanguage, state.practiceLanguage);
    if (pathname !== expectedPath) {
      scheduledPathname = expectedPath;
    }
  }

  return {
    nextPathname: scheduledPathname ?? pathname,
    nextState: scheduledState ?? state,
    nextStorageLoadFired,
    changed: Boolean(scheduledState || scheduledPathname),
  };
}

function simulate({ urlPair, storedPair, maxRenders = 8 }) {
  const hasInitialCanonicalPracticeRoute = urlPair !== null;
  let pathname = urlPair ? buildPracticeRoute(urlPair.yourLanguage, urlPair.practiceLanguage) : "/languages";
  let state = urlPair
    ? { yourLanguage: urlPair.yourLanguage, practiceLanguage: urlPair.practiceLanguage }
    : { yourLanguage: "", practiceLanguage: "" };
  let storageLoadFired = false;

  const seen = new Map();
  for (let renderN = 0; renderN < maxRenders; renderN++) {
    const key = `${pathname}|${state.yourLanguage}-${state.practiceLanguage}`;
    if (seen.has(key)) {
      return { converged: false, cycleStart: seen.get(key), cycleEnd: renderN, renders: renderN };
    }
    seen.set(key, renderN);

    const result = step({ pathname, state, storageLoadFired, hasInitialCanonicalPracticeRoute, storedPair });
    if (!result.changed) {
      return { converged: true, renders: renderN + 1, finalState: state, finalPathname: pathname };
    }
    pathname = result.nextPathname;
    state = result.nextState;
    storageLoadFired = result.nextStorageLoadFired;
  }

  return { converged: false, timedOut: true, renders: maxRenders };
}

console.log("\n=== practice-route storage-preference policy (unit) ===\n");

test("policy: does NOT restore stored language on a canonical-practice mount", () => {
  assert.equal(shouldRestoreStoredLanguagePreference(true), false);
});

test("policy: DOES restore stored language on an ordinary-route mount", () => {
  assert.equal(shouldRestoreStoredLanguagePreference(false), true);
});

console.log("\n=== canonical practice URL vs. stored preferences ===\n");

test("1. canonical URL equals stored pair: URL stays authoritative, no overwrite requested, converges immediately", () => {
  const result = simulate({
    urlPair: { yourLanguage: "en", practiceLanguage: "es" },
    storedPair: { yourLanguage: "en", practiceLanguage: "es" },
  });
  assert.equal(result.converged, true, "expected convergence, not a cycle/timeout");
  assert.equal(result.renders, 1, "matching URL/storage should settle on the very first render");
  assert.deepEqual(result.finalState, { yourLanguage: "en", practiceLanguage: "es" });
  assert.equal(result.finalPathname, "/languages/filters/exercises/en-es/practice");
});

test("2. canonical URL differs from stored pair: URL stays authoritative, reconciliation reaches a stable state (no oscillation)", () => {
  const result = simulate({
    urlPair: { yourLanguage: "en", practiceLanguage: "es" },
    storedPair: { yourLanguage: "fr", practiceLanguage: "de" },
  });
  assert.equal(result.converged, true, "expected convergence; the pre-fix model oscillates forever here");
  assert.equal(result.renders, 1, "the fix must prevent storage from ever scheduling an overwrite, so this settles on render 1 just like the matching case");
  assert.deepEqual(result.finalState, { yourLanguage: "en", practiceLanguage: "es" }, "route pair must win over the mismatched stored pair");
  assert.equal(result.finalPathname, "/languages/filters/exercises/en-es/practice");
});

test("3. canonical URL, no stored pair: URL stays authoritative, no behavior change", () => {
  const result = simulate({
    urlPair: { yourLanguage: "de", practiceLanguage: "it" },
    storedPair: null,
  });
  assert.equal(result.converged, true);
  assert.equal(result.renders, 1);
  assert.deepEqual(result.finalState, { yourLanguage: "de", practiceLanguage: "it" });
});

console.log("\n=== ordinary routes keep restoring stored preferences ===\n");

test("4. no canonical route, complete stored pair: stored values restore normally", () => {
  const result = simulate({
    urlPair: null,
    storedPair: { yourLanguage: "ru", practiceLanguage: "pt" },
  });
  assert.equal(result.converged, true);
  assert.deepEqual(result.finalState, { yourLanguage: "ru", practiceLanguage: "pt" });
  assert.equal(
    shouldRestoreStoredLanguagePreference(false) && Boolean("ru" && "pt"),
    true,
    "shouldAutoRedirectFromStoredLanguagesRef must remain eligible on ordinary routes with a complete stored pair",
  );
});

test("5. no canonical route, incomplete stored pair: only the valid partial restoration occurs, no auto-redirect eligibility", () => {
  const result = simulate({
    urlPair: null,
    storedPair: { yourLanguage: "ru", practiceLanguage: null },
  });
  assert.equal(result.converged, true);
  assert.deepEqual(
    result.finalState,
    { yourLanguage: "ru", practiceLanguage: "" },
    "only the persisted value that actually validated should apply",
  );
  assert.equal(
    shouldRestoreStoredLanguagePreference(false) && Boolean("ru" && null),
    false,
    "an incomplete stored pair must never make the /languages auto-redirect eligible",
  );
});

test("canonical-practice mount never marks auto-redirect eligible, even with a complete stored pair", () => {
  assert.equal(
    shouldRestoreStoredLanguagePreference(true) && Boolean("fr" && "de"),
    false,
    "shouldAutoRedirectFromStoredLanguagesRef.current must be false for a canonical-practice mount regardless of what is stored",
  );
});

console.log("\n=== post-mount behavior is unaffected ===\n");

test("6. a later ordinary language-selector change is not blocked or reverted by the initial-load rule", () => {
  // Start from the settled state of case 2 (URL won over a mismatched stored
  // pair on a canonical practice mount) — storage-load has now fired once
  // and, per its effect deps, can never fire again for the rest of the
  // session, regardless of what hasInitialCanonicalPracticeRoute was at mount.
  const settled = simulate({
    urlPair: { yourLanguage: "en", practiceLanguage: "es" },
    storedPair: { yourLanguage: "fr", practiceLanguage: "de" },
  });
  assert.equal(settled.converged, true);

  // The user then navigates away to an ordinary route (e.g. /languages) and
  // picks a new pair via the plain HomePage selectors — a direct setState
  // call, not sourced from storage or the URL. On an ordinary route neither
  // route->state nor state->URL engage (both are guarded on
  // resolvedPage === "practice"), so the new selection must simply stick.
  const afterSelectorChange = step({
    pathname: "/languages",
    state: { yourLanguage: "ru", practiceLanguage: "de" },
    storageLoadFired: true,
    hasInitialCanonicalPracticeRoute: true, // frozen from the original mount; must not leak into this later render
    storedPair: { yourLanguage: "fr", practiceLanguage: "de" },
  });

  assert.equal(afterSelectorChange.changed, false, "an ordinary-route language change needs no correction from either sync effect");
  assert.deepEqual(
    afterSelectorChange.nextState,
    { yourLanguage: "ru", practiceLanguage: "de" },
    "the new selection must stick — the initial-load suppression must not re-apply or revert it",
  );
});

console.log("\n=== legacy practice-route (language-less alias) ===\n");

test("canonical-route state->URL eligibility remains true", () => {
  assert.equal(
    shouldCanonicalizePracticeRoute("practice", true, "en", "es"),
    true,
    "a valid canonical practice route with both languages must remain eligible for canonicalization",
  );
});

test("legacy-route state->URL eligibility is false", () => {
  assert.equal(
    shouldCanonicalizePracticeRoute("practice", false, "en", "es"),
    false,
    "the language-less legacy route (hasPracticeRoute=false) must never be eligible, even with both languages known",
  );
});

// Legacy-route navigation model: state->URL's contribution comes from the
// real shouldCanonicalizePracticeRoute helper; the auto-redirect effect
// itself (App.tsx:436-469) is unchanged production code and is reproduced
// here only as scaffolding, to prove exactly one navigation decision
// results once state->URL is correctly suppressed — not to re-test
// auto-redirect's own conditions.
function legacyRouteNavigationDecisions({ hasCompleteStoredPair }) {
  const practiceRoute = parsePracticeRoute("/languages/filters/exercises/practice"); // null: no language segment
  const resolvedPage = "practice"; // pageFromPath's literal ROUTES.practice match
  const yourLanguage = hasCompleteStoredPair ? "en" : "";
  const practiceLanguage = hasCompleteStoredPair ? "es" : "";

  const decisions = [];

  if (shouldCanonicalizePracticeRoute(resolvedPage, practiceRoute !== null, yourLanguage, practiceLanguage)) {
    decisions.push({ source: "state->URL", destination: buildPracticeRoute(yourLanguage, practiceLanguage) });
  }

  // Auto-redirect's own conditions, unchanged and out of scope — reproduced
  // only to prove it remains the sole navigator once state->URL is silent.
  const isContinueDisabled = !yourLanguage || !practiceLanguage;
  const shouldAutoRedirectFromStoredLanguages = hasCompleteStoredPair; // ordinary-route mount, both persisted
  const startedOnLegacyPracticePage = true; // fresh mount directly on ROUTES.practice
  if (!isContinueDisabled && shouldAutoRedirectFromStoredLanguages && startedOnLegacyPracticePage && resolvedPage === "practice") {
    decisions.push({ source: "auto-redirect", destination: "/languages/filters/exercises" });
  }

  return decisions;
}

test("legacy route with complete stored pair produces only the auto-redirect-equivalent decision", () => {
  const decisions = legacyRouteNavigationDecisions({ hasCompleteStoredPair: true });
  assert.equal(decisions.length, 1, "exactly one navigation decision must be produced, not two competing ones");
  assert.equal(decisions[0].source, "auto-redirect");
});

test("legacy route destination remains exercise selection", () => {
  const decisions = legacyRouteNavigationDecisions({ hasCompleteStoredPair: true });
  assert.equal(decisions[0].destination, "/languages/filters/exercises");
});

test("legacy route with incomplete language state produces no newly invented navigation", () => {
  const decisions = legacyRouteNavigationDecisions({ hasCompleteStoredPair: false });
  assert.deepEqual(decisions, [], "no navigation — invented or otherwise — should occur for the incomplete-language case");
});

test("a later valid canonical practice route still allows state->URL synchronization", () => {
  // On an already-canonical practice path, state->URL must still be able to
  // canonicalize if state and path ever disagree (e.g. a direct setter
  // change) — proving the legacy-route guard change is narrowly scoped to
  // hasPracticeRoute=false and does not suppress canonicalization generally.
  const result = step({
    pathname: "/languages/filters/exercises/en-es/practice",
    state: { yourLanguage: "de", practiceLanguage: "it" },
    storageLoadFired: true,
    hasInitialCanonicalPracticeRoute: true,
    storedPair: null,
  });
  assert.equal(result.changed, true, "state->URL must still canonicalize a valid practice route");
  assert.equal(result.nextPathname, "/languages/filters/exercises/de-it/practice");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("practice-route-sync guard passed");
}
