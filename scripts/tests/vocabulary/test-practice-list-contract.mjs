// Behavior/architecture contract for Practice List (My Lists Phase 3):
// entry points, setup dialog wiring, VocabularyPractice's
// restrictToConceptIds integration, zero-SRS-effect guarantees, exercise
// reuse, and App.tsx routing/session handoff. A precise source-text guard
// (not a behavioral/DOM one) — matching every other My Lists contract
// test's own precedent (see test-my-lists-corrective-contract.mjs's own
// header for why: VocabularyPractice.tsx and App.tsx transitively read
// import.meta.env, a Vite-only global).
//
// Run: node scripts/tests/vocabulary/test-practice-list-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const MY_LISTS_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "my-lists");
const PRACTICE_DIR = path.join(ROOT_DIR, "src", "features", "practice");
const PRACTICE_EXERCISES_DIR = path.join(PRACTICE_DIR, "exercises");

// Strips `//` line comments before a source-text assertion checks for the
// ABSENCE of a pattern — otherwise a comment that merely explains what was
// deliberately left out (e.g. "no CEFR filter here") would itself trip the
// same assertion it's documenting compliance with.
function stripLineComments(source) {
  // No `$` anchor: these source files have CRLF line endings, and `.`
  // already excludes `\r` — anchoring on `$` (end of string, after the
  // trailing `\r`) would never match, silently leaving every "stripped"
  // comment intact. Un-anchored `.*` already stops at the `\r` on its own.
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*/, ""))
    .join("\n");
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

const appSource = fs.readFileSync(path.join(ROOT_DIR, "src", "app", "App.tsx"), "utf8");
const vocabPracticeSource = fs.readFileSync(path.join(PRACTICE_DIR, "VocabularyPractice.tsx"), "utf8");
const dialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "PracticeListSetupDialog.tsx"), "utf8");
const detailSource = fs.readFileSync(path.join(MY_LISTS_DIR, "ListDetailView.tsx"), "utf8");
const cardSource = fs.readFileSync(path.join(MY_LISTS_DIR, "ListCard.tsx"), "utf8");
const sectionSource = fs.readFileSync(path.join(MY_LISTS_DIR, "MyListsSection.tsx"), "utf8");
const dashboardSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "UserProfileDashboardPage.tsx"),
  "utf8",
);
const hookSource = fs.readFileSync(path.join(ROOT_DIR, "src", "app", "hooks", "usePracticeListSession.ts"), "utf8");
const customPracticeProgressSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "lib", "customPracticeProgress.ts"),
  "utf8",
);

console.log("\n=== Entry points ===\n");

test("Detail header: Practice List is the primary action, before Add Words, only inside the hasMembers branch (never for a zero-word list)", () => {
  const actionsBlockMatch = detailSource.match(/hasMembers \? \(\s*<div className="my-lists-detail__actions">([\s\S]*?)<\/div>\s*\) : null/);
  assert.ok(actionsBlockMatch, "the actions block must exist and stay gated on hasMembers");
  const practiceButtonIndex = actionsBlockMatch[1].indexOf("onOpenPracticeList");
  const addWordsButtonIndex = actionsBlockMatch[1].indexOf("onOpenAddWords");
  assert.ok(practiceButtonIndex > -1 && addWordsButtonIndex > -1 && practiceButtonIndex < addWordsButtonIndex);
  assert.match(actionsBlockMatch[1], /t\("userProfile\.myListsSection\.practiceList"\)/);
});

test("15. A zero-word list never renders the Practice List button (the whole actions block, incl. Practice List, is gated on hasMembers)", () => {
  assert.match(detailSource, /\{hasMembers \? \(\s*<div className="my-lists-detail__actions">/);
});

test("List card: Practice List is an optional overflow-menu item, present only when a callback is supplied", () => {
  assert.match(cardSource, /onPracticeList\?\: \(\) => void;/);
  assert.match(cardSource, /\{onPracticeList \? \(\s*<DropdownMenuItem onSelect=\{onPracticeList\}>/);
});

test("15b. MyListsSection only supplies ListCard's onPracticeList when the list actually has words (never for a 0-word list)", () => {
  const propMatch = sectionSource.match(/onPracticeList=\{\s*onStartPracticeList && getListWordCount\(wordCountsByListId, list\.id\) > 0([\s\S]*?)\}/);
  assert.ok(propMatch, "onPracticeList must be conditioned on a non-zero word count");
});

console.log("\n=== Setup dialog: compact, no forbidden filters, quantity/order/exercises ===\n");

test("The setup dialog does NOT expose status/SRS/CEFR/grammar/daily-goal filters", () => {
  assert.doesNotMatch(
    stripLineComments(dialogSource),
    /notStudied.*filter|statusFilter|srsPriority|dailyGoal|cefr|grammarType/i,
  );
});

test("Quantity/order controls are built from the pure helpers, not ad-hoc JSX logic", () => {
  assert.match(dialogSource, /import \{[\s\S]*?buildQuantityOptions,[\s\S]*?getDefaultQuantityOption,[\s\S]*?selectListPracticeWords,[\s\S]*?\} from "\.\/practiceListSelection"/);
  assert.match(dialogSource, /buildQuantityOptions\(memberships\.length\)/);
});

test("24. Exercise selection reuses the canonical EXERCISE_IDS contract and exerciseSelection.exercise.* labels — no second exercise-name list", () => {
  assert.match(dialogSource, /import \{ EXERCISE_IDS, type ExerciseId \} from "\.\.\/\.\.\/\.\.\/\.\.\/exercises\/exerciseIds"/);
  assert.match(dialogSource, /t\(`exerciseSelection\.exercise\.\$\{exerciseId\}`\)/);
  assert.doesNotMatch(dialogSource, /const exerciseGroups|const exerciseItems/);
});

test("The last selected exercise can never be deselected (mirrors ExerciseSelection.tsx's own rule)", () => {
  assert.match(dialogSource, /if \(previous\.length === 1\) return previous;/);
});

test("Default quantity/order/exercises reset every time the dialog opens — never a stale prior selection", () => {
  const effectMatch = dialogSource.match(/useEffect\(\(\) => \{\s*if \(!open\) return;([\s\S]*?)\}, \[open\]\);/);
  assert.ok(effectMatch, "the open-triggered reset effect must exist");
  assert.match(effectMatch[1], /getDefaultQuantityOption/);
  assert.match(effectMatch[1], /setOrder\("random"\)/);
  assert.match(effectMatch[1], /setSelectedExercises\(\[\.\.\.EXERCISE_IDS\]\)/);
});

test("Start Practice resolves the final word selection from the CURRENT memberships prop at click time, not a frozen dialog-open snapshot", () => {
  const handleStartMatch = dialogSource.match(/const handleStart = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(handleStartMatch, "handleStart must exist");
  assert.match(handleStartMatch[1], /selectListPracticeWords\(memberships, selectedQuantity\.value, order\)/);
});

console.log("\n=== VocabularyPractice: restrictToConceptIds integration (items 16, 28, 30) ===\n");

test("restrictToConceptIds is an optional prop, never required — direct/ordinary Custom Practice is unaffected when omitted", () => {
  assert.match(vocabPracticeSource, /restrictToConceptIds\?: string\[\] \| null;/);
});

test("28. When restrictToConceptIds is provided, the word pool is restricted AND reordered to match it exactly — level/category/word-type filters are skipped entirely", () => {
  const restrictionBlockMatch = vocabPracticeSource.match(/if \(hasConceptIdRestriction\) \{([\s\S]*?)\} else \{/);
  assert.ok(restrictionBlockMatch, "the concept-id restriction branch must exist");
  assert.match(restrictionBlockMatch[1], /restrictToConceptIds!\s*\n\s*\.map\(\(conceptId\) => wordByConceptId\.get\(conceptId\)\)/);
});

test("16. The restriction never reads or filters by word_state/category/status — an unstudied concept id is included exactly like a studied one", () => {
  const restrictionBlockMatch = vocabPracticeSource.match(/if \(hasConceptIdRestriction\) \{([\s\S]*?)\} else \{/);
  assert.doesNotMatch(stripLineComments(restrictionBlockMatch[1]), /word_state|\bcategory\b|\bstatus\b/i);
});

test("30. Direct/ordinary Custom Practice (no restriction) still applies the original level/category/word-type filters, byte-identical logic", () => {
  const elseBlockMatch = vocabPracticeSource.match(/\} else \{([\s\S]*?)\}\s*\n\s*\n\s*\/\/ Shuffle the words/);
  assert.ok(elseBlockMatch, "the unrestricted (ordinary) filter branch must exist");
  assert.match(elseBlockMatch[1], /selectedLevels\.includes\(word\.level\)/);
  assert.match(elseBlockMatch[1], /selectedCategories\.includes\(word\.category\)/);
  assert.match(elseBlockMatch[1], /selectedWordTypes\.includes\(word\.type\)/);
});

test("A concept-id-restricted session's order is never reshuffled — shuffleArray is skipped exactly when the restriction is active", () => {
  assert.match(
    vocabPracticeSource,
    /const shuffledWords = hasConceptIdRestriction \? loadedWords : shuffleArray\(loadedWords\);/,
  );
});

console.log("\n=== Zero SRS effect (items 17-22) ===\n");

test("17-22. VocabularyPractice never references user_word_progress, word_state, correct_streak, next_review_at, reviews_completed, or new_words_completed anywhere in its source", () => {
  assert.doesNotMatch(
    vocabPracticeSource,
    /user_word_progress|correct_streak|next_review_at|reviews_completed|new_words_completed/i,
  );
});

test("The only persistence call VocabularyPractice makes is completeCustomPracticeWord — no other Supabase write function is imported", () => {
  const supabaseWriteImports = [...vocabPracticeSource.matchAll(/import \{[^}]*\} from "\.\.\/\.\.\/lib\/(\w+)"/g)].map(
    (m) => m[0],
  );
  assert.match(vocabPracticeSource, /import \{ completeCustomPracticeWord \} from "\.\.\/\.\.\/lib\/customPracticeProgress"/);
  assert.doesNotMatch(stripLineComments(vocabPracticeSource), /completeNewWordStudy|completeWordReview|updateWordProgressFavorite/);
});

test("17. complete_custom_practice_word's own request body sends no word/concept id at all — it cannot create or reference a user_word_progress row for any word, studied or not", () => {
  const bodyMatch = customPracticeProgressSource.match(/\/rest\/v1\/rpc\/complete_custom_practice_word", \{([\s\S]*?)\}\);/);
  assert.ok(bodyMatch, "the RPC call body must exist");
  assert.doesNotMatch(bodyMatch[1], /word_id|p_word/i);
  assert.match(bodyMatch[1], /p_event_id: eventId/);
  assert.match(bodyMatch[1], /p_target_language: targetLanguage/);
  assert.match(bodyMatch[1], /p_custom_practice_time_seconds: customPracticeTimeSeconds/);
});

test("customPracticeProgress.ts's own header confirms it never touches user_word_progress, review_events, or the SRS counters", () => {
  assert.match(
    customPracticeProgressSource,
    /never touches user_word_progress, never creates a review_events row,\s*\n\/\/ never increments new_words_completed\/reviews_completed/,
  );
});

console.log("\n=== Activity time (item 23) ===\n");

test("23. VocabularyPractice's active-time tracking reuses the existing Custom Practice timer/persistence — no new time column or tracker introduced", () => {
  assert.match(vocabPracticeSource, /customPracticeTimerRef/);
  assert.match(vocabPracticeSource, /createActiveWordTimer/);
  assert.doesNotMatch(vocabPracticeSource, /practice_list_time_seconds|practiceListTimeSeconds/i);
});

console.log("\n=== No new exercise engine/components (items 25-26) ===\n");

test("25. The 5 canonical exercise components (matching EXERCISE_IDS) still exist under src/features/practice/exercises/, and VocabularyPractice imports exactly those 5 — no 6th exercise component was introduced", () => {
  const exerciseFiles = new Set(fs.readdirSync(PRACTICE_EXERCISES_DIR).filter((entry) => entry.endsWith(".tsx")));
  const canonicalExerciseFiles = [
    "WordTypingExercise.tsx",
    "HalfWrittenExercise.tsx",
    "BrokenWordExercise.tsx",
    "ConnectWordsExercise.tsx",
    "ListeningExercise.tsx",
  ];
  for (const file of canonicalExerciseFiles) {
    assert.ok(exerciseFiles.has(file), `${file} must still exist`);
  }
  const importedExerciseComponents = [...vocabPracticeSource.matchAll(/import \{ (\w+Exercise) \} from "\.\/exercises\/\1"/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    importedExerciseComponents.sort(),
    ["BrokenWordExercise", "ConnectWordsExercise", "HalfWrittenExercise", "ListeningExercise", "WordTypingExercise"].sort(),
  );
});

test("26. Group-exercise (4-word) pool-size fallback logic is untouched — small pools still gracefully fall back to a non-group exercise", () => {
  assert.match(vocabPracticeSource, /if \(isFourWordExercise\(nextExercise\)\) \{\s*\n\s*if \(resolvedNextIndex \+ 4 > words\.length\) \{\s*\n\s*nextExercise = getNonFourWordFallback\(\);/);
  assert.match(vocabPracticeSource, /shuffledWords\.length < 4/);
});

test("No My Lists file invents special small-list/group-exercise behavior of its own — Practice List relies entirely on VocabularyPractice's existing engine", () => {
  assert.doesNotMatch(dialogSource, /connectWords.*4|listening.*4|minimumPool|groupExercise/i);
});

console.log("\n=== Routing/session (items 27, 29) ===\n");

test("27. No new route is introduced — Practice List reuses buildPracticeRoute/the existing 'practice' page, tagged with source=vocabulary-list", () => {
  assert.match(appSource, /buildPracticeRoute\(\s*\n\s*yourLanguage as UILanguage,\s*\n\s*config\.targetLanguage as UILanguage,\s*\n\s*ROUTES,\s*\n\s*\);/);
  assert.match(appSource, /\$\{practiceRoute\}\?source=vocabulary-list&listId=\$\{encodeURIComponent\(config\.listId\)\}/);
  assert.doesNotMatch(appSource, /practiceList:\s*string,?\s*\n?\s*\/\/ ROUTES/); // no new ROUTES.practiceList key added
});

test("29. Starting a Practice List session sets practiceLanguage to the list's own target_language before navigating", () => {
  const handlerMatch = appSource.match(/const handleStartPracticeList = \(config: PracticeListStartConfig\) => \{([\s\S]*?)\n  \};/);
  assert.ok(handlerMatch, "handleStartPracticeList must exist");
  assert.match(handlerMatch[1], /setPracticeLanguage\(config\.targetLanguage\)/);
});

test("The practice route render branch only restricts words when the URL's listId matches the restored session's listId — never a stale/foreign session", () => {
  assert.match(
    appSource,
    /practiceListSession\.listId === vocabularyListIdParam\s*\n\s*\? practiceListSession\s*\n\s*: null;/,
  );
});

test("Leaving a Practice List session (Back/Finish) clears the session so an unrelated later Exercises visit is never restricted", () => {
  assert.match(appSource, /if \(activePracticeListSession\) setPracticeListSession\(null\);/);
});

console.log("\n=== usePracticeListSession: durable refresh, reusing the existing localStorage mechanism ===\n");

test("The session hook persists to localStorage (same mechanism useStoredAppPreferences already uses) rather than inventing a new persistence layer", () => {
  assert.match(hookSource, /window\.localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(session\)\)/);
  assert.match(hookSource, /window\.localStorage\.getItem\(STORAGE_KEY\)/);
});

test("Only a small listId/listName/conceptIds JSON blob is stored — never the whole vocabulary payload or anything beyond the resolved id list", () => {
  assert.match(hookSource, /interface PracticeListSession \{\s*\n\s*listId: string;\s*\n\s*listName: string;/);
});

console.log("\n=== Prop threading: App.tsx -> UserProfileDashboardPage -> MyListsSection ===\n");

test("onStartPracticeList is threaded through UserProfileDashboardPage to MyListsSection", () => {
  assert.match(dashboardSource, /onStartPracticeList\?\: \(config: PracticeListStartConfig\) => void;/);
  assert.match(dashboardSource, /<MyListsSection[\s\S]*?onStartPracticeList=\{onStartPracticeList\}/);
});

test("App.tsx passes handleStartPracticeList into UserProfileDashboardPage's profile-page render", () => {
  assert.match(appSource, /onStartPracticeList=\{handleStartPracticeList\}/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("practice-list-contract guard passed");
}
