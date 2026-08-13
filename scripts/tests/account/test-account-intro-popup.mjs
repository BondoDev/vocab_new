// Regression guard for the anonymous "account intro" popup, shared across
// its three trigger contexts (language-setup, practice-complete,
// level-test-complete):
//
// - src/app/utils/accountIntroPolicy.ts owns the pure decisions: whether the
//   Languages page's Continue click should attach the one-time
//   showAccountIntro navigation signal (language-setup only), and -
//   centrally, for all three contexts - whether a popup should actually
//   open given auth status and the frequency policy: a single global
//   rolling 24-hour cooldown (isWithinAccountIntroCooldown /
//   ACCOUNT_INTRO_COOLDOWN_MS), shared across all three contexts. This
//   supersedes an earlier once-per-browser-session cap and permanent
//   per-context "shown forever" flags - neither exists anymore.
// - src/app/utils/accountIntroStorage.ts centralizes the one localStorage
//   key (an epoch-ms lastShownAt timestamp) that backs the cooldown - the
//   only place in the app that touches it - and best-effort clears the two
//   now-unread legacy keys from the superseded policy.
// - src/app/hooks/useStoredAppPreferences.ts captures whether a *complete*
//   language pair already existed in localStorage before this load (the
//   sole source of language-setup's "first-time" eligibility signal - it
//   still goes through the same shared cooldown as the other two once
//   signaled).
// - src/app/hooks/useAccountIntroPopup.ts consumes the router-state signal
//   and exposes requestAccountIntro() for the other two triggers, then
//   applies the shared policy before ever opening or writing the cooldown
//   timestamp.
// - VocabularyPractice.tsx / VocabularyLevelExam.tsx fire onSessionComplete/
//   onExamComplete at their own canonical completion events only.
// - src/app/App.tsx wires all three triggers into the one shared dialog and
//   reuses Header's existing login/signup dialog for Create account / Log in
//   (no second auth flow).
//
// Behavioral for the pure policy module and the storage module (both
// import-free / minimally-dependent, loadable directly via Node's native
// TypeScript stripping - see storedLanguagePreferencePolicy.ts for why this
// project's other .ts modules can't). The storage module touches
// window.localStorage/sessionStorage, so its tests install a minimal fake
// Storage on globalThis.window first (this repo has no jsdom/testing-library
// dependency - see package.json - so this is the lightest way to exercise
// real read/write behavior rather than only asserting on source text). Every
// cooldown-boundary test below uses controllable timestamps (plain numbers),
// never real waiting/timeouts.
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

  console.log("\n[2] isWithinAccountIntroCooldown / shouldShowAccountIntro - global 24h cooldown, all 3 contexts");

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

  await test("Case 12: authenticated -> never shows, for any of the 3 contexts, regardless of cooldown state", () => {
    for (const context of ["language-setup", "practice-complete", "level-test-complete"]) {
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

  await test("auth not yet resolved -> never shows, even otherwise fully eligible (no flash for a signed-in user)", () => {
    for (const context of ["language-setup", "practice-complete", "level-test-complete"]) {
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

  console.log("\n[3] accountIntroStorage.ts - behavioral tests against a fake Storage");

  // Fresh fake storages per test file run, installed before the module's
  // functions are first invoked (they read `window` lazily inside function
  // bodies, not at import time, so import order doesn't matter here).
  globalThis.window = globalThis.window ?? {};
  globalThis.window.localStorage = new FakeStorage();
  globalThis.window.sessionStorage = new FakeStorage();

  const { markAccountIntroShown, readAccountIntroLastShownAtMs } = await import(
    "../../../src/app/utils/accountIntroStorage.ts"
  );

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

  console.log("\n[10] App.tsx wiring - all 3 triggers share one dialog instance (module-boundary tradeoff, see file header)");

  const appSource = readFile("src/app/App.tsx");

  await test("imports and wires useAccountIntroPopup", () => {
    assert.match(appSource, /import \{ useAccountIntroPopup \} from "\.\/hooks\/useAccountIntroPopup"/);
    assert.match(appSource, /useAccountIntroPopup\(\{/);
  });

  await test("defines exactly one shared accountIntroDialog element (not a separate modal per trigger)", () => {
    const match = appSource.match(/const accountIntroDialog = \(\n([\s\S]*?)\n {2}\);/);
    assert.ok(match, "could not locate the shared accountIntroDialog JSX constant");
    assert.match(match[1], /<AccountIntroDialog/);
    assert.match(match[1], /context=\{accountIntroPopup\.context\}/);
    assert.match(match[1], /onCreateAccount=\{handleAccountIntroCreateAccount\}/);
    assert.match(match[1], /onLogIn=\{handleAccountIntroLogIn\}/);
  });

  await test("the shared dialog is rendered on all 3 trigger-reachable pages (levelCategory, practice, exam) via {accountIntroDialog}", () => {
    const occurrences = (appSource.match(/\{accountIntroDialog\}/g) ?? []).length;
    assert.equal(occurrences, 3, `expected {accountIntroDialog} on all 3 pages, found ${occurrences}`);
  });

  await test("the Languages-page Continue's proceed() callback decides the signal via shouldSignalAccountIntro, using the pre-save ref", () => {
    const match = appSource.match(/proceed: \(\) => \{([\s\S]*?)\n    \},\n  \}\);/);
    assert.ok(match, "could not locate the useAccountLanguageConfirm proceed() callback body");
    assert.match(match[1], /shouldSignalAccountIntro\(/);
    assert.match(match[1], /hadCompleteStoredLanguagePairAtLoadRef\.current/);
    assert.match(match[1], /isAuthenticated: Boolean\(authUserId\)/);
  });

  await test("the signal is passed as router navigation state (showAccountIntro), not a new localStorage key", () => {
    const match = appSource.match(/proceed: \(\) => \{([\s\S]*?)\n    \},\n  \}\);/);
    assert.match(match[1], /navigate\(\s*ROUTES\.levelCategory/);
    assert.match(match[1], /state: \{ showAccountIntro: true \}/);
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

  console.log("\n[11] accountIntroPopup localization contract - all 7 languages, all 3 contexts");

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
  };

  await test("English copy matches the task's pinned (do-not-reword) strings exactly, for all 3 contexts", () => {
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

  await test("CONTEXT_COPY_KEYS maps all 3 contexts to their own title/description keys, and the dialog reads through it (not a hardcoded key)", () => {
    assert.match(dialogSource, /"language-setup": \{[\s\S]*?"accountIntroPopup\.title"[\s\S]*?"accountIntroPopup\.description"/);
    assert.match(dialogSource, /"practice-complete": \{[\s\S]*?"accountIntroPopup\.practiceComplete\.title"[\s\S]*?"accountIntroPopup\.practiceComplete\.description"/);
    assert.match(dialogSource, /"level-test-complete": \{[\s\S]*?"accountIntroPopup\.levelTestComplete\.title"[\s\S]*?"accountIntroPopup\.levelTestComplete\.description"/);
    assert.match(dialogSource, /const \{ titleKey, descriptionKey \} = CONTEXT_COPY_KEYS\[context\];/);
    assert.match(dialogSource, /\{t\(titleKey\)\}/);
    assert.match(dialogSource, /\{t\(descriptionKey\)\}/);
  });

  await test("createAccount/maybeLater/logIn and the 3 benefit rows are NOT duplicated per context - single shared keys reused across all 3 triggers", () => {
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
