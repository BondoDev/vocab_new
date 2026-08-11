// Behavior contract for the My Lists corrective phase's UI wiring
// (AddWordsDialog, ListDetailView, ListCard, MyListsSection,
// vocabularyLists.ts, loadFullVocabulary.ts). Transitively imports
// src/lib/supabaseAuth.ts (reads import.meta.env, a Vite-only global) so —
// matching test-my-lists-phase2b-contract.mjs's own precedent — this is a
// precise source-text guard rather than a behavioral/DOM one. Covers the
// corrective brief's test items 6-28 (Add/Remove/Picker/Detail/Cards) and
// 30-34 (regression).
//
// Run: node scripts/tests/vocabulary/test-my-lists-corrective-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const MY_LISTS_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "my-lists");
const VOCAB_SECTION_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "vocabulary");

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

const sectionSource = fs.readFileSync(path.join(MY_LISTS_DIR, "MyListsSection.tsx"), "utf8");
const detailSource = fs.readFileSync(path.join(MY_LISTS_DIR, "ListDetailView.tsx"), "utf8");
const pickerSource = fs.readFileSync(path.join(MY_LISTS_DIR, "AddWordsDialog.tsx"), "utf8");
const cardSource = fs.readFileSync(path.join(MY_LISTS_DIR, "ListCard.tsx"), "utf8");
const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "vocabularyLists.ts"), "utf8");
const loadFullVocabSource = fs.readFileSync(path.join(VOCAB_SECTION_DIR, "loadFullVocabulary.ts"), "utf8");
const statusSource = fs.readFileSync(path.join(MY_LISTS_DIR, "listWordStatus.ts"), "utf8");
const countsSource = fs.readFileSync(path.join(MY_LISTS_DIR, "listWordCounts.ts"), "utf8");
const createDialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "CreateListDialog.tsx"), "utf8");
const renameDialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "RenameListDialog.tsx"), "utf8");
const deleteDialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "DeleteListDialog.tsx"), "utf8");

console.log("\n=== Membership model: word_id-based everywhere, no word_progress_id left ===\n");

test("vocabularyLists.ts membership/add/remove are all word_id-based — no word_progress_id anywhere", () => {
  assert.doesNotMatch(libSource, /word_progress_id|wordProgressId/);
  assert.match(libSource, /export interface UserVocabularyListMembership \{\s*listId: string;\s*wordId: string;\s*createdAt: string;\s*\}/);
  assert.match(libSource, /p_word_ids: wordIds/);
  assert.match(libSource, /p_word_id: wordId/);
});

test("ListDetailView/AddWordsDialog/MyListsSection contain no leftover word_progress_id/wordProgressId reference", () => {
  for (const [name, source] of [
    ["ListDetailView.tsx", detailSource],
    ["AddWordsDialog.tsx", pickerSource],
    ["MyListsSection.tsx", sectionSource],
    ["ListCard.tsx", cardSource],
  ]) {
    assert.doesNotMatch(source, /word_progress_id|wordProgressId/, `${name} must not reference word_progress_id`);
  }
});

console.log("\n=== 6-10. Add: unstudied + studied words addable, duplicate-safe, batched, no progress side effects ===\n");

test("6/7/9. AddWordsDialog sources rows from allRows (the full vocabulary set), not a progress-filtered subset", () => {
  assert.match(pickerSource, /allRows: ListWordRow\[\];/);
  assert.doesNotMatch(pickerSource, /loadVocabularyProgress/);
});

test("8. Add is always a single batched RPC call for the whole selection, never one call per word", () => {
  assert.doesNotMatch(pickerSource, /selectedIds\.forEach|for \(const .* of selectedIds\)/);
  assert.match(sectionSource, /addWordsToVocabularyList\(session, listIdToUpdate, wordIds\)/);
});

test("10. Adding words never calls anything that creates/updates user_word_progress or user_daily_stats", () => {
  assert.doesNotMatch(sectionSource, /completeNewWordStudy|completeWordReview|updateWordProgressFavorite/);
  const fnMatch = sectionSource.match(/const handleSubmitAddWords = async \(wordIds: string\[\]\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleSubmitAddWords must exist");
  assert.doesNotMatch(fnMatch[1], /user_word_progress|user_daily_stats/i);
});

console.log("\n=== 11-13. Remove: unstudied + studied removable, progress untouched ===\n");

test("11/12. handleRemoveWord operates on wordId and calls removeWordFromVocabularyList with it — works identically for a studied or unstudied word (no status branching)", () => {
  const fnMatch = sectionSource.match(/const handleRemoveWord = \(wordId: string\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleRemoveWord must exist");
  assert.match(fnMatch[1], /removeWordFromVocabularyList\(session, listIdToUpdate, wordId\)/);
  assert.doesNotMatch(fnMatch[1], /\.status\s*===\s*["']notStudied["']|row\.status/);
});

test("13. Removing a word never touches user_word_progress — vocabulary progress persists", () => {
  assert.doesNotMatch(libSource.split("export async function removeWordFromVocabularyList")[1], /user_word_progress/i);
});

console.log("\n=== 14-17. Picker: full vocabulary source, unstudied + studied both visible ===\n");

test("14. The picker's rows come from ListDetailView's full-vocabulary resolution (loadFullVocabularyForLanguagePair), not loadVocabularyProgress", () => {
  assert.match(detailSource, /import \{ loadFullVocabularyForLanguagePair, type FullVocabularyConceptRow \} from "\.\.\/vocabulary\/loadFullVocabulary"/);
  assert.doesNotMatch(detailSource, /loadVocabularyProgress/);
});

test("loadFullVocabularyForLanguagePair resolves every concept in the target language, not filtered by any progress-row set", () => {
  assert.match(loadFullVocabSource, /listResolvableConceptIds\(targetEntries\)/);
  assert.doesNotMatch(loadFullVocabSource, /progressRows:|UserWordProgressFullRow/);
});

test("15/16. Every row is decorated with an OPTIONAL status via resolveListWordStatus — a row with no matching progress still resolves and renders (notStudied), never skipped", () => {
  assert.match(detailSource, /status: resolveListWordStatus\(wordStateByConceptId\.get\(row\.conceptId\)\)/);
  assert.match(statusSource, /if \(!wordState\) \{\s*return "notStudied";/);
});

test("17. Already-added words are excluded from the picker's available rows via conceptId, not any progress-derived id", () => {
  assert.match(pickerSource, /allRows\.filter\(\(row\) => !alreadyAddedIds\.has\(row\.conceptId\)\)/);
});

console.log("\n=== 18-19. Search matches target word / translation ===\n");

test("18/19. Both the detail view and the picker filter search via filterListWordRowsBySearch, matching targetWord or translation", () => {
  assert.match(detailSource, /filterListWordRowsBySearch\(byStatus, searchQuery\)/);
  assert.match(pickerSource, /filterListWordRowsBySearch\(byStatus, searchQuery\)/);
});

test("The picker's search/filter/pagination are pure client-side derivations over already-loaded rows — no Supabase call on keystroke", () => {
  const visibleBlock = pickerSource.match(/const visibleRows = useMemo\(\(\) => \{([\s\S]*?)\}, \[availableRows, statusFilter, searchQuery\]\);/);
  assert.ok(visibleBlock, "visibleRows must be a pure useMemo");
  assert.doesNotMatch(visibleBlock[1], /supabase|fetch\(|await /i);
});

console.log("\n=== 20-22. Not studied / Learning / Known / Mastered filters ===\n");

test("20-22. Both the picker and the detail view offer all/notStudied/learning/known/mastered via ListWordStatusFilterId, filtered with filterListWordRowsByStatus", () => {
  assert.match(pickerSource, /const STATUS_FILTERS: ListWordStatusFilterId\[\] = \["all", "notStudied", "learning", "known", "mastered"\];/);
  assert.match(detailSource, /const STATUS_FILTERS: ListWordStatusFilterId\[\] = \["all", "notStudied", "learning", "known", "mastered"\];/);
  assert.match(pickerSource, /filterListWordRowsByStatus\(availableRows, statusFilter\)/);
  assert.match(detailSource, /filterListWordRowsByStatus\(listRows, statusFilter\)/);
});

test("'All' remains the default filter in both the picker and the detail view — status is never forced", () => {
  assert.match(pickerSource, /useState<ListWordStatusFilterId>\("all"\)/);
  assert.match(detailSource, /useState<ListWordStatusFilterId>\("all"\)/);
});

console.log("\n=== 23. Already-added handling ===\n");

test("23. A search hit on an already-added word shows the 'Already added' hint rather than looking like a silent gap", () => {
  assert.match(pickerSource, /function AlreadyAddedHint/);
  assert.match(pickerSource, /t\("userProfile\.myListsSection\.picker\.alreadyAdded"\)/);
});

console.log("\n=== Performance: picker paginates instead of rendering thousands of DOM rows ===\n");

test("The picker paginates visibleRows at a page size within 25-50, using the shared getPageWindow helper", () => {
  assert.match(pickerSource, /const PAGE_SIZE = 30;/);
  assert.match(pickerSource, /import \{ getPageWindow \} from "\.\/listPagination"/);
  assert.match(pickerSource, /pagedRows = visibleRows\.slice\(pageStart, pageStart \+ PAGE_SIZE\)/);
});

test("Vocabulary resolution happens exactly once per ListDetailView mount (full set), not once per row and not re-triggered by membership/progress changes", () => {
  const effectMatch = detailSource.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[list\.targetLanguage, nativeLanguage\]\);/);
  assert.ok(effectMatch, "the single resolution effect must exist, keyed only on target/native language");
  assert.match(effectMatch[1], /loadFullVocabularyForLanguagePair\(\{\s*targetLanguage: list\.targetLanguage,/);
});

console.log("\n=== 24-26. Detail view: unstudied + studied rows render, count independent of progress ===\n");

test("24/25. Detail rows render whether or not they have progress — status badge always renders a text label, notStudied included", () => {
  assert.match(detailSource, /my-lists-status-badge my-lists-status-badge--\$\{row\.status\}/);
  assert.match(detailSource, /statusLabel\(row\.status\)/);
});

test("26. The header's word count comes from memberships.length — a direct membership count, never derived from resolved/progress rows", () => {
  assert.match(detailSource, /\{memberships\.length\} \{t\("userProfile\.myListsSection\.wordsUnit"\)\}/);
});

test("Detail view never auto-creates a user_word_progress row just because a word is in a list", () => {
  assert.doesNotMatch(detailSource, /completeNewWordStudy|completeWordReview|insert.*user_word_progress/i);
});

console.log("\n=== 27-28. Cards show a real total count, no aggregate display ===\n");

test("27. ListCard no longer renders Learning/Known/Mastered aggregate counts or a segmented progress bar", () => {
  assert.doesNotMatch(cardSource, /my-lists-card__bar|my-lists-card__stats|metrics\.learning|metrics\.known|metrics\.mastered/);
  assert.doesNotMatch(cardSource, /ListCardMetrics/);
});

test("28. ListCard's word count prop is a plain number (wordCount), computed via listWordCounts.ts from membership rows directly", () => {
  assert.match(cardSource, /interface ListCardProps \{[\s\S]*?wordCount: number;/);
  assert.match(cardSource, /\{wordCount\} \{t\("userProfile\.myListsSection\.wordsUnit"\)\}/);
  assert.match(sectionSource, /computeListWordCountsByListId\(memberships\)/);
  assert.match(sectionSource, /getListWordCount\(wordCountsByListId, list\.id\)/);
});

test("listWordCounts.ts computes a total only — no per-status breakdown, no word_state lookup", () => {
  assert.doesNotMatch(countsSource, /WordState|wordStateById|learning:|known:|mastered:/);
});

console.log("\n=== Language isolation: picker/detail resolve the list's OWN target_language ===\n");

test("Vocabulary is resolved for list.targetLanguage, not any other in-scope language variable", () => {
  assert.match(detailSource, /targetLanguage: list\.targetLanguage,/);
});

console.log("\n=== Accessibility (unchanged from Phase 2B) ===\n");

test("Picker rows use a semantic <label>+checkbox pairing, and status is always a text label, never color-only", () => {
  assert.match(pickerSource, /<label key=\{row\.conceptId\} className=\{`my-lists-picker__row/);
  assert.match(pickerSource, /<input\s+type="checkbox"/);
  assert.match(pickerSource, /\{statusLabel\(row\.status\)\}/);
});

console.log("\n=== 30-33. Create/rename/delete/duplicate-name regression — unchanged ===\n");

test("30. Create List flow is unchanged: same dialog, same handler, same validation", () => {
  assert.match(sectionSource, /const handleCreate = async \(name: string\) => \{/);
  assert.match(createDialogSource, /const validation = validateListName\(name\)/);
});

test("31. Rename flow is unchanged: prefilled dialog, same duplicate-aware handler", () => {
  assert.match(sectionSource, /const handleRename = async \(name: string\) => \{/);
  assert.match(renameDialogSource, /setName\(list\?\.name \?\? ""\)/);
});

test("32. Delete flow is unchanged: AlertDialog confirmation, same handler, memberships still filtered out of local state", () => {
  assert.match(sectionSource, /const handleConfirmDelete = async \(\) => \{/);
  assert.match(deleteDialogSource, /from "\.\.\/\.\.\/\.\.\/\.\.\/app\/components\/ui\/alert-dialog"/);
  assert.match(sectionSource, /memberships: prev\.memberships\.filter\(\(membership\) => membership\.listId !== deletedId\)/);
});

test("33. Duplicate-name rejection still surfaces the shared conflict copy", () => {
  assert.match(sectionSource, /resolveListMutationErrorMessage\(t, error, "userProfile\.myListsSection\.createError"\)/);
  assert.match(sectionSource, /resolveListMutationErrorMessage\(t, error, "userProfile\.myListsSection\.renameError"\)/);
});

console.log("\n=== 34. No Practice List introduced ===\n");

test("34. No Study List/Practice List UI, route, or behavior exists anywhere in the my-lists section", () => {
  for (const entry of fs.readdirSync(MY_LISTS_DIR)) {
    const filePath = path.join(MY_LISTS_DIR, entry);
    if (!fs.statSync(filePath).isFile()) continue;
    const content = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(content, /studyList|study-list|StudyList|practiceList|PracticeList|practice-list/i, `${entry} must not implement Practice List yet`);
  }
  const migrationSource = fs.readFileSync(
    path.join(ROOT_DIR, "supabase", "migrations", "20260811170000_my_lists_corrective_word_id_membership.sql"),
    "utf8",
  );
  // The migration's own header may explain, as prose, why this membership
  // model change is a deliberate prerequisite for a FUTURE Practice List —
  // what must never exist is an actual implementation artifact (a table,
  // function, or RPC whose own name references it).
  assert.doesNotMatch(migrationSource, /create (table|function) public\.\w*practice/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-corrective-contract guard passed");
}
