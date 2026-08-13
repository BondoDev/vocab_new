// Behavior contract for My Lists Phase 2A's UI wiring (MyListsSection,
// ListCard, ListDetailView, RenameListDialog, DeleteListDialog,
// vocabularyLists.ts). Transitively imports src/lib/supabaseAuth.ts (reads
// import.meta.env, a Vite-only global) so — matching
// test-my-lists-contract.mjs's own precedent — this is a precise
// source-text guard rather than a behavioral/DOM one.
//
// Run: node scripts/tests/vocabulary/test-my-lists-phase2a-contract.mjs
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
const cardSource = fs.readFileSync(path.join(MY_LISTS_DIR, "ListCard.tsx"), "utf8");
const detailSource = fs.readFileSync(path.join(MY_LISTS_DIR, "ListDetailView.tsx"), "utf8");
const renameDialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "RenameListDialog.tsx"), "utf8");
const deleteDialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "DeleteListDialog.tsx"), "utf8");
const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "vocabularyLists.ts"), "utf8");

console.log("\n=== 23. Phase 1 zero-list empty state is preserved unchanged ===\n");

test("23. The zero-list branch still renders the same empty-state markup/keys as Phase 1, with no search/sort/grid", () => {
  const emptyBranchMatch = sectionSource.match(/!hasLists \? \(([\s\S]*?)\) : \(/);
  assert.ok(emptyBranchMatch, "the empty-state JSX branch must still exist");
  const body = emptyBranchMatch[1];
  assert.match(body, /my-lists-empty-state__icon/);
  assert.match(body, /t\("userProfile\.myListsSection\.emptyState\.title"\)/);
  assert.match(body, /t\("userProfile\.myListsSection\.emptyState\.description"\)/);
  assert.doesNotMatch(body, /my-lists-toolbar|my-lists-card-grid|search|sort/i);
});

test("23b. Search/sort/grid only render in the hasLists branch, never in the loading/error/empty branches", () => {
  assert.match(sectionSource, /my-lists-toolbar[\s\S]*my-lists-card-grid/);
  const toolbarIndex = sectionSource.indexOf("my-lists-toolbar");
  const notHasListsIndex = sectionSource.indexOf('!hasLists ? (');
  const closeEmptyIndex = sectionSource.indexOf(") : (", notHasListsIndex);
  assert.ok(toolbarIndex > closeEmptyIndex, "toolbar must be rendered only after the empty-state branch, in the hasLists branch");
});

console.log("\n=== 21-22. Search + sort wiring ===\n");

test("21. A search input is wired to local state and filters via filterListsBySearchQuery", () => {
  assert.match(sectionSource, /import \{ filterListsBySearchQuery, sortLists, type ListSortMode \} from "\.\/listSearchSort"/);
  assert.match(sectionSource, /const \[searchQuery, setSearchQuery\] = useState\(""\)/);
  assert.match(sectionSource, /filterListsBySearchQuery\(lists, searchQuery\)/);
  assert.match(sectionSource, /onChange=\{\(event\) => setSearchQuery\(event\.target\.value\)\}/);
});

test("22. A sort control is wired to local state and sorts via sortLists, offering all three required modes", () => {
  assert.match(sectionSource, /const \[sortMode, setSortMode\] = useState<ListSortMode>\("recentlyUpdated"\)/);
  assert.match(sectionSource, /sortLists\(filterListsBySearchQuery\(lists, searchQuery\), sortMode\)/);
  assert.match(sectionSource, /<option value="recentlyUpdated">/);
  assert.match(sectionSource, /<option value="nameAsc">/);
  assert.match(sectionSource, /<option value="nameDesc">/);
});

test("Search/sort operate on already-loaded lists only — no new Supabase call is made when typing/sorting", () => {
  const toolbarStart = sectionSource.indexOf('<div className="my-lists-toolbar">');
  const cardGridStart = sectionSource.indexOf('<div className="my-lists-card-grid">');
  assert.ok(toolbarStart > -1 && cardGridStart > toolbarStart, "toolbar JSX must exist before the card grid");
  const toolbarBlock = sectionSource.slice(toolbarStart, cardGridStart);
  assert.doesNotMatch(toolbarBlock, /readUserVocabularyLists|supabase/i);
});

console.log("\n=== 24. List detail empty state ===\n");

test("24. ListDetailView shows the dedicated 'no words yet' message when the list has zero members — never a fake table (Phase 2B condition update: !hasMembers, since resolveState now holds the full active-language word set, not just this list's members — see test-my-lists-phase2b-contract.mjs's own dedicated check for the current behavior)", () => {
  assert.match(detailSource, /!hasMembers \? \(/);
  assert.match(detailSource, /t\("userProfile\.myListsSection\.detail\.emptyState"\)/);
  const emptyBranchMatch = detailSource.match(/!hasMembers \? \(([\s\S]*?)\) : \(/);
  assert.ok(emptyBranchMatch, "the detail empty-state branch must exist");
  assert.doesNotMatch(emptyBranchMatch[1], /<table/);
});

test("ListDetailView reuses loadFullVocabularyForLanguagePair rather than reimplementing word resolution (superseded by the My Lists corrective phase — see test-my-lists-corrective-contract.mjs for the current resolver contract)", () => {
  assert.match(detailSource, /import \{ loadFullVocabularyForLanguagePair, type FullVocabularyConceptRow \} from "\.\.\/vocabulary\/loadFullVocabulary"/);
});

console.log("\n=== Real word counts on cards (10-13 UI wiring) ===\n");

test("MyListsSection computes a real per-list word count directly from membership rows, never a fake count (superseded: no Learning/Known/Mastered aggregate exists anymore — see test-my-lists-corrective-contract.mjs)", () => {
  assert.match(sectionSource, /computeListWordCountsByListId\(memberships\)/);
  assert.doesNotMatch(sectionSource, /wordCount: \d/); // no hardcoded non-zero literal count
});

test("ListCard renders a real total word count from its wordCount prop, not local invented state (superseded: cards no longer show learning/known/mastered aggregates — see test-my-lists-corrective-contract.mjs)", () => {
  assert.match(cardSource, /interface ListCardProps \{[\s\S]*?wordCount: number;/);
  assert.match(cardSource, /\{wordCount\}/);
});

console.log("\n=== Card overflow menu: Rename/Delete only, Study List omitted ===\n");

test("The card menu offers exactly Rename and Delete — no Study List entry (reserved cleanly by omission, not a disabled placeholder)", () => {
  const menuMatch = cardSource.match(/<DropdownMenuContent align="end">([\s\S]*?)<\/DropdownMenuContent>/);
  assert.ok(menuMatch, "the overflow menu content must exist");
  assert.match(menuMatch[1], /userProfile\.myListsSection\.rename/);
  assert.match(menuMatch[1], /userProfile\.myListsSection\.delete/);
  assert.doesNotMatch(menuMatch[1], /studyList|study-list|StudyList/i);
});

test("The card is not itself one big clickable element — View List and the overflow trigger are two independent controls (no nested buttons)", () => {
  assert.doesNotMatch(cardSource, /<article className="my-lists-card"[^>]*onClick/);
  assert.match(cardSource, /<button[^>]*className="my-lists-card__view-button"/);
  assert.match(cardSource, /<button[^>]*className="my-lists-card__menu-trigger"/);
});

console.log("\n=== Rename dialog ===\n");

test("RenameListDialog is prefilled with the target list's current name and validated the same way as Create", () => {
  assert.match(renameDialogSource, /setName\(list\?\.name \?\? ""\)/);
  assert.match(renameDialogSource, /import \{ LIST_NAME_MAX_LENGTH, validateListName \} from "\.\/listNameValidation"/);
});

test("A duplicate rename surfaces the same shared duplicate-name error path as create (via resolveListMutationErrorMessage's 'conflict' handling)", () => {
  assert.match(sectionSource, /const handleRename = async \(name: string\) => \{([\s\S]*?)\n  \};/);
  const fnMatch = sectionSource.match(/const handleRename = async \(name: string\) => \{([\s\S]*?)\n  \};/);
  assert.match(fnMatch[1], /resolveListMutationErrorMessage\(t, error, "userProfile\.myListsSection\.renameError"\)/);
});

console.log("\n=== Delete dialog — clearly destructive, explains membership-only impact ===\n");

test("DeleteListDialog uses AlertDialog (not the plain Dialog) and destructive button styling", () => {
  assert.match(deleteDialogSource, /from "\.\.\/\.\.\/\.\.\/\.\.\/app\/components\/ui\/alert-dialog"/);
  assert.match(deleteDialogSource, /bg-destructive/);
});

test("The delete confirmation copy explains list + memberships are removed and vocabulary progress is unaffected", () => {
  assert.match(sectionSource + deleteDialogSource, /userProfile\.myListsSection\.deleteDialog\.title/);
  assert.match(sectionSource + deleteDialogSource, /userProfile\.myListsSection\.deleteDialog\.description/);
});

console.log("\n=== 18-19-20. Delete flow: local state stays consistent, no reload ===\n");

test("18/20. A successful delete removes the list AND its membership rows from local state — no full reload, no stale cards", () => {
  const fnMatch = sectionSource.match(/const handleConfirmDelete = async \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleConfirmDelete must exist");
  assert.match(fnMatch[1], /lists: prev\.lists\.filter\(\(list\) => list\.id !== deletedId\)/);
  assert.match(fnMatch[1], /memberships: prev\.memberships\.filter\(\(membership\) => membership\.listId !== deletedId\)/);
  assert.doesNotMatch(sectionSource, /location\.reload|window\.location/);
});

test("19. Delete never calls a user_word_progress-touching function — vocabulary progress stays untouched from the frontend too", () => {
  assert.doesNotMatch(sectionSource, /readUserWordProgress|completeNewWordStudy|completeWordReview|updateWordProgressFavorite/);
});

console.log("\n=== Data loading: batched, no vocabulary.json for counts ===\n");

test("Memberships for all loaded lists are fetched in one batched call, never one request per card", () => {
  assert.match(
    sectionSource,
    /readUserVocabularyListMemberships\(\s*session,\s*lists\.map\(\(list\) => list\.id\),\s*\)/,
  );
});

test("MyListsSection.tsx and ListCard.tsx never import vocabulary.json — card counts come only from membership + shared progress rows", () => {
  assert.doesNotMatch(sectionSource, /vocabulary\.json/);
  assert.doesNotMatch(cardSource, /vocabulary\.json/);
});

test("vocabularyLists.ts still never imports vocabulary.json or queries user_word_progress directly", () => {
  // \r\n -> \n first: without it, a CRLF line's trailing \r survives
  // split("\n") and blocks /\/\/.*$/ from ever reaching $ (`.` never
  // matches \r, and $ without /m only matches the true string end) — so
  // nothing gets stripped, and this file's own header comment (which
  // legitimately says "vocabulary.json" while explaining this module never
  // touches it) leaks through as a false positive on this CRLF checkout.
  const withoutComments = libSource
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  assert.doesNotMatch(withoutComments, /vocabulary\.json/);
  assert.doesNotMatch(withoutComments, /\buser_word_progress\b/);
});

console.log("\n=== Routing: reuses the existing profile-section query-param architecture ===\n");

test("List detail is addressed via a listId query param on the same myLists section, not a new route/section id", () => {
  assert.match(sectionSource, /function resolveListIdFromSearch\(search: string\): string \| null \{/);
  assert.match(sectionSource, /new URLSearchParams\(search\)\.get\("listId"\)/);
  assert.match(sectionSource, /search: "\?section=myLists"/);
  assert.match(sectionSource, /search: `\?section=myLists&listId=\$\{id\}`/);
});

console.log("\n=== Study List still not implemented (Add Words shipped in Phase 2B — see that phase's own contract test) ===\n");

test("No Study List behavior exists anywhere in the my-lists section", () => {
  for (const entry of fs.readdirSync(MY_LISTS_DIR)) {
    const filePath = path.join(MY_LISTS_DIR, entry);
    if (!fs.statSync(filePath).isFile()) continue;
    const content = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(content, /studyList|study-list|StudyList/i, `${entry} must not implement Study List yet`);
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-phase2a-contract guard passed");
}
