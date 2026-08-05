// Contract guard for Timezone Phase 1's database migration.
//
// Run: node scripts/tests/learning/test-user-timezone-foundation-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const MIGRATION_PATH = "supabase/migrations/20260806120000_add_user_timezone_foundation.sql";
const source = fs.readFileSync(path.join(ROOT_DIR, MIGRATION_PATH), "utf8");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function compactSql(value) {
  return value.replace(/\s+/g, " ").trim();
}

console.log("\n=== user timezone foundation migration contract ===\n");

test("1. Adds nullable timezone and timezone_updated_at columns to public.user_profiles", () => {
  const sql = compactSql(source);
  assert.match(sql, /alter table public\.user_profiles add column if not exists timezone text null, add column if not exists timezone_updated_at timestamptz null;/i);
});

test("2. Does not default timezone to UTC or any other value", () => {
  const nonCommentSql = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(nonCommentSql, /timezone\s+text\s+[^;\n]*default/i);
  assert.doesNotMatch(nonCommentSql, /default\s+'UTC'/i);
});

test("3. Does not backfill, rewrite, or mass-update existing profile rows", () => {
  const nonCommentSql = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(nonCommentSql, /update\s+public\.user_profiles(?!\s+as\s+up[\s\S]*where\s+up\.id\s*=\s*v_user_id\s+and\s+up\.timezone\s+is\s+null)/i);
  assert.doesNotMatch(nonCommentSql, /insert\s+into\s+public\.user_profiles/i);
});

test("4. Creates initialize_user_timezone(text), not a broad set_user_timezone replacement RPC", () => {
  assert.match(source, /create or replace function public\.initialize_user_timezone\(\s*p_timezone text\s*\)/i);
  assert.doesNotMatch(source, /create or replace function public\.set_user_timezone/i);
});

test("5. RPC requires authentication and rejects missing/blank timezone values", () => {
  assert.match(source, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(source, /if v_user_id is null then/i);
  assert.match(source, /authentication required/i);
  assert.match(source, /if p_timezone is null or length\(v_timezone\) = 0 then/i);
});

test("6. RPC validates against pg_catalog.pg_timezone_names", () => {
  assert.match(source, /from pg_catalog\.pg_timezone_names as tzn/i);
  assert.match(source, /where tzn\.name = v_timezone/i);
});

test("7. RPC uses SECURITY DEFINER with an empty search_path", () => {
  const fnMatch = source.match(/create or replace function public\.initialize_user_timezone[\s\S]*?\$function\$;/i);
  assert.ok(fnMatch, "initialize_user_timezone function must exist");
  assert.match(fnMatch[0], /security definer/i);
  assert.match(fnMatch[0], /set search_path to ''/i);
});

test("8. RPC updates only timezone, timezone_updated_at, and updated_at", () => {
  const updateMatch = source.match(/update public\.user_profiles as up[\s\S]*?where up\.id = v_user_id\s+and up\.timezone is null;/i);
  assert.ok(updateMatch, "scoped user_profiles update must exist");
  const setClause = updateMatch[0].match(/set([\s\S]*?)where/i)?.[1] ?? "";
  assert.match(setClause, /timezone = v_timezone/i);
  assert.match(setClause, /timezone_updated_at = v_now/i);
  assert.match(setClause, /updated_at = v_now/i);
  assert.doesNotMatch(setClause, /daily_goal|learning_language|native_language|nickname|current_level|user_age|birth_month|birth_day|onboarding_completed|is_new_user/i);
});

test("9. RPC writes only when stored timezone is null and never inserts a missing row", () => {
  assert.match(source, /where up\.id = v_user_id\s+and up\.timezone is null/i);
  assert.match(source, /profile row not found/i);
  assert.doesNotMatch(source, /insert\s+into\s+public\.user_profiles/i);
});

test("10. Timezone columns are protected from direct profile writes", () => {
  assert.match(source, /create or replace function public\.prevent_direct_user_timezone_write\(\)/i);
  assert.match(source, /create trigger prevent_direct_user_timezone_write/i);
  assert.match(source, /current_setting\('app\.allow_user_timezone_write', true\) = 'on'/i);
  assert.match(source, /timezone fields are writable only through initialize_user_timezone/i);
});

test("11. RPC revokes PUBLIC/anon execution and grants authenticated execution", () => {
  assert.match(source, /revoke execute on function public\.initialize_user_timezone\(text\) from public;/i);
  assert.match(source, /revoke execute on function public\.initialize_user_timezone\(text\) from anon;/i);
  assert.match(source, /grant execute on function public\.initialize_user_timezone\(text\) to authenticated;/i);
  assert.match(source, /grant execute on function public\.initialize_user_timezone\(text\) to postgres;/i);
  assert.match(source, /grant execute on function public\.initialize_user_timezone\(text\) to service_role;/i);
});

test("12. Learning RPC signatures and p_stat_date behavior are explicitly untouched", () => {
  assert.doesNotMatch(source, /create or replace function public\.complete_new_word_study/i);
  assert.doesNotMatch(source, /create or replace function public\.complete_word_review/i);
  assert.doesNotMatch(source, /create or replace function public\.complete_custom_practice_word/i);
  assert.match(source, /Learning RPCs still accept\s+-- client-provided p_stat_date/i);
});

console.log(`\n-----------------------------------------`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`-----------------------------------------\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("user timezone foundation migration contract passed");
}
