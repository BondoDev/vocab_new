// Contract guard for ACCOUNT-001: explicit Cancel actions on the Languages
// and Timezone settings cards (SettingsSection.tsx) — a source-text guard,
// like test-settings-current-level-ui-contract.mjs/
// test-settings-nickname-ui-contract.mjs: SettingsSection.tsx is a React
// component and this repo has no component renderer in its test suite, so
// its behavioral shape is verified from source text instead of by mounting
// it.
//
// Scope: only the Languages/Timezone cards' new Cancel affordance. Neither
// card gains an edit mode, a confirmation dialog, or a new backend call —
// this file only asserts the narrow dirty-state-driven show/hide + restore
// behavior described in the ACCOUNT-001 task brief.
//
// Run: node scripts/tests/learning/test-settings-drafts-cancel-ui-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const SETTINGS_SECTION_PATH = path.join(
  ROOT_DIR,
  "src",
  "features",
  "user-profile",
  "sections",
  "settings",
  "SettingsSection.tsx",
);

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

const source = fs.readFileSync(SETTINGS_SECTION_PATH, "utf8");

console.log("\n=== Languages: Cancel restores drafts, no RPC, no edit mode added ===\n");

test("1. handleCancelLanguages restores all three drafts from the confirmed userProfile values and clears the save error", () => {
  const cancelMatch = source.match(/const handleCancelLanguages = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(cancelMatch, "handleCancelLanguages must exist");
  const body = cancelMatch[1];
  assert.match(body, /setNativeDraft\(userProfile\.nativeLanguage\)/);
  assert.match(body, /setPracticeDraft\(userProfile\.practiceLanguage\)/);
  assert.match(body, /setLevelDraft\(userProfile\.languageLevel\)/);
  assert.match(body, /setLanguagesError\(null\)/);
  // No RPC/backend write of any kind in the cancel handler itself.
  assert.doesNotMatch(body, /updateUserProfileLearningPreferences/);
});

test("2. The Languages card's Cancel button is wired to handleCancelLanguages and only rendered while a draft is dirty (isLanguagesUnchanged === false)", () => {
  const languagesSectionMatch = source.match(/\{\/\* ---- Languages ---- \*\/\}([\s\S]*?)\{\/\* ---- Time & Region ---- \*\/\}/);
  assert.ok(languagesSectionMatch, "the Languages section block must exist");
  const block = languagesSectionMatch[1];
  assert.match(block, /\{!isLanguagesUnchanged \? \(\s*\n\s*<Button type="button" variant="outline" onClick=\{handleCancelLanguages\} disabled=\{isSavingLanguages\}>/);
  // Exactly one Cancel button in this card, and it precedes Save in source
  // order (matches the task's "Cancel   Save" layout).
  const cancelIndex = block.indexOf("onClick={handleCancelLanguages}");
  const saveIndex = block.indexOf("onClick={handleSaveLanguages}");
  assert.ok(cancelIndex !== -1 && saveIndex !== -1 && cancelIndex < saveIndex, "Cancel must render before Save");
});

test("3. No new edit-mode flag was introduced for the Languages card (still driven purely by the existing drafts/isLanguagesUnchanged, no isEditingLanguages state)", () => {
  assert.doesNotMatch(source, /isEditingLanguages/);
});

console.log("\n=== Timezone: Cancel restores draft, no RPC, no edit mode added ===\n");

test("4. handleCancelTimezone restores timezoneDraft from the confirmed userProfile.timezone and clears both transient error states", () => {
  const cancelMatch = source.match(/const handleCancelTimezone = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(cancelMatch, "handleCancelTimezone must exist");
  const body = cancelMatch[1];
  assert.match(body, /setTimezoneDraft\(userProfile\.timezone \?\? ""\)/);
  assert.match(body, /setTimezoneError\(null\)/);
  assert.match(body, /setDetectionError\(null\)/);
  // No RPC/backend write of any kind in the cancel handler itself.
  assert.doesNotMatch(body, /updateUserTimezone/);
});

test("5. The Timezone card's Cancel button is wired to handleCancelTimezone and only rendered while the draft is dirty (isTimezoneUnchanged === false)", () => {
  const timezoneSectionMatch = source.match(/\{\/\* ---- Time & Region ---- \*\/\}([\s\S]*?)\{\/\* ---- Data & Account \(danger zone\) ---- \*\/\}/);
  assert.ok(timezoneSectionMatch, "the Time & Region section block must exist");
  const block = timezoneSectionMatch[1];
  assert.match(block, /\{!isTimezoneUnchanged \? \(\s*\n\s*<Button type="button" variant="outline" onClick=\{handleCancelTimezone\} disabled=\{isSavingTimezone\}>/);
  const cancelIndex = block.indexOf("onClick={handleCancelTimezone}");
  const saveIndex = block.indexOf("onClick={handleSaveTimezone}");
  assert.ok(cancelIndex !== -1 && saveIndex !== -1 && cancelIndex < saveIndex, "Cancel must render before Save");
});

test("6. No new edit-mode flag was introduced for the Timezone card (still driven purely by timezoneDraft/isTimezoneUnchanged, no isEditingTimezone state)", () => {
  assert.doesNotMatch(source, /isEditingTimezone/);
});

console.log("\n=== Both Cancel buttons reuse the existing localized copy/button pattern ===\n");

test("7. Both new Cancel buttons reuse the same existing translation key already used by nickname/email/password Cancel (userProfile.settingsSection.cancel), not a new key", () => {
  const cancelButtonUses = [...source.matchAll(/onClick=\{handleCancel\w+\}[^>]*>\s*\n\s*\{t\("([^"]+)"\)\}/g)].map((m) => m[1]);
  assert.ok(cancelButtonUses.includes("userProfile.settingsSection.cancel"));
  assert.ok(
    cancelButtonUses.every((key) => key === "userProfile.settingsSection.cancel"),
    `every Cancel button must reuse the shared cancel key, found: ${cancelButtonUses.join(", ")}`,
  );
});

test("8. Existing Save semantics for both cards are untouched: handleSaveLanguages/handleSaveTimezone bodies still exist unchanged in shape (still gated by canSaveLanguages/canSaveTimezone)", () => {
  assert.match(source, /<Button type="button" onClick=\{handleSaveLanguages\} disabled=\{!canSaveLanguages\}>/);
  assert.match(source, /<Button type="button" onClick=\{handleSaveTimezone\} disabled=\{!canSaveTimezone\}>/);
});

console.log("\n=== Invariant: Save-active and Cancel-visible can never disagree (ACCOUNT-001 regression report) ===\n");

// A prior manual QA report claimed Save became active on a language change
// while no Cancel button appeared. That can only happen if Save's enablement
// and Cancel's visibility are driven by two different "dirty" booleans that
// can disagree. These two tests assert there is only ever one: extract
// canSaveLanguages/canSaveTimezone's own formula and the Cancel button's
// render condition independently, then require both to reference the exact
// same identifier (isLanguagesUnchanged / isTimezoneUnchanged) rather than
// merely happening to look similar.
test("9. canSaveLanguages's formula and the Languages Cancel button's render condition both gate on the literal identifier isLanguagesUnchanged (one shared dirty-check, not two)", () => {
  const canSaveMatch = source.match(/const canSaveLanguages =([\s\S]*?);\r?\n\r?\n/);
  assert.ok(canSaveMatch, "canSaveLanguages must exist");
  assert.match(canSaveMatch[1], /!isLanguagesUnchanged/, "canSaveLanguages must negate isLanguagesUnchanged");

  const cancelConditionMatch = source.match(/\{(!isLanguagesUnchanged) \? \(\s*\n\s*<Button type="button" variant="outline" onClick=\{handleCancelLanguages\}/);
  assert.ok(cancelConditionMatch, "the Languages Cancel button's render condition must exist");
  assert.equal(cancelConditionMatch[1], "!isLanguagesUnchanged");
});

test("10. canSaveTimezone's formula and the Timezone Cancel button's render condition both gate on the literal identifier isTimezoneUnchanged (one shared dirty-check, not two)", () => {
  const canSaveMatch = source.match(/const canSaveTimezone =([\s\S]*?);\r?\n\r?\n/);
  assert.ok(canSaveMatch, "canSaveTimezone must exist");
  assert.match(canSaveMatch[1], /!isTimezoneUnchanged/, "canSaveTimezone must negate isTimezoneUnchanged");

  const cancelConditionMatch = source.match(/\{(!isTimezoneUnchanged) \? \(\s*\n\s*<Button type="button" variant="outline" onClick=\{handleCancelTimezone\}/);
  assert.ok(cancelConditionMatch, "the Timezone Cancel button's render condition must exist");
  assert.equal(cancelConditionMatch[1], "!isTimezoneUnchanged");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("settings-drafts-cancel-ui-contract tests failed");
  process.exit(1);
} else {
  console.log("Settings drafts Cancel UI contract passed");
}
