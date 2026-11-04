// Regression coverage for the onboarding age default-state bug (2026-08-13):
// AccountOnboardingDialog's age control always *displayed* 18 the moment it
// mounted with no age recorded yet, but the form's authoritative
// profile.age (the value prepareAccountOnboardingSubmit actually validates)
// stayed null until onChange fired — so a brand-new user who filled every
// other required field and left age untouched at its visible default of 18
// failed "Please set your age." The user had to change the age and change
// it back to 18 before submission would succeed.
//
// Root cause: two separate sources of truth for the same value.
// AccountOnboardingDialog.tsx kept its own local ageInputValue state (for
// the raw text box) defaulting to 18 purely for display, while the
// authoritative profile.age prop it actually submits was never pushed to
// match. The fix (src/app/components/dialogs/AccountOnboardingDialog.tsx):
//   - Both the display default and the authoritative default now resolve
//     through one shared pure function, resolveOnboardingAgeDefault (moved
//     to src/app/utils/accountOnboardingAge.ts, alongside the pre-existing
//     clampOnboardingAge range clamp, so both are directly testable here).
//   - A mount/open effect pushes that same default into the authoritative
//     profile.age via onProfileChange whenever the dialog opens with
//     profile.age still null, so the two values can never disagree.
//   - prepareAccountOnboardingSubmit's own `age === null` check
//     (src/app/utils/accountOnboarding.ts) is untouched — the fix is
//     state-consistency, not validation silently coercing a missing age to
//     18 at submit time.
//
// Exercises the real production code directly where it can:
// src/app/utils/accountOnboardingAge.ts, loaded via Node's native
// TypeScript stripping (no problematic imports). AccountOnboardingDialog.tsx
// and src/app/utils/accountOnboarding.ts cannot be loaded this way —
// AccountOnboardingDialog.tsx is JSX, and accountOnboarding.ts imports
// startsWithLetter from "../../lib/userProfile" (no extension; userProfile.ts
// itself pulls in supabaseAuth.ts's import.meta.env chain), the same
// "cannot be loaded directly without a bundler" constraint
// test-profile-load-and-onboarding.mjs and test-account-language-sync.mjs
// already document for sibling hooks/utils. Both are instead pinned as
// source-text/data-flow checks, the same tradeoff those files use.
//
// Minimum registration age 16 (2026-11-05): ONBOARDING_MIN_AGE is now 16.
// Typed ages are validated (getOnboardingAgeIssue) instead of silently
// clamped, so prepareAccountOnboardingSubmit gained one range check after
// the null check; only the step buttons still clamp. Settings uses
// isAllowedProfileAge, which also accepts the account's unchanged legacy
// stored age. Sections [1], [2e], [3c] and [5] below cover that change.
//
// Run: node --experimental-strip-types scripts/tests/account/test-onboarding-age-default-state.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clampOnboardingAge,
  getOnboardingAgeIssue,
  isAllowedProfileAge,
  resolveOnboardingAgeDefault,
  DEFAULT_ONBOARDING_AGE,
  ONBOARDING_MIN_AGE,
  ONBOARDING_MAX_AGE,
} from "../../../src/app/utils/accountOnboardingAge.ts";

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

async function main() {
  console.log("\n[1] resolveOnboardingAgeDefault / clampOnboardingAge — pure logic");

  test("1a. initial age displayed is 18: resolveOnboardingAgeDefault(null) is the same 18 the input shows on mount", () => {
    assert.equal(resolveOnboardingAgeDefault(null), 18);
    assert.equal(DEFAULT_ONBOARDING_AGE, 18);
  });

  test("1b. a real stored age is never overridden by the default", () => {
    assert.equal(resolveOnboardingAgeDefault(30), 30);
    assert.equal(resolveOnboardingAgeDefault(10), 10);
  });

  test("5a. the step-button clamp keeps values within [16, 100]", () => {
    assert.equal(ONBOARDING_MIN_AGE, 16);
    assert.equal(ONBOARDING_MAX_AGE, 100);
    assert.equal(clampOnboardingAge(5), 16);
    assert.equal(clampOnboardingAge(15), 16);
    assert.equal(clampOnboardingAge(150), 100);
    assert.equal(clampOnboardingAge(16), 16);
    assert.equal(clampOnboardingAge(100), 100);
  });

  test("5c. minimum age 16: 15 rejected, 16 accepted, 100 accepted, 101 rejected, fractions rejected", () => {
    assert.equal(getOnboardingAgeIssue(15), "belowMinimum");
    assert.equal(getOnboardingAgeIssue(10), "belowMinimum");
    assert.equal(getOnboardingAgeIssue(16), null);
    assert.equal(getOnboardingAgeIssue(18), null);
    assert.equal(getOnboardingAgeIssue(100), null);
    assert.equal(getOnboardingAgeIssue(101), "aboveMaximum");
    assert.equal(getOnboardingAgeIssue(16.5), "notWholeNumber");
    assert.equal(getOnboardingAgeIssue(Number.NaN), "notWholeNumber");
  });

  test("5d. Settings: 16-100 allowed; below 16 only as the account's own unchanged stored (legacy) age", () => {
    assert.equal(isAllowedProfileAge(15, null), false);
    assert.equal(isAllowedProfileAge(15, 30), false);
    assert.equal(isAllowedProfileAge(16, null), true);
    assert.equal(isAllowedProfileAge(100, 12), true);
    assert.equal(isAllowedProfileAge(101, 30), false);
    assert.equal(isAllowedProfileAge(12, 12), true, "legacy account keeps its stored age");
    assert.equal(isAllowedProfileAge(11, 12), false, "legacy account cannot lower its age");
  });

  test("5b. clampOnboardingAge still rounds to the nearest whole year, exactly as before this fix", () => {
    assert.equal(clampOnboardingAge(45.6), 46);
    assert.equal(clampOnboardingAge(45.4), 45);
  });

  console.log("\n[2] AccountOnboardingDialog.tsx — display default and authoritative push are wired to the same source of truth");

  const dialogSource = read("src/app/components/dialogs/AccountOnboardingDialog.tsx");

  test("2a. imports the shared helpers instead of redefining its own local clamp/default logic", () => {
    assert.match(
      dialogSource,
      /import \{\s*clampOnboardingAge,\s*DEFAULT_ONBOARDING_AGE,\s*getOnboardingAgeIssue,\s*ONBOARDING_MAX_AGE,\s*ONBOARDING_MIN_AGE,\s*resolveOnboardingAgeDefault,\s*\} from "\.\.\/\.\.\/utils\/accountOnboardingAge";/,
    );
    assert.doesNotMatch(dialogSource, /function clampAge\(/, "the old local clampAge redefinition must be gone");
  });

  test("2b. the input's initial display value (requirement: initial age displayed is 18) resolves through resolveOnboardingAgeDefault, not a bare `?? 18`/`|| 18` literal", () => {
    assert.match(
      dialogSource,
      /const \[ageInputValue, setAgeInputValue\] = useState\(\(\) =>\s*String\(resolveOnboardingAgeDefault\(profile\.age\)\),\s*\);/,
    );
    assert.doesNotMatch(dialogSource, /profile\.age \?\? 18/, "no leftover bare default literal - resolveOnboardingAgeDefault is the single source of truth");
  });

  test("2c. a mount/open effect pushes the exact same default into the authoritative profile.age via onProfileChange whenever it is still null (requirement: form state/submission already contains 18 before any age interaction) — this is the actual bug fix, not just a display change", () => {
    const effectMatch = dialogSource.match(
      /useEffect\(\(\) => \{\s*if \(open && profile\.age === null\) \{([\s\S]*?)\n {4}\}\s*\n[\s\S]*?\}, \[open\]\);/,
    );
    assert.ok(effectMatch, "could not locate the open/null-age authoritative-push effect");
    assert.match(effectMatch[1], /handleAgeChange\(resolveOnboardingAgeDefault\(profile\.age\)\)/);
  });

  test("2d. the authoritative-push effect is keyed on `open` alone, not on `profile.age` - it must fire once per open and never refire to stomp a value the user has since deliberately cleared", () => {
    assert.match(dialogSource, /\}, \[open\]\);/);
  });

  test("2e. handleAgeChange stores typed ages as entered (no silent clamp to 16), the inline error comes from getOnboardingAgeIssue, and only the step buttons clamp", () => {
    const handlerMatch = dialogSource.match(/const handleAgeChange = \(nextValue: number \| null\) => \{([\s\S]*?)\n {2}\};/);
    assert.ok(handlerMatch, "could not locate handleAgeChange");
    assert.match(handlerMatch[1], /onProfileChange\(\{ age: nextValue \}\)/);
    assert.doesNotMatch(handlerMatch[1], /clampOnboardingAge/);
    assert.match(dialogSource, /getOnboardingAgeIssue\(profile\.age\)/);
    assert.match(dialogSource, /accountOnboarding\.errors\.ageMinimum/);
    assert.equal((dialogSource.match(/clampOnboardingAge\(displayedAgeValue [+-] 1\)/g) ?? []).length, 2);
  });

  console.log("\n[3] prepareAccountOnboardingSubmit — validation contract preserved, never weakened into a silent default");

  const validationSource = read("src/app/utils/accountOnboarding.ts");

  test("3a. the null-age check still exists with its ageRequired error key - the same check the bug report's failure came from", () => {
    assert.match(
      validationSource,
      /if \(age === null\) \{\s*return \{ ok: false, errorKey: "accountOnboarding\.errors\.ageRequired" \};\s*\}/,
    );
  });

  test("3b. this fix was never implemented by making validation itself default a missing age to 18 - no `age ?? 18` / `age || 18` fallback exists anywhere in accountOnboarding.ts", () => {
    assert.doesNotMatch(validationSource, /age \?\? 18/);
    assert.doesNotMatch(validationSource, /age \|\| 18/);
  });

  test("3d. a non-null age outside 16-100 is rejected with ageMinimum/ageOutOfRange via getOnboardingAgeIssue", () => {
    assert.match(validationSource, /const ageIssue = getOnboardingAgeIssue\(age\);/);
    assert.match(validationSource, /accountOnboarding\.errors\.ageMinimum/);
    assert.match(validationSource, /accountOnboarding\.errors\.ageOutOfRange/);
  });

  test("3c. besides getOnboardingAgeIssue, age is gated only by the null check - a valid age reaches the success branch and is passed through unchanged, never re-derived", () => {
    // Exactly one conditional keyed on the standalone `age` variable (the
    // null check) across the whole file - proves nothing else in
    // prepareAccountOnboardingSubmit can reject a resolved/clamped age
    // (requirements: "a valid form can submit with age left untouched at
    // 18" and "changing age still works" both reduce to this single gate).
    const ageConditionals = (validationSource.match(/\bage\b\s*===|===\s*\bage\b/g) ?? []).length;
    assert.equal(ageConditionals, 1, "expected exactly one age-keyed condition (the null check)");
    assert.match(
      validationSource,
      /profile: \{\s*\.\.\.userProfile,\s*nickname,\s*age,/,
      "the resolved age must be passed through into the submitted profile unchanged, not re-defaulted",
    );
  });

  console.log("\n[4] Audit: other defaulted fields in this same onboarding form");

  test("4a. age is the only field with its own local shadow-state default in AccountOnboardingDialog.tsx - nickname/languageLevel/birthMonth/birthDay/nativeLanguage/practiceLanguage are all bound directly to the profile prop with no synthetic default value of their own", () => {
    const useStateMatches = [...dialogSource.matchAll(/const \[\w+, set\w+\] = useState/g)];
    assert.equal(useStateMatches.length, 1, "expected exactly one local useState in this dialog (ageInputValue) - a second would need the same audit this fix just did for age");
    assert.match(dialogSource, /const \[ageInputValue, setAgeInputValue\] = useState/);
  });

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("onboarding-age-default-state guard passed");
  }
}

main();
