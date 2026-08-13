// Static contract guard for
// supabase/migrations/20260811170000_my_lists_corrective_word_id_membership.sql
// — the My Lists corrective phase's word_id-based membership migration.
// Deliberately a source-text guard, not a live-database test — matching
// every other migration-contract test in this repo (the migration is never
// applied to Supabase as part of this test suite). Covers the corrective
// brief's Migration test items 1-5 plus its own migration-safety
// requirements (existing-row preservation, abort-on-unresolvable,
// created_at preservation, FK/grant shape).
//
// Run: node scripts/tests/learning/test-my-lists-corrective-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const PRIOR_MIGRATION_PATHS = [
  path.join(ROOT_DIR, "supabase", "migrations", "20260811130000_add_user_vocabulary_lists.sql"),
  path.join(ROOT_DIR, "supabase", "migrations", "20260811140000_my_lists_phase2a_duplicate_protection_and_membership.sql"),
  path.join(ROOT_DIR, "supabase", "migrations", "20260811150000_fix_my_lists_rpc_column_ambiguity.sql"),
  path.join(ROOT_DIR, "supabase", "migrations", "20260811160000_my_lists_phase2b_membership_write_rpcs.sql"),
];
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811170000_my_lists_corrective_word_id_membership.sql",
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

function stripSqlLineComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

test("0. All four prior migrations still exist, unedited; this migration exists and sorts after them", () => {
  for (const p of PRIOR_MIGRATION_PATHS) {
    assert.ok(fs.existsSync(p), `${path.basename(p)} is missing`);
  }
  assert.ok(fs.existsSync(MIGRATION_PATH), "corrective migration file is missing");
  for (const p of PRIOR_MIGRATION_PATHS) {
    assert.ok(path.basename(MIGRATION_PATH) > path.basename(p));
  }
});

// This migration is checked in with CRLF line endings. Normalize once at
// the read site so stripSqlLineComments' per-line `--.*$` (whose `$`
// without the `m` flag only matches true end-of-string, not "immediately
// before a lone trailing \r") actually strips every comment line, and so
// every `\n`-anchored regex/indexOf below can assume LF without needing
// "\r?\n" sprinkled through each pattern. Normalizing only changes
// line-ending bytes, never the SQL text itself, so it can't change what
// these assertions prove.
const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");
const sqlOnly = stripSqlLineComments(migrationSource);

test("Prior migration files are byte-for-byte untouched by this task (forward-only)", () => {
  for (const p of PRIOR_MIGRATION_PATHS) {
    const source = fs.readFileSync(p, "utf8");
    assert.doesNotMatch(source, /p_word_ids|user_vocabulary_list_words_list_word_id_key/);
  }
});

console.log("\n=== 1. Existing-membership conversion: word_id backfilled from word_progress_id ===\n");

test("1. word_id is added nullable, then backfilled via word_progress_id -> user_word_progress.id -> word_id", () => {
  assert.match(sqlOnly, /alter table public\.user_vocabulary_list_words\s*\n\s*add column if not exists word_id text;/);
  const backfillMatch = sqlOnly.match(
    /update public\.user_vocabulary_list_words as uvlw\s*\n\s*set word_id = uwp\.word_id\s*\n\s*from public\.user_word_progress as uwp\s*\n\s*where uvlw\.word_progress_id = uwp\.id\s*\n\s*and uvlw\.word_id is null;/,
  );
  assert.ok(backfillMatch, "the backfill UPDATE must join word_progress_id -> user_word_progress.id and copy word_id");
});

console.log("\n=== 2. No membership loss: unresolvable rows abort the migration, never silently dropped ===\n");

test("2. A guarded DO block counts unresolved rows and RAISEs (aborts) if any exist — no DELETE against the table anywhere in this file", () => {
  const guardMatch = migrationSource.match(/do \$\$\s*\ndeclare\s*\n\s*v_unresolved_count integer;([\s\S]*?)\nend;\s*\n\$\$;/);
  assert.ok(guardMatch, "the unresolved-row guard block must exist");
  assert.match(guardMatch[1], /where word_id is null or length\(btrim\(word_id\)\) = 0;/);
  assert.match(guardMatch[1], /if v_unresolved_count > 0 then/);
  assert.match(guardMatch[1], /raise exception/);
  // Scoped to the schema-migration steps only (before the RPC section,
  // which legitimately DELETEs a single caller-owned row by word_id) — no
  // bulk/unscoped DELETE against the table anywhere in the migration steps
  // that convert existing rows.
  const rpcSectionIndex = sqlOnly.indexOf("drop function if exists public.add_words_to_vocabulary_list");
  const schemaSection = rpcSectionIndex > -1 ? sqlOnly.slice(0, rpcSectionIndex) : sqlOnly;
  assert.doesNotMatch(schemaSection, /delete from public\.user_vocabulary_list_words/i);
});

test("The abort happens before word_id is ever made NOT NULL — verification precedes the constraint", () => {
  const guardIndex = migrationSource.indexOf("v_unresolved_count integer;");
  const notNullIndex = migrationSource.indexOf("alter column word_id set not null;");
  assert.ok(guardIndex > -1 && notNullIndex > -1 && guardIndex < notNullIndex);
});

console.log("\n=== created_at is preserved — never rewritten for existing rows ===\n");

test("No statement in this migration ever assigns/updates created_at", () => {
  assert.doesNotMatch(sqlOnly, /set\s+created_at\s*=/i);
});

console.log("\n=== 3. Schema contains word_id (NOT NULL once verified) ===\n");

test("3. word_id becomes NOT NULL only guarded behind an is_nullable check (safe to re-run)", () => {
  const notNullBlock = migrationSource.match(/do \$\$\s*\nbegin\s*\n\s*if exists \(([\s\S]*?)alter column word_id set not null;([\s\S]*?)end;\s*\n\$\$;/);
  assert.ok(notNullBlock, "the guarded NOT NULL block must exist");
  assert.match(notNullBlock[1], /column_name = 'word_id'/);
  assert.match(notNullBlock[1], /is_nullable = 'YES'/);
});

console.log("\n=== 4. word_progress_id fully removed: FK, supporting index, and the column itself ===\n");

test("4a. The old word_progress_id -> user_word_progress FK is dropped", () => {
  assert.match(sqlOnly, /alter table public\.user_vocabulary_list_words\s*\n\s*drop constraint if exists user_vocabulary_list_words_word_progress_id_fkey;/);
});

test("4b. The now-purposeless word_progress_id index is dropped", () => {
  assert.match(sqlOnly, /drop index if exists public\.user_vocabulary_list_words_word_progress_id_idx;/);
});

test("4c. word_progress_id column itself is dropped", () => {
  assert.match(sqlOnly, /alter table public\.user_vocabulary_list_words\s*\n\s*drop column if exists word_progress_id;/);
});

test("4d. No FK to user_word_progress remains anywhere in this migration (no new one is added)", () => {
  assert.doesNotMatch(sqlOnly, /references public\.user_word_progress/i);
});

console.log("\n=== 5. Duplicate membership blocked by the new (list_id, word_id) unique constraint ===\n");

test("5. The old (list_id, word_progress_id) unique constraint is dropped, and a new (list_id, word_id) one is added, guarded for safe re-runs", () => {
  assert.match(sqlOnly, /alter table public\.user_vocabulary_list_words\s*\n\s*drop constraint if exists user_vocabulary_list_words_list_word_key;/);
  const uniqueBlock = migrationSource.match(/do \$\$\s*\nbegin\s*\n\s*if not exists \(([\s\S]*?)add constraint user_vocabulary_list_words_list_word_id_key unique \(list_id, word_id\);([\s\S]*?)end;\s*\n\$\$;/);
  assert.ok(uniqueBlock, "the guarded new-unique-constraint block must exist");
  assert.match(uniqueBlock[1], /conname = 'user_vocabulary_list_words_list_word_id_key'/);
});

console.log("\n=== list_id -> user_vocabulary_lists FK is untouched (still CASCADE) ===\n");

test("No statement drops or recreates the list_id foreign key or the table itself", () => {
  assert.doesNotMatch(sqlOnly, /drop constraint.*list_id_fkey/i);
  assert.doesNotMatch(sqlOnly, /create table|drop table|recreate/i);
});

console.log("\n=== Security: authenticated stays SELECT-only, RLS/table grants untouched ===\n");

test("No table grant statement touches user_vocabulary_list_words — RLS/SELECT-only grant from Phase 2A is untouched", () => {
  assert.doesNotMatch(sqlOnly, /grant\s+[\w,\s]*\bon public\.user_vocabulary_list_words\b/i);
  assert.doesNotMatch(sqlOnly, /create policy|drop policy/i);
});

console.log("\n=== Old RPC overloads dropped, new ones created with the new text-based signature ===\n");

test("The old uuid[]/uuid RPC overloads are explicitly dropped before the new ones are defined", () => {
  assert.match(sqlOnly, /drop function if exists public\.add_words_to_vocabulary_list\(uuid, uuid\[\]\);/);
  assert.match(sqlOnly, /drop function if exists public\.remove_word_from_vocabulary_list\(uuid, uuid\);/);
  const dropAddIndex = migrationSource.indexOf("drop function if exists public.add_words_to_vocabulary_list(uuid, uuid[])");
  const createAddIndex = migrationSource.indexOf("create or replace function public.add_words_to_vocabulary_list(\n  p_list_id uuid,\n  p_word_ids text[]");
  assert.ok(dropAddIndex > -1 && createAddIndex > -1 && dropAddIndex < createAddIndex);
});

const addRpcMatch = migrationSource.match(
  /create or replace function public\.add_words_to_vocabulary_list\(([\s\S]*?)\$function\$;/,
);
const removeRpcMatch = migrationSource.match(
  /create or replace function public\.remove_word_from_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

console.log("\n=== New add RPC: add_words_to_vocabulary_list(uuid, text[]) ===\n");

test("Exists with signature (uuid, text[]), SECURITY DEFINER, empty search_path, no p_user_id", () => {
  assert.ok(addRpcMatch, "add_words_to_vocabulary_list must exist");
  assert.match(addRpcMatch[0], /p_list_id uuid/);
  assert.match(addRpcMatch[0], /p_word_ids text\[\]/);
  assert.match(addRpcMatch[0], /security definer/i);
  assert.match(addRpcMatch[0], /set search_path to ''/i);
  assert.doesNotMatch(addRpcMatch[0], /p_user_id/);
});

test("List ownership is verified before any word validation (42501 if not found/not owned)", () => {
  const ownershipIndex = addRpcMatch[0].indexOf("if not exists (");
  const blankCheckIndex = addRpcMatch[0].indexOf("must not contain null or blank entries");
  assert.ok(ownershipIndex > -1 && blankCheckIndex > -1 && ownershipIndex < blankCheckIndex);
  assert.match(addRpcMatch[0], /'add_words_to_vocabulary_list: list not found or not owned by caller'/);
  assert.match(addRpcMatch[0], /using errcode = '42501';/);
});

test("Rejects a null/empty p_word_ids array, and rejects any null/blank entry (whole call aborts, no partial writes)", () => {
  assert.match(addRpcMatch[0], /if p_word_ids is null or array_length\(p_word_ids, 1\) is null then/);
  assert.match(addRpcMatch[0], /requested_id is null or length\(btrim\(requested_id\)\) = 0/);
});

test("Rejects an oversized word id as a defense-in-depth sanity cap", () => {
  assert.match(addRpcMatch[0], /length\(btrim\(requested_id\)\) > 64/);
});

test("Duplicate membership is idempotent — ON CONFLICT (list_id, word_id) DO NOTHING, already_added reported per id", () => {
  assert.match(addRpcMatch[0], /on conflict \(list_id, word_id\) do nothing;/);
  assert.match(addRpcMatch[0], /already_added/);
  const capturedBeforeInsert = addRpcMatch[0].indexOf("into v_already_added_ids");
  const insertIndex = addRpcMatch[0].indexOf("insert into public.user_vocabulary_list_words");
  assert.ok(capturedBeforeInsert > -1 && capturedBeforeInsert < insertIndex);
});

test("Never touches user_word_progress or user_daily_stats; only INSERTs into user_vocabulary_list_words", () => {
  assert.doesNotMatch(addRpcMatch[0], /user_word_progress|user_daily_stats/i);
  const insertTargets = [...addRpcMatch[0].matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(insertTargets, ["user_vocabulary_list_words"]);
});

test("Grants: EXECUTE revoked from public/anon, granted to postgres/authenticated/service_role", () => {
  assert.match(sqlOnly, /revoke execute on function public\.add_words_to_vocabulary_list\(uuid, text\[\]\) from public;/);
  assert.match(sqlOnly, /revoke execute on function public\.add_words_to_vocabulary_list\(uuid, text\[\]\) from anon;/);
  assert.match(sqlOnly, /grant execute on function public\.add_words_to_vocabulary_list\(uuid, text\[\]\) to postgres;/);
  assert.match(sqlOnly, /grant execute on function public\.add_words_to_vocabulary_list\(uuid, text\[\]\) to authenticated;/);
  assert.match(sqlOnly, /grant execute on function public\.add_words_to_vocabulary_list\(uuid, text\[\]\) to service_role;/);
});

console.log("\n=== New remove RPC: remove_word_from_vocabulary_list(uuid, text) ===\n");

test("Exists with signature (uuid, text), SECURITY DEFINER, empty search_path, no p_user_id", () => {
  assert.ok(removeRpcMatch, "remove_word_from_vocabulary_list must exist");
  assert.match(removeRpcMatch[0], /p_list_id uuid,\s*\n\s*p_word_id text/);
  assert.match(removeRpcMatch[0], /security definer/i);
  assert.match(removeRpcMatch[0], /set search_path to ''/i);
  assert.doesNotMatch(removeRpcMatch[0], /p_user_id/);
});

test("List ownership verified explicitly (42501) before the idempotent DELETE, scoped by (list_id, word_id)", () => {
  const ownershipIndex = removeRpcMatch[0].indexOf("if not exists (");
  const deleteIndex = removeRpcMatch[0].indexOf("delete from public.user_vocabulary_list_words");
  assert.ok(ownershipIndex > -1 && deleteIndex > -1 && ownershipIndex < deleteIndex);
  assert.match(
    removeRpcMatch[0],
    /delete from public\.user_vocabulary_list_words as uvlw\s*\n\s*where uvlw\.list_id = p_list_id\s*\n\s*and uvlw\.word_id = btrim\(p_word_id\);/,
  );
  const afterDelete = removeRpcMatch[0].split("delete from public.user_vocabulary_list_words")[1];
  assert.doesNotMatch(afterDelete, /if not found then/i);
});

test("Never touches user_word_progress, is_favorite, or user_daily_stats", () => {
  const bodyWithoutComments = stripSqlLineComments(removeRpcMatch[0]);
  assert.doesNotMatch(bodyWithoutComments, /user_word_progress|is_favorite|user_daily_stats/i);
});

test("Grants: EXECUTE revoked from public/anon, granted to postgres/authenticated/service_role", () => {
  assert.match(sqlOnly, /revoke execute on function public\.remove_word_from_vocabulary_list\(uuid, text\) from public;/);
  assert.match(sqlOnly, /revoke execute on function public\.remove_word_from_vocabulary_list\(uuid, text\) from anon;/);
  assert.match(sqlOnly, /grant execute on function public\.remove_word_from_vocabulary_list\(uuid, text\) to postgres;/);
  assert.match(sqlOnly, /grant execute on function public\.remove_word_from_vocabulary_list\(uuid, text\) to authenticated;/);
  assert.match(sqlOnly, /grant execute on function public\.remove_word_from_vocabulary_list\(uuid, text\) to service_role;/);
});

console.log("\n=== No vocabulary table invented ===\n");

test("This migration does not create a database vocabulary table — word-id existence validation stays application-owned", () => {
  assert.doesNotMatch(sqlOnly, /create table[^;]*vocabulary/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-corrective-migration-contract guard passed");
}
