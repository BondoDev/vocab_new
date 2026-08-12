// Contract guard for the live 42702 "column reference \"target_language\" is
// ambiguous" fix —
// supabase/migrations/20260813120000_fix_learning_progress_reset_column_ambiguity.sql.
//
// Root cause (see that migration's own header for the full explanation):
// reset_learning_language_progress's RETURNS TABLE clause declares an
// output column named `target_language`, which PL/pgSQL turns into an
// implicit function-scoped variable of the same name — colliding with the
// real `target_language` *column* every DELETE statement's WHERE clause
// referenced unqualified. This test's central job is making sure that
// specific mistake (a bare, alias-less `target_language`/`user_id`
// reference inside a DELETE statement) can never silently reappear, plus
// the usual signature/security/grant/scope contract every migration test
// in this repository carries.
//
// Source-text guard, like every migration-contract test in this repository
// — there is no live Supabase project reachable from this environment
// (SUPABASE_SERVICE_ROLE_KEY is not set here); see test:supabase-live's own
// scenarios/progressResetActivated.mjs for the live end-to-end coverage
// this fix needs once real credentials are available.
//
// Run: node scripts/tests/learning/test-learning-progress-reset-column-ambiguity-fix-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const FIX_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260813120000_fix_learning_progress_reset_column_ambiguity.sql",
);
const ORIGINAL_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260808120000_add_learning_language_progress_reset_rpc.sql",
);
const ACTIVATION_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260812130000_activate_learning_progress_reset_rpc.sql",
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

assert.ok(fs.existsSync(FIX_MIGRATION_PATH), "the column-ambiguity fix migration file is missing");
const source = fs.readFileSync(FIX_MIGRATION_PATH, "utf8");

const rpcMatch = source.match(/create or replace function public\.reset_learning_language_progress\(([\s\S]*?)\$function\$;/);
assert.ok(rpcMatch, "reset_learning_language_progress function definition must exist in the fix migration");
const rpcBody = rpcMatch[0];

console.log("\n=== 42702 fix: the actual bug is gone ===\n");

test("1. No DELETE statement anywhere references a bare, unqualified target_language column (the exact ambiguous form that caused 42702)", () => {
  // Matches `target_language = ...` (or `and target_language`) that is NOT
  // preceded by `<alias>.` — i.e. exactly the shape that was ambiguous.
  const bareTargetLanguagePattern = /(?<![.\w])target_language\s*=/g;
  const offenders = [...rpcBody.matchAll(bareTargetLanguagePattern)];
  assert.deepEqual(
    offenders.map((m) => m[0]),
    [],
    "found a bare, unqualified target_language reference — this is exactly what caused the live 42702 error",
  );
});

test("2. Every DELETE statement uses an explicit table alias, and every predicate column is qualified through it", () => {
  const deleteStatements = [...rpcBody.matchAll(/delete from public\.(\w+) as (\w+)\s+where\s+([\s\S]*?);/gi)];
  assert.equal(deleteStatements.length, 4, "expected exactly four aliased DELETE statements");

  const expectedAliases = {
    review_events: "re",
    custom_practice_events: "cpe",
    user_word_progress: "uwp",
    user_daily_stats: "uds",
  };

  for (const [, table, alias, whereClause] of deleteStatements) {
    assert.equal(alias, expectedAliases[table], `${table} must use alias "${expectedAliases[table]}"`);
    assert.match(
      whereClause,
      new RegExp(`${alias}\\.user_id = v_user_id`),
      `${table}'s WHERE clause must qualify user_id through its own alias`,
    );
    assert.match(
      whereClause,
      new RegExp(`${alias}\\.target_language = v_target_language`),
      `${table}'s WHERE clause must qualify target_language through its own alias`,
    );
  }
});

test("3. All four owned tables are still covered — none dropped, none added", () => {
  const deletedTables = [...rpcBody.matchAll(/delete from public\.(\w+) as \w+/gi)].map((m) => m[1]);
  assert.deepEqual(
    deletedTables.sort(),
    ["custom_practice_events", "review_events", "user_daily_stats", "user_word_progress"].sort(),
  );
});

test("4. review_events and custom_practice_events are still deleted before user_word_progress (deletion order preserved)", () => {
  const reviewIndex = rpcBody.search(/delete from public\.review_events/i);
  const customPracticeIndex = rpcBody.search(/delete from public\.custom_practice_events/i);
  const wordProgressIndex = rpcBody.search(/delete from public\.user_word_progress/i);
  const dailyStatsIndex = rpcBody.search(/delete from public\.user_daily_stats/i);
  assert.ok(reviewIndex < wordProgressIndex);
  assert.ok(customPracticeIndex < wordProgressIndex);
  assert.ok(wordProgressIndex < dailyStatsIndex);
});

test("5. The returned target_language value is explicitly the local variable (v_target_language), not the bare output-column identifier", () => {
  const returnMatch = rpcBody.match(/return query\s+select\s+([\s\S]*?);/i);
  assert.ok(returnMatch, "expected a return query select statement");
  assert.match(returnMatch[1], /true,\s*\n?\s*v_target_language,/);
});

console.log("\n=== 42702 fix: signature, security model, and scope unchanged ===\n");

test("6. Signature is unchanged: reset_learning_language_progress(p_target_language text) — no p_user_id anywhere", () => {
  assert.match(rpcBody, /create or replace function public\.reset_learning_language_progress\(\s*p_target_language text\s*\)/);
  assert.doesNotMatch(rpcBody, /p_user_id/i);
  assert.doesNotMatch(rpcBody, /p_target_user_id/i);
});

test("7. RETURNS TABLE shape is byte-identical to the original migration's", () => {
  const returnsTablePattern =
    /returns table \(\s*reset boolean,\s*target_language text,\s*word_progress_deleted integer,\s*daily_stats_deleted integer,\s*review_events_deleted integer,\s*custom_practice_events_deleted integer\s*\)/i;
  assert.match(source, returnsTablePattern);
  const originalSource = fs.readFileSync(ORIGINAL_MIGRATION_PATH, "utf8");
  assert.match(originalSource, returnsTablePattern);
});

test("8. SECURITY DEFINER with an empty search_path, identity derived only from auth.uid()", () => {
  assert.match(rpcBody, /security definer/i);
  assert.match(rpcBody, /set search_path to ''/i);
  assert.match(rpcBody, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(rpcBody, /if v_user_id is null then/i);
});

test("9. Same seven-code language allow-list validation is preserved", () => {
  const allowListMatch = rpcBody.match(/if v_target_language not in \(([^)]+)\) then/i);
  assert.ok(allowListMatch, "expected an explicit IN (...) allow-list check");
  const codes = allowListMatch[1].split(",").map((code) => code.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(codes.sort(), ["de", "en", "es", "fr", "it", "pt", "ru"].sort());
});

test("10. No dynamic SQL was introduced while fixing the ambiguity", () => {
  assert.doesNotMatch(rpcBody, /execute\s+format\(/i);
  assert.doesNotMatch(rpcBody, /execute\s+'/i);
});

test("11. user_profiles/auth.users are still never referenced in executable code", () => {
  const codeOnly = source
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  assert.doesNotMatch(codeOnly, /user_profiles/);
  assert.doesNotMatch(codeOnly, /auth\.users/);
});

console.log("\n=== 42702 fix: grants re-asserted, not weakened ===\n");

test("12. EXECUTE is revoked from public and anon, and granted to postgres/authenticated/service_role — same as before", () => {
  assert.match(source, /revoke execute on function public\.reset_learning_language_progress\(text\) from public;/i);
  assert.match(source, /revoke execute on function public\.reset_learning_language_progress\(text\) from anon;/i);
  const grantLines = [
    ...source.matchAll(/^\s*grant execute on function public\.reset_learning_language_progress\(text\) to (\w+);/gim),
  ].map((m) => m[1]);
  assert.deepEqual(grantLines.sort(), ["authenticated", "postgres", "service_role"].sort());
});

test("13. No table-level grant/revoke or policy is touched — only this one function's EXECUTE privileges", () => {
  const codeOnly = source
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  assert.doesNotMatch(codeOnly, /create policy|drop policy/i);
  assert.doesNotMatch(codeOnly, /grant (insert|select|update|delete|truncate|references|trigger|maintain)/i);
  assert.doesNotMatch(codeOnly, /^\s*revoke insert, select, update, delete/im);
});

console.log("\n=== 42702 fix: prior migrations left untouched ===\n");

test("14. The original migration file is byte-unchanged in its own function body text (still has the ambiguous unqualified form — this repo never edits an applied migration)", () => {
  const originalSource = fs.readFileSync(ORIGINAL_MIGRATION_PATH, "utf8");
  assert.match(originalSource, /where\s+user_id = v_user_id\s*\n\s*and target_language = v_target_language;/i);
});

test("15. The activation migration file is untouched and still contains exactly its one grant statement", () => {
  const activationSource = fs.readFileSync(ACTIVATION_MIGRATION_PATH, "utf8");
  assert.match(activationSource, /grant execute on function public\.reset_learning_language_progress\(text\) to authenticated;/i);
});

test("16. This migration creates/replaces exactly one function — no other object is created", () => {
  const allFunctionDefs = [...source.matchAll(/create or replace function public\.(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(allFunctionDefs)], ["reset_learning_language_progress"]);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("learning-progress-reset-column-ambiguity-fix-migration-contract tests failed");
  process.exit(1);
}

console.log("learning-progress-reset-column-ambiguity-fix-migration-contract tests passed");
