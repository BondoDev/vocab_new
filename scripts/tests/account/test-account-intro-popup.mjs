// Regression guard for the anonymous "account intro" popup (first-time
// language-selection onboarding nudge shown once on the Filters page):
//
// - src/app/utils/accountIntroPolicy.ts owns the two pure decisions: whether
//   the Languages page's Continue click should attach the one-time
//   showAccountIntro navigation signal, and whether the Filters page should
//   actually open the popup once that signal (and auth status) is known.
// - src/app/hooks/useStoredAppPreferences.ts captures whether a *complete*
//   language pair already existed in localStorage before this load, via a
//   ref set from the raw pre-save read - this is the sole source of
//   "first-time" (see its own doc comment for why re-deriving this after
//   Continue saves would always read "complete").
// - src/app/hooks/useAccountIntroPopup.ts consumes the signal on the Filters
//   page and decides when to actually open the dialog.
// - src/app/App.tsx wires the two together and reuses Header's existing
//   login/signup dialog for Create account / Log in (no second auth flow).
//
// Behavioral for the pure policy module (import-free, loads directly via
// Node's native TypeScript stripping - see storedLanguagePreferencePolicy.ts
// for why this project's other .ts modules can't). Source-text checks for
// the React hook/component wiring, matching test-account-language-sync.mjs's
// own documented module-boundary tradeoff.
//
// Run: node --experimental-strip-types scripts/tests/account/test-account-intro-popup.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  shouldOpenAccountIntro,
  shouldSignalAccountIntro,
} from "../../../src/app/utils/accountIntroPolicy.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");

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

async function main() {
  console.log("\n[1] shouldSignalAccountIntro - Languages-page Continue signal gate");

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

  console.log("\n[2] shouldOpenAccountIntro - Filters-page open gate");

  await test("Case 1 (continued): a pending signal, auth resolved, anonymous -> opens", () => {
    assert.equal(
      shouldOpenAccountIntro({
        hasPendingIntroSignal: true,
        isAuthResolved: true,
        isAuthenticated: false,
      }),
      true,
    );
  });

  await test("Case 3 (continued): a pending signal but authenticated -> never opens", () => {
    assert.equal(
      shouldOpenAccountIntro({
        hasPendingIntroSignal: true,
        isAuthResolved: true,
        isAuthenticated: true,
      }),
      false,
    );
  });

  await test("auth not yet resolved -> never opens, even with a pending signal and an eventually-anonymous visitor", () => {
    assert.equal(
      shouldOpenAccountIntro({
        hasPendingIntroSignal: true,
        isAuthResolved: false,
        isAuthenticated: false,
      }),
      false,
    );
  });

  await test("Case 5: no pending signal (normal Filters visit) -> never opens, regardless of auth state", () => {
    assert.equal(
      shouldOpenAccountIntro({
        hasPendingIntroSignal: false,
        isAuthResolved: true,
        isAuthenticated: false,
      }),
      false,
    );
  });

  await test("Case 6: signal already consumed (no longer pending) -> a later re-check never reopens it", () => {
    // Mirrors useAccountIntroPopup.ts's own contract: once its effect has
    // run shouldOpenAccountIntro once for a given signal, it flips
    // hasPendingSignal back to false before doing anything else - so a
    // refresh (or any later re-render) always evaluates this with
    // hasPendingIntroSignal: false.
    assert.equal(
      shouldOpenAccountIntro({
        hasPendingIntroSignal: false,
        isAuthResolved: true,
        isAuthenticated: false,
      }),
      false,
    );
  });

  console.log("\n[3] useStoredAppPreferences.ts - first-time detection wiring (module-boundary tradeoff, see file header)");

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

  console.log("\n[4] App.tsx wiring - source-text checks (module-boundary tradeoff, see file header)");

  const appSource = readFile("src/app/App.tsx");

  await test("imports and wires useAccountIntroPopup", () => {
    assert.match(appSource, /import \{ useAccountIntroPopup \} from "\.\/hooks\/useAccountIntroPopup"/);
    assert.match(appSource, /useAccountIntroPopup\(\{/);
  });

  await test("renders AccountIntroDialog (reuses the shared Dialog primitive via that component, not a new modal)", () => {
    assert.match(
      appSource,
      /import \{ AccountIntroDialog \} from "\.\/components\/dialogs\/AccountIntroDialog"/,
    );
    assert.match(appSource, /<AccountIntroDialog/);
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

  console.log("\n[5] useAccountIntroPopup.ts wiring - source-text checks (module-boundary tradeoff, see file header)");

  const popupHookSource = readFile("src/app/hooks/useAccountIntroPopup.ts");

  await test("consumes the router-state signal via a `replace` navigation with state cleared to null", () => {
    const match = popupHookSource.match(/navigate\(`\$\{location\.pathname\}\$\{location\.search\}`, \{([\s\S]*?)\}\);/);
    assert.ok(match, "could not locate the consuming navigate() call");
    assert.match(match[1], /replace: true/);
    assert.match(match[1], /state: null/);
  });

  await test("Case 6: the consuming navigate() call is unconditional on resolvedPage/signal alone - independent of auth status", () => {
    // The consuming effect's dependency array must not include authUserId/
    // isAuthResolved - otherwise a refresh before auth resolves could skip
    // clearing the signal.
    const match = popupHookSource.match(
      /\}, \[resolvedPage, location\.pathname, location\.search, location\.state, navigate\]\);/,
    );
    assert.ok(match, "consuming effect's dependency array does not match the expected auth-independent shape");
  });

  await test("only opens via shouldOpenAccountIntro (the shared pure policy), not a reimplemented condition", () => {
    assert.match(popupHookSource, /import \{ shouldOpenAccountIntro \} from "\.\.\/utils\/accountIntroPolicy"/);
    assert.match(popupHookSource, /shouldOpenAccountIntro\(\{/);
  });

  await test("Case 4: close() only closes the dialog - it never re-arms hasPendingSignal (no immediate reopen)", () => {
    const match = popupHookSource.match(/const close = useCallback\(([\s\S]*?)\[\]\);/);
    assert.ok(match, "could not locate close()");
    assert.doesNotMatch(match[1], /setHasPendingSignal/);
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

  console.log("\n[8] accountIntroPopup localization contract - all 7 languages");

  const englishData = readJson(`src/data/interface/${LOCALE_FILES[0]}`);
  const expectedKeys = flattenKeys(englishData.accountIntroPopup, "accountIntroPopup");
  assert.ok(expectedKeys.length > 0, "english_interface.json is missing accountIntroPopup entirely");

  // Resolves a dotted flattenKeys() path (e.g. "accountIntroPopup.benefits.
  // studyWords.title") against the nested JSON object it was flattened from -
  // needed now that benefits.* is a real nested object, not a flat key
  // containing literal dots.
  function resolveNestedPath(root, dottedPath) {
    return dottedPath
      .split(".")
      .slice(1) // drop the leading "accountIntroPopup" segment - root is already that subtree
      .reduce((node, segment) => (node && typeof node === "object" ? node[segment] : undefined), root);
  }

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
  };

  await test("English copy matches the task's pinned (do-not-reword) strings exactly", () => {
    assert.deepEqual(englishData.accountIntroPopup, PINNED_ENGLISH_COPY);
  });

  console.log("\n[9] AccountIntroDialog.tsx - reuses the shared Dialog primitive and t(...) for every string");

  const dialogSource = readFile("src/app/components/dialogs/AccountIntroDialog.tsx");

  await test("imports Dialog/DialogContent from the shared ui/dialog module (no custom modal implementation)", () => {
    assert.match(dialogSource, /from "\.\.\/ui\/dialog"/);
  });

  await test("every top-level user-facing string goes through t(\"accountIntroPopup.*\") - no hardcoded English copy", () => {
    for (const key of ["title", "description", "createAccount", "maybeLater", "logIn"]) {
      assert.match(dialogSource, new RegExp(`t\\("accountIntroPopup\\.${key}"\\)`));
    }
  });

  await test("all 3 benefit rows are driven by translation keys (title + description) via the BENEFITS config, not hardcoded copy", () => {
    for (const benefitKey of ["studyWords", "reviewSmart", "trackProgress"]) {
      assert.match(dialogSource, new RegExp(`"accountIntroPopup\\.benefits\\.${benefitKey}\\.title"`));
      assert.match(dialogSource, new RegExp(`"accountIntroPopup\\.benefits\\.${benefitKey}\\.description"`));
    }
    assert.match(dialogSource, /t\(benefit\.titleKey\)/);
    assert.match(dialogSource, /t\(benefit\.descriptionKey\)/);
  });

  await test("benefit icons are reused from lucide-react (no new icon dependency, no emoji)", () => {
    assert.match(dialogSource, /from "lucide-react"/);
    assert.doesNotMatch(
      dialogSource,
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
      "no emoji characters expected in the dialog source",
    );
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
