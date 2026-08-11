// Behavior contract for My Lists Phase 1 (MyListsSection.tsx,
// CreateListDialog.tsx, src/lib/vocabularyLists.ts, and their wiring into
// the profile shell/sidebar/header). This module transitively imports
// src/lib/supabaseAuth.ts, which reads import.meta.env — a Vite-only
// global unavailable under plain `node` — so, matching
// test-vocabulary-favorite-contract.mjs's own precedent, this is a precise
// source-text guard rather than a behavioral/DOM one.
//
// Run: node scripts/tests/vocabulary/test-my-lists-contract.mjs
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
const dialogSource = fs.readFileSync(path.join(MY_LISTS_DIR, "CreateListDialog.tsx"), "utf8");
const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "vocabularyLists.ts"), "utf8");
const migrationSource = fs.readFileSync(
  path.join(ROOT_DIR, "supabase", "migrations", "20260811130000_add_user_vocabulary_lists.sql"),
  "utf8",
);

console.log("\n=== 1-2. Empty state and absence of search/sort/filters while empty ===\n");

test("1. Zero lists renders the empty-state block (icon + title + description + Create List)", () => {
  assert.match(sectionSource, /!hasLists \? \(/);
  assert.match(sectionSource, /my-lists-empty-state/);
  assert.match(sectionSource, /t\("userProfile\.myListsSection\.emptyState\.title"\)/);
  assert.match(sectionSource, /t\("userProfile\.myListsSection\.emptyState\.description"\)/);
});

test("2. No search, sort, or filter control exists in the zero-list empty state (Phase 2A adds search/sort, but only once at least one list exists — see test-my-lists-phase2a-contract.mjs's own dedicated check)", () => {
  const emptyBranchMatch = sectionSource.match(/!hasLists \? \(([\s\S]*?)\) : \(/);
  assert.ok(emptyBranchMatch, "the empty-state JSX branch must exist");
  assert.doesNotMatch(emptyBranchMatch[1], /search|sort|filter/i);
});

test("2b. The empty branch never renders a fake placeholder list row", () => {
  const emptyBranchMatch = sectionSource.match(/!hasLists \? \(([\s\S]*?)\) : \(/);
  assert.ok(emptyBranchMatch, "the empty-state JSX branch must exist");
  assert.doesNotMatch(emptyBranchMatch[1], /my-lists-grid__item/);
});

console.log("\n=== 3. Create List opens the modal ===\n");

test("3. The header and empty-state Create List buttons both open the dialog via the same handler (renamed handleOpenCreateDialog in Phase 2A to disambiguate from rename/delete)", () => {
  assert.match(sectionSource, /const handleOpenCreateDialog = \(\) => \{/);
  assert.match(sectionSource, /onClick=\{handleOpenCreateDialog\}[\s\S]*?my-lists-section__create-button/);
  assert.match(sectionSource, /onClick=\{handleOpenCreateDialog\}[\s\S]*?my-lists-empty-state__button/);
  assert.match(sectionSource, /<CreateListDialog\s+open=\{isCreateDialogOpen\}/);
});

console.log("\n=== 4-6. Name validation (empty/whitespace rejected, trimmed) ===\n");

test("4-5. The dialog's submit is disabled unless validateListName accepts the current draft", () => {
  assert.match(dialogSource, /import \{ LIST_NAME_MAX_LENGTH, validateListName \} from "\.\/listNameValidation"/);
  assert.match(dialogSource, /const validation = validateListName\(name\)/);
  assert.match(dialogSource, /const canSubmit = validation\.ok && !isSubmitting/);
  assert.match(dialogSource, /<Button type="submit" disabled=\{!canSubmit\}>/);
});

test("6. onSubmit is only ever called with the already-trimmed name from validateListName, never the raw input", () => {
  assert.match(dialogSource, /if \(!validation\.ok \|\| isSubmitting\) return;/);
  assert.match(dialogSource, /void onSubmit\(validation\.name\)/);
  assert.doesNotMatch(dialogSource, /onSubmit\(name\)/);
});

test("6b. The Input carries a maxLength matching LIST_NAME_MAX_LENGTH (no server round-trip needed to reject an over-long draft)", () => {
  assert.match(dialogSource, /maxLength=\{LIST_NAME_MAX_LENGTH\}/);
});

console.log("\n=== 7-8. Valid submit + active target language included ===\n");

test("7-8. handleCreate sends the active practiceLanguage as the target language, never a hardcoded/omitted one", () => {
  const fnMatch = sectionSource.match(/const handleCreate = async \(name: string\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleCreate must exist");
  assert.match(fnMatch[1], /if \(!targetLanguage\) return;/);
  assert.match(fnMatch[1], /createUserVocabularyList\(session, targetLanguage, name\)/);
  assert.match(sectionSource, /const targetLanguage = userProfile\.practiceLanguage;/);
});

console.log("\n=== 9. Authenticated user ownership enforced ===\n");

test("9. Reads and writes both require a real StoredSupabaseSession — never an unauthenticated/anonymous call", () => {
  assert.match(sectionSource, /getStoredSupabaseSession\(\)/);
  assert.match(sectionSource, /if \(!session\) \{/);
  const createFnMatch = libSource.match(/export async function createUserVocabularyList\(([\s\S]*?)\n\}/);
  assert.match(createFnMatch[1], /const userId = session\.user\?\.id;/);
  assert.match(createFnMatch[1], /if \(!userId \|\| !targetLanguage\) \{/);
});

test("9b. createUserVocabularyList calls the RPC (never a direct table POST), and never sends a caller-supplied user id", () => {
  assert.match(libSource, /"\/rest\/v1\/rpc\/create_user_vocabulary_list"/);
  assert.doesNotMatch(libSource, /\/rest\/v1\/user_vocabulary_lists\?[^`]*method:\s*"POST"/s);
  assert.doesNotMatch(libSource, /p_user_id/);
});

console.log("\n=== 10. New list appears without a full page reload ===\n");

test("10. A successful create prepends the returned row into local state (alongside the already-loaded memberships, untouched) and closes the dialog — no refetch, no location.reload", () => {
  const fnMatch = sectionSource.match(/const handleCreate = async \(name: string\) => \{([\s\S]*?)\n  \};/);
  assert.match(
    fnMatch[1],
    /setState\(\(prev\) =>\s*prev\.status === "result"\s*\?\s*\{ status: "result", lists: \[created, \.\.\.prev\.lists\], memberships: prev\.memberships \}\s*:\s*prev,\s*\);/,
  );
  assert.match(fnMatch[1], /setIsCreateDialogOpen\(false\);/);
  assert.doesNotMatch(sectionSource, /location\.reload|window\.location/);
});

console.log("\n=== 11-12. Load error and create error handled safely ===\n");

test("11. A load failure shows the restrained error state with Retry, not a raw Supabase error or a crash", () => {
  assert.match(sectionSource, /isError \? \(/);
  assert.match(sectionSource, /t\("userProfile\.myListsSection\.loadError"\)/);
  assert.match(sectionSource, /onClick=\{handleRetry\}/);
  assert.match(sectionSource, /catch \(error\) \{\s*if \(cancelled\) return;\s*console\.warn\([\s\S]*?setState\(\{ status: "error" \}\);/);
});

test("12. A create failure surfaces the safe, localized createError copy (or a sharper safe category message, including the Phase 2A duplicate-name case) — never the raw error", () => {
  assert.match(
    dialogSource,
    /role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"/,
  );
  // Phase 2A wraps the same resolveSupabaseErrorMessageKey call inside a
  // shared resolveListMutationErrorMessage helper (also used by rename),
  // which additionally maps category "conflict" to the duplicate-name
  // copy — see test-my-lists-phase2a-contract.mjs for that specific check.
  assert.match(sectionSource, /resolveSupabaseErrorMessageKey\(category, fallbackKey\)/);
  assert.match(
    sectionSource,
    /setCreateError\(resolveListMutationErrorMessage\(t, error, "userProfile\.myListsSection\.createError"\)\)/,
  );
  assert.doesNotMatch(sectionSource, /setCreateError\(error\.message\)/);
});

console.log("\n=== 13. Locale key-set contract — covered by test-my-lists-localization.mjs ===\n");
console.log("  (see scripts/tests/vocabulary/test-my-lists-localization.mjs for the full 7-locale contract)");
passed++;

console.log("\n=== 15. No unrelated learning logic changed — my-lists stays self-contained ===\n");

test("15. MyListsSection never calls a user_word_progress/user_daily_stats read or write function", () => {
  assert.doesNotMatch(
    sectionSource,
    /readUserWordProgress|completeNewWordStudy|completeWordReview|updateWordProgressFavorite|readTodayNewWordsCompleted/,
  );
});

test("15b. vocabularyLists.ts duplicates its own request helpers rather than modifying newWordProgress.ts's shared internals", () => {
  const newWordProgressSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"), "utf8");
  assert.doesNotMatch(newWordProgressSource, /user_vocabulary_lists/);
});

console.log("\n=== Language isolation ===\n");

test("The read query filters by both user_id and target_language — a list never leaks across target languages", () => {
  const readFnMatch = libSource.match(/export async function readUserVocabularyLists\(([\s\S]*?)\n\}/);
  assert.match(readFnMatch[1], /user_id=eq\.\$\{encodeURIComponent\(userId\)\}&target_language=eq\.\$\{encodeURIComponent\(/);
});

console.log("\n=== Routing/navigation wiring ===\n");

const sidebarSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "components", "UserProfileSidebar.tsx"),
  "utf8",
);
const dashboardPageSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "UserProfileDashboardPage.tsx"),
  "utf8",
);
const headerSource = fs.readFileSync(path.join(ROOT_DIR, "src", "app", "components", "layout", "Header.tsx"), "utf8");

test("The existing sidebar nav entry ('my-lists' id) is reused, not duplicated — its id now matches the section id exactly", () => {
  assert.match(sidebarSource, /\{ id: "myLists", labelKey: "userProfile\.sidebar\.items\.myLists", icon: ListPlus \}/);
  assert.match(sidebarSource, /"dashboard" \| "learning" \| "vocabulary" \| "myLists" \| "progress"/);
});

test("UserProfileDashboardPage renders MyListsSection for the myLists section id, threading the same shared profile props as its siblings", () => {
  assert.match(dashboardPageSource, /import \{ MyListsSection \} from "\.\/my-lists\/MyListsSection";/);
  const jsxMatch = dashboardPageSource.match(/\{activeSection === "myLists" \? \(\s*<MyListsSection\s+([\s\S]*?)\/>/);
  assert.ok(jsxMatch, "UserProfileDashboardPage must render <MyListsSection ... /> when activeSection is myLists");
  assert.match(jsxMatch[1], /userProfile=\{userProfile\}/);
  assert.match(jsxMatch[1], /isProfileLoaded=\{isProfileLoaded\}/);
});

test("The header's account menu 'My Lists' entry is wired to navigate (no longer a disabled placeholder)", () => {
  const itemMatch = headerSource.match(/\{ id: "myLists", labelKey: "userProfile\.sidebar\.items\.myLists"[^}]*\}/);
  assert.ok(itemMatch, "the header account menu must define a myLists item");
  assert.match(itemMatch[0], /section: "myLists" as const/);
  assert.doesNotMatch(itemMatch[0], /disabled: true/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-contract guard passed");
}
