// Static contract guard for
// supabase/migrations/20260811160000_my_lists_phase2b_membership_write_rpcs.sql
// — My Lists Phase 2B's membership write RPCs (Add/Remove Words).
// Deliberately a source-text guard, not a live-database test — matching
// every other migration-contract test in this repo (the migration is
// never applied to Supabase as part of this test suite). Covers test
// items 1-12 (RPC-level: ownership, cross-language, idempotency, batch
// atomicity, learning-state isolation) from the Phase 2B brief.
//
// Run: node scripts/tests/learning/test-my-lists-phase2b-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const PRIOR_MIGRATION_PATHS = [
  path.join(ROOT_DIR, "supabase", "migrations", "20260811140000_my_lists_phase2a_duplicate_protection_and_membership.sql"),
  path.join(ROOT_DIR, "supabase", "migrations", "20260811150000_fix_my_lists_rpc_column_ambiguity.sql"),
];
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811160000_my_lists_phase2b_membership_write_rpcs.sql",
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

test("0. Both prior migrations still exist, and this migration exists and sorts after them", () => {
  for (const p of PRIOR_MIGRATION_PATHS) {
    assert.ok(fs.existsSync(p), `${path.basename(p)} is missing`);
  }
  assert.ok(fs.existsSync(MIGRATION_PATH), "Phase 2B migration file is missing");
  for (const p of PRIOR_MIGRATION_PATHS) {
    assert.ok(path.basename(MIGRATION_PATH) > path.basename(p));
  }
});

const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8");
const sqlOnly = stripSqlLineComments(migrationSource);

console.log("\n=== Batch add RPC: add_words_to_vocabulary_list ===\n");

const addRpcMatch = migrationSource.match(
  /create or replace function public\.add_words_to_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

test("Exists with signature (uuid, uuid[]), SECURITY DEFINER, empty search_path, no p_user_id", () => {
  assert.ok(addRpcMatch, "add_words_to_vocabulary_list must exist");
  assert.match(addRpcMatch[0], /p_list_id uuid/);
  assert.match(addRpcMatch[0], /p_word_progress_ids uuid\[\]/);
  assert.match(addRpcMatch[0], /security definer/i);
  assert.match(addRpcMatch[0], /set search_path to ''/i);
  assert.doesNotMatch(addRpcMatch[0], /p_user_id/);
});

test("1/3. List ownership is verified first — a foreign/missing list is rejected before any word validation", () => {
  const beforeValidation = addRpcMatch[0].split("if not found then")[0];
  assert.match(beforeValidation, /from public\.user_vocabulary_lists as uvl\s*\n\s*where uvl\.id = p_list_id\s*\n\s*and uvl\.user_id = v_user_id;/);
  assert.match(addRpcMatch[0], /'add_words_to_vocabulary_list: list not found or not owned by caller'/);
  assert.match(addRpcMatch[0], /using errcode = '42501';/);
});

test("2. Every requested word_progress row must be owned by the caller (uwp.user_id = v_user_id)", () => {
  const validationMatch = addRpcMatch[0].match(/select count\(\*\)\s*\n\s*into v_valid_count\s*\n\s*from public\.user_word_progress as uwp\s*\n\s*where ([\s\S]*?);/);
  assert.ok(validationMatch, "the set-based validation SELECT must exist");
  assert.match(validationMatch[1], /uwp\.user_id = v_user_id/);
});

test("4. Every requested row's target_language must match the list's own target_language — cross-language rejected server-side", () => {
  const validationMatch = addRpcMatch[0].match(/select count\(\*\)\s*\n\s*into v_valid_count\s*\n\s*from public\.user_word_progress as uwp\s*\n\s*where ([\s\S]*?);/);
  assert.match(validationMatch[1], /uwp\.target_language = v_list_target_language/);
});

test("If any requested id is invalid, the whole call raises (aborts) before the INSERT ever runs — no partial writes", () => {
  const validateIndex = addRpcMatch[0].indexOf("if v_valid_count <> v_requested_count then");
  const insertIndex = addRpcMatch[0].indexOf("insert into public.user_vocabulary_list_words");
  assert.ok(validateIndex > -1 && insertIndex > -1 && validateIndex < insertIndex, "validation must precede the INSERT");
  assert.match(addRpcMatch[0], /raise exception\s*\n\s*'add_words_to_vocabulary_list: one or more word progress rows are missing, not owned by caller, or do not match the list target_language'/);
});

test("5. Duplicate membership is handled idempotently — ON CONFLICT DO NOTHING, already_added reported per id, never a raw unique-violation surfaced", () => {
  assert.match(addRpcMatch[0], /on conflict \(list_id, word_progress_id\) do nothing;/);
  assert.match(addRpcMatch[0], /already_added/);
  // already-member ids are captured BEFORE the insert so the result can
  // label them accurately regardless of ON CONFLICT's own empty return.
  const capturedBeforeInsert = addRpcMatch[0].indexOf("into v_already_added_ids");
  const insertIndex = addRpcMatch[0].indexOf("insert into public.user_vocabulary_list_words");
  assert.ok(capturedBeforeInsert > -1 && capturedBeforeInsert < insertIndex);
});

test("6/7. The input array is de-duplicated before validation, and the returned row count matches the distinct requested id count (one row per id, no partial set)", () => {
  assert.match(addRpcMatch[0], /select array_agg\(distinct requested_id\)\s*\n\s*into v_distinct_ids/);
  assert.match(addRpcMatch[0], /v_requested_count := array_length\(v_distinct_ids, 1\);/);
  assert.match(
    addRpcMatch[0],
    /return query\s*\n\s*select requested_id, coalesce\(requested_id = any\(v_already_added_ids\), false\)\s*\n\s*from unnest\(v_distinct_ids\) as requested_id;/,
  );
});

test("Rejects a null/empty p_word_progress_ids array before touching the database", () => {
  assert.match(addRpcMatch[0], /if p_word_progress_ids is null or array_length\(p_word_progress_ids, 1\) is null then/);
});

console.log("\n=== Add RPC never touches learning state (10-12) ===\n");

test("10-12. add_words_to_vocabulary_list never INSERTs/UPDATEs/DELETEs user_word_progress or user_daily_stats", () => {
  const bodyOnly = addRpcMatch[0];
  assert.doesNotMatch(bodyOnly, /insert into public\.user_word_progress|update public\.user_word_progress|delete from public\.user_word_progress/i);
  assert.doesNotMatch(bodyOnly, /user_daily_stats/i);
  // The only table this function writes to.
  const insertTargets = [...bodyOnly.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(insertTargets, ["user_vocabulary_list_words"]);
});

console.log("\n=== add_words_to_vocabulary_list grants ===\n");

test("EXECUTE revoked from public/anon, granted to postgres/authenticated/service_role", () => {
  assert.match(sqlOnly, /revoke execute on function public\.add_words_to_vocabulary_list\(uuid, uuid\[\]\) from public;/);
  assert.match(sqlOnly, /revoke execute on function public\.add_words_to_vocabulary_list\(uuid, uuid\[\]\) from anon;/);
  assert.match(sqlOnly, /grant execute on function public\.add_words_to_vocabulary_list\(uuid, uuid\[\]\) to postgres;/);
  assert.match(sqlOnly, /grant execute on function public\.add_words_to_vocabulary_list\(uuid, uuid\[\]\) to authenticated;/);
  assert.match(sqlOnly, /grant execute on function public\.add_words_to_vocabulary_list\(uuid, uuid\[\]\) to service_role;/);
});

console.log("\n=== No separate single-word add RPC (deliberate design choice) ===\n");

test("add_word_to_vocabulary_list (singular) is not defined — batch RPC is the sole add path", () => {
  assert.doesNotMatch(migrationSource, /create or replace function public\.add_word_to_vocabulary_list\(/);
});

console.log("\n=== Remove RPC: remove_word_from_vocabulary_list (8-9) ===\n");

const removeRpcMatch = migrationSource.match(
  /create or replace function public\.remove_word_from_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

test("Exists with signature (uuid, uuid), SECURITY DEFINER, empty search_path, no p_user_id", () => {
  assert.ok(removeRpcMatch, "remove_word_from_vocabulary_list must exist");
  assert.match(removeRpcMatch[0], /p_list_id uuid,\s*\n\s*p_word_progress_id uuid/);
  assert.match(removeRpcMatch[0], /security definer/i);
  assert.match(removeRpcMatch[0], /set search_path to ''/i);
  assert.doesNotMatch(removeRpcMatch[0], /p_user_id/);
});

test("List ownership is verified explicitly (raises 42501 if not owned) before the DELETE", () => {
  const ownershipIndex = removeRpcMatch[0].indexOf("if not exists (");
  const deleteIndex = removeRpcMatch[0].indexOf("delete from public.user_vocabulary_list_words");
  assert.ok(ownershipIndex > -1 && deleteIndex > -1 && ownershipIndex < deleteIndex);
  assert.match(removeRpcMatch[0], /'remove_word_from_vocabulary_list: list not found or not owned by caller'/);
  assert.match(removeRpcMatch[0], /using errcode = '42501';/);
});

test("8/9. The DELETE is scoped by list_id + word_progress_id and carries no 'not found' guard — repeated/already-absent removal is a safe no-op, not an error", () => {
  assert.match(
    removeRpcMatch[0],
    /delete from public\.user_vocabulary_list_words as uvlw\s*\n\s*where uvlw\.list_id = p_list_id\s*\n\s*and uvlw\.word_progress_id = p_word_progress_id;/,
  );
  // No "if not found then raise" after the DELETE (unlike
  // delete_user_vocabulary_list, which does require the list itself to
  // exist) — the whole function body has exactly one raise-on-not-found,
  // and it's the ownership check above, not this DELETE.
  const afterDelete = removeRpcMatch[0].split("delete from public.user_vocabulary_list_words")[1];
  assert.doesNotMatch(afterDelete, /if not found then/i);
});

test("10-12. remove_word_from_vocabulary_list never touches user_word_progress, is_favorite, or user_daily_stats", () => {
  const bodyWithoutComments = stripSqlLineComments(removeRpcMatch[0]);
  assert.doesNotMatch(bodyWithoutComments, /user_word_progress/i);
  assert.doesNotMatch(bodyWithoutComments, /is_favorite/i);
  assert.doesNotMatch(bodyWithoutComments, /user_daily_stats/i);
});

console.log("\n=== remove_word_from_vocabulary_list grants ===\n");

test("EXECUTE revoked from public/anon, granted to postgres/authenticated/service_role", () => {
  assert.match(sqlOnly, /revoke execute on function public\.remove_word_from_vocabulary_list\(uuid, uuid\) from public;/);
  assert.match(sqlOnly, /revoke execute on function public\.remove_word_from_vocabulary_list\(uuid, uuid\) from anon;/);
  assert.match(sqlOnly, /grant execute on function public\.remove_word_from_vocabulary_list\(uuid, uuid\) to postgres;/);
  assert.match(sqlOnly, /grant execute on function public\.remove_word_from_vocabulary_list\(uuid, uuid\) to authenticated;/);
  assert.match(sqlOnly, /grant execute on function public\.remove_word_from_vocabulary_list\(uuid, uuid\) to service_role;/);
});

console.log("\n=== Scope: table/RLS untouched, prior migrations untouched ===\n");

test("No DDL against user_vocabulary_list_words itself (table/index/policy unchanged) — only new functions are added", () => {
  assert.doesNotMatch(sqlOnly, /create table|alter table|create index|create policy|drop policy|drop table/i);
});

test("No direct table grant statement for user_vocabulary_list_words — the two RPCs are the only new write path", () => {
  assert.doesNotMatch(sqlOnly, /grant\s+(?:[\w,\s]*\binsert\b[\w,\s]*|[\w,\s]*\bdelete\b[\w,\s]*)\s+on public\.user_vocabulary_list_words/i);
});

test("Prior migration files (20260811140000, 20260811150000) are untouched (forward-only)", () => {
  for (const p of PRIOR_MIGRATION_PATHS) {
    const before = fs.readFileSync(p, "utf8");
    assert.doesNotMatch(before, /add_words_to_vocabulary_list|remove_word_from_vocabulary_list/);
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-phase2b-migration-contract guard passed");
}
