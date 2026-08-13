// Contract guard for Settings' Languages card Current Level control
// (SettingsSection.tsx) — a source-text guard, like
// test-settings-nickname-ui-contract.mjs: SettingsSection.tsx is a React
// component and this repo has no component renderer in its test suite, so
// its behavioral shape is verified from source text instead of by mounting
// it. The response parser's own logic is covered independently and more
// thoroughly by test-user-profile-learning-preferences-response.mjs, and the
// RPC's own contract by
// test-update-user-profile-learning-preferences-migration-contract.mjs.
//
// Run: node scripts/tests/learning/test-settings-current-level-ui-contract.mjs
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
const USER_PROFILE_LIB_PATH = path.join(ROOT_DIR, "src", "lib", "userProfile.ts");
const APP_TSX_PATH = path.join(ROOT_DIR, "src", "app", "App.tsx");
const DASHBOARD_PAGE_PATH = path.join(
  ROOT_DIR,
  "src",
  "features",
  "user-profile",
  "sections",
  "UserProfileDashboardPage.tsx",
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
const userProfileSource = fs.readFileSync(USER_PROFILE_LIB_PATH, "utf8");
const appSource = fs.readFileSync(APP_TSX_PATH, "utf8");
const dashboardPageSource = fs.readFileSync(DASHBOARD_PAGE_PATH, "utf8");

console.log("\n=== Current Level renders as an editable control, not read-only text ===\n");

test("1. Current Level is a real <Select>, not a plain <span> value display", () => {
  assert.match(
    source,
    /<Select\s*\n\s*value=\{levelDraft \|\| undefined\}\s*\n\s*onValueChange=\{\(value\) => setLevelDraft\(value as LanguageLevelCode\)\}/,
  );
});

test("2. The Select is initialized from the confirmed profile value (userProfile.languageLevel), not an empty/hardcoded default", () => {
  assert.match(source, /const \[levelDraft, setLevelDraft\] = useState<LanguageLevelCode \| "">\(userProfile\.languageLevel\);/);
});

test("2b. A profile reload/change re-syncs the draft, mirroring native/practice draft resync", () => {
  const effectMatch = source.match(/useEffect\(\(\) => \{\s*\n\s*setNativeDraft\(userProfile\.nativeLanguage\);\s*\n\s*setPracticeDraft\(userProfile\.practiceLanguage\);\s*\n\s*setLevelDraft\(userProfile\.languageLevel\);\s*\n\s*\}, \[userProfile\.nativeLanguage, userProfile\.practiceLanguage, userProfile\.languageLevel\]\);/);
  assert.ok(effectMatch, "the languages draft-resync effect must include levelDraft/userProfile.languageLevel");
});

test("3. Only the six canonical CEFR codes are offered, sourced from the shared SUPPORTED_LEVEL_CODES (not a second hand-authored list)", () => {
  assert.match(
    source,
    /import \{ SUPPORTED_LANGUAGE_CODES, SUPPORTED_LEVEL_CODES \} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/userProfileOnboarding"/,
  );
  assert.doesNotMatch(source, /const SUPPORTED_LEVEL_CODES = \[/);
  assert.match(
    source,
    /\{SUPPORTED_LEVEL_CODES\.map\(\(code\) => \(\s*\n\s*<SelectItem key=\{code\} value=\{code\}>\s*\n\s*\{`\$\{code\} · \$\{t\(`levels\.\$\{code\}\.name`\)\}`\}/,
  );
});

test("3b. Labels reuse the existing localized level-name architecture (levels.{code}.name), not a hardcoded English label set", () => {
  assert.match(source, /t\(`levels\.\$\{code\}\.name`\)/);
});

console.log("\n=== Save dirty-state includes Current Level ===\n");

test("4. isLanguagesUnchanged compares all three drafts (native, practice, level) against confirmed profile values", () => {
  assert.match(
    source,
    /const isLanguagesUnchanged =\s*\n\s*nativeDraft === userProfile\.nativeLanguage &&\s*\n\s*practiceDraft === userProfile\.practiceLanguage &&\s*\n\s*levelDraft === userProfile\.languageLevel;/,
  );
});

test("5. canSaveLanguages requires a real levelDraft value in addition to native/practice, and is disabled when unchanged", () => {
  assert.match(source, /Boolean\(nativeDraft\) && Boolean\(practiceDraft\) && Boolean\(levelDraft\)/);
  assert.match(source, /!isLanguagesUnchanged && !isSavingLanguages;/);
});

console.log("\n=== Save persists native + learning + level atomically via the narrow RPC ===\n");

test("6. handleSaveLanguages calls updateUserProfileLearningPreferences with all three drafts in one call, never two sequential RPC calls", () => {
  assert.match(
    source,
    /void updateUserProfileLearningPreferences\(authSession, \{\s*\n\s*nativeLanguage: nativeDraft,\s*\n\s*practiceLanguage: practiceDraft,\s*\n\s*languageLevel: levelDraft,\s*\n\s*\}\)/,
  );
  // Never the old two-call sequence this task explicitly avoids.
  assert.doesNotMatch(source, /updateUserProfileLanguages\(authSession/);
});

test("7. The narrow atomic RPC (update_user_profile_learning_preferences) is what userProfile.ts actually calls, sending exactly the three expected fields and no client user id", () => {
  const fnMatch = userProfileSource.match(/export async function updateUserProfileLearningPreferences\(([\s\S]*?)\r?\n\}/);
  assert.ok(fnMatch, "updateUserProfileLearningPreferences must exist in userProfile.ts");
  assert.match(fnMatch[1], /\/rest\/v1\/rpc\/update_user_profile_learning_preferences/);
  const bodyMatch = fnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\)/);
  assert.ok(bodyMatch, "updateUserProfileLearningPreferences must send a JSON body");
  assert.match(bodyMatch[1], /p_native_language:\s*input\.nativeLanguage/);
  assert.match(bodyMatch[1], /p_learning_language:\s*input\.practiceLanguage/);
  assert.match(bodyMatch[1], /p_current_level:\s*input\.languageLevel/);
  assert.doesNotMatch(fnMatch[1], /p_user_id/);
});

test("8. update_user_profile_languages(2-arg) is left importable/intact in userProfile.ts — the old RPC caller is not deleted, only unused by SettingsSection now", () => {
  assert.match(userProfileSource, /export async function updateUserProfileLanguages\(/);
  assert.match(userProfileSource, /\/rest\/v1\/rpc\/update_user_profile_languages/);
});

console.log("\n=== Success updates the shared profile languageLevel; failure never partially updates ===\n");

test("9. On success, the shared profile state (userProfile.languageLevel) is updated from the parsed RPC result via writeStoredUserProfile + onProfileLanguagesChange", () => {
  const saveMatch = source.match(/void updateUserProfileLearningPreferences\(authSession, \{[\s\S]*?\.finally\(/);
  assert.ok(saveMatch, "handleSaveLanguages's save chain must exist");
  const body = saveMatch[0];
  assert.match(body, /writeStoredUserProfile\(authUserId, \{\s*\n\s*\.\.\.userProfile,\s*\n\s*nativeLanguage: result\.nativeLanguage,\s*\n\s*practiceLanguage: result\.practiceLanguage,\s*\n\s*languageLevel: result\.languageLevel,\s*\n\s*updatedAt: result\.updatedAt,\s*\n\s*\}\)/);
  assert.match(body, /onProfileLanguagesChange\?\.\(\{/);
  assert.match(body, /languageLevel: \(result\.languageLevel \|\| nextProfile\.languageLevel\) as LanguageLevelCode,/);
});

test("10. On failure, all three drafts (native/practice/level) revert to the confirmed profile values, and userProfile is never touched in the .catch branch", () => {
  // Anchored on the languages-specific diagnostics line (not just any
  // `.catch((error) => {`) so this can't accidentally span from an earlier
  // unrelated catch block (nickname/email/password) all the way down to
  // this one's own .finally — those exist earlier in the same file.
  const catchMatch = source.match(
    /\.catch\(\(error\) => \{\s*\n\s*const diagnostics = describeSupabaseError\("updateUserProfileLearningPreferences", error\);([\s\S]*?)\}\)\s*\n\s*\.finally\(\(\) => \{\s*\n\s*setIsSavingLanguages\(false\);/,
  );
  assert.ok(catchMatch, "handleSaveLanguages's .catch branch must exist");
  const body = catchMatch[1];
  assert.match(body, /setNativeDraft\(userProfile\.nativeLanguage\)/);
  assert.match(body, /setPracticeDraft\(userProfile\.practiceLanguage\)/);
  assert.match(body, /setLevelDraft\(userProfile\.languageLevel\)/);
  assert.doesNotMatch(body, /writeStoredUserProfile/);
  assert.doesNotMatch(body, /onProfileLanguagesChange/);
});

test("11. Errors are sanitized through describeSupabaseError/resolveSupabaseErrorMessageKey — never a raw Supabase/Postgres message shown to the user", () => {
  assert.match(source, /describeSupabaseError\("updateUserProfileLearningPreferences", error\)/);
  assert.match(
    source,
    /resolveSupabaseErrorMessageKey\(diagnostics\.category, "userProfile\.settingsSection\.languages\.saveError"\)/,
  );
});

console.log("\n=== ProfileLanguagesChange propagation carries languageLevel end-to-end ===\n");

test("12. ProfileLanguagesChange (SettingsSection.tsx) declares languageLevel: LanguageLevelCode", () => {
  assert.match(
    source,
    /export interface ProfileLanguagesChange \{\s*\n\s*nativeLanguage: UILanguage;\s*\n\s*practiceLanguage: UILanguage;[\s\S]*?languageLevel: LanguageLevelCode;\s*\n\s*updatedAt: string;\s*\n\}/,
  );
});

test("13. App.tsx's handleProfileLanguagesChange accepts and applies languageLevel to shared userProfile state", () => {
  assert.match(appSource, /const handleProfileLanguagesChange = \(change: \{\s*\n\s*nativeLanguage: UILanguage;\s*\n\s*practiceLanguage: UILanguage;\s*\n\s*languageLevel: LanguageLevelCode;\s*\n\s*updatedAt: string;\s*\n\s*\}\) => \{/);
  assert.match(appSource, /languageLevel: change\.languageLevel,/);
});

test("14. App.tsx passes currentLevel={userProfile.languageLevel} into NewWordStudyPreparation, so a saved level change reaches Study New Words with no extra wiring", () => {
  assert.match(appSource, /currentLevel=\{userProfile\.languageLevel\}/);
});

test("15. onProfileLanguagesChange is threaded from App.tsx through UserProfileDashboardPage into SettingsSection", () => {
  assert.match(appSource, /onProfileLanguagesChange=\{handleProfileLanguagesChange\}/);
  assert.match(dashboardPageSource, /onProfileLanguagesChange=\{onProfileLanguagesChange\}/);
});

console.log("\n=== Helper text explains both language and level semantics without claiming lower-level words are learned ===\n");

test("16. The Languages card's helper text row still renders languages.changeNote (single shared helper text, not a second level-specific one)", () => {
  assert.match(source, /\{t\("userProfile\.settingsSection\.languages\.changeNote"\)\}/);
});

test("17. English changeNote explains learning-language switching AND level/new-word-study-start semantics, and preserves existing progress — never claims lower-level words are learned/mastered", () => {
  const englishInterfacePath = path.join(ROOT_DIR, "src", "data", "interface", "english_interface.json");
  const english = JSON.parse(fs.readFileSync(englishInterfacePath, "utf8"));
  const changeNote = english.userProfile.settingsSection.languages.changeNote;
  assert.match(changeNote, /learning language/i);
  assert.match(changeNote, /level/i);
  assert.match(changeNote, /new-word study/i);
  assert.match(changeNote, /progress is preserved/i);
  assert.doesNotMatch(changeNote, /learned|mastered|known/i);
});

console.log("\n=== One Save button only — no second, level-only Save affordance ===\n");

test("18. Exactly one Save button exists in the Languages section (handleSaveLanguages), not a second level-only save action", () => {
  const languagesSectionMatch = source.match(/\{\/\* ---- Languages ---- \*\/\}([\s\S]*?)\{\/\* ---- Time & Region ---- \*\/\}/);
  assert.ok(languagesSectionMatch, "the Languages section block must exist");
  const saveButtonMatches = [...languagesSectionMatch[1].matchAll(/<Button[^>]*onClick=\{handleSaveLanguages\}/g)];
  assert.equal(saveButtonMatches.length, 1);
  assert.doesNotMatch(languagesSectionMatch[1], /handleSaveLevel|handleSaveCurrentLevel/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("settings-current-level-ui-contract tests failed");
  process.exit(1);
} else {
  console.log("Settings Current Level UI contract passed");
}
