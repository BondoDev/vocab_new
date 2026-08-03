// Focused guard for updateWordProgressFavorite's request contract in
// src/lib/newWordProgress.ts. Can't be exercised as a runtime unit test
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

console.log("\n=== updateWordProgressFavorite RPC/REST contract ===\n");

test("1. The update is scoped by both id=eq and user_id=eq (never user_id alone)", () => {
  const fnMatch = libSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "updateWordProgressFavorite must exist");
  const body = fnMatch[1];
  assert.match(body, /id=eq\.\$\{encodeURIComponent\(progressRowId\)\}/, "must filter by the progress row's own id");
  assert.match(body, /user_id=eq\.\$\{encodeURIComponent\(\s*userId,?\s*\)\}/, "must also filter by the authenticated user's id");
});

test("2. The request uses PATCH, not POST/PUT", () => {
  const fnMatch = libSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  assert.match(fnMatch[1], /"PATCH"/);
});

test("3. The request body sends exactly { is_favorite: isFavorite } — no other fields", () => {
  const fnMatch = libSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  assert.match(fnMatch[1], /\{\s*is_favorite:\s*isFavorite\s*\}/);
});

test("4. user_id is never accepted as a caller-supplied argument (only read from session.user.id)", () => {
  const fnMatch = libSource.match(
    /export async function updateWordProgressFavorite\(\s*session: StoredSupabaseSession,\s*progressRowId: string,\s*isFavorite: boolean,\s*\)/,
  );
  assert.ok(fnMatch, "updateWordProgressFavorite's parameter list must be exactly (session, progressRowId, isFavorite)");
});

test("5. Failures are wrapped in VocabularyFavoriteUpdateError — no raw Supabase/PostgreSQL error reaches the caller", () => {
  assert.match(libSource, /class VocabularyFavoriteUpdateError extends Error/);
  const fnMatch = libSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  assert.match(fnMatch[1], /catch\s*\{[\s\S]*throw new VocabularyFavoriteUpdateError/);
});

test("6. readUserWordProgress scopes reads by both user_id and target_language (language isolation)", () => {
  const fnMatch = libSource.match(/export async function readUserWordProgress\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "readUserWordProgress must exist");
  assert.match(fnMatch[1], /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
  assert.match(fnMatch[1], /target_language=eq\.\$\{encodeURIComponent\(\s*targetLanguage,?\s*\)\}/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-favorite-contract guard passed");
}
