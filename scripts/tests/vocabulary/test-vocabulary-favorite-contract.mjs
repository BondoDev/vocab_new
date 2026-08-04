// Focused guard for updateWordProgressFavorite's RPC contract in
// src/lib/newWordProgress.ts, and for VocabularySection.tsx's optimistic
// update/rollback around it. Can't be exercised as a runtime unit test
// because that module transitively imports src/lib/supabaseAuth.ts, which
// reads import.meta.env.VITE_SUPABASE_URL — a Vite-only global unavailable
// under plain `node --experimental-strip-types` (same limitation documented
// in test-complete-new-word-study-contract.mjs). So, like that test, this is
// a precise source-text guard rather than a behavioral one.
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-vocabulary-favorite-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

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

const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"), "utf8");
const sectionSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "vocabulary", "VocabularySection.tsx"),
  "utf8",
);

console.log("\n=== set_word_progress_favorite RPC contract ===\n");

test("1. updateWordProgressFavorite calls the set_word_progress_favorite RPC, not a direct table PATCH", () => {
  const fnMatch = libSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "updateWordProgressFavorite must exist");
  const body = fnMatch[1];
  assert.match(body, /"\/rest\/v1\/rpc\/set_word_progress_favorite"/, "must call the RPC endpoint");
  assert.doesNotMatch(
    body,
    /\/rest\/v1\/user_word_progress\?/,
    "must not PATCH user_word_progress directly anymore",
  );
});

test("2. The RPC request body sends exactly p_word_progress_id and p_is_favorite — no other keys", () => {
  const bodyMatch = libSource.match(/"\/rest\/v1\/rpc\/set_word_progress_favorite",\s*\{([\s\S]*?)\},\s*\);/);
  assert.ok(bodyMatch, "the set_word_progress_favorite RPC call body must be found");
  const body = bodyMatch[1];

  assert.match(body, /p_word_progress_id\s*:\s*progressRowId/, "must send p_word_progress_id");
  assert.match(body, /p_is_favorite\s*:\s*isFavorite/, "must send p_is_favorite");

  const sentKeys = [...body.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  assert.deepEqual(
    sentKeys.sort(),
    ["p_is_favorite", "p_word_progress_id"].sort(),
    "must send exactly these two keys — nothing else",
  );
});

test("3. user_id is never sent as a caller-supplied RPC argument (only read from session.user.id for the guard check)", () => {
  assert.doesNotMatch(libSource, /p_user_id/, "p_user_id must not appear anywhere in newWordProgress.ts");
});

test("4. No protected progress field (word_state/correct_streak/last_practiced_at/next_review_at/word_id/target_language) is ever sent by the favorite RPC call", () => {
  const bodyMatch = libSource.match(/"\/rest\/v1\/rpc\/set_word_progress_favorite",\s*\{([\s\S]*?)\},\s*\);/);
  const body = bodyMatch[1];
  assert.doesNotMatch(body, /word_state|correct_streak|last_practiced_at|next_review_at|word_id|target_language/i);
});

test("5. updateWordProgressFavorite's parameter list is exactly (session, progressRowId, isFavorite)", () => {
  const fnMatch = libSource.match(
    /export async function updateWordProgressFavorite\(\s*session: StoredSupabaseSession,\s*progressRowId: string,\s*isFavorite: boolean,\s*\)/,
  );
  assert.ok(fnMatch, "updateWordProgressFavorite's parameter list must be exactly (session, progressRowId, isFavorite)");
});

test("6. The RPC's returned row is validated (word_progress_id/is_favorite shape) before the call resolves", () => {
  const fnMatch = libSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  const body = fnMatch[1];
  assert.match(body, /row\.word_progress_id/, "must read word_progress_id off the returned row");
  assert.match(body, /row\.is_favorite/, "must read is_favorite off the returned row");
  assert.match(body, /throw new VocabularyFavoriteUpdateError/, "a malformed row must still raise the safe error type");
});

test("7. Failures are wrapped in VocabularyFavoriteUpdateError — no raw Supabase/PostgreSQL error reaches the caller", () => {
  assert.match(libSource, /class VocabularyFavoriteUpdateError extends Error/);
  const fnMatch = libSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  assert.match(fnMatch[1], /catch \(error\)[\s\S]*throw new VocabularyFavoriteUpdateError/);
});

test("8. Session/auth failures are distinguished from generic failures, matching completeNewWordStudy/completeWordReview's precedent", () => {
  const fnMatch = libSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  const body = fnMatch[1];
  assert.match(body, /jwt\|session\|unauthorized\|401/i, "must test for the same auth-failure signature as the other two RPCs");
  assert.match(body, /session has expired/i, "must surface a distinct expired-session message");
});

test("9. readUserWordProgress scopes reads by both user_id and target_language (language isolation)", () => {
  const fnMatch = libSource.match(/export async function readUserWordProgress\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "readUserWordProgress must exist");
  assert.match(fnMatch[1], /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
  assert.match(fnMatch[1], /target_language=eq\.\$\{encodeURIComponent\(\s*targetLanguage,?\s*\)\}/);
});

console.log("\n=== VocabularySection.tsx optimistic update / rollback ===\n");

test("10. handleToggleFavorite applies an optimistic update before calling updateWordProgressFavorite", () => {
  const fnMatch = sectionSource.match(/const handleToggleFavorite = \(row: ResolvedVocabularyRow\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleToggleFavorite must exist");
  const body = fnMatch[1];
  const optimisticIndex = body.indexOf("applyFavoriteToggle(prev.data.rows, row.id, nextIsFavorite)");
  const callIndex = body.indexOf("updateWordProgressFavorite(session, row.id, nextIsFavorite)");
  assert.ok(optimisticIndex >= 0, "must optimistically apply the toggle");
  assert.ok(callIndex >= 0, "must call updateWordProgressFavorite");
  assert.ok(optimisticIndex < callIndex, "the optimistic update must happen before the network call");
});

test("11. On failure, the row and favorites count are reverted to their previous values", () => {
  const fnMatch = sectionSource.match(/const handleToggleFavorite = \(row: ResolvedVocabularyRow\) => \{([\s\S]*?)\n  \};/);
  const body = fnMatch[1];
  const catchMatch = body.match(/\.catch\(\(error\) => \{([\s\S]*?)\n      \}\)/);
  assert.ok(catchMatch, "must have a .catch handler on the write");
  assert.match(catchMatch[1], /applyFavoriteToggle\(prev\.data\.rows, row\.id, previousIsFavorite\)/, "must revert the row's favorite flag");
  assert.match(
    catchMatch[1],
    /adjustFavoritesCount\(prev\.data\.counts\.favorites, nextIsFavorite, previousIsFavorite\)/,
    "must revert the favorites count",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-favorite-contract guard passed");
}
