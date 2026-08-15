// Architecture guard for My Lists Phase 3 of the profile-section data-fetch
// optimization: useProfileSharedMyLists.ts (src/features/user-profile/
// sections/) must be the single, LAZY, shared owner — for the whole
// /profile dashboard — of the signed-in user's vocabulary lists
// (readUserVocabularyLists) and their word memberships
// (readUserVocabularyListMemberships), which MyListsSection previously
// fetched on its own useState/useEffect every time it mounted (i.e. every
// My Lists -> Vocabulary/Dashboard -> My Lists round trip re-fetched both,
// even when nothing had changed).
//
// Modeled directly on test-daily-stats-shared-ownership.mjs, which this
// guard is a close sibling of — same "shared + lazy + cached" contract,
// same static/deterministic (Node stdlib only, no build, no network)
// approach. One deliberate difference from that guard: unlike
// readMilestoneDailyStats/readVocabularyGrowthEvents (which have exactly
// one legitimate caller), readUserVocabularyLists has TWO legitimate
// callers — useProfileSharedMyLists.ts (the shared cache) and
// AddWordToListDialog.tsx (the Vocabulary page's "Add to list" popup,
// which intentionally stays a self-contained data owner rather than
// reusing My Lists' own cache — see that file's own header). This guard
// checks that MyListsSection.tsx itself is no longer among the callers
// (its own local fetch effect must be gone), not that only one file calls
// it.
//
// Run: node scripts/tests/architecture/test-my-lists-shared-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const SECTIONS_DIR = path.join(SRC_DIR, "features", "user-profile", "sections");

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

// Same CRLF-safe line-comment strip as test-daily-stats-shared-ownership.mjs
// — several of these files' own prose explains an absent call by name.
function stripLineComments(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

const sharedHookPath = path.join(SECTIONS_DIR, "useProfileSharedMyLists.ts");
const sharedHookRaw = fs.readFileSync(sharedHookPath, "utf8");
const sharedHookLive = stripLineComments(sharedHookRaw);
const dashboardPage = read("src/features/user-profile/sections/UserProfileDashboardPage.tsx");
const dashboardSection = read("src/features/user-profile/sections/dashboard/DashboardSection.tsx");
const learningSection = read("src/features/user-profile/sections/learning/LearningSection.tsx");
const vocabularySection = read("src/features/user-profile/sections/vocabulary/VocabularySection.tsx");
const addWordToListDialogPath = path.join(SECTIONS_DIR, "vocabulary", "AddWordToListDialog.tsx");
const addWordToListDialog = fs.readFileSync(addWordToListDialogPath, "utf8");
const progressSection = read("src/features/user-profile/sections/progress/ProgressSection.tsx");
const settingsSection = read("src/features/user-profile/sections/settings/SettingsSection.tsx");
const myListsSectionPath = path.join(SECTIONS_DIR, "my-lists", "MyListsSection.tsx");
const myListsSection = fs.readFileSync(myListsSectionPath, "utf8");
const invalidationStore = read("src/lib/sharedProgressInvalidation.ts");

console.log("\n=== Shared ownership: one hook, one call site ===\n");

test("1. UserProfileDashboardPage calls useProfileSharedMyLists exactly once and forwards every return value into MyListsSection", () => {
  const callCount = (dashboardPage.match(/useProfileSharedMyLists\(/g) || []).length;
  assert.equal(callCount, 1, `expected exactly one useProfileSharedMyLists( call site, found ${callCount}`);
  for (const propName of [
    "myListsStatus",
    "myLists",
    "myListsMemberships",
    "requestMyLists",
    "retryMyLists",
    "applyListCreated",
    "applyListRenamed",
    "applyListDeleted",
    "applyListMembershipsReplaced",
    "applyMembershipRemoved",
    "applyMembershipAdded",
  ]) {
    const occurrences = (dashboardPage.match(new RegExp(`\\b${propName}\\b`, "g")) || []).length;
    assert.ok(occurrences >= 2, `${propName} must be both received from the hook and forwarded as a prop (found ${occurrences} occurrence(s))`);
  }
});

test("2. readUserVocabularyLists is called only from useProfileSharedMyLists.ts and AddWordToListDialog.tsx (its own explicitly self-contained fetch) — MyListsSection.tsx no longer calls it directly", () => {
  function readFilesRecursive(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        readFilesRecursive(fullPath, results);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }
  const ALLOWED = new Set([sharedHookPath, addWordToListDialogPath]);
  const profileFiles = readFilesRecursive(path.join(SRC_DIR, "features", "user-profile"));
  const offenders = [];
  for (const file of profileFiles) {
    if (ALLOWED.has(file)) continue;
    const live = stripLineComments(fs.readFileSync(file, "utf8"));
    if (/readUserVocabularyLists\(/.test(live)) {
      offenders.push(path.relative(path.join(SRC_DIR, "features", "user-profile"), file).replace(/\\/g, "/"));
    }
  }
  assert.deepEqual(offenders, [], `unexpected direct readUserVocabularyLists( caller(s): ${offenders.join(", ")}`);
});

test("3. readUserVocabularyListMemberships is called only from useProfileSharedMyLists.ts (the initial batch load) and MyListsSection.tsx (the add-words flow's own targeted, authoritative single-list re-read)", () => {
  function readFilesRecursive(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        readFilesRecursive(fullPath, results);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }
  const ALLOWED = new Set([sharedHookPath, myListsSectionPath]);
  const profileFiles = readFilesRecursive(path.join(SRC_DIR, "features", "user-profile"));
  const offenders = [];
  for (const file of profileFiles) {
    if (ALLOWED.has(file)) continue;
    const live = stripLineComments(fs.readFileSync(file, "utf8"));
    if (/readUserVocabularyListMemberships\(/.test(live)) {
      offenders.push(path.relative(path.join(SRC_DIR, "features", "user-profile"), file).replace(/\\/g, "/"));
    }
  }
  assert.deepEqual(offenders, [], `unexpected direct readUserVocabularyListMemberships( caller(s): ${offenders.join(", ")}`);
});

console.log("\n=== Lazy, not eager: sections that don't need this resource never reference it ===\n");

test("4. Dashboard/Learning/Vocabulary/Progress/Settings never reference useProfileSharedMyLists, myLists, or myListsMemberships", () => {
  for (const [label, source] of [
    ["dashboard/DashboardSection.tsx", dashboardSection],
    ["learning/LearningSection.tsx", learningSection],
    ["vocabulary/VocabularySection.tsx", vocabularySection],
    ["progress/ProgressSection.tsx", progressSection],
    ["settings/SettingsSection.tsx", settingsSection],
  ]) {
    const live = stripLineComments(source);
    assert.doesNotMatch(live, /useProfileSharedMyLists/, `${label} must not reference useProfileSharedMyLists`);
    assert.doesNotMatch(live, /\bmyListsStatus\b|\bmyListsMemberships\b|\bonRequestMyLists\b/, `${label} must not reference the shared My Lists resource`);
  }
});

test("5. The fetch branch is gated behind requestedKeyRef, not run unconditionally on mount", () => {
  assert.match(sharedHookLive, /requestedKeyRef\.current !== contextKey/, "the effect must gate on whether this context has actually been requested");
  assert.match(sharedHookLive, /await readUserVocabularyLists\(session, targetLanguage\)/, "the fetch must be reachable only past that gate");
  const gateIndex = sharedHookLive.indexOf("requestedKeyRef.current !== contextKey");
  const fetchIndex = sharedHookLive.indexOf("await readUserVocabularyLists(session, targetLanguage)");
  assert.ok(gateIndex >= 0 && fetchIndex > gateIndex, "the requestedKeyRef gate must appear before the fetch call in source order");
});

test("6. MyListsSection requests the resource exactly once per mount, matching every other shared-lazy-resource consumer's own precedent", () => {
  assert.match(
    myListsSection,
    /useEffect\(\(\) => \{\s*onRequestMyLists\(\);\s*\}, \[onRequestMyLists\]\);/,
    "MyListsSection must request the shared resource in its own mount effect, matching DashboardSection/LearningSection's onRequestDailyStats() precedent",
  );
});

console.log("\n=== The two-step dependent fetch chain is preserved ===\n");

test("7. Memberships are fetched only after lists resolve, using that same fetch's own list ids — never in parallel, never per-card", () => {
  const listsIndex = sharedHookLive.indexOf("const lists = await readUserVocabularyLists(session, targetLanguage);");
  const membershipsIndex = sharedHookLive.indexOf("const memberships = await readUserVocabularyListMemberships(");
  assert.ok(listsIndex >= 0 && membershipsIndex > listsIndex, "memberships must be fetched after lists, in source order");
  assert.match(sharedHookLive, /readUserVocabularyListMemberships\(\s*session,\s*lists\.map\(\(list\) => list\.id\),?\s*\)/, "memberships must be requested using the just-resolved list ids, batched into one call");
});

console.log("\n=== Cache key: (authUserId, targetLanguage) — lists are genuinely language-scoped ===\n");

test("8. The shared context key is derived from authUserId + isProfileLoaded + targetLanguage only", () => {
  assert.match(
    sharedHookLive,
    /const contextKey = authUserId && isProfileLoaded && targetLanguage \? `\$\{authUserId\}:\$\{targetLanguage\}` : null;/,
    "contextKey must be exactly authUserId + targetLanguage, gated on isProfileLoaded",
  );
});

test("9. A missing context (signed out / profile not loaded / no target language) hard-resets to idle with empty lists/memberships", () => {
  assert.match(sharedHookLive, /if \(!contextKey\) \{/);
  const noContextBranch = sharedHookLive.match(/if \(!contextKey\) \{([\s\S]*?)\}/);
  assert.ok(noContextBranch, "expected an explicit !contextKey branch");
  assert.match(noContextBranch[1], /requestedKeyRef\.current = null/);
  assert.match(noContextBranch[1], /setState\(idleState\(null\)\)/);
});

console.log("\n=== Retry: a failed load can be retried on the next mount, not permanently stuck ===\n");

test("10. retryMyLists force-refetches even from a ready/error state, and requestMyLists does not treat 'error' as already-settled", () => {
  const retryFnMatch = sharedHookLive.match(/const retryMyLists = useCallback\(\(\) => \{([\s\S]*?)\}, \[contextKey\]\);/);
  assert.ok(retryFnMatch, "retryMyLists must exist as a useCallback scoped to contextKey");
  assert.match(retryFnMatch[1], /setRetryToken/, "retryMyLists must bump a retry token to force the effect to re-run");

  const requestFnMatch = sharedHookLive.match(/const requestMyLists = useCallback\(\(\) => \{([\s\S]*?)\}, \[contextKey\]\);/);
  assert.ok(requestFnMatch, "requestMyLists must exist as a useCallback scoped to contextKey");
  assert.match(
    requestFnMatch[1],
    /stateRef\.current\.status !== "error"/,
    "requestMyLists' already-settled check must exclude 'error' — a fresh mount must be able to retry a previously-failed load",
  );
});

console.log("\n=== Invalidation: a narrow, dedicated signal for writers other than My Lists' own mutations ===\n");

test("11. sharedProgressInvalidation.ts exports notifyVocabularyListsChanged/subscribeVocabularyListsChanged, and useProfileSharedMyLists subscribes to it", () => {
  assert.match(invalidationStore, /export function notifyVocabularyListsChanged\(/);
  assert.match(invalidationStore, /export function subscribeVocabularyListsChanged\(/);
  assert.match(sharedHookLive, /subscribeVocabularyListsChanged/, "useProfileSharedMyLists must subscribe to subscribeVocabularyListsChanged");
});

test("12. AddWordToListDialog (the one external writer of list/membership data) fires notifyVocabularyListsChanged after every successful create/add/remove", () => {
  const live = stripLineComments(addWordToListDialog);
  const notifyCount = (live.match(/notifyVocabularyListsChanged\(\)/g) || []).length;
  assert.ok(notifyCount >= 2, `expected at least 2 notifyVocabularyListsChanged() call sites (list creation + the toggle add/remove success branch), found ${notifyCount}`);
});

test("13. MyListsSection's own mutations never call notifyVocabularyListsChanged — its create/rename/delete/add-words/remove-word handlers already update the shared cache precisely and must not also broadcast a redundant self-invalidation", () => {
  assert.doesNotMatch(stripLineComments(myListsSection), /notifyVocabularyListsChanged/, "MyListsSection must rely on its own onList*/onListMembership* appliers, not the invalidation channel");
});

console.log("\n=== Mutation map: MyListsSection updates the shared cache precisely, never a full reload ===\n");

test("14. handleCreate/handleRename/handleConfirmDelete/handleSubmitAddWords/handleRemoveWord call the precise onList*/onListMembership* appliers, and never re-fetch the whole list set (no readUserVocabularyLists call anywhere in this file)", () => {
  assert.doesNotMatch(myListsSection, /readUserVocabularyLists\(/, "MyListsSection must never call readUserVocabularyLists itself — that fetch belongs solely to useProfileSharedMyLists");
  for (const [handler, applier] of [
    ["handleCreate", "onListCreated(created)"],
    ["handleRename", "onListRenamed(renamed)"],
    ["handleConfirmDelete", "onListDeleted(deletedId)"],
    ["handleSubmitAddWords", "onListMembershipsReplaced(listIdToUpdate, freshMemberships)"],
    ["handleRemoveWord", "onListMembershipRemoved(listIdToUpdate, wordId)"],
  ]) {
    const fnMatch = myListsSection.match(new RegExp(`const ${handler} = (?:async )?\\([^)]*\\) => \\{([\\s\\S]*?)\\n  \\};`));
    assert.ok(fnMatch, `${handler} must exist`);
    assert.ok(fnMatch[1].includes(applier), `${handler} must call ${applier}`);
  }
});

test("15. handleRemoveWord rolls an optimistic removal back via onListMembershipAdded on RPC failure", () => {
  const fnMatch = myListsSection.match(/const handleRemoveWord = \([^)]*\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleRemoveWord must exist");
  assert.match(fnMatch[1], /onListMembershipAdded\(removedMembership\)/, "a failed remove must roll back via onListMembershipAdded");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-shared-ownership guard passed");
}
