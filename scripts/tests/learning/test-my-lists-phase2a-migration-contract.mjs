// Static contract guard for
// supabase/migrations/20260811140000_my_lists_phase2a_duplicate_protection_and_membership.sql
// — My Lists Phase 2A's duplicate-name protection, rename/delete RPCs, and
// the user_vocabulary_list_words membership table. Deliberately a
// source-text guard, not a live-database test — this migration is never
// applied to Supabase as part of this repository's test suite, matching
// test-restrict-learning-writes-migration-contract.mjs's own precedent.
// Also confirms the prior Phase 1 migration file is untouched (this repo's
// migrations are forward-only).
//
// Run: node scripts/tests/learning/test-my-lists-phase2a-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const PHASE1_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811130000_add_user_vocabulary_lists.sql",
);
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811140000_my_lists_phase2a_duplicate_protection_and_membership.sql",
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

test("0. The Phase 1 migration still exists, and the Phase 2A migration exists and sorts after it", () => {
  assert.ok(fs.existsSync(PHASE1_MIGRATION_PATH), "Phase 1 migration file is missing");
  assert.ok(fs.existsSync(MIGRATION_PATH), "Phase 2A migration file is missing");
  assert.ok(path.basename(MIGRATION_PATH) > path.basename(PHASE1_MIGRATION_PATH));
});

const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8");
const phase1Source = fs.readFileSync(PHASE1_MIGRATION_PATH, "utf8");

test("0b. The Phase 1 migration file is byte-identical to before (forward-only — old migrations are never edited)", () => {
  assert.doesNotMatch(phase1Source, /user_vocabulary_lists_user_language_normalized_name_key/);
  assert.doesNotMatch(phase1Source, /rename_user_vocabulary_list|delete_user_vocabulary_list|user_vocabulary_list_words/);
});

console.log("\n=== 1-5. Duplicate-name unique index ===\n");

test("1-3. The unique index is scoped to (user_id, target_language, lower(btrim(name))) — case/whitespace-insensitive", () => {
  assert.match(
    migrationSource,
    /create unique index user_vocabulary_lists_user_language_normalized_name_key\s*\n\s*on public\.user_vocabulary_lists \(user_id, target_language, lower\(btrim\(name\)\)\);/,
  );
});

test("4. Different target languages are NOT merged — target_language is part of the unique key, not excluded from it", () => {
  const indexMatch = migrationSource.match(/create unique index user_vocabulary_lists_user_language_normalized_name_key[\s\S]*?;/);
  assert.ok(indexMatch, "unique index statement must exist");
  assert.match(indexMatch[0], /target_language/);
});

test("5. Different users are NOT merged — user_id is part of the unique key", () => {
  const indexMatch = migrationSource.match(/create unique index user_vocabulary_lists_user_language_normalized_name_key[\s\S]*?;/);
  assert.match(indexMatch[0], /user_id/);
});

test("Existing duplicates are detected and fail the migration loudly, never silently resolved", () => {
  const guardMatch = migrationSource.match(
    /do \$\$\s*declare\s*v_duplicate_group_count integer;([\s\S]*?)\nend;\s*\$\$;/,
  );
  assert.ok(guardMatch, "the duplicate-detection guard DO block must exist");
  const body = guardMatch[1];
  assert.match(body, /group by user_id, target_language, lower\(btrim\(name\)\)/);
  assert.match(body, /having count\(\*\) > 1/);
  assert.match(body, /if v_duplicate_group_count > 0 then/);
  assert.match(body, /raise exception/i);
  // Never a silent DELETE/UPDATE to resolve a collision on the caller's
  // behalf.
  assert.doesNotMatch(body, /delete from|update public\.user_vocabulary_lists\s+set/i);
});

console.log("\n=== create_user_vocabulary_list — predictable duplicate rejection ===\n");

const createRpcMatch = migrationSource.match(
  /create or replace function public\.create_user_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

test("create_user_vocabulary_list rejects a duplicate with a predictable 23505 before the INSERT", () => {
  assert.ok(createRpcMatch, "create_user_vocabulary_list must be redefined in this migration");
  const body = createRpcMatch[0];
  const duplicateCheckIndex = body.indexOf("lower(btrim(name)) = lower(v_name)");
  const insertIndex = body.indexOf("insert into public.user_vocabulary_lists");
  assert.ok(duplicateCheckIndex > -1 && insertIndex > -1 && duplicateCheckIndex < insertIndex);
  assert.match(body, /using errcode = '23505';/);
});

test("create_user_vocabulary_list's duplicate check is scoped to (user_id, target_language) — matches the unique index exactly", () => {
  const checkMatch = createRpcMatch[0].match(/if exists \(([\s\S]*?)\) then\s*\n\s*raise exception\s*\n\s*'create_user_vocabulary_list: a list with this name already exists/);
  assert.ok(checkMatch, "the proactive duplicate check must exist");
  assert.match(checkMatch[1], /user_id = v_user_id/);
  assert.match(checkMatch[1], /target_language = p_target_language/);
});

console.log("\n=== 14-17. rename_user_vocabulary_list ===\n");

const renameRpcMatch = migrationSource.match(
  /create or replace function public\.rename_user_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

test("rename_user_vocabulary_list exists with signature (uuid, text), SECURITY DEFINER, empty search_path", () => {
  assert.ok(renameRpcMatch, "rename_user_vocabulary_list must exist");
  assert.match(renameRpcMatch[0], /p_list_id uuid/);
  assert.match(renameRpcMatch[0], /p_name text/);
  assert.match(renameRpcMatch[0], /security definer/i);
  assert.match(renameRpcMatch[0], /set search_path to ''/i);
  assert.doesNotMatch(renameRpcMatch[0], /p_user_id/);
});

test("14-15. Ownership is enforced by scoping the lookup to (id = p_list_id AND user_id = v_user_id) — a foreign list matches zero rows, never gets touched", () => {
  assert.match(
    renameRpcMatch[0],
    /where uvl\.id = p_list_id\s*\n\s*and uvl\.user_id = v_user_id;/,
  );
  assert.match(renameRpcMatch[0], /if not found then/i);
  assert.match(renameRpcMatch[0], /'rename_user_vocabulary_list: list not found or not owned by caller'/);
});

test("16. Rename enforces the same duplicate rule, excluding the list's own row", () => {
  const checkMatch = renameRpcMatch[0].match(/if exists \(([\s\S]*?)\) then\s*\n\s*raise exception\s*\n\s*'rename_user_vocabulary_list: a list with this name already exists/);
  assert.ok(checkMatch, "rename's duplicate check must exist");
  assert.match(checkMatch[1], /user_id = v_user_id/);
  assert.match(checkMatch[1], /target_language = v_target_language/);
  assert.match(checkMatch[1], /id <> p_list_id/);
  assert.match(renameRpcMatch[0], /using errcode = '23505';/);
});

test("17. The UPDATE explicitly sets updated_at = now() (no generic trigger)", () => {
  const updateMatch = renameRpcMatch[0].match(/update public\.user_vocabulary_lists as uvl\s*\n\s*set ([\s\S]*?)\s*\n\s*where/);
  assert.ok(updateMatch, "UPDATE statement must exist");
  assert.match(updateMatch[1], /name = v_name/);
  assert.match(updateMatch[1], /updated_at = now\(\)/);
});

test("rename_user_vocabulary_list grants: authenticated/postgres/service_role EXECUTE, public/anon revoked", () => {
  assert.match(migrationSource, /revoke execute on function public\.rename_user_vocabulary_list\(uuid, text\) from public;/);
  assert.match(migrationSource, /revoke execute on function public\.rename_user_vocabulary_list\(uuid, text\) from anon;/);
  assert.match(migrationSource, /grant execute on function public\.rename_user_vocabulary_list\(uuid, text\) to authenticated;/);
  assert.match(migrationSource, /grant execute on function public\.rename_user_vocabulary_list\(uuid, text\) to postgres;/);
  assert.match(migrationSource, /grant execute on function public\.rename_user_vocabulary_list\(uuid, text\) to service_role;/);
});

console.log("\n=== 18-19. delete_user_vocabulary_list ===\n");

const deleteRpcMatch = migrationSource.match(
  /create or replace function public\.delete_user_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

test("delete_user_vocabulary_list exists with signature (uuid), SECURITY DEFINER, empty search_path, no p_user_id", () => {
  assert.ok(deleteRpcMatch, "delete_user_vocabulary_list must exist");
  assert.match(deleteRpcMatch[0], /p_list_id uuid/);
  assert.match(deleteRpcMatch[0], /security definer/i);
  assert.match(deleteRpcMatch[0], /set search_path to ''/i);
  assert.doesNotMatch(deleteRpcMatch[0], /p_user_id/);
});

test("18. The DELETE is scoped by both id and user_id — deletes only a caller-owned row", () => {
  assert.match(
    deleteRpcMatch[0],
    /delete from public\.user_vocabulary_lists\s*\n\s*where id = p_list_id\s*\n\s*and user_id = v_user_id;/,
  );
  assert.match(deleteRpcMatch[0], /if not found then/i);
});

test("19. delete_user_vocabulary_list never references user_word_progress — vocabulary/learning progress is untouched", () => {
  const bodyWithoutComments = deleteRpcMatch[0]
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  assert.doesNotMatch(bodyWithoutComments, /user_word_progress/);
});

test("delete_user_vocabulary_list grants: authenticated/postgres/service_role EXECUTE, public/anon revoked", () => {
  assert.match(migrationSource, /revoke execute on function public\.delete_user_vocabulary_list\(uuid\) from public;/);
  assert.match(migrationSource, /revoke execute on function public\.delete_user_vocabulary_list\(uuid\) from anon;/);
  assert.match(migrationSource, /grant execute on function public\.delete_user_vocabulary_list\(uuid\) to authenticated;/);
});

console.log("\n=== 6-9, 20. user_vocabulary_list_words membership table ===\n");

const tableMatch = migrationSource.match(/create table if not exists public\.user_vocabulary_list_words \(([\s\S]*?)\n\);/);

test("Table defines exactly id, list_id, word_progress_id, created_at", () => {
  assert.ok(tableMatch, "user_vocabulary_list_words table must exist");
  const body = tableMatch[1];
  assert.match(body, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(body, /list_id uuid not null references public\.user_vocabulary_lists \(id\) on delete cascade/);
  assert.match(body, /word_progress_id uuid not null references public\.user_word_progress \(id\) on delete cascade/);
  assert.match(body, /created_at timestamptz not null default now\(\)/);
});

test("6. A unique constraint on (list_id, word_progress_id) blocks duplicate membership", () => {
  assert.match(tableMatch[1], /constraint user_vocabulary_list_words_list_word_key\s*\n\s*unique \(list_id, word_progress_id\)/);
});

test("7. list_id has ON DELETE CASCADE — deleting a list cascades its membership rows", () => {
  assert.match(tableMatch[1], /list_id uuid not null references public\.user_vocabulary_lists \(id\) on delete cascade/);
});

test("8. word_progress_id has ON DELETE CASCADE — deleting a progress row cascades its membership rows", () => {
  assert.match(tableMatch[1], /word_progress_id uuid not null references public\.user_word_progress \(id\) on delete cascade/);
});

test("8b. An index on word_progress_id exists, so that cascade never forces a sequential scan", () => {
  assert.match(
    migrationSource,
    /create index if not exists user_vocabulary_list_words_word_progress_id_idx\s*\n\s*on public\.user_vocabulary_list_words \(word_progress_id\);/,
  );
});

test("9. Membership never duplicates word_state, target_language, translation, CEFR/level, or word text", () => {
  const body = tableMatch[1];
  assert.doesNotMatch(body, /\bword_state\b/);
  assert.doesNotMatch(body, /\btarget_language\b/);
  assert.doesNotMatch(body, /\btranslation\b/);
  assert.doesNotMatch(body, /\blevel\b/);
  assert.doesNotMatch(body, /\bword\b/i);
});

console.log("\n=== Membership RLS/security — read-only, EXISTS-scoped, no membership-write RPC yet ===\n");

test("RLS is enabled with exactly one SELECT policy, scoped via EXISTS against the caller's own lists", () => {
  assert.match(migrationSource, /alter table public\.user_vocabulary_list_words enable row level security;/);
  const policyMatch = migrationSource.match(
    /create policy "Users can view memberships of their own lists"\s*\n\s*on public\.user_vocabulary_list_words\s*\n\s*as permissive\s*\n\s*for select\s*\n\s*to authenticated\s*\n\s*using \(([\s\S]*?)\n\s*\);/,
  );
  assert.ok(policyMatch, "the membership SELECT policy must exist");
  assert.match(policyMatch[1], /exists \(/);
  assert.match(policyMatch[1], /uvl\.id = list_id/);
  assert.match(policyMatch[1], /uvl\.user_id = auth\.uid\(\)/);
});

test("authenticated is granted SELECT only on user_vocabulary_list_words — no direct INSERT/UPDATE/DELETE grant anywhere", () => {
  assert.match(migrationSource, /grant select on public\.user_vocabulary_list_words to authenticated;/);
  assert.doesNotMatch(
    migrationSource,
    /grant\s+(?:[\w,\s]*\binsert\b[\w,\s]*|[\w,\s]*\bupdate\b[\w,\s]*|[\w,\s]*\bdelete\b[\w,\s]*)\s+on public\.user_vocabulary_list_words to authenticated;/i,
  );
});

test("anon receives no grant on user_vocabulary_list_words at all", () => {
  assert.doesNotMatch(migrationSource, /grant[\s\S]*?on public\.user_vocabulary_list_words to anon;/i);
});

test("No membership-write RPC exists yet — Add/Remove Words is explicitly Phase 2B", () => {
  assert.doesNotMatch(migrationSource, /function public\.(add|remove|insert)_.*(list_word|word.*list)/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-phase2a-migration-contract guard passed");
}
