// Focused migration-contract guard for
// supabase/migrations/20260808130000_add_vocabulary_growth_events_rpc.sql —
// the narrow read-only RPC exposing the caller's own review_events state
// transitions to Vocabulary Growth's reconstruction engine. Deliberately
// static/deterministic (Node stdlib only, no build, no live database
// connection) so it stays cheap to run in CI, modeled directly on
// scripts/tests/learning/test-restrict-user-profiles-writes-migration-contract.mjs
// and this repository's other migration-contract guards.
//
// Run: node scripts/tests/learning/test-vocabulary-growth-events-rpc-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const MIGRATIONS_DIR = path.join(ROOT_DIR, "supabase", "migrations");

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

console.log("\n=== read_vocabulary_growth_events migration contract ===\n");

test("1. The migration file exists", () => {
  assert.ok(
    fs.existsSync(path.join(MIGRATIONS_DIR, "20260808130000_add_vocabulary_growth_events_rpc.sql")),
    "expected migration file is missing",
  );
});

const migrationSource = fs.readFileSync(
  path.join(MIGRATIONS_DIR, "20260808130000_add_vocabulary_growth_events_rpc.sql"),
  "utf8",
);

// This migration is checked in with CRLF line endings. Normalize once so
// every regex below that isolates a slice by matching up to a literal
// "\n" (e.g. the end of the parameter list, or the end of the RETURNS
// TABLE column list) can assume LF without needing "\r?\n" sprinkled
// through each pattern. Normalizing only changes line-ending bytes, never
// the SQL text itself, so it can't change what these assertions prove.
const normalizedMigrationSource = migrationSource.replace(/\r\n/g, "\n");

const fnMatch = normalizedMigrationSource.match(
  /create or replace function public\.read_vocabulary_growth_events\(([\s\S]*?)\$function\$;/,
);

test("1b. read_vocabulary_growth_events is defined in that migration", () => {
  assert.ok(fnMatch, "function definition not found");
});

const fnBody = fnMatch[1];

test("2. Derives the caller exclusively from auth.uid()", () => {
  assert.match(fnBody, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(fnBody, /if v_user_id is null then[\s\S]*?raise exception/);
});

test("3. Never accepts a p_user_id/p_target_user_id parameter", () => {
  const signature = normalizedMigrationSource.match(/create or replace function public\.read_vocabulary_growth_events\(([\s\S]*?)\)\nreturns/);
  assert.ok(signature, "could not isolate the function's parameter list");
  assert.doesNotMatch(signature[1], /p_user_id|p_target_user_id/);
});

test("4. Returns only word_progress_id, previous_state, new_state, event_date — no other columns", () => {
  const returnsMatch = normalizedMigrationSource.match(/returns table\(([\s\S]*?)\)\nlanguage plpgsql/);
  assert.ok(returnsMatch, "could not isolate the RETURNS TABLE column list");
  const columns = returnsMatch[1]
    .split(",")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
  assert.deepEqual(columns.sort(), ["event_date", "new_state", "previous_state", "word_progress_id"].sort());
});

test("4b. Never selects event_id, user_id, result, streak, promoted, or demoted columns", () => {
  assert.doesNotMatch(fnBody, /\bre\.event_id\b|\bre\.user_id\b(?!\s*=)|\bre\.result\b|\bre\.previous_correct_streak\b|\bre\.new_correct_streak\b|\bre\.promoted\b|\bre\.demoted\b/);
});

test("4c. p_target_language is required and validated against the seven-language allow-list", () => {
  assert.match(fnBody, /p_target_language is null or length\(btrim\(p_target_language\)\) = 0/);
  assert.match(fnBody, /p_target_language not in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\)/);
});

test("4d. p_since_date is optional and defaults to null (never forces a bound that would break 'All time')", () => {
  const signature = normalizedMigrationSource.match(/create or replace function public\.read_vocabulary_growth_events\(([\s\S]*?)\)\nreturns/);
  assert.ok(signature, "could not isolate the function's parameter list");
  assert.match(signature[1], /p_since_date date default null/);
});

test("5. Read-only: exactly one `select` statement, no insert/update/delete anywhere in the function body", () => {
  assert.doesNotMatch(fnBody, /\binsert\s+into\b/i);
  assert.doesNotMatch(fnBody, /\bupdate\s+public\./i);
  assert.doesNotMatch(fnBody, /\bdelete\s+from\b/i);
});

test("5b. SECURITY DEFINER with an empty search_path, scoped to review_events by user_id + target_language", () => {
  assert.match(fnBody, /security definer/);
  assert.match(fnBody, /set search_path to ''/);
  assert.match(fnBody, /from public\.review_events as re/);
  assert.match(fnBody, /re\.user_id = v_user_id/);
  assert.match(fnBody, /re\.target_language = p_target_language/);
});

test("6. Grants: EXECUTE revoked from public/anon, granted to postgres/authenticated/service_role", () => {
  assert.match(migrationSource, /revoke execute on function public\.read_vocabulary_growth_events\(text, date\) from public;/);
  assert.match(migrationSource, /revoke execute on function public\.read_vocabulary_growth_events\(text, date\) from anon;/);
  assert.match(migrationSource, /grant execute on function public\.read_vocabulary_growth_events\(text, date\) to postgres;/);
  assert.match(migrationSource, /grant execute on function public\.read_vocabulary_growth_events\(text, date\) to authenticated;/);
  assert.match(migrationSource, /grant execute on function public\.read_vocabulary_growth_events\(text, date\) to service_role;/);
});

test("7. Never grants a broad table privilege or adds an RLS policy on review_events", () => {
  assert.doesNotMatch(migrationSource, /grant\s+(?:insert|select|update|delete|all)\b[\s\S]{0,60}on\s+(?:table\s+)?public\.review_events/i);
  assert.doesNotMatch(migrationSource, /create policy[\s\S]*?review_events/i);
  assert.doesNotMatch(migrationSource, /alter table public\.review_events\s+enable row level security/i);
});

test("8. Does not alter review_events' own columns/constraints, and touches no other table", () => {
  assert.doesNotMatch(migrationSource, /alter table public\.review_events\s+add column/i);
  assert.doesNotMatch(migrationSource, /alter table public\.review_events\s+drop column/i);
  assert.doesNotMatch(migrationSource, /create table/i);
  assert.doesNotMatch(migrationSource, /alter table public\.user_word_progress/i);
  assert.doesNotMatch(migrationSource, /alter table public\.user_daily_stats/i);
});

console.log("\n=== signature extraction is CRLF/LF-agnostic (regression) ===\n");

// Tests 3 and 4d isolate the function's parameter list by matching up to a
// literal "\)\nreturns". This migration is checked in with CRLF line
// endings, so that isolation only works against normalizedMigrationSource
// (CRLF collapsed to LF above). These fixture-based checks pin that
// behavior directly, independent of the real migration file, so a future
// regression (e.g. someone reverting to matching against the raw,
// non-normalized source) fails here with a clear message instead of
// resurfacing as "could not isolate the function's parameter list".
const SIGNATURE_RE = /create or replace function public\.read_vocabulary_growth_events\(([\s\S]*?)\)\nreturns/;
function extractSignature(source) {
  return source.replace(/\r\n/g, "\n").match(SIGNATURE_RE);
}

test("12. Signature extraction parses an LF-only function definition", () => {
  const lfFixture = [
    "create or replace function public.read_vocabulary_growth_events(",
    "  p_target_language text,",
    "  p_since_date date default null",
    ")",
    "returns table(",
    "  word_progress_id uuid",
    ")",
    "language plpgsql",
  ].join("\n");
  const match = extractSignature(lfFixture);
  assert.ok(match, "LF-only fixture should parse");
  assert.match(match[1], /p_since_date date default null/);
});

test("13. Signature extraction parses a CRLF function definition", () => {
  const crlfFixture = [
    "create or replace function public.read_vocabulary_growth_events(",
    "  p_target_language text,",
    "  p_since_date date default null",
    ")",
    "returns table(",
    "  word_progress_id uuid",
    ")",
    "language plpgsql",
  ].join("\r\n");
  const match = extractSignature(crlfFixture);
  assert.ok(match, "CRLF fixture should parse");
  assert.match(match[1], /p_since_date date default null/);
});

test("14. Signature extraction does not match malformed SQL with a missing/misplaced `returns`", () => {
  const malformedFixture = [
    "create or replace function public.read_vocabulary_growth_events(",
    "  p_target_language text",
    ")",
    "-- no returns clause on the next line",
    "language plpgsql",
  ].join("\r\n");
  const match = extractSignature(malformedFixture);
  assert.equal(match, null, "malformed fixture (no `returns` immediately after the param list) must not match");
});

test("15. The real migration file (checked in with CRLF) parses via this same extraction", () => {
  const match = extractSignature(migrationSource);
  assert.ok(match, "the real migration's CRLF signature must parse");
  assert.match(match[1], /p_target_language text/);
  assert.match(match[1], /p_since_date date default null/);
});

console.log("\n=== review_events privileges remain restricted (unchanged by this migration) ===\n");

test("9. The prior corrective migration revoking anon/authenticated privileges from review_events still exists untouched", () => {
  const revokeMigrationPath = path.join(MIGRATIONS_DIR, "20260805170000_revoke_review_events_client_privileges.sql");
  assert.ok(fs.existsSync(revokeMigrationPath), "the prior revoke migration must not be removed");
  const revokeSource = fs.readFileSync(revokeMigrationPath, "utf8");
  assert.match(revokeSource, /revoke all privileges on table public\.review_events from anon;/);
  assert.match(revokeSource, /revoke all privileges on table public\.review_events from authenticated;/);
});

test("10. No migration after the review_events privilege revoke ever re-grants a direct table privilege on it to anon/authenticated", () => {
  // Scoped to migrations chronologically after
  // 20260805170000_revoke_review_events_client_privileges.sql (filenames
  // are zero-padded timestamps, so lexicographic order is chronological
  // order) — the baseline migration necessarily contains the *original*
  // broad grant this repository's own corrective migration later revokes,
  // so it must be excluded rather than treated as a regression.
  const REVOKE_MIGRATION = "20260805170000_revoke_review_events_client_privileges.sql";
  const allMigrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && name > REVOKE_MIGRATION);
  assert.ok(allMigrationFiles.length > 0, "expected at least one migration after the revoke");
  for (const fileName of allMigrationFiles) {
    const source = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8");
    assert.doesNotMatch(
      source,
      /grant\s+(?:insert|select|update|delete|all|truncate|references|trigger|maintain)[\s\S]{0,80}on\s+(?:table\s+)?public\.review_events\s+to\s+(?:anon|authenticated)\b/i,
      `${fileName} must not grant a direct table privilege on review_events to anon/authenticated`,
    );
  }
});

test("11. No migration adds an RLS policy on review_events (it stays zero-policy, RPC-only access)", () => {
  const allMigrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
  for (const fileName of allMigrationFiles) {
    const source = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8");
    assert.doesNotMatch(
      source,
      /create policy[\s\S]{0,200}on\s+public\.review_events/i,
      `${fileName} must not add an RLS policy on review_events`,
    );
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-growth-events-rpc-migration-contract guard passed");
}
