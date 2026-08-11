// Static contract guard for
// supabase/migrations/20260811130000_add_user_vocabulary_lists.sql — My
// Lists Phase 1's new table + narrow create RPC. Deliberately a
// source-text guard, not a live-database test: the migration is never
// applied to Supabase as part of this repository's test suite. See
// test-restrict-learning-writes-migration-contract.mjs for the same
// text-guard-over-behavioral-test precedent this file follows. Placed
// under scripts/tests/learning/ to match this repository's existing
// convention of keeping every migration-contract test in one folder
// regardless of the table's feature area (see e.g.
// test-restrict-user-profiles-writes-migration-contract.mjs, also here).
//
// Run: node scripts/tests/learning/test-my-lists-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811130000_add_user_vocabulary_lists.sql",
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

test("0. The migration file exists", () => {
  assert.ok(fs.existsSync(MIGRATION_PATH), "migration file is missing");
});

const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8");

console.log("\n=== public.user_vocabulary_lists table shape ===\n");

const tableMatch = migrationSource.match(/create table if not exists public\.user_vocabulary_lists \(([\s\S]*?)\n\);/);

test("1. CREATE TABLE IF NOT EXISTS defines the Phase 1 columns, and preserves (not duplicates) the live table's own name constraint names", () => {
  assert.ok(tableMatch, "user_vocabulary_lists table definition must exist");
  const body = tableMatch[1];
  assert.match(body, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(body, /user_id uuid not null references auth\.users \(id\) on delete cascade/);
  assert.match(body, /target_language text not null/);
  assert.match(body, /name text not null/);
  assert.match(body, /created_at timestamptz not null default now\(\)/);
  assert.match(body, /updated_at timestamptz not null default now\(\)/);
  // Matches the already-live table's own constraint names/expressions
  // exactly (user_vocabulary_lists_name_length /
  // user_vocabulary_lists_name_not_blank) rather than a differently-named
  // equivalent — CREATE TABLE IF NOT EXISTS is a full no-op against that
  // live table, so a fresh database must end up with the identical shape.
  assert.match(body, /constraint user_vocabulary_lists_name_length\s+check \(char_length\(name\) <= 80\)/);
  assert.match(body, /constraint user_vocabulary_lists_name_not_blank\s+check \(length\(btrim\(name\)\) > 0\)/);
  // No target_language CHECK inline — added afterward via a guarded DO
  // block (test 2) so the same statement covers both a freshly-created
  // table and the already-live one that doesn't have it yet.
  assert.doesNotMatch(body, /target_language[^,\n]*check/i);
});

test("1b. No old-named/combined name constraint (user_vocabulary_lists_name_length_check) is (re)introduced", () => {
  assert.doesNotMatch(migrationSource, /user_vocabulary_lists_name_length_check/);
});

test("2. target_language is added via a guarded, existence-checked DO block — not inline in CREATE TABLE", () => {
  const doBlockMatch = migrationSource.match(/do \$\$\s*declare\s*v_invalid_count integer;([\s\S]*?)\nend;\s*\$\$;/);
  assert.ok(doBlockMatch, "the target_language constraint guard DO block must exist");
  const body = doBlockMatch[1];
  assert.match(
    body,
    /if not exists \(\s*select 1\s*from pg_constraint\s*where conname = 'user_vocabulary_lists_target_language_allowed_values_check'\s*and conrelid = 'public\.user_vocabulary_lists'::regclass\s*\) then/,
  );
  // Fails the whole migration (named exception) rather than silently
  // skipping or letting a bare ALTER TABLE error out, if any existing live
  // row already holds a target_language outside the allow-list.
  assert.match(body, /if v_invalid_count > 0 then/);
  assert.match(body, /raise exception/i);
  assert.match(
    body,
    /alter table public\.user_vocabulary_lists\s*add constraint user_vocabulary_lists_target_language_allowed_values_check\s*check \(target_language in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\)\);/,
  );
});

test("3. Name validation stays exactly the live table's two existing CHECKs — no uniqueness constraint anywhere", () => {
  assert.match(migrationSource, /check \(char_length\(name\) <= 80\)/);
  assert.match(migrationSource, /check \(length\(btrim\(name\)\) > 0\)/);
  assert.doesNotMatch(migrationSource, /unique\s*\(user_id, target_language, name\)/i);
  assert.doesNotMatch(migrationSource, /unique\s*\(user_id, name\)/i);
});

test("4. An index serves the (user_id, target_language) read shape", () => {
  assert.match(
    migrationSource,
    /create index if not exists user_vocabulary_lists_user_language_idx\s+on public\.user_vocabulary_lists \(user_id, target_language\);/,
  );
});

console.log("\n=== RLS: SELECT-only, ownership-scoped, no broad-grant window ever opened ===\n");

test("5. RLS is enabled on the table", () => {
  assert.match(migrationSource, /alter table public\.user_vocabulary_lists enable row level security;/);
});

test("6. The four legacy live policy names are each dropped, and exactly one ownership-scoped FOR SELECT policy is (re)created", () => {
  // The live database already carries these four broad owner-scoped
  // policies (direct INSERT/UPDATE/DELETE were allowed) — each must be
  // dropped by name so they can never coexist with the new SELECT-only
  // policy. DROP POLICY IF EXISTS is a no-op against a fresh database that
  // never had them.
  for (const legacyPolicyName of [
    "Users can read own vocabulary lists",
    "Users can create own vocabulary lists",
    "Users can update own vocabulary lists",
    "Users can delete own vocabulary lists",
  ]) {
    assert.match(
      migrationSource,
      new RegExp(`drop policy if exists "${legacyPolicyName}" on public\\.user_vocabulary_lists;`),
      `must drop the legacy live policy "${legacyPolicyName}"`,
    );
  }
  // Also drops its own target policy name first (re-run safety), then
  // creates it exactly once — never two SELECT policies coexisting.
  assert.match(
    migrationSource,
    /drop policy if exists "Users can view their own vocabulary lists" on public\.user_vocabulary_lists;/,
  );
  assert.match(
    migrationSource,
    /create policy "Users can view their own vocabulary lists"\s+on public\.user_vocabulary_lists\s+as permissive\s+for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\);/,
  );
  const createPolicyMatches = migrationSource.match(/create policy "[^"]+"\s+on public\.user_vocabulary_lists/g) ?? [];
  assert.equal(createPolicyMatches.length, 1, "exactly one CREATE POLICY statement must exist for this table");
});

test("7. authenticated's full privilege set is explicitly revoked first, then re-granted SELECT only", () => {
  assert.match(
    migrationSource,
    /revoke select, insert, update, delete, truncate, references, trigger, maintain\s*\n\s*on public\.user_vocabulary_lists from authenticated;/,
  );
  assert.match(migrationSource, /grant select on public\.user_vocabulary_lists to authenticated;/);
  assert.doesNotMatch(
    migrationSource,
    /grant\s+(?:[\w,\s]*\binsert\b[\w,\s]*|[\w,\s]*\bupdate\b[\w,\s]*|[\w,\s]*\bdelete\b[\w,\s]*)\s+on public\.user_vocabulary_lists to authenticated;/i,
  );
});

test("8. anon's full privilege set is explicitly revoked, and anon never receives any grant on this table", () => {
  assert.match(
    migrationSource,
    /revoke select, insert, update, delete, truncate, references, trigger, maintain\s*\n\s*on public\.user_vocabulary_lists from anon;/,
  );
  assert.doesNotMatch(migrationSource, /grant[\s\S]*?on public\.user_vocabulary_lists to anon;/i);
});

test("9. postgres and service_role keep full table privileges", () => {
  assert.match(
    migrationSource,
    /grant select, insert, update, delete, truncate, references, trigger, maintain\s+on public\.user_vocabulary_lists to postgres;/,
  );
  assert.match(
    migrationSource,
    /grant select, insert, update, delete, truncate, references, trigger, maintain\s+on public\.user_vocabulary_lists to service_role;/,
  );
});

console.log("\n=== create_user_vocabulary_list RPC — the only write path ===\n");

const rpcMatch = migrationSource.match(
  /create or replace function public\.create_user_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

test("10. Creates public.create_user_vocabulary_list(text, text)", () => {
  assert.ok(rpcMatch, "create_user_vocabulary_list function definition must exist");
  assert.match(rpcMatch[0], /p_target_language text/);
  assert.match(rpcMatch[0], /p_name text/);
});

test("11. Uses SECURITY DEFINER with an empty search_path, every object schema-qualified", () => {
  assert.match(rpcMatch[0], /security definer/i);
  assert.match(rpcMatch[0], /set search_path to ''/i);
  assert.match(rpcMatch[0], /public\.user_vocabulary_lists/);
});

test("12. Derives the caller exclusively from auth.uid() and rejects a null caller", () => {
  assert.match(rpcMatch[0], /v_user_id uuid := auth\.uid\(\)/);
  assert.match(rpcMatch[0], /if v_user_id is null then/i);
});

test("13. The function never accepts a p_user_id (or any other client-supplied user identifier) argument", () => {
  assert.doesNotMatch(rpcMatch[0], /p_user_id/);
});

test("14. Rejects a missing/unsupported target language before ever attempting the insert", () => {
  assert.match(rpcMatch[0], /if p_target_language is null or length\(btrim\(p_target_language\)\) = 0 then/i);
  assert.match(rpcMatch[0], /if p_target_language not in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\) then/i);
});

test("15. Rejects an empty/whitespace-only name and a name over 80 characters, both before the insert — never silently truncates", () => {
  assert.match(rpcMatch[0], /v_name text := btrim\(p_name\)/);
  assert.match(rpcMatch[0], /if v_name is null or length\(v_name\) = 0 then/i);
  assert.match(rpcMatch[0], /if length\(v_name\) > 80 then/i);
  assert.doesNotMatch(rpcMatch[0], /substr(ing)?\(/i, "must reject an over-long name, never truncate it");
});

test("16. The INSERT writes only user_id, target_language, name — never a client-supplied id/created_at/updated_at", () => {
  const insertMatch = rpcMatch[0].match(
    /insert into public\.user_vocabulary_lists as uvl \(([\s\S]*?)\)\s*\n\s*values \(([\s\S]*?)\)\s*\n\s*returning/,
  );
  assert.ok(insertMatch, "INSERT statement must exist inside the RPC");
  assert.equal(insertMatch[1].trim(), "user_id, target_language, name");
  assert.equal(insertMatch[2].trim(), "v_user_id, p_target_language, v_name");
});

test("17. Returns the full row shape (id, user_id, target_language, name, created_at, updated_at)", () => {
  assert.match(
    migrationSource,
    /returns table \(\s*id uuid,\s*user_id uuid,\s*target_language text,\s*name text,\s*created_at timestamptz,\s*updated_at timestamptz\s*\)/,
  );
});

console.log("\n=== create_user_vocabulary_list RPC grants ===\n");

test("18. PUBLIC's default EXECUTE grant is explicitly revoked, and anon is explicitly revoked (not merely never granted)", () => {
  assert.match(
    migrationSource,
    /revoke execute on function public\.create_user_vocabulary_list\(text, text\) from public;/,
  );
  assert.match(
    migrationSource,
    /revoke execute on function public\.create_user_vocabulary_list\(text, text\) from anon;/,
  );
});

test("19. EXECUTE is granted to postgres/authenticated/service_role, and never to anon", () => {
  assert.match(migrationSource, /grant execute on function public\.create_user_vocabulary_list\(text, text\) to postgres;/);
  assert.match(migrationSource, /grant execute on function public\.create_user_vocabulary_list\(text, text\) to authenticated;/);
  assert.match(migrationSource, /grant execute on function public\.create_user_vocabulary_list\(text, text\) to service_role;/);
  assert.doesNotMatch(
    migrationSource,
    /grant execute on function public\.create_user_vocabulary_list\(text, text\) to anon;/,
  );
});

console.log("\n=== Explicitly out of scope for Phase 1 ===\n");

test("20. No word-membership table, and no update/delete/rename RPC for a list", () => {
  const createTableStatements = migrationSource.match(/create table[^;]*;/gi) ?? [];
  assert.ok(createTableStatements.length > 0, "expected at least one CREATE TABLE statement (user_vocabulary_lists)");
  for (const statement of createTableStatements) {
    assert.doesNotMatch(statement, /membership/i, `unexpected membership table: ${statement.slice(0, 80)}`);
  }
  assert.doesNotMatch(migrationSource, /function public\.(update|delete|rename)_user_vocabulary_list/i);
});

test("21. No other table, RPC, policy, or grant in the schema is touched by this migration", () => {
  assert.doesNotMatch(migrationSource, /public\.user_word_progress|public\.user_daily_stats|public\.user_profiles|public\.review_events/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-migration-contract guard passed");
}
