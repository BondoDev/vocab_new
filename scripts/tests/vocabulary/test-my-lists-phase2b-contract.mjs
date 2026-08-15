// Behavior contract for My Lists Phase 2B's UI wiring (AddWordsDialog,
// ListDetailView, MyListsSection, vocabularyLists.ts). Transitively imports
// src/lib/supabaseAuth.ts (reads import.meta.env, a Vite-only global) so —
// matching test-my-lists-phase2a-contract.mjs's own precedent — this is a
// precise source-text guard rather than a behavioral/DOM one. Covers test
// items 13-25 (UI) and 27-31 (regression) from the Phase 2B brief.
//
// Run: node scripts/tests/vocabulary/test-my-lists-phase2b-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const MY_LISTS_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "my-lists");

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
const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "vocabularyLists.ts"), "utf8");
const createDialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "CreateListDialog.tsx"), "utf8");
const renameDialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "RenameListDialog.tsx"), "utf8");
const deleteDialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "DeleteListDialog.tsx"), "utf8");
const migrationSource = fs.readFileSync(
  path.join(ROOT_DIR, "supabase", "migrations", "20260811140000_my_lists_phase2a_duplicate_protection_and_membership.sql"),
  "utf8",
);

console.log("\n=== 13. Add Words opens the picker ===\n");

test("13. The detail view's Add Words button and empty-state Add Words button both open AddWordsDialog", () => {
  assert.match(detailSource, /onClick=\{onOpenAddWords\}[\s\S]*?my-lists-detail__add-button/);
  assert.match(detailSource, /onClick=\{onOpenAddWords\}[\s\S]*?my-lists-empty-state__button/);
  assert.match(detailSource, /<AddWordsDialog\s+open=\{isAddWordsDialogOpen\}/);
});

console.log("\n=== 14. Already-added words unavailable in the picker ===\n");

test("14. AddWordsDialog excludes already-added words from availableRows before search/status filtering (superseded identity: conceptId, since membership is word_id-based — see supabase/README.md's 'My Lists Corrective Phase' section)", () => {
  const availableMatch = pickerSource.match(/const availableRows = useMemo\(\s*\(\) => allRows\.filter\(\(row\) => !alreadyAddedIds\.has\(row\.conceptId\)\),/);
  assert.ok(availableMatch, "availableRows must filter out alreadyAddedIds by conceptId");
  assert.match(pickerSource, /const visibleRows = useMemo\(\(\) => \{\s*const byStatus = filterListWordRowsByStatus\(availableRows, statusFilter\);/);
});

console.log("\n=== 15. Multi-select count correct ===\n");

test("15. Selection is a Set, toggled per row, and the footer summary/button both derive from its size", () => {
  assert.match(pickerSource, /const \[selectedIds, setSelectedIds\] = useState<ReadonlySet<string>>\(new Set\(\)\)/);
  assert.match(pickerSource, /const toggleSelected = \(conceptId: string\) => \{/);
  assert.match(pickerSource, /const selectedCount = selectedIds\.size;/);
  assert.match(pickerSource, /selectedCount === 0\s*\n\s*\? t\("userProfile\.myListsSection\.picker\.addSelected"\)/);
});

test("Selected rows are visually marked and the checkbox reflects selection state", () => {
  assert.match(pickerSource, /const isSelected = selectedIds\.has\(row\.conceptId\);/);
  assert.match(pickerSource, /checked=\{isSelected\}/);
  assert.match(pickerSource, /is-selected/);
});

console.log("\n=== 16. Successful add updates list immediately ===\n");

test("16. handleSubmitAddWords calls the RPC, refetches only this list's memberships, and replaces them in the shared cache (via onListMembershipsReplaced) — no full reload", () => {
  // Fetch-audit Phase 3: the "replace this list's own membership rows"
  // updater moved from this section's own setState to
  // useProfileSharedMyLists.ts's applyListMembershipsReplaced — see that
  // hook's own header. The RPC call + targeted authoritative re-read
  // (needed because add_words_to_vocabulary_list's response has no
  // created_at) stay exactly where they were, in this section.
  const fnMatch = sectionSource.match(/const handleSubmitAddWords = async \(wordIds: string\[\]\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleSubmitAddWords must exist");
  assert.match(fnMatch[1], /addWordsToVocabularyList\(session, listIdToUpdate, wordIds\)/);
  assert.match(fnMatch[1], /readUserVocabularyListMemberships\(session, \[listIdToUpdate\]\)/);
  assert.match(fnMatch[1], /onListMembershipsReplaced\(listIdToUpdate, freshMemberships\)/);
  assert.doesNotMatch(sectionSource, /location\.reload|window\.location/);
  const applierMatch = fs
    .readFileSync(path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "useProfileSharedMyLists.ts"), "utf8")
    .match(/const applyListMembershipsReplaced = useCallback\(\s*\(listId: string, memberships: UserVocabularyListMembership\[\]\) => \{([\s\S]*?)\n {4}\},\s*\[contextKey\],\s*\);/);
  assert.ok(applierMatch, "useProfileSharedMyLists.ts must define applyListMembershipsReplaced");
  assert.match(
    applierMatch[1],
    /memberships: \[\.\.\.prev\.memberships\.filter\(\(membership\) => membership\.listId !== listId\), \.\.\.memberships\]/,
  );
});

console.log("\n=== 17. Remove updates list immediately (optimistic) ===\n");

test("17. handleRemoveWord removes the membership from the shared cache before the RPC resolves (optimistic, via onListMembershipRemoved), and rolls back via onListMembershipAdded on failure", () => {
  // Fetch-audit Phase 3: same lift as test 16 above — the optimistic
  // remove/rollback updaters moved to useProfileSharedMyLists.ts's
  // applyMembershipRemoved/applyMembershipAdded.
  const fnMatch = sectionSource.match(/const handleRemoveWord = \(wordId: string\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleRemoveWord must exist");
  const applyRemovedIndex = fnMatch[1].indexOf("onListMembershipRemoved(listIdToUpdate, wordId);");
  const rpcCallIndex = fnMatch[1].indexOf("removeWordFromVocabularyList(");
  assert.ok(applyRemovedIndex > -1 && rpcCallIndex > -1 && applyRemovedIndex < rpcCallIndex, "the shared cache must update before the RPC call fires");
  assert.match(fnMatch[1], /\.catch\(\(error\) => \{[\s\S]*?onListMembershipAdded\(removedMembership\)/);
});

test("A successful remove shows the 'Removed from list' toast; a failed remove shows a distinct error toast", () => {
  assert.match(sectionSource, /showToast\(t\("userProfile\.myListsSection\.removedFromList"\)\)/);
  assert.match(sectionSource, /showToast\(t\("userProfile\.myListsSection\.removeError"\)\)/);
});

console.log("\n=== Counts stay real — superseded by the My Lists corrective phase's word-count helper ===\n");

test("Card/detail counts are computed via computeListWordCountsByListId (superseded: the Learning/Known/Mastered aggregate from Phase 2B no longer exists on cards at all — see test-my-lists-corrective-contract.mjs)", () => {
  assert.match(sectionSource, /computeListWordCountsByListId\(memberships\)/);
  assert.doesNotMatch(sectionSource, /learning\+\+|known\+\+|mastered\+\+/);
});

console.log("\n=== 18-19. Search by word / translation ===\n");

test("18-19. The detail view's search filters via filterListWordRowsBySearch, which matches both targetWord and translation (superseded module: listWordFiltering.ts, since rows now carry an optional notStudied status — see supabase/README.md's 'My Lists Corrective Phase' section)", () => {
  assert.match(detailSource, /import \{ filterListWordRowsByStatus, filterListWordRowsBySearch, type ListWordStatusFilterId \} from "\.\/listWordFiltering"/);
  assert.match(detailSource, /filterListWordRowsBySearch\(byStatus, searchQuery\)/);
  const listWordFilteringSource = fs.readFileSync(path.join(MY_LISTS_DIR, "listWordFiltering.ts"), "utf8");
  assert.match(listWordFilteringSource, /word\.includes\(normalizedQuery\) \|\| translation\.includes\(normalizedQuery\)/);
});

test("The Add Words picker's search is client-side over already-loaded resolved rows — no Supabase request on keystroke", () => {
  const searchBlockMatch = pickerSource.match(/const visibleRows = useMemo\(\(\) => \{([\s\S]*?)\}, \[availableRows, statusFilter, searchQuery\]\);/);
  assert.ok(searchBlockMatch, "visibleRows must be a pure useMemo over already-loaded rows");
  assert.doesNotMatch(searchBlockMatch[1], /supabase|fetch\(|await /i);
});

console.log("\n=== 20-22. Not studied/Learning/Known/Mastered filters ===\n");

test("20-22. Both the picker and the detail view offer all/notStudied/learning/known/mastered via ListWordStatusFilterId, filtered with filterListWordRowsByStatus (superseded: Phase 2B had no 'Not studied' filter at all — see test-my-lists-corrective-contract.mjs)", () => {
  assert.match(pickerSource, /const STATUS_FILTERS: ListWordStatusFilterId\[\] = \["all", "notStudied", "learning", "known", "mastered"\];/);
  assert.match(detailSource, /const STATUS_FILTERS: ListWordStatusFilterId\[\] = \["all", "notStudied", "learning", "known", "mastered"\];/);
  assert.match(pickerSource, /filterListWordRowsByStatus\(availableRows, statusFilter\)/);
  assert.match(detailSource, /filterListWordRowsByStatus\(listRows, statusFilter\)/);
});

console.log("\n=== 23. Zero-list-word empty state ===\n");

test("23. ListDetailView shows the real empty state (title + description + Add Words) when the list has zero members — never an empty table", () => {
  const emptyBranchMatch = detailSource.match(/!hasMembers \? \(([\s\S]*?)\) : \(/);
  assert.ok(emptyBranchMatch, "the zero-member empty-state branch must exist");
  assert.match(emptyBranchMatch[1], /t\("userProfile\.myListsSection\.detail\.emptyState"\)/);
  assert.match(emptyBranchMatch[1], /t\("userProfile\.myListsSection\.detail\.emptyStateDescription"\)/);
  assert.match(emptyBranchMatch[1], /onOpenAddWords/);
  assert.doesNotMatch(emptyBranchMatch[1], /<table/);
});

console.log("\n=== 24. Zero-filter-match state ===\n");

test("24. A non-empty list whose current search/filter matches zero rows shows 'No matching words', not the zero-list empty state", () => {
  assert.match(detailSource, /filteredRows\.length === 0 \? \(/);
  const noMatchBranchMatch = detailSource.match(/filteredRows\.length === 0 \? \(([\s\S]*?)\) : \(/);
  assert.ok(noMatchBranchMatch, "the no-match branch must exist");
  assert.match(noMatchBranchMatch[1], /t\("userProfile\.myListsSection\.detail\.noMatch"\)/);
  assert.doesNotMatch(noMatchBranchMatch[1], /detail\.emptyState"\)/, "must not reuse the zero-list empty-state copy for a zero-match filter");
});

console.log("\n=== 25. Mobile rendering contract ===\n");

test("25. The detail view renders both a desktop table and a mobile card list (CSS-toggled, matching VocabularyTable's own two-markup pattern) — not a squeezed table", () => {
  assert.match(detailSource, /className="my-lists-detail-table-container"/);
  assert.match(detailSource, /className="my-lists-mobile-list"/);
  const scssSource = fs.readFileSync(path.join(MY_LISTS_DIR, "my-lists-section.scss"), "utf8");
  assert.match(scssSource, /\.my-lists-detail-table-container\s*\{\s*display: none;/);
  assert.match(scssSource, /\.my-lists-mobile-list\s*\{\s*display: flex;/);
});

test("The Add Words dialog uses a responsive width (sm:max-w-2xl), not a fixed narrow modal squeezing a desktop table", () => {
  assert.match(pickerSource, /className="my-lists-add-words-dialog sm:max-w-2xl"/);
});

console.log("\n=== Accessibility ===\n");

test("Picker rows use a semantic <label>+checkbox pairing (native accessible name) rather than a bare clickable div", () => {
  assert.match(pickerSource, /<label key=\{row\.conceptId\} className=\{`my-lists-picker__row/);
  assert.match(pickerSource, /<input\s+type="checkbox"/);
});

test("Row actions (View word details / Remove from list) use the shared keyboard-accessible DropdownMenu, not a bare onClick div", () => {
  assert.match(detailSource, /import \{\s*DropdownMenu,\s*DropdownMenuContent,\s*DropdownMenuItem,\s*DropdownMenuTrigger,\s*\} from "\.\.\/\.\.\/\.\.\/\.\.\/app\/components\/ui\/dropdown-menu"/);
  assert.match(detailSource, /function RowActionsMenu/);
});

test("Status is never communicated by color alone — every status badge still renders its own text label (superseded field: row.status, now inclusive of notStudied — see listWordStatus.ts)", () => {
  assert.match(detailSource, /\{statusLabel\(row\.status\)\}/);
  assert.match(pickerSource, /\{statusLabel\(row\.status\)\}/);
});

console.log("\n=== Loading states ===\n");

test("AddWordsDialog shows a loading block while resolveStatus is 'loading' — never an empty/'no matches' flash before load completes", () => {
  const loadingBranchIndex = pickerSource.indexOf('resolveStatus === "loading" ? (');
  const noMatchIndex = pickerSource.indexOf("detail.noMatch");
  assert.ok(loadingBranchIndex > -1 && noMatchIndex > loadingBranchIndex, "the loading branch must be checked before the no-match copy can ever render");
});

console.log("\n=== Errors are scoped and safe ===\n");

test("Add/remove errors never surface a raw Supabase/Postgres message — both go through VocabularyListError + resolveListMutationErrorMessage", () => {
  assert.match(libSource, /throw new VocabularyListError\("We couldn't add those words to your list\. Please try again\.", category\);/);
  assert.match(libSource, /throw new VocabularyListError\("We couldn't remove this word\. Please try again\.", category\);/);
  assert.match(sectionSource, /setAddWordsError\(resolveListMutationErrorMessage\(t, error, "userProfile\.myListsSection\.addWordsError"\)\)/);
});

console.log("\n=== Performance: batched add, no per-row/per-card network calls ===\n");

test("Add Words always calls the batch RPC once for the whole selection, never once per selected word", () => {
  assert.doesNotMatch(pickerSource, /selectedIds\.forEach|for \(const .* of selectedIds\)/);
  assert.match(sectionSource, /addWordsToVocabularyList\(session, listIdToUpdate, wordIds\)/);
});

test("vocabulary.json is resolved once per ListDetailView mount for the FULL vocabulary set — not filtered by progress rows, not once per row, not twice for member vs. picker subsets (superseded resolver: loadFullVocabularyForLanguagePair, keyed only on target/native language — see supabase/README.md's 'My Lists Corrective Phase' section)", () => {
  const effectMatch = detailSource.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[list\.targetLanguage, nativeLanguage\]\);/);
  assert.ok(effectMatch, "the single resolution effect must exist, keyed only on target/native language — not on memberships or progress rows");
  assert.match(effectMatch[1], /loadFullVocabularyForLanguagePair\(\{\s*targetLanguage: list\.targetLanguage,/);
});

console.log("\n=== 26 covered by test-my-lists-phase2b-localization.mjs ===\n");
console.log("  (see scripts/tests/vocabulary/test-my-lists-phase2b-localization.mjs)");
passed++;

console.log("\n=== 27-30. Create/rename/delete/duplicate-name regression ===\n");

test("27. Create List flow is unchanged: same dialog, same handler, same validation", () => {
  assert.match(sectionSource, /const handleOpenCreateDialog = \(\) => \{/);
  assert.match(sectionSource, /const handleCreate = async \(name: string\) => \{/);
  assert.match(createDialogSource, /const validation = validateListName\(name\)/);
});

test("28. Rename flow is unchanged: prefilled dialog, same duplicate-aware handler", () => {
  assert.match(sectionSource, /const handleRename = async \(name: string\) => \{/);
  assert.match(renameDialogSource, /setName\(list\?\.name \?\? ""\)/);
});

test("29. Delete flow is unchanged: AlertDialog confirmation, same handler", () => {
  assert.match(sectionSource, /const handleConfirmDelete = async \(\) => \{/);
  assert.match(deleteDialogSource, /from "\.\.\/\.\.\/\.\.\/\.\.\/app\/components\/ui\/alert-dialog"/);
});

test("30. The duplicate-name unique index and RPC checks from Phase 2A are untouched by any Phase 2B migration", () => {
  assert.match(migrationSource, /create unique index user_vocabulary_lists_user_language_normalized_name_key/);
  const phase2bMigrationSource = fs.readFileSync(
    path.join(ROOT_DIR, "supabase", "migrations", "20260811160000_my_lists_phase2b_membership_write_rpcs.sql"),
    "utf8",
  );
  assert.doesNotMatch(phase2bMigrationSource, /create unique index|user_vocabulary_lists_user_language_normalized_name_key/);
});

console.log("\n=== 31. No Study List implementation introduced ===\n");

test("31. No Study List UI, route, or behavior exists anywhere in the my-lists section or its migrations", () => {
  for (const entry of fs.readdirSync(MY_LISTS_DIR)) {
    const filePath = path.join(MY_LISTS_DIR, entry);
    if (!fs.statSync(filePath).isFile()) continue;
    const content = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(content, /studyList|study-list|StudyList/i, `${entry} must not implement Study List yet`);
  }
  const phase2bMigrationSource = fs.readFileSync(
    path.join(ROOT_DIR, "supabase", "migrations", "20260811160000_my_lists_phase2b_membership_write_rpcs.sql"),
    "utf8",
  );
  assert.doesNotMatch(phase2bMigrationSource, /study/i);
});

test("No 'change learning state' / 'review now' / 'study now' action exists in the list-detail row menu", () => {
  assert.doesNotMatch(detailSource, /review now|study now|change.*learning state/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-phase2b-contract guard passed");
}
