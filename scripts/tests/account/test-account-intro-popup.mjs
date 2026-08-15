// Regression guard for the anonymous "account intro" popup, shared across
// its four trigger contexts (language-setup, practice-complete,
// level-test-complete, seo-engagement):
//
// - src/app/utils/accountIntroPolicy.ts owns the pure decisions: whether the
//   Languages page's Continue click should attach the one-time
//   showAccountIntro navigation signal (language-setup only); centrally, for
//   all four contexts, whether a popup should actually open given auth
//   status and the frequency policy: a single global rolling 24-hour
//   cooldown (isWithinAccountIntroCooldown / ACCOUNT_INTRO_COOLDOWN_MS),
//   shared across all four contexts; which routes count as "SEO" for the
//   seo-engagement trigger (isAccountIntroSeoEligibleRoute, reusing the
//   app's own PageKey route classification); and that trigger's own
//   cumulative-active-time math (computeAccountIntroSeoActiveTotalMs /
//   foldAccountIntroSeoActiveSegment / hasAccountIntroSeoActiveTimeReachedThreshold).
// - src/app/utils/accountIntroStorage.ts centralizes the localStorage
//   lastShownAt cooldown timestamp and the sessionStorage seoActiveMs
//   cumulative-engagement counter - the only place in the app that touches
//   either - and best-effort clears two now-unread legacy keys from a
//   superseded earlier policy.
// - src/app/hooks/useStoredAppPreferences.ts captures whether a *complete*
//   language pair already existed in localStorage before this load (the
//   sole source of language-setup's "first-time" eligibility signal - it
//   still goes through the same shared cooldown as the others once
//   signaled).
// - src/app/hooks/useAccountIntroPopup.ts consumes the router-state signal
//   and exposes requestAccountIntro() for the other three triggers, then
//   applies the shared policy before ever opening or writing the cooldown
//   timestamp. Untouched by the seo-engagement trigger's addition - it was
//   already fully generic across contexts.
// - src/app/hooks/useAccountIntroSeoEngagement.ts owns the seo-engagement
//   trigger's timestamp-segment tracking (Page Visibility API, a 1s
//   threshold-check interval, sessionStorage persistence) and calls
//   requestAccountIntro("seo-engagement") - nothing else.
// - VocabularyPractice.tsx / VocabularyLevelExam.tsx fire onSessionComplete/
//   onExamComplete at their own canonical completion events only.
// - src/app/App.tsx wires all four triggers into the one shared dialog
//   (rendered on every page, since seo-engagement can request it while the
//   user is on any route, not just the original three) and reuses Header's
//   existing login/signup dialog for Create account / Log in (no second
//   auth flow).
//
// Behavioral for the pure policy module and the storage module (both
// import-free / minimally-dependent, loadable directly via Node's native
// TypeScript stripping - see storedLanguagePreferencePolicy.ts for why this
// project's other .ts modules can't). The storage module touches
// window.localStorage/sessionStorage, so its tests install a minimal fake
// Storage on globalThis.window first (this repo has no jsdom/testing-library
// dependency - see package.json - so this is the lightest way to exercise
// real read/write behavior rather than only asserting on source text). Every
// cooldown/timer-boundary test below uses controllable timestamps (plain
// numbers), never real waiting/timeouts.
// Source-text checks for the React hook/component wiring, matching
// test-account-language-sync.mjs's own documented module-boundary tradeoff.
//
// Run: node --experimental-strip-types scripts/tests/account/test-account-intro-popup.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT_INTRO_COOLDOWN_MS,
  ACCOUNT_INTRO_SEO_ACTIVE_TIME_THRESHOLD_MS,
  computeAccountIntroSeoActiveTotalMs,
  foldAccountIntroSeoActiveSegment,
  hasAccountIntroSeoActiveTimeReachedThreshold,
  isAccountIntroSeoEligibleRoute,
  isWithinAccountIntroCooldown,
  shouldShowAccountIntro,
  shouldSignalAccountIntro,
} from "../../../src/app/utils/accountIntroPolicy.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const LOCALE_FILES = [
  "english_interface.json",
  "german_interface.json",
  "spanish_interface.json",
  "french_interface.json",
  "italian_interface.json",
  "portuguese_interface.json",
  "russian_interface.json",
];

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

// Normalizes CRLF to LF: several source files in this repo are checked out
// with CRLF line endings, which silently breaks any regex pattern here that
// spans a line break (`\n` expects a bare LF, but a CRLF line break is
// actually `\r\n` - a stray `\r` sits right before it). Same precedent as
// test-auth-dialog-hardening.mjs's own `read()` helper.
function readFile(relativePath) {
  return fs
    .readFileSync(path.join(ROOT_DIR, relativePath), "utf8")
    .replace(/\r\n/g, "\n");
}

function readJson(relativePath) {
  return JSON.parse(readFile(relativePath));
}

function flattenKeys(obj, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenKeys(value, nextPath));
    } else {
      out.push(nextPath);
    }
  }
  return out.sort();
}

// Resolves a dotted flattenKeys() path (e.g. "accountIntroPopup.benefits.
// studyWords.title") against the nested JSON object it was flattened from.
function resolveNestedPath(root, dottedPath) {
  return dottedPath
    .split(".")
    .slice(1) // drop the leading "accountIntroPopup" segment - root is already that subtree
    .reduce((node, segment) => (node && typeof node === "object" ? node[segment] : undefined), root);
}

// Minimal Storage-shaped fake (getItem/setItem only - all this feature's
// storage module needs) backed by a plain Map, so accountIntroStorage.ts's
// real canUseSessionStorage()/canUseLocalStorage() guards see a usable
// window.{session,local}Storage without needing a full DOM environment.
class FakeStorage {
  #data = new Map();
  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }
  setItem(key, value) {
    this.#data.set(key, String(value));
  }
  removeItem(key) {
    this.#data.delete(key);
  }
  clear() {
    this.#data.clear();
  }
}

async function main() {
  console.log("\n[1] shouldSignalAccountIntro - Languages-page Continue signal gate (language-setup only)");

  await test("Case 1: anonymous + no stored language pair before setup -> signals the popup", () => {
    assert.equal(
      shouldSignalAccountIntro({
        isAuthenticated: false,
        hadCompleteStoredLanguagePairBeforeSetup: false,
      }),
      true,
    );
  });

  await test("Case 2: anonymous + already had a complete stored language pair -> no signal", () => {
    assert.equal(
      shouldSignalAccountIntro({
        isAuthenticated: false,
        hadCompleteStoredLanguagePairBeforeSetup: true,
      }),
      false,
    );
  });

  await test("Case 3: authenticated, regardless of stored-pair state -> never signals", () => {
    assert.equal(
      shouldSignalAccountIntro({
        isAuthenticated: true,
        hadCompleteStoredLanguagePairBeforeSetup: false,
      }),
      false,
    );
    assert.equal(
      shouldSignalAccountIntro({
        isAuthenticated: true,
        hadCompleteStoredLanguagePairBeforeSetup: true,
      }),
      false,
    );
  });

  console.log("\n[2] isWithinAccountIntroCooldown / shouldShowAccountIntro - global 24h cooldown, all 4 contexts");

  const NOW = 1_800_000_000_000; // arbitrary fixed instant - all "controllable timestamp" math below is relative to this
  const HOUR_MS = 60 * 60 * 1000;

  await test("ACCOUNT_INTRO_COOLDOWN_MS is exactly 24 hours, defined as a single named constant", () => {
    assert.equal(ACCOUNT_INTRO_COOLDOWN_MS, 24 * HOUR_MS);
  });

  await test("Case 1: no lastShownAt (never shown) -> not in cooldown -> eligible", () => {
    assert.equal(
      isWithinAccountIntroCooldown({ lastShownAtMs: null, nowMs: NOW }),
      false,
    );
  });

  await test("Case 3: shown 1 hour ago -> suppressed", () => {
    assert.equal(
      isWithinAccountIntroCooldown({ lastShownAtMs: NOW - 1 * HOUR_MS, nowMs: NOW }),
      true,
    );
  });

  await test("Case 4: shown 23h59m ago -> still suppressed (just under the boundary)", () => {
    assert.equal(
      isWithinAccountIntroCooldown({
        lastShownAtMs: NOW - (24 * HOUR_MS - 60_000),
        nowMs: NOW,
      }),
      true,
    );
  });

  await test("Case 5: shown exactly 24 hours ago -> eligible again (boundary is inclusive of eligibility)", () => {
    assert.equal(
      isWithinAccountIntroCooldown({ lastShownAtMs: NOW - 24 * HOUR_MS, nowMs: NOW }),
      false,
    );
  });

  await test("Case 5 (continued): shown 24 hours and 1ms ago -> eligible", () => {
    assert.equal(
      isWithinAccountIntroCooldown({
        lastShownAtMs: NOW - (24 * HOUR_MS + 1),
        nowMs: NOW,
      }),
      false,
    );
  });

  await test("shown 25 hours ago -> eligible (well past the boundary)", () => {
    assert.equal(
      isWithinAccountIntroCooldown({ lastShownAtMs: NOW - 25 * HOUR_MS, nowMs: NOW }),
      false,
    );
  });

  await test("a corrupted future timestamp (lastShownAt after now) never suppresses indefinitely - treated as not-in-cooldown", () => {
    assert.equal(
      isWithinAccountIntroCooldown({ lastShownAtMs: NOW + HOUR_MS, nowMs: NOW }),
      false,
    );
  });

  const BASE_ELIGIBLE = {
    isAuthResolved: true,
    isAuthenticated: false,
    lastShownAtMs: null,
    nowMs: NOW,
  };

  await test("Case 15: language-setup, resolved+anonymous, never shown -> eligible (first-setup behavior still works)", () => {
    assert.equal(
      shouldShowAccountIntro({ ...BASE_ELIGIBLE, context: "language-setup" }),
      true,
    );
  });

  await test("practice-complete / level-test-complete, resolved+anonymous, never shown -> both eligible", () => {
    for (const context of ["practice-complete", "level-test-complete"]) {
      assert.equal(shouldShowAccountIntro({ ...BASE_ELIGIBLE, context }), true);
    }
  });

  const ALL_CONTEXTS = [
    "language-setup",
    "practice-complete",
    "level-test-complete",
    "seo-engagement",
  ];

  await test("Case 3 (SEO): authenticated -> never shows, for any of the 4 contexts, regardless of cooldown state", () => {
    for (const context of ALL_CONTEXTS) {
      assert.equal(
        shouldShowAccountIntro({ ...BASE_ELIGIBLE, context, isAuthenticated: true }),
        false,
        `${context} must not show when authenticated`,
      );
      assert.equal(
        shouldShowAccountIntro({
          ...BASE_ELIGIBLE,
          context,
          isAuthenticated: true,
          lastShownAtMs: null,
        }),
        false,
        `${context} must not show when authenticated even with no prior cooldown`,
      );
    }
  });

  await test("auth not yet resolved -> never shows, even otherwise fully eligible (no flash for a signed-in user), for all 4 contexts", () => {
    for (const context of ALL_CONTEXTS) {
      assert.equal(
        shouldShowAccountIntro({ ...BASE_ELIGIBLE, context, isAuthResolved: false }),
        false,
        `${context} must not show before auth resolves`,
      );
    }
  });

  await test("Case 6: practice-complete can appear again once the cooldown from a prior popup (any context) has elapsed", () => {
    assert.equal(
      shouldShowAccountIntro({
        ...BASE_ELIGIBLE,
        context: "practice-complete",
        lastShownAtMs: NOW - 25 * HOUR_MS,
      }),
      true,
    );
  });

  await test("Case 7: level-test-complete can appear again once the cooldown from a prior popup (any context) has elapsed", () => {
    assert.equal(
      shouldShowAccountIntro({
        ...BASE_ELIGIBLE,
        context: "level-test-complete",
        lastShownAtMs: NOW - 25 * HOUR_MS,
      }),
      true,
    );
  });

  await test("Case 8: practice popup shown, then Level Test completed within the cooldown -> Level Test suppressed (cooldown is global, not per-context)", () => {
    assert.equal(
      shouldShowAccountIntro({
        ...BASE_ELIGIBLE,
        context: "level-test-complete",
        lastShownAtMs: NOW - 2 * HOUR_MS, // the practice popup's own shown time
      }),
      false,
    );
  });

  await test("Case 9: Level Test popup shown, then practice completed after the cooldown -> practice allowed", () => {
    assert.equal(
      shouldShowAccountIntro({
        ...BASE_ELIGIBLE,
        context: "practice-complete",
        lastShownAtMs: NOW - 25 * HOUR_MS, // the level-test popup's own shown time
      }),
      true,
    );
  });

  await test("Case 1 (SEO): seo-engagement, resolved+anonymous, no prior popup -> eligible", () => {
    assert.equal(
      shouldShowAccountIntro({ ...BASE_ELIGIBLE, context: "seo-engagement" }),
      true,
    );
  });

  await test("Case 16: practice popup shown recently -> seo-engagement trigger suppressed too (global cooldown)", () => {
    assert.equal(
      shouldShowAccountIntro({
        ...BASE_ELIGIBLE,
        context: "seo-engagement",
        lastShownAtMs: NOW - 2 * HOUR_MS,
      }),
      false,
    );
  });

  await test("Case 17: Level Test popup shown recently -> seo-engagement trigger suppressed too (global cooldown)", () => {
    assert.equal(
      shouldShowAccountIntro({
        ...BASE_ELIGIBLE,
        context: "seo-engagement",
        lastShownAtMs: NOW - 2 * HOUR_MS,
      }),
      false,
    );
  });

  await test("seo-engagement can appear again once the cooldown from a prior popup (any context) has elapsed", () => {
    assert.equal(
      shouldShowAccountIntro({
        ...BASE_ELIGIBLE,
        context: "seo-engagement",
        lastShownAtMs: NOW - 25 * HOUR_MS,
      }),
      true,
    );
  });

  await test("Example 1: Monday 10:00 practice popup shown -> Monday 12:00 Level Test suppressed -> Tuesday 09:00 (23h) practice suppressed -> Tuesday 10:01 (24h01m) Level Test eligible", () => {
    const mondayTenAm = NOW;
    const mondayNoon = mondayTenAm + 2 * HOUR_MS;
    const tuesdayNineAm = mondayTenAm + 23 * HOUR_MS;
    const tuesdayTenOhOne = mondayTenAm + 24 * HOUR_MS + 60_000;

    assert.equal(
      shouldShowAccountIntro({
        context: "level-test-complete",
        isAuthResolved: true,
        isAuthenticated: false,
        lastShownAtMs: mondayTenAm,
        nowMs: mondayNoon,
      }),
      false,
    );
    assert.equal(
      shouldShowAccountIntro({
        context: "practice-complete",
        isAuthResolved: true,
        isAuthenticated: false,
        lastShownAtMs: mondayTenAm,
        nowMs: tuesdayNineAm,
      }),
      false,
    );
    assert.equal(
      shouldShowAccountIntro({
        context: "level-test-complete",
        isAuthResolved: true,
        isAuthenticated: false,
        lastShownAtMs: mondayTenAm,
        nowMs: tuesdayTenOhOne,
      }),
      true,
    );
  });

  console.log("\n[2b] isAccountIntroSeoEligibleRoute - SEO route eligibility (reuses PageKey, no duplicated route knowledge)");

  const SEO_ELIGIBLE_PAGE_KEYS = [
    "vocabularyLevel",
    "levelTestSeo",
    "verbListSeo",
    "pastVerbFormsSeo",
    "conjugatedVerbFormsSeo",
    "seoHub",
    "wordSeoHub",
    "wordPage",
  ];

  const NON_ELIGIBLE_PAGE_KEYS = [
    // Interactive/app RouteKey pages - explicitly excluded by the product
    // requirement (About, Help, Filters, Exercises, practice, exam, account
    // pages, generic navigation).
    "language",
    "levelCategory",
    "exerciseSelection",
    "practice",
    "explore",
    "exam",
    "about",
    "help",
    "profile",
    "newWordStudy",
    "reviewWords",
    // Non-content PageKeys.
    "devSeoCefrPlaceholder",
    "notFound",
  ];

  await test("Case 1/2 (SEO eligibility): all 7 real SEO content route families are eligible", () => {
    for (const pageKey of SEO_ELIGIBLE_PAGE_KEYS) {
      assert.equal(isAccountIntroSeoEligibleRoute(pageKey), true, `${pageKey} should be eligible`);
    }
  });

  await test("Case 2 (SEO eligibility): every interactive app page, the dev-only placeholder, and notFound are all ineligible", () => {
    for (const pageKey of NON_ELIGIBLE_PAGE_KEYS) {
      assert.equal(isAccountIntroSeoEligibleRoute(pageKey), false, `${pageKey} should not be eligible`);
    }
  });

  console.log("\n[2c] SEO active-time math - computeAccountIntroSeoActiveTotalMs / foldAccountIntroSeoActiveSegment / hasAccountIntroSeoActiveTimeReachedThreshold");

  const SECOND_MS = 1000;

  await test("ACCOUNT_INTRO_SEO_ACTIVE_TIME_THRESHOLD_MS is exactly 60 seconds, defined as a single named constant", () => {
    assert.equal(ACCOUNT_INTRO_SEO_ACTIVE_TIME_THRESHOLD_MS, 60 * SECOND_MS);
  });

  await test("Case 12: 59,999ms accumulated -> threshold not reached", () => {
    assert.equal(hasAccountIntroSeoActiveTimeReachedThreshold(59_999), false);
  });

  await test("Case 13: exactly 60,000ms accumulated -> threshold reached", () => {
    assert.equal(hasAccountIntroSeoActiveTimeReachedThreshold(60_000), true);
  });

  await test("computeAccountIntroSeoActiveTotalMs: live total is the persisted baseline plus the running segment's real elapsed time (timestamp math, not tick-counting)", () => {
    assert.equal(
      computeAccountIntroSeoActiveTotalMs({
        accumulatedMs: 20_000,
        activeSegmentStartedAtMs: NOW - 15_000,
        nowMs: NOW,
      }),
      35_000,
    );
  });

  await test("computeAccountIntroSeoActiveTotalMs: no running segment -> total is just the persisted baseline", () => {
    assert.equal(
      computeAccountIntroSeoActiveTotalMs({
        accumulatedMs: 42_000,
        activeSegmentStartedAtMs: null,
        nowMs: NOW,
      }),
      42_000,
    );
  });

  await test("Case 5: SEO A 30s + SEO B 30s -> 60s total, threshold reached (a single continuous segment spanning both pages)", () => {
    // "The timer must not reset on every SEO route change" - modeled here as
    // one segment (the effect never restarts on an eligible -> eligible
    // transition - see section [5b] below), so this is really just
    // computeAccountIntroSeoActiveTotalMs/foldAccountIntroSeoActiveSegment
    // applied to a single 60s elapsed span.
    const result = foldAccountIntroSeoActiveSegment({
      previousAccumulatedMs: 0,
      elapsedSegmentMs: 60_000,
      isWithinCooldown: false,
    });
    assert.equal(result.nextAccumulatedMs, 60_000);
    assert.equal(result.hasReachedThreshold, true);
  });

  await test("Case 6: SEO A 30s + non-SEO 20s + SEO B 30s -> trigger at 60 cumulative SEO seconds (the non-SEO interval contributes nothing but doesn't erase what came before)", () => {
    const afterSeoA = foldAccountIntroSeoActiveSegment({
      previousAccumulatedMs: 0,
      elapsedSegmentMs: 30_000,
      isWithinCooldown: false,
    });
    assert.equal(afterSeoA.nextAccumulatedMs, 30_000);
    assert.equal(afterSeoA.hasReachedThreshold, false);
    // The 20s on a non-SEO page never becomes a fold() call at all - no
    // segment runs there, so accumulatedMs is untouched at 30_000.
    const afterSeoB = foldAccountIntroSeoActiveSegment({
      previousAccumulatedMs: afterSeoA.nextAccumulatedMs,
      elapsedSegmentMs: 30_000,
      isWithinCooldown: false,
    });
    assert.equal(afterSeoB.nextAccumulatedMs, 60_000);
    assert.equal(afterSeoB.hasReachedThreshold, true);
  });

  await test("Case 7/8: SEO A 20s + SEO B 20s + SEO C 20s -> trigger, and each route change only adds - never resets - progress", () => {
    let accumulatedMs = 0;
    for (const pageSeconds of [20_000, 20_000, 20_000]) {
      const result = foldAccountIntroSeoActiveSegment({
        previousAccumulatedMs: accumulatedMs,
        elapsedSegmentMs: pageSeconds,
        isWithinCooldown: false,
      });
      assert.ok(result.nextAccumulatedMs >= accumulatedMs, "progress must never move backward on a route change");
      accumulatedMs = result.nextAccumulatedMs;
    }
    assert.equal(accumulatedMs, 60_000);
    assert.equal(hasAccountIntroSeoActiveTimeReachedThreshold(accumulatedMs), true);
  });

  await test("Case 9/Example C: visible 30s + hidden 60s + visible 30s -> only the 2 visible segments (60s) are ever folded in", () => {
    // The hidden 60s never produces a fold() call at all (no segment runs
    // while hidden - see section [5b]'s startActiveSegmentIfPossible check)
    // - modeled here as simply never folding anything for it.
    const afterFirstVisible = foldAccountIntroSeoActiveSegment({
      previousAccumulatedMs: 0,
      elapsedSegmentMs: 30_000,
      isWithinCooldown: false,
    });
    const afterSecondVisible = foldAccountIntroSeoActiveSegment({
      previousAccumulatedMs: afterFirstVisible.nextAccumulatedMs,
      elapsedSegmentMs: 30_000,
      isWithinCooldown: false,
    });
    assert.equal(afterSecondVisible.nextAccumulatedMs, 60_000);
    assert.equal(afterSecondVisible.hasReachedThreshold, true);
  });

  await test("Case 10: hidden time alone (no fold ever called for it) never reaches the threshold", () => {
    // There is no pure-function equivalent of "hidden time" to fold - by
    // design, hidden time never produces a call to fold at all. This is
    // exactly what guarantees it can't reach the threshold: the accumulator
    // simply never moves while hidden.
    assert.equal(hasAccountIntroSeoActiveTimeReachedThreshold(0), false);
  });

  await test("Case 4/18/19 (cooldown interaction): folding while the cooldown is active always resets to 0, regardless of how much was previously accumulated - a fresh 60s is required after it expires", () => {
    const foldedDuringCooldown = foldAccountIntroSeoActiveSegment({
      previousAccumulatedMs: 59_000, // right at the edge of firing
      elapsedSegmentMs: 5_000,
      isWithinCooldown: true,
    });
    assert.equal(foldedDuringCooldown.nextAccumulatedMs, 0);
    assert.equal(foldedDuringCooldown.hasReachedThreshold, false);

    // Once the cooldown has expired, accumulation starts fresh at 0 - not at
    // the 59_000 that was building up before the cooldown began - so 30s
    // more is nowhere near enough on its own.
    const afterCooldownExpired = foldAccountIntroSeoActiveSegment({
      previousAccumulatedMs: foldedDuringCooldown.nextAccumulatedMs,
      elapsedSegmentMs: 30_000,
      isWithinCooldown: false,
    });
    assert.equal(afterCooldownExpired.nextAccumulatedMs, 30_000);
    assert.equal(afterCooldownExpired.hasReachedThreshold, false);
  });

  console.log("\n[3] accountIntroStorage.ts - behavioral tests against a fake Storage");

  // Fresh fake storages per test file run, installed before the module's
  // functions are first invoked (they read `window` lazily inside function
  // bodies, not at import time, so import order doesn't matter here).
  globalThis.window = globalThis.window ?? {};
  globalThis.window.localStorage = new FakeStorage();
  globalThis.window.sessionStorage = new FakeStorage();

  const {
    markAccountIntroShown,
    readAccountIntroLastShownAtMs,
    readAccountIntroSeoActiveMs,
    writeAccountIntroSeoActiveMs,
  } = await import("../../../src/app/utils/accountIntroStorage.ts");

  await test("Case 1: no stored value -> readAccountIntroLastShownAtMs returns null (never shown)", () => {
    window.localStorage.clear();
    assert.equal(readAccountIntroLastShownAtMs(), null);
  });

  await test("Case 2/16: marking shown writes the current instant, and it round-trips through a fresh read (survives page refresh/browser restart, since it's localStorage not sessionStorage)", () => {
    window.localStorage.clear();
    markAccountIntroShown(NOW);
    // A fresh read call - simulating a brand-new page load reading the same
    // localStorage - must see the same value markAccountIntroShown wrote.
    assert.equal(readAccountIntroLastShownAtMs(), NOW);
  });

  await test("the timestamp is namespaced under fluentstellar.accountIntro.lastShownAt, not a generic key, and is a plain millisecond number (not an object/JSON blob)", () => {
    window.localStorage.clear();
    markAccountIntroShown(NOW);
    const raw = window.localStorage.getItem("fluentstellar.accountIntro.lastShownAt");
    assert.equal(raw, String(NOW));
  });

  await test("Case 13: malformed/corrupt/non-numeric stored timestamps are treated as null (never shown) rather than throwing", () => {
    for (const corruptValue of ["not-a-number", "", "NaN", "Infinity", "{}", "[1,2,3]"]) {
      window.localStorage.clear();
      window.localStorage.setItem("fluentstellar.accountIntro.lastShownAt", corruptValue);
      assert.doesNotThrow(() => readAccountIntroLastShownAtMs());
      assert.equal(readAccountIntroLastShownAtMs(), null, `expected null for corrupt value ${JSON.stringify(corruptValue)}`);
    }
  });

  await test("Case 14: the two legacy keys from the superseded session-cap / permanent-per-context policy are never read - their presence (even with truthy-looking data) has no bearing on the cooldown", () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    // Simulate a returning visitor whose browser still has the old
    // permanent "shown forever" record and old session flag set, but has
    // never written the new lastShownAt key.
    window.localStorage.setItem(
      "fluentstellar.accountIntro.shown.v1",
      JSON.stringify({ practiceComplete: true, levelTestComplete: true }),
    );
    window.sessionStorage.setItem("fluentstellar.accountIntro.session", "1");
    assert.equal(readAccountIntroLastShownAtMs(), null, "legacy keys must not be read as a cooldown timestamp");
  });

  await test("Case 14 (continued): marking shown best-effort clears both legacy keys so they don't linger forever", () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("fluentstellar.accountIntro.shown.v1", "{}");
    window.sessionStorage.setItem("fluentstellar.accountIntro.session", "1");
    markAccountIntroShown(NOW);
    assert.equal(window.localStorage.getItem("fluentstellar.accountIntro.shown.v1"), null);
    assert.equal(window.sessionStorage.getItem("fluentstellar.accountIntro.session"), null);
  });

  await test("storage helpers never throw and fail safe (return null / no-op) when window storage is unavailable", () => {
    const savedWindow = globalThis.window;
    // Simulate SSR/prerendering (no window) as well as a window with no
    // storage APIs (private-browsing style failure) - both are real
    // conditions canUseLocalStorage()/canUseSessionStorage() guard against.
    globalThis.window = undefined;
    assert.doesNotThrow(() => readAccountIntroLastShownAtMs());
    assert.equal(readAccountIntroLastShownAtMs(), null);
    assert.doesNotThrow(() => markAccountIntroShown(NOW));
    globalThis.window = savedWindow;
  });

  await test("Case 22 (SEO): no stored value -> readAccountIntroSeoActiveMs returns 0 (represents a freshly-closed/never-started session)", () => {
    window.sessionStorage.clear();
    assert.equal(readAccountIntroSeoActiveMs(), 0);
  });

  await test("Case 20 (SEO): writing the counter round-trips through a fresh read, and writing 0 genuinely resets it back down", () => {
    window.sessionStorage.clear();
    writeAccountIntroSeoActiveMs(45_000);
    assert.equal(readAccountIntroSeoActiveMs(), 45_000);
    writeAccountIntroSeoActiveMs(0);
    assert.equal(readAccountIntroSeoActiveMs(), 0);
  });

  await test("the SEO counter is namespaced under fluentstellar.accountIntro.seoActiveMs, stored under sessionStorage specifically (not localStorage - it must not survive a closed tab/browser restart)", () => {
    window.sessionStorage.clear();
    writeAccountIntroSeoActiveMs(12_345);
    assert.equal(window.sessionStorage.getItem("fluentstellar.accountIntro.seoActiveMs"), "12345");
    assert.equal(window.localStorage.getItem("fluentstellar.accountIntro.seoActiveMs"), null);
  });

  await test("Case 22 (continued): a brand-new sessionStorage instance (representing a closed tab/browser) reads back as 0, independent of whatever the old session had accumulated", () => {
    const previousSessionStorage = window.sessionStorage;
    previousSessionStorage.clear();
    writeAccountIntroSeoActiveMs(58_000);
    assert.equal(readAccountIntroSeoActiveMs(), 58_000);

    // Simulate the browser/tab actually closing: sessionStorage is replaced
    // with a fresh, empty instance (this is exactly what a new session looks
    // like - nothing carries over from the old one).
    window.sessionStorage = new FakeStorage();
    assert.equal(readAccountIntroSeoActiveMs(), 0);
    window.sessionStorage = previousSessionStorage;
  });

  await test("malformed/corrupt/negative stored SEO counters are treated as 0 rather than throwing", () => {
    for (const corruptValue of ["not-a-number", "", "NaN", "-500", "Infinity", "{}"]) {
      window.sessionStorage.clear();
      window.sessionStorage.setItem("fluentstellar.accountIntro.seoActiveMs", corruptValue);
      assert.doesNotThrow(() => readAccountIntroSeoActiveMs());
      assert.equal(readAccountIntroSeoActiveMs(), 0, `expected 0 for corrupt value ${JSON.stringify(corruptValue)}`);
    }
  });

  await test("writeAccountIntroSeoActiveMs never throws when sessionStorage is unavailable (SSR/private browsing)", () => {
    const savedWindow = globalThis.window;
    globalThis.window = undefined;
    assert.doesNotThrow(() => readAccountIntroSeoActiveMs());
    assert.equal(readAccountIntroSeoActiveMs(), 0);
    assert.doesNotThrow(() => writeAccountIntroSeoActiveMs(1000));
    globalThis.window = savedWindow;
  });

  const accountIntroStorageSource = readFile("src/app/utils/accountIntroStorage.ts");

  await test("no runtime import of accountIntroPolicy.ts from the storage module (both stay independently loadable/testable)", () => {
    assert.doesNotMatch(accountIntroStorageSource, /from "\.\/accountIntroPolicy"/);
  });

  await test("the superseded per-context storage functions no longer exist anywhere in the module", () => {
    for (const removedName of [
      "hasAccountIntroShownThisSession",
      "markAccountIntroShownThisSession",
      "hasAccountIntroContextBeenShown",
      "markAccountIntroContextShown",
    ]) {
      assert.doesNotMatch(accountIntroStorageSource, new RegExp(removedName));
    }
  });

  console.log("\n[4] useStoredAppPreferences.ts - first-time detection wiring (module-boundary tradeoff, see file header)");

  const storedPrefsSource = readFile("src/app/hooks/useStoredAppPreferences.ts");

  await test("imports hasCompleteLanguagePair from the shared language-pair policy (no reimplementation)", () => {
    assert.match(
      storedPrefsSource,
      /import \{ hasCompleteLanguagePair \} from "\.\.\/utils\/languageProfileSyncPolicy"/,
    );
  });

  await test("captures hadCompleteStoredLanguagePairAtLoadRef from the raw persisted read, before the restoreStoredLanguage save-affecting section", () => {
    const refAssignmentIndex = storedPrefsSource.indexOf(
      "hadCompleteStoredLanguagePairAtLoadRef.current = hasCompleteLanguagePair(",
    );
    const restoreGateIndex = storedPrefsSource.indexOf(
      "const restoreStoredLanguage = shouldRestoreStoredLanguagePreference(",
    );
    assert.ok(refAssignmentIndex !== -1, "ref assignment not found");
    assert.ok(restoreGateIndex !== -1, "restoreStoredLanguage gate not found");
    assert.ok(
      refAssignmentIndex < restoreGateIndex,
      "first-time detection must be captured before any state-restoring/saving logic runs",
    );
  });

  await test("the ref is seeded from persistedYourLanguage/persistedPracticeLanguage, not from live yourLanguage/practiceLanguage state", () => {
    const match = storedPrefsSource.match(
      /hadCompleteStoredLanguagePairAtLoadRef\.current = hasCompleteLanguagePair\(\{([\s\S]*?)\}\);/,
    );
    assert.ok(match, "could not locate the ref assignment body");
    assert.match(match[1], /persistedYourLanguage/);
    assert.match(match[1], /persistedPracticeLanguage/);
  });

  console.log("\n[5] useAccountIntroPopup.ts wiring - source-text checks (module-boundary tradeoff, see file header)");

  const popupHookSource = readFile("src/app/hooks/useAccountIntroPopup.ts");

  await test("consumes the router-state signal via a `replace` navigation with state cleared to null (language-setup only)", () => {
    const match = popupHookSource.match(/navigate\(`\$\{location\.pathname\}\$\{location\.search\}`, \{([\s\S]*?)\}\);/);
    assert.ok(match, "could not locate the consuming navigate() call");
    assert.match(match[1], /replace: true/);
    assert.match(match[1], /state: null/);
  });

  await test("Case 6/21-consumption: the consuming navigate() call is unconditional on resolvedPage/signal alone - independent of auth status", () => {
    const match = popupHookSource.match(
      /\}, \[resolvedPage, location\.pathname, location\.search, location\.state, navigate\]\);/,
    );
    assert.ok(match, "consuming effect's dependency array does not match the expected auth-independent shape");
  });

  await test("only opens via shouldShowAccountIntro (the shared pure policy), not a reimplemented condition", () => {
    assert.match(popupHookSource, /import \{[\s\S]*?shouldShowAccountIntro[\s\S]*?\} from "\.\.\/utils\/accountIntroPolicy"/);
    assert.match(popupHookSource, /shouldShowAccountIntro\(\{/);
  });

  await test("Case 23: an eligible trigger arriving before auth resolves is preserved, not discarded", () => {
    const match = popupHookSource.match(/useEffect\(\(\) => \{\n(\s*)if \(!pendingContext \|\| !isAuthResolved\) \{\n\s*return;\n\s*\}\n([\s\S]*?)\n {2}\}, \[pendingContext, isAuthResolved, authUserId\]\);/);
    assert.ok(match, "could not locate the evaluation effect with the expected early-return guard");
    // setPendingContext(null) must come AFTER the early-return guard, not
    // before it - otherwise an unresolved trigger would be cleared instead
    // of preserved.
    assert.doesNotMatch(match[1] ?? "", /setPendingContext/);
  });

  await test("Case 11/12: markAccountIntroShown only appears after the shouldShow guard - never before it, never unconditionally (an eligible-but-suppressed trigger, or an authenticated one, never writes the timestamp)", () => {
    const match = popupHookSource.match(/if \(!shouldShow\) \{\n\s*return;\n\s*\}\n([\s\S]*?)\n {2}\}, \[pendingContext, isAuthResolved, authUserId\]\);/);
    assert.ok(match, "could not locate the post-shouldShow-guard branch");
    assert.match(match[1], /markAccountIntroShown\(nowMs\)/);
    // And confirm the mark call never appears anywhere earlier in the effect
    // (i.e. not before the `if (!shouldShow) return;` guard).
    const guardIndex = popupHookSource.indexOf("if (!shouldShow) {");
    const markIndex = popupHookSource.indexOf("markAccountIntroShown(nowMs)");
    assert.ok(guardIndex !== -1 && markIndex !== -1);
    assert.ok(markIndex > guardIndex, "marking must only happen after the shouldShow guard");
  });

  await test("Case 10: the cooldown timestamp is written unconditionally once shouldShow is true - dismissing the popup afterward cannot undo it (the write already happened at open time, not on any later user action)", () => {
    const match = popupHookSource.match(/if \(!shouldShow\) \{\n\s*return;\n\s*\}\n([\s\S]*?)setIsOpen\(true\);/);
    assert.ok(match, "could not locate the open branch");
    assert.match(match[1], /markAccountIntroShown\(nowMs\);/);
  });

  await test("nowMs is captured once per evaluation (Date.now()) and reused for both the policy check and the write - not read twice", () => {
    const occurrences = (popupHookSource.match(/Date\.now\(\)/g) ?? []).length;
    assert.equal(occurrences, 1, `expected exactly one Date.now() call, found ${occurrences}`);
    assert.match(popupHookSource, /const nowMs = Date\.now\(\);/);
  });

  await test("requestAccountIntro only records the pending context - it never marks anything shown itself (marking happens solely in the evaluation effect above)", () => {
    const match = popupHookSource.match(/const requestAccountIntro = useCallback\(\s*\n?\s*\(requestedContext: RequestableAccountIntroContext\) => \{([\s\S]*?)\},\s*\n\s*\[\],?\s*\n?\s*\);/);
    assert.ok(match, "could not locate requestAccountIntro");
    assert.doesNotMatch(match[1], /markAccountIntro/);
    assert.match(match[1], /setPendingContext\(requestedContext\)/);
  });

  await test("Case 4/10: close() only closes the dialog - it never touches pendingContext/storage (dismissal never un-marks a popup that already opened, and never immediately reopens one)", () => {
    const match = popupHookSource.match(/const close = useCallback\(([\s\S]*?)\[\]\);/);
    assert.ok(match, "could not locate close()");
    assert.doesNotMatch(match[1], /setPendingContext/);
    assert.doesNotMatch(match[1], /markAccountIntro/);
  });

  await test("the superseded session-cap/permanent-per-context functions and RequestableAccountIntroContext's predecessor type are gone from this hook", () => {
    for (const removedName of [
      "hasAccountIntroShownThisSession",
      "markAccountIntroShownThisSession",
      "hasAccountIntroContextBeenShown",
      "markAccountIntroContextShown",
      "PersistedAccountIntroContext",
      "hasAnyAccountIntroShownThisSession",
      "hasThisContextBeenShownBefore",
    ]) {
      assert.doesNotMatch(popupHookSource, new RegExp(removedName));
    }
  });

  console.log("\n[5b] useAccountIntroSeoEngagement.ts wiring - source-text checks (module-boundary tradeoff, see file header)");

  const seoEngagementSource = readFile("src/app/hooks/useAccountIntroSeoEngagement.ts");

  await test("useAccountIntroPopup.ts required zero changes to support seo-engagement (it was already fully context-agnostic)", () => {
    assert.doesNotMatch(popupHookSource, /seo-engagement/);
    assert.doesNotMatch(popupHookSource, /Seo/);
  });

  await test("Case 2/8: eligibility is derived from isAccountIntroSeoEligibleRoute + auth state, and the tracking effect depends only on that derived boolean (not on resolvedPage itself) - so an eligible SEO page -> eligible SEO page navigation never restarts the segment", () => {
    assert.match(
      seoEngagementSource,
      /const isEligibleNow =\s*\n\s*isAccountIntroSeoEligibleRoute\(resolvedPage\) &&\s*\n\s*isAuthResolved &&\s*\n\s*!authUserId;/,
    );
    assert.match(seoEngagementSource, /\}, \[isEligibleNow, requestAccountIntro\]\);/);
  });

  await test("Case 3: an authenticated visitor is excluded from isEligibleNow, so accumulation never starts for them (not merely never shown)", () => {
    assert.match(seoEngagementSource, /!authUserId/);
  });

  await test("uses the Page Visibility API (visibilitychange + document.visibilityState), not a naive setTimeout(60000)", () => {
    assert.match(seoEngagementSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
    assert.match(seoEngagementSource, /document\.visibilityState/);
    assert.doesNotMatch(seoEngagementSource, /setTimeout\(/);
  });

  await test("Case 11: starting a segment is guarded so it can never start twice (activeSegmentStartedAtRef.current === null check) - visibility transitions can't double-count", () => {
    assert.match(
      seoEngagementSource,
      /if \(activeSegmentStartedAtRef\.current === null\) \{\s*\n\s*activeSegmentStartedAtRef\.current = Date\.now\(\);/,
    );
  });

  await test("Case 14: requestAccountIntro(\"seo-engagement\") is guarded by hasRequestedRef - a threshold crossing can only ever request once until reset", () => {
    assert.match(
      seoEngagementSource,
      /function requestIfThresholdReached\(hasReachedThreshold: boolean\): void \{\s*\n\s*if \(hasReachedThreshold && !hasRequestedRef\.current\) \{\s*\n\s*hasRequestedRef\.current = true;\s*\n\s*requestAccountIntro\("seo-engagement"\);/,
    );
  });

  await test("the 1-second interval only checks the threshold via real timestamp math (computeAccountIntroSeoActiveTotalMs) - it never itself increments a counter per tick", () => {
    const tickMatch = seoEngagementSource.match(/function checkTick\(\): void \{([\s\S]*?)\n    \}/);
    assert.ok(tickMatch, "could not locate checkTick");
    assert.match(tickMatch[1], /computeAccountIntroSeoActiveTotalMs\(/);
    assert.doesNotMatch(tickMatch[1], /accumulatedMsRef\.current \+=/);
    assert.doesNotMatch(tickMatch[1], /accumulatedMsRef\.current\+\+/);
  });

  await test("Case 4/18/19 (cooldown): every point that could start or fold a segment first checks isWithinAccountIntroCooldown and resets (not merely skips) the accumulator when active", () => {
    const occurrences = (seoEngagementSource.match(/isCurrentlyWithinCooldown\(\)/g) ?? []).length;
    assert.ok(occurrences >= 3, `expected the cooldown check in at least 3 places (segment-start, segment-end, periodic tick), found ${occurrences}`);
    assert.match(seoEngagementSource, /function resetForCooldown\(\): void \{/);
  });

  await test("Case 20: the counter resets specifically when this trigger's own popup actually opens (isOpen && context === \"seo-engagement\"), not merely when threshold is reached", () => {
    const match = seoEngagementSource.match(/useEffect\(\(\) => \{\s*\n\s*if \(isOpen && context === "seo-engagement"\) \{([\s\S]*?)\n {4}\}\s*\n {2}\}, \[isOpen, context\]\);/);
    assert.ok(match, "could not locate the isOpen/context reset effect");
    assert.match(match[1], /accumulatedMsRef\.current = 0;/);
    assert.match(match[1], /writeAccountIntroSeoActiveMs\(0\);/);
    assert.match(match[1], /hasRequestedRef\.current = false;/);
  });

  await test("cleans up its listener and interval on every effect teardown (route change away from an eligible page, or unmount)", () => {
    const match = seoEngagementSource.match(/return \(\) => \{([\s\S]*?)\n    \};\s*\n {2}\}, \[isEligibleNow, requestAccountIntro\]\);/);
    assert.ok(match, "could not locate the tracking effect's cleanup function");
    assert.match(match[1], /document\.removeEventListener\("visibilitychange", handleVisibilityChange\)/);
    assert.match(match[1], /window\.clearInterval\(intervalId\)/);
  });

  await test("only ever calls requestAccountIntro with the literal \"seo-engagement\" context (matches RequestableAccountIntroContext)", () => {
    const calls = seoEngagementSource.match(/requestAccountIntro\("[^"]*"\)/g) ?? [];
    assert.ok(calls.length > 0, "expected at least one requestAccountIntro call");
    for (const call of calls) {
      assert.equal(call, 'requestAccountIntro("seo-engagement")');
    }
  });

  console.log("\n[6] Header.tsx wiring - reuses the existing login/signup dialog (module-boundary tradeoff, see file header)");

  const headerSource = readFile("src/app/components/layout/Header.tsx");

  await test("requestedAuthMode effect calls the existing openLoginDialog/openSignupDialog functions, not a new auth UI", () => {
    const match = headerSource.match(/useEffect\(\(\) => \{\n    if \(!requestedAuthMode\) \{([\s\S]*?)\n  \}, \[requestedAuthMode\]\);/);
    assert.ok(match, "could not locate the requestedAuthMode effect");
    assert.match(match[1], /openSignupDialog\(\)/);
    assert.match(match[1], /openLoginDialog\(\)/);
    assert.match(match[1], /onAuthActionRequestHandled\?\.\(\)/);
  });

  console.log("\n[7] useAuthSession.ts - auth-resolved flag (guards against flashing the popup for a signed-in user)");

  const authSessionSource = readFile("src/app/hooks/useAuthSession.ts");

  await test("isAuthResolved starts false and flips true only from within the storage-read mount effect", () => {
    assert.match(authSessionSource, /const \[isAuthResolved, setIsAuthResolved\] = useState\(false\)/);
    const match = authSessionSource.match(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/);
    assert.ok(match, "could not locate the mount effect");
    assert.match(match[1], /setIsAuthResolved\(true\)/);
  });

  await test("isAuthResolved is exposed from the hook's return value", () => {
    assert.match(authSessionSource, /return \{[\s\S]*?isAuthResolved,[\s\S]*?\};/);
  });

  console.log("\n[8] VocabularyPractice.tsx - onSessionComplete fires only at genuine session completion (module-boundary tradeoff, see file header)");

  const practiceSource = readFile("src/features/practice/VocabularyPractice.tsx");

  await test("Case 4/5/6/7: onSessionComplete?.() appears exactly twice - immediately after each of the two real setSessionComplete(true) call sites", () => {
    const callSites = [...practiceSource.matchAll(/setSessionComplete\(true\);\n(\s*)(onSessionComplete\?\.\(\);)?/g)];
    assert.equal(callSites.length, 2, "expected exactly 2 setSessionComplete(true) call sites");
    for (const match of callSites) {
      assert.ok(match[2], "every setSessionComplete(true) call site must be immediately followed by onSessionComplete?.()");
    }
    // And it must not appear anywhere else in the file (e.g. handleStartAgain,
    // onBack/onGoFilters, or any exit/error path) - exactly 2 occurrences.
    const totalOccurrences = (practiceSource.match(/onSessionComplete\?\.\(\)/g) ?? []).length;
    assert.equal(totalOccurrences, 2);
  });

  await test("Case 6: onSessionComplete is never referenced inside handleStartAgain (Practice Again resets, it does not complete)", () => {
    const match = practiceSource.match(/const handleStartAgain = \(\) => \{([\s\S]*?)\n  \};/);
    assert.ok(match, "could not locate handleStartAgain");
    assert.doesNotMatch(match[1], /onSessionComplete/);
    assert.match(match[1], /setSessionComplete\(false\)/);
  });

  await test("onSessionComplete is declared as an optional, side-effect-free prop (VocabularyPractice owns no auth/anonymous logic itself)", () => {
    assert.match(practiceSource, /onSessionComplete\?: \(\) => void;/);
  });

  console.log("\n[9] VocabularyLevelExam.tsx - onExamComplete fires only at genuine test completion, after a result exists (module-boundary tradeoff, see file header)");

  const examSource = readFile("src/app/pages/VocabularyLevelExam.tsx");

  await test("Case 9/10/11/12/13/14: onExamComplete?.() appears exactly twice - immediately after each of the two real setExamComplete(true) call sites, each already preceded by setFinalLevel (result available first)", () => {
    const completionBlock = examSource.match(
      /\/\/ Completed all levels!\n(\s*)setFinalLevel\(LEVELS\[currentLevel\]\);\n\s*setExamComplete\(true\);\n\s*onExamComplete\?\.\(\);/,
    );
    assert.ok(completionBlock, "moveToNextQuestion's completion branch must set finalLevel, then examComplete, then call onExamComplete?.()");

    const endExamBlock = examSource.match(
      /const endExam = \(\) => \{[\s\S]*?setFinalLevel\(completedLevel\);\n\s*setExamComplete\(true\);\n\s*onExamComplete\?\.\(\);\n\s*\};/,
    );
    assert.ok(endExamBlock, "endExam() must set finalLevel, then examComplete, then call onExamComplete?.()");

    const totalOccurrences = (examSource.match(/onExamComplete\?\.\(\)/g) ?? []).length;
    assert.equal(totalOccurrences, 2);
  });

  await test("Case 11: onExamComplete is never referenced in the exit/abandon path (handleRequestCancel, isExitDialogOpen, onCancel)", () => {
    const cancelMatch = examSource.match(/const handleRequestCancel = \(\) => \{([\s\S]*?)\n  \};/);
    assert.ok(cancelMatch, "could not locate handleRequestCancel");
    assert.doesNotMatch(cancelMatch[1], /onExamComplete/);
    // AlertDialog's onCancel wiring (the actual "Leave test" action) never
    // mentions onExamComplete either.
    const exitDialogRegion = examSource.slice(examSource.indexOf("isExitDialogOpen} onOpenChange"));
    assert.ok(exitDialogRegion.length > 0);
    assert.doesNotMatch(exitDialogRegion.slice(0, 800), /onExamComplete/);
  });

  await test("onExamComplete is declared as an optional, side-effect-free prop distinct from onComplete (which only fires later, on Start practicing)", () => {
    assert.match(examSource, /onExamComplete\?: \(\) => void;/);
    assert.match(examSource, /onComplete: \(level: string\) => void;/);
  });

  console.log("\n[10] App.tsx wiring - all 4 triggers share one dialog instance (module-boundary tradeoff, see file header)");

  const appSource = readFile("src/app/App.tsx");

  await test("imports and wires useAccountIntroPopup", () => {
    assert.match(appSource, /import \{ useAccountIntroPopup \} from "\.\/hooks\/useAccountIntroPopup"/);
    assert.match(appSource, /useAccountIntroPopup\(\{/);
  });

  await test("imports and wires useAccountIntroSeoEngagement, fed by the same accountIntroPopup instance (isOpen/context/requestAccountIntro)", () => {
    assert.match(
      appSource,
      /import \{ useAccountIntroSeoEngagement \} from "\.\/hooks\/useAccountIntroSeoEngagement"/,
    );
    const match = appSource.match(/useAccountIntroSeoEngagement\(\{([\s\S]*?)\n {2}\}\);/);
    assert.ok(match, "could not locate the useAccountIntroSeoEngagement call");
    assert.match(match[1], /resolvedPage,/);
    assert.match(match[1], /isAuthResolved,/);
    assert.match(match[1], /authUserId,/);
    assert.match(match[1], /isOpen: accountIntroPopup\.isOpen,/);
    assert.match(match[1], /context: accountIntroPopup\.context,/);
    assert.match(match[1], /requestAccountIntro: accountIntroPopup\.requestAccountIntro,/);
  });

  await test("defines exactly one shared accountIntroDialog element (not a separate modal per trigger)", () => {
    const match = appSource.match(/const accountIntroDialog = \(\n([\s\S]*?)\n {2}\);/);
    assert.ok(match, "could not locate the shared accountIntroDialog JSX constant");
    assert.match(match[1], /<AccountIntroDialog/);
    assert.match(match[1], /context=\{accountIntroPopup\.context\}/);
    assert.match(match[1], /onCreateAccount=\{handleAccountIntroCreateAccount\}/);
    assert.match(match[1], /onLogIn=\{handleAccountIntroLogIn\}/);
  });

  await test("Case 2/8: the shared dialog is rendered on literally every page (not just the original 3) - seo-engagement can request it while the user is on any route, including one it just navigated away from an eligible SEO page to", () => {
    const onboardingOccurrences = (appSource.match(/\{accountOnboardingDialog\}/g) ?? []).length;
    const introOccurrences = (appSource.match(/\{accountIntroDialog\}/g) ?? []).length;
    assert.ok(onboardingOccurrences > 3, "sanity check: the existing shared dialogs should appear on many pages");
    assert.equal(
      introOccurrences,
      onboardingOccurrences,
      `accountIntroDialog must be rendered everywhere accountOnboardingDialog is (found ${introOccurrences} vs ${onboardingOccurrences})`,
    );
  });

  await test("all 8 SEO PageKey page blocks specifically render {accountIntroDialog} (vocabularyLevel, levelTestSeo, verbListSeo, pastVerbFormsSeo, conjugatedVerbFormsSeo, seoHub, wordSeoHub, wordPage)", () => {
    const seoPageKeys = [
      "vocabularyLevel",
      "levelTestSeo",
      "verbListSeo",
      "pastVerbFormsSeo",
      "conjugatedVerbFormsSeo",
      "seoHub",
      "wordSeoHub",
      "wordPage",
    ];
    const blockStarts = [];
    const lines = appSource.split("\n");
    lines.forEach((line, index) => {
      const match = line.match(/resolvedPage === "(\w+)"/);
      if (match && seoPageKeys.includes(match[1])) {
        blockStarts.push([index, match[1]]);
      }
    });
    assert.equal(blockStarts.length, seoPageKeys.length, "expected exactly one resolvedPage branch per SEO PageKey");

    // Find where the NEXT top-level resolvedPage branch (any PageKey) starts,
    // to know where each SEO block ends.
    const allBranchLines = [];
    lines.forEach((line, index) => {
      if (/^\s*if \(resolvedPage === "\w+"\) \{/.test(line)) {
        allBranchLines.push(index);
      }
    });

    for (const [startLine, pageKey] of blockStarts) {
      const nextBranchLine = allBranchLines.find((line) => line > startLine) ?? lines.length;
      const block = lines.slice(startLine, nextBranchLine).join("\n");
      assert.match(block, /\{accountIntroDialog\}/, `${pageKey}'s branch must render {accountIntroDialog}`);
    }
  });

  // The Languages page's Continue click no longer attaches the router-state
  // showAccountIntro signal (superseded by the LanguageAccountChoiceDialog
  // gate below, which decides and acts synchronously, before navigating,
  // instead of signaling AccountIntroDialog to open after arrival on the
  // Filters page). useAccountLanguageConfirm's proceed() now simply
  // delegates to languageAccountChoice.attemptProceed().
  await test("the Languages-page Continue's proceed() callback delegates to languageAccountChoice.attemptProceed()", () => {
    const match = appSource.match(/proceed: \(\) => languageAccountChoice\.attemptProceed\(\),/);
    assert.ok(match, "expected useAccountLanguageConfirm's proceed to delegate to languageAccountChoice.attemptProceed()");
  });

  await test("no showAccountIntro router-state signal remains anywhere in App.tsx", () => {
    assert.doesNotMatch(appSource, /showAccountIntro/);
  });

  console.log("\n[10b] LanguageAccountChoiceDialog - the Languages-page Continue-time Create account / Log in / Continue as guest gate");

  const languageAccountChoiceHookSource = readFile("src/app/hooks/useLanguageAccountChoice.ts");
  const languageAccountChoiceDialogSource = readFile(
    "src/app/components/dialogs/LanguageAccountChoiceDialog.tsx",
  );

  await test("useLanguageAccountChoice decides eligibility via shouldSignalAccountIntro and the shared cooldown, using the pre-save ref", () => {
    const match = languageAccountChoiceHookSource.match(/const attemptProceed = \(\) => \{([\s\S]*?)\n  \};/);
    assert.ok(match, "could not locate attemptProceed()");
    assert.match(match[1], /shouldSignalAccountIntro\(/);
    assert.match(match[1], /isWithinAccountIntroCooldown\(/);
    assert.match(match[1], /readAccountIntroLastShownAtMs\(\)/);
  });

  await test("App.tsx wires useLanguageAccountChoice with the same isAuthenticated/pre-save-ref inputs the old signal used", () => {
    const match = appSource.match(/const languageAccountChoice = useLanguageAccountChoice\(\{([\s\S]*?)\n  \}\);/);
    assert.ok(match, "could not locate the useLanguageAccountChoice(...) call");
    assert.match(match[1], /isAuthenticated: Boolean\(authUserId\)/);
    assert.match(match[1], /hadCompleteStoredLanguagePairAtLoadRef\.current/);
  });

  await test("Create account / Log in / Continue as guest all navigate to the Filters page exactly once; only Create account / Log in also request Header's auth dialog", () => {
    const match = appSource.match(/const languageAccountChoice = useLanguageAccountChoice\(\{([\s\S]*?)\n  \}\);/);
    assert.match(match[1], /onCreateAccount: \(\) => \{[\s\S]*?navigate\(ROUTES\.levelCategory\);[\s\S]*?setRequestedHeaderAuthMode\("signup"\);[\s\S]*?\}/);
    assert.match(match[1], /onLogIn: \(\) => \{[\s\S]*?navigate\(ROUTES\.levelCategory\);[\s\S]*?setRequestedHeaderAuthMode\("login"\);[\s\S]*?\}/);
    assert.match(match[1], /onContinueAsGuest: \(\) => navigate\(ROUTES\.levelCategory\)/);
  });

  await test("every one of the three choices starts the shared 24h cooldown (markAccountIntroShown), so no other account-intro trigger re-asks the same visit", () => {
    assert.match(languageAccountChoiceHookSource, /const handleCreateAccount = \(\) => \{\s*markShown\(\);/);
    assert.match(languageAccountChoiceHookSource, /const handleLogIn = \(\) => \{\s*markShown\(\);/);
    assert.match(languageAccountChoiceHookSource, /const handleContinueAsGuest = \(\) => \{\s*markShown\(\);/);
    assert.match(languageAccountChoiceHookSource, /const markShown = \(\) => markAccountIntroShown\(Date\.now\(\)\);/);
  });

  await test("dismissing without choosing (close()) does not start the cooldown and does not navigate", () => {
    const match = languageAccountChoiceHookSource.match(/const close = \(\) => setIsOpen\(false\);/);
    assert.ok(match, "expected close() to be a plain dialog-close with no cooldown/navigation side effect");
  });

  await test("LanguageAccountChoiceDialog is rendered on the Languages page, driven by languageAccountChoice state", () => {
    const match = appSource.match(/<LanguageAccountChoiceDialog\s([\s\S]*?)\/>/);
    assert.ok(match, "could not locate <LanguageAccountChoiceDialog ... />");
    assert.match(match[1], /open=\{languageAccountChoice\.isOpen\}/);
    assert.match(match[1], /onCreateAccount=\{languageAccountChoice\.handleCreateAccount\}/);
    assert.match(match[1], /onLogIn=\{languageAccountChoice\.handleLogIn\}/);
    assert.match(match[1], /onContinueAsGuest=\{languageAccountChoice\.handleContinueAsGuest\}/);
  });

  await test("LanguageAccountChoiceDialog offers all three choices through Header's existing auth dialog (no new auth flow) and a distinct guest action", () => {
    assert.match(languageAccountChoiceDialogSource, /onClick=\{onCreateAccount\}/);
    assert.match(languageAccountChoiceDialogSource, /onClick=\{onLogIn\}/);
    assert.match(languageAccountChoiceDialogSource, /onClick=\{onContinueAsGuest\}/);
  });

  await test("languageAccountChoice localization - all 7 languages define non-empty title/description/createAccount/logIn/continueAsGuest", () => {
    for (const file of LOCALE_FILES) {
      const data = JSON.parse(readFile(`src/data/interface/${file}`));
      const section = data.languageAccountChoice;
      assert.ok(section, `${file}: missing languageAccountChoice`);
      for (const key of ["title", "description", "createAccount", "logIn", "continueAsGuest"]) {
        assert.equal(typeof section[key], "string", `${file}: languageAccountChoice.${key} must be a string`);
        assert.ok(section[key].length > 0, `${file}: languageAccountChoice.${key} must be non-empty`);
      }
    }
  });

  await test("VocabularyPractice's onSessionComplete requests the practice-complete context specifically", () => {
    assert.match(
      appSource,
      /onSessionComplete=\{\(\) =>\s*\n?\s*accountIntroPopup\.requestAccountIntro\("practice-complete"\)\s*\n?\s*\}/,
    );
  });

  await test("VocabularyLevelExam's onExamComplete requests the level-test-complete context specifically", () => {
    assert.match(
      appSource,
      /onExamComplete=\{\(\) =>\s*\n?\s*accountIntroPopup\.requestAccountIntro\("level-test-complete"\)\s*\n?\s*\}/,
    );
  });

  await test("Create account / Log in reuse Header's existing auth dialog via requestedHeaderAuthMode (no new auth flow)", () => {
    assert.match(appSource, /setRequestedHeaderAuthMode\("signup"\)/);
    assert.match(appSource, /setRequestedHeaderAuthMode\("login"\)/);
    assert.match(appSource, /requestedAuthMode: requestedHeaderAuthMode/);
  });

  await test("never creates a permanent hasSeenAccountPopup (or similarly-named) localStorage key anywhere in src/", () => {
    const srcDir = path.join(ROOT_DIR, "src");
    const offenders = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = fs.readFileSync(abs, "utf8");
          if (/hasSeenAccountPopup/i.test(text)) {
            offenders.push(path.relative(ROOT_DIR, abs));
          }
        }
      }
    })(srcDir);
    assert.deepEqual(offenders, [], `must not introduce a permanent "seen" flag: ${offenders.join(", ")}`);
  });

  console.log("\n[11] accountIntroPopup localization contract - all 7 languages, all 4 contexts");

  const englishData = readJson(`src/data/interface/${LOCALE_FILES[0]}`);
  const expectedKeys = flattenKeys(englishData.accountIntroPopup, "accountIntroPopup");
  assert.ok(expectedKeys.length > 0, "english_interface.json is missing accountIntroPopup entirely");

  for (const file of LOCALE_FILES) {
    await test(`${file} is valid JSON and defines accountIntroPopup with the same key set as English, all non-empty`, () => {
      const data = readJson(`src/data/interface/${file}`);
      assert.ok(data.accountIntroPopup, `${file} is missing accountIntroPopup`);
      const keys = flattenKeys(data.accountIntroPopup, "accountIntroPopup");
      assert.deepEqual(keys, expectedKeys, `${file} accountIntroPopup key set does not match English`);
      for (const key of keys) {
        const value = resolveNestedPath(data.accountIntroPopup, key);
        assert.equal(typeof value, "string", `${file} ${key} is not a string`);
        assert.ok(value.trim().length > 0, `${file} ${key} is empty`);
      }
    });
  }

  const PINNED_ENGLISH_COPY = {
    title: "Learn vocabulary with a plan",
    description: "Turn practice into structured learning.",
    benefits: {
      studyWords: {
        title: "Study new words",
        description: "Follow a structured learning order",
      },
      reviewSmart: {
        title: "Review intelligently",
        description: "Return to words at the right time",
      },
      trackProgress: {
        title: "Track progress",
        description: "See what you've learned over time",
      },
    },
    createAccount: "Create account",
    maybeLater: "Maybe later",
    logIn: "Already have an account? Log in",
    practiceComplete: {
      title: "Keep your learning progress",
      description: "Turn your practice into long-term vocabulary learning.",
    },
    levelTestComplete: {
      title: "Turn your result into progress",
      description: "Use your vocabulary level as a starting point for structured learning.",
    },
    seoEngagement: {
      title: "Turn browsing into learning",
      description: "Build a structured vocabulary routine with study, reviews, and progress tracking.",
    },
  };

  await test("Case 23/24: English copy matches the task's pinned (do-not-reword) strings exactly, for all 4 contexts, including the new seo-engagement copy", () => {
    assert.deepEqual(englishData.accountIntroPopup, PINNED_ENGLISH_COPY);
  });

  console.log("\n[12] AccountIntroDialog.tsx - contextual copy only; design/dimensions/benefits/buttons unchanged (module-boundary tradeoff, see file header)");

  const dialogSource = readFile("src/app/components/dialogs/AccountIntroDialog.tsx");

  await test("imports Dialog/DialogContent from the shared ui/dialog module (no custom modal implementation)", () => {
    assert.match(dialogSource, /from "\.\.\/ui\/dialog"/);
  });

  await test("accepts a context prop typed AccountIntroContext, imported from the shared policy (no local re-declaration)", () => {
    assert.match(
      dialogSource,
      /import type \{ AccountIntroContext \} from "\.\.\/\.\.\/utils\/accountIntroPolicy"/,
    );
    assert.match(dialogSource, /context: AccountIntroContext;/);
  });

  await test("Case 23: CONTEXT_COPY_KEYS maps all 4 contexts (including the new seo-engagement) to their own title/description keys, and the dialog reads through it (not a hardcoded key)", () => {
    assert.match(dialogSource, /"language-setup": \{[\s\S]*?"accountIntroPopup\.title"[\s\S]*?"accountIntroPopup\.description"/);
    assert.match(dialogSource, /"practice-complete": \{[\s\S]*?"accountIntroPopup\.practiceComplete\.title"[\s\S]*?"accountIntroPopup\.practiceComplete\.description"/);
    assert.match(dialogSource, /"level-test-complete": \{[\s\S]*?"accountIntroPopup\.levelTestComplete\.title"[\s\S]*?"accountIntroPopup\.levelTestComplete\.description"/);
    assert.match(dialogSource, /"seo-engagement": \{[\s\S]*?"accountIntroPopup\.seoEngagement\.title"[\s\S]*?"accountIntroPopup\.seoEngagement\.description"/);
    assert.match(dialogSource, /const \{ titleKey, descriptionKey \} = CONTEXT_COPY_KEYS\[context\];/);
    assert.match(dialogSource, /\{t\(titleKey\)\}/);
    assert.match(dialogSource, /\{t\(descriptionKey\)\}/);
  });

  await test("Case 25: no second dialog component was created for the SEO trigger - exactly one AccountIntroDialog.tsx file exists, and it's the only dialogs/*.tsx file referencing seo-engagement", () => {
    const dialogsDir = path.join(ROOT_DIR, "src", "app", "components", "dialogs");
    const dialogFiles = fs.readdirSync(dialogsDir).filter((name) => name.endsWith(".tsx"));
    assert.equal(
      dialogFiles.filter((name) => /accountintro/i.test(name)).length,
      1,
      "expected exactly one AccountIntroDialog component file",
    );
    const filesReferencingSeoEngagement = dialogFiles.filter((name) => {
      const text = fs.readFileSync(path.join(dialogsDir, name), "utf8");
      return text.includes("seo-engagement");
    });
    assert.deepEqual(filesReferencingSeoEngagement, ["AccountIntroDialog.tsx"]);
  });

  await test("createAccount/maybeLater/logIn and the 3 benefit rows are NOT duplicated per context - single shared keys reused across all 4 triggers", () => {
    for (const key of ["createAccount", "maybeLater", "logIn"]) {
      const occurrences = (dialogSource.match(new RegExp(`"accountIntroPopup\\.${key}"`, "g")) ?? []).length;
      assert.equal(occurrences, 1, `expected exactly 1 reference to accountIntroPopup.${key}, found ${occurrences}`);
    }
    for (const benefitKey of ["studyWords", "reviewSmart", "trackProgress"]) {
      assert.match(dialogSource, new RegExp(`"accountIntroPopup\\.benefits\\.${benefitKey}\\.title"`));
      assert.match(dialogSource, new RegExp(`"accountIntroPopup\\.benefits\\.${benefitKey}\\.description"`));
    }
  });

  await test("benefit icons are reused from lucide-react (no new icon dependency, no emoji)", () => {
    assert.match(dialogSource, /from "lucide-react"/);
    assert.doesNotMatch(
      dialogSource,
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
      "no emoji characters expected in the dialog source",
    );
  });

  await test("design preserved: dialog dimensions, radius, benefit-row layout, and button classes are unchanged from the already-approved redesign", () => {
    assert.match(dialogSource, /w-\[min\(92vw,27rem\)\] max-w-none max-h-\[calc\(100svh-2rem\)\] overflow-y-auto overflow-x-hidden rounded-\[1\.75rem\]/);
    assert.match(dialogSource, /flex h-14 w-14 items-center justify-center rounded-2xl bg-white/);
    assert.match(dialogSource, /flex items-start gap-3 rounded-xl px-2 py-2/);
    assert.match(dialogSource, /bg-\[linear-gradient\(135deg,#6f58ff,#5c49f2\)\]/);
  });

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("account intro popup tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
