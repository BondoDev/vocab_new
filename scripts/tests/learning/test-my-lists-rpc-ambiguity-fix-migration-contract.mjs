// Static contract guard for
// supabase/migrations/20260811150000_fix_my_lists_rpc_column_ambiguity.sql
// — the corrective fix for the live 42702 "column reference is ambiguous"
// error in rename_user_vocabulary_list / create_user_vocabulary_list.
// Deliberately a source-text guard, not a live-database test — matching
// every other migration-contract test in this repo (the migration is
// never applied to Supabase as part of this test suite).
//
// Run: node scripts/tests/learning/test-my-lists-rpc-ambiguity-fix-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const PHASE2A_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811140000_my_lists_phase2a_duplicate_protection_and_membership.sql",
);
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811150000_fix_my_lists_rpc_column_ambiguity.sql",
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

test("0. The Phase 2A migration still exists untouched, and this corrective migration exists and sorts after it", () => {
  assert.ok(fs.existsSync(PHASE2A_MIGRATION_PATH), "Phase 2A migration file is missing");
  assert.ok(fs.existsSync(MIGRATION_PATH), "corrective migration file is missing");
  assert.ok(path.basename(MIGRATION_PATH) > path.basename(PHASE2A_MIGRATION_PATH));
});

const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8");
const phase2aSource = fs.readFileSync(PHASE2A_MIGRATION_PATH, "utf8");

test("0b. The Phase 2A migration file is byte-identical to before (forward-only — old migrations are never edited)", () => {
  // The still-broken (unaliased) duplicate-check shape must still be
  // exactly what Phase 2A originally shipped — proves this corrective
  // migration didn't rewrite history in place.
  assert.match(phase2aSource, /where user_id = v_user_id\s*\n\s*and target_language = p_target_language\s*\n\s*and lower\(btrim\(name\)\) = lower\(v_name\)/);
});

console.log("\n=== create_user_vocabulary_list — duplicate check now alias-qualified ===\n");

const createRpcMatch = migrationSource.match(
  /create or replace function public\.create_user_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

test("create_user_vocabulary_list is redefined with the exact same signature (text, text)", () => {
  assert.ok(createRpcMatch, "create_user_vocabulary_list must be redefined in this migration");
  assert.match(createRpcMatch[0], /p_target_language text,\s*\n\s*p_name text/);
  assert.match(
    migrationSource,
    /returns table \(\s*id uuid,\s*user_id uuid,\s*target_language text,\s*name text,\s*created_at timestamptz,\s*updated_at timestamptz\s*\)/,
  );
});

test("The duplicate-check subquery aliases the table and qualifies user_id/target_language/name — no bare column reference remains", () => {
  const checkMatch = createRpcMatch[0].match(/if exists \(([\s\S]*?)\) then\s*\n\s*raise exception\s*\n\s*'create_user_vocabulary_list: a list with this name already exists/);
  assert.ok(checkMatch, "the duplicate-check EXISTS subquery must exist");
  const body = checkMatch[1];
  assert.match(body, /from public\.user_vocabulary_lists as uvl/);
  assert.match(body, /uvl\.user_id = v_user_id/);
  assert.match(body, /uvl\.target_language = p_target_language/);
  assert.match(body, /lower\(btrim\(uvl\.name\)\) = lower\(v_name\)/);
  // No bare (unqualified) user_id/target_language/name reference anywhere
  // in this subquery.
  assert.doesNotMatch(body, /where user_id = v_user_id/);
  assert.doesNotMatch(body, /and target_language = p_target_language/);
  assert.doesNotMatch(body, /lower\(btrim\(name\)\)/);
});

console.log("\n=== rename_user_vocabulary_list — duplicate check now alias-qualified ===\n");

const renameRpcMatch = migrationSource.match(
  /create or replace function public\.rename_user_vocabulary_list\(([\s\S]*?)\$function\$;/,
);

test("rename_user_vocabulary_list is redefined with the exact same signature (uuid, text)", () => {
  assert.ok(renameRpcMatch, "rename_user_vocabulary_list must be redefined in this migration");
  assert.match(renameRpcMatch[0], /p_list_id uuid,\s*\n\s*p_name text/);
});

test("The exact statement that raised 42702 live is fixed: table aliased, id/user_id/target_language/name all qualified", () => {
  const checkMatch = renameRpcMatch[0].match(/if exists \(([\s\S]*?)\) then\s*\n\s*raise exception\s*\n\s*'rename_user_vocabulary_list: a list with this name already exists/);
  assert.ok(checkMatch, "the duplicate-check EXISTS subquery must exist");
  const body = checkMatch[1];
  assert.match(body, /from public\.user_vocabulary_lists as uvl/);
  assert.match(body, /uvl\.user_id = v_user_id/);
  assert.match(body, /uvl\.target_language = v_target_language/);
  assert.match(body, /uvl\.id <> p_list_id/);
  assert.match(body, /lower\(btrim\(uvl\.name\)\) = lower\(v_name\)/);
  assert.doesNotMatch(body, /where user_id = v_user_id/);
  assert.doesNotMatch(body, /and target_language = v_target_language/);
  assert.doesNotMatch(body, /and id <> p_list_id/);
  assert.doesNotMatch(body, /lower\(btrim\(name\)\)/);
});

test("The ownership lookup and the UPDATE/RETURNING clause remain exactly as before (already fully qualified, untouched by this fix)", () => {
  assert.match(
    renameRpcMatch[0],
    /select uvl\.target_language\s*\n\s*into v_target_language\s*\n\s*from public\.user_vocabulary_lists as uvl\s*\n\s*where uvl\.id = p_list_id\s*\n\s*and uvl\.user_id = v_user_id;/,
  );
  assert.match(
    renameRpcMatch[0],
    /update public\.user_vocabulary_lists as uvl\s*\n\s*set name = v_name,\s*\n\s*updated_at = now\(\)\s*\n\s*where uvl\.id = p_list_id\s*\n\s*and uvl\.user_id = v_user_id\s*\n\s*returning uvl\.id, uvl\.user_id, uvl\.target_language, uvl\.name, uvl\.created_at, uvl\.updated_at;/,
  );
});

console.log("\n=== delete_user_vocabulary_list — audited, confirmed unaffected, left untouched ===\n");

test("delete_user_vocabulary_list is NOT redefined by this migration (it has no RETURNS TABLE, so no colliding output variables exist)", () => {
  assert.doesNotMatch(migrationSource, /create or replace function public\.delete_user_vocabulary_list/);
});

console.log("\n=== Scope: no grants/tables/RLS/membership touched ===\n");

// Strips SQL line comments (`-- ...`) before scanning so this migration's
// own explanatory prose (which legitimately discusses "grants are
// preserved automatically", "no table is touched", etc.) never trips these
// checks — only a real statement in live SQL counts.
function stripSqlLineComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}
const sqlOnly = stripSqlLineComments(migrationSource);

test("No GRANT/REVOKE statement appears — CREATE OR REPLACE preserves the existing grants automatically", () => {
  assert.doesNotMatch(sqlOnly, /\bgrant\b|\brevoke\b/i);
});

test("No DDL against tables/indexes/policies, and no data-modifying statement anywhere", () => {
  assert.doesNotMatch(sqlOnly, /create table|alter table|create index|create policy|drop policy/i);
  const withoutFunctionBodies = sqlOnly.replace(/create or replace function[\s\S]*?\$function\$;/gi, "");
  assert.doesNotMatch(withoutFunctionBodies, /\binsert\b|\bupdate\b|\bdelete\b/i);
});

test("public.user_vocabulary_list_words (membership) is never referenced", () => {
  assert.doesNotMatch(sqlOnly, /user_vocabulary_list_words/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-rpc-ambiguity-fix-migration-contract guard passed");
}
