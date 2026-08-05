// Static contract guard for
// supabase/migrations/20260805200000_drop_legacy_learning_rpc_signatures.sql
// — corrective migration 6 (see supabase/README.md's "Legacy RPC cleanup"
// section). Verifies the migration text itself, plus that every prior
// migration file it builds on (including Corrective Migration 5) is
// untouched. Same source-text-guard-over-behavioral-test precedent as every
// other *-migration-contract.mjs script: this migration is never applied to
// a real Postgres instance as part of this repository's test suite.
//
// Run: node scripts/tests/learning/test-drop-legacy-learning-rpc-signatures-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const MIGRATIONS_DIR = path.join(ROOT_DIR, "supabase", "migrations");

const PRIOR_MIGRATION_NAMES = [
  "20260804192152_baseline_existing_learning_system_schema.sql",
  "20260805100000_restrict_learning_writes_and_add_favorite_rpc.sql",
  "20260805130000_add_learning_non_negative_constraints_and_revoke_anon_rpc.sql",
  "20260805150000_add_review_events_referential_integrity.sql",
  "20260805170000_revoke_review_events_client_privileges.sql",
  "20260805190000_add_learning_mode_time_tracking.sql",
];
const MIGRATION_NAME = "20260805200000_drop_legacy_learning_rpc_signatures.sql";
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_NAME);

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

console.log("\n=== corrective migration 6: file/ordering guards ===\n");

test("1. All six prior migration files still exist", () => {
  for (const name of PRIOR_MIGRATION_NAMES) {
    assert.ok(fs.existsSync(path.join(MIGRATIONS_DIR, name)), `${name} is missing`);
  }
});

test("2. The new migration file exists, named later than every prior migration", () => {
  assert.ok(fs.existsSync(MIGRATION_PATH), "the new migration file is missing");
  for (const name of PRIOR_MIGRATION_NAMES) {
    assert.ok(MIGRATION_NAME > name, `${MIGRATION_NAME} must sort after ${name}`);
  }
});

const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8");
const priorSources = Object.fromEntries(
  PRIOR_MIGRATION_NAMES.map((name) => [name, fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8")]),
);

test("3. Prior migration files' content is byte-for-byte unchanged (spot-checked marker strings)", () => {
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[0]].includes("BASELINE MIGRATION"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[1]].includes("CORRECTIVE MIGRATION 1"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[2]].includes("CORRECTIVE MIGRATION 2"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[3]].includes("CORRECTIVE MIGRATION 3"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[4]].includes("CORRECTIVE MIGRATION 4"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[5]].includes("CORRECTIVE MIGRATION 5"));
});

test("4. Corrective Migration 5's content is byte-for-byte unchanged (full-file hash-equivalent spot check)", () => {
  const migration5 = priorSources[PRIOR_MIGRATION_NAMES[5]];
  // A handful of load-bearing fragments that must survive verbatim —
  // cheaper than shelling out to git diff, and this script has no git
  // dependency by design (matches every other *-migration-contract.mjs).
  assert.match(migration5, /create or replace function public\.complete_new_word_study\(\s*p_word_id text,\s*p_target_language text,\s*p_stat_date date,\s*p_study_time_seconds integer\s*\)/i);
  assert.match(migration5, /create or replace function public\.complete_word_review\(\s*p_event_id uuid,\s*p_word_progress_id uuid,\s*p_result text,\s*p_stat_date date,\s*p_review_time_seconds integer\s*\)/i);
  assert.match(migration5, /create table if not exists public\.custom_practice_events/i);
});

console.log("\n=== corrective migration 6: exactly the two legacy signatures are dropped ===\n");

test("5. DROP FUNCTION IF EXISTS public.complete_new_word_study(text, text, date); appears exactly once", () => {
  const matches = [...migrationSource.matchAll(/DROP FUNCTION IF EXISTS\s+public\.complete_new_word_study\(text, text, date\)\s*;/gi)];
  assert.equal(matches.length, 1, "expected exactly one DROP FUNCTION statement for the legacy Study signature");
});

test("6. DROP FUNCTION IF EXISTS public.complete_word_review(uuid, uuid, text, date); appears exactly once", () => {
  const matches = [...migrationSource.matchAll(/DROP FUNCTION IF EXISTS\s+public\.complete_word_review\(uuid, uuid, text, date\)\s*;/gi)];
  assert.equal(matches.length, 1, "expected exactly one DROP FUNCTION statement for the legacy Review signature");
});

test("7. Exactly two DROP FUNCTION statements exist in the whole file — nothing else is dropped", () => {
  // Strip `--`-prefixed comment lines first — the migration's own prose
  // legitimately says "DROP FUNCTION IF EXISTS" while explaining the
  // rationale, without being a second real statement.
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const matches = [...sqlOnly.matchAll(/DROP FUNCTION/gi)];
  assert.equal(matches.length, 2, `expected exactly 2 real DROP FUNCTION statements, found ${matches.length}`);
});

test("8. Neither DROP statement targets the duration-aware (4th/5th-parameter) signatures", () => {
  assert.doesNotMatch(migrationSource, /DROP FUNCTION[\s\S]{0,80}complete_new_word_study\(text, text, date, integer\)/i);
  assert.doesNotMatch(migrationSource, /DROP FUNCTION[\s\S]{0,80}complete_word_review\(uuid, uuid, text, date, integer\)/i);
});

test("9. complete_custom_practice_word is never the target of any DDL statement (DROP/ALTER/CREATE OR REPLACE)", () => {
  // The migration's own header prose may reference the function name for
  // context (e.g. "complete_custom_practice_word(...) are untouched") —
  // what must never appear is an actual DDL statement acting on it.
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /complete_custom_practice_word/i);
});

console.log("\n=== corrective migration 6: no CASCADE, no unrelated changes ===\n");

test("10. CASCADE is never used anywhere in this migration", () => {
  assert.doesNotMatch(migrationSource.replace(/--.*$/gm, ""), /\bCASCADE\b/i);
});

test("11. No CREATE/ALTER/DROP statement targets a table, column, constraint, index, or policy", () => {
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /\balter table\b/i);
  assert.doesNotMatch(sqlOnly, /\bcreate table\b/i);
  assert.doesNotMatch(sqlOnly, /\bdrop table\b/i);
  assert.doesNotMatch(sqlOnly, /\bcreate policy\b/i);
  assert.doesNotMatch(sqlOnly, /\bdrop policy\b/i);
  assert.doesNotMatch(sqlOnly, /\bcreate index\b/i);
  assert.doesNotMatch(sqlOnly, /\bdrop index\b/i);
});

test("12. No GRANT/REVOKE statement appears anywhere — grants on remaining functions are untouched", () => {
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /\bgrant\b/i);
  assert.doesNotMatch(sqlOnly, /\brevoke\b/i);
});

test("13. No CREATE OR REPLACE FUNCTION appears — no function body is redefined by this migration", () => {
  assert.doesNotMatch(migrationSource, /create or replace function/i);
});

test("14. set_word_progress_favorite is not touched (no DDL statement acting on it)", () => {
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /set_word_progress_favorite/i);
});

console.log("\n=== corrective migration 6: frontend already sends duration parameters ===\n");

const newWordProgressSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"), "utf8");

test("15. completeNewWordStudy's request body sends p_study_time_seconds (duration-aware call, never the legacy 3-arg shape)", () => {
  const bodyMatch = newWordProgressSource.match(/"\/rest\/v1\/rpc\/complete_new_word_study",\s*\{([\s\S]*?)\},\s*\);/);
  assert.ok(bodyMatch, "the complete_new_word_study RPC call body must be found");
  assert.match(bodyMatch[1], /p_study_time_seconds\s*:\s*studyTimeSeconds/);
});

test("16. completeWordReview's request body sends p_review_time_seconds (duration-aware call, never the legacy 4-arg shape)", () => {
  const bodyMatch = newWordProgressSource.match(/"\/rest\/v1\/rpc\/complete_word_review",\s*\{([\s\S]*?)\},\s*\);/);
  assert.ok(bodyMatch, "the complete_word_review RPC call body must be found");
  assert.match(bodyMatch[1], /p_review_time_seconds\s*:\s*reviewTimeSeconds/);
});

test("17. No frontend source file calls complete_new_word_study with exactly the legacy 3-key body shape", () => {
  // The only call site is the one verified by test 15 above (already sends
  // 4 keys). This is a repo-wide guard that no *second*, stale call site
  // exists anywhere sending only p_word_id/p_target_language/p_stat_date.
  const callSites = [...newWordProgressSource.matchAll(/\/rest\/v1\/rpc\/complete_new_word_study/g)];
  assert.equal(callSites.length, 1, "expected exactly one complete_new_word_study RPC call site in the frontend");
});

test("18. No frontend source file calls complete_word_review with exactly the legacy 4-key body shape", () => {
  const callSites = [...newWordProgressSource.matchAll(/\/rest\/v1\/rpc\/complete_word_review/g)];
  assert.equal(callSites.length, 1, "expected exactly one complete_word_review RPC call site in the frontend");
});

console.log("\n=== corrective migration 6: documentation no longer describes the legacy signatures as active ===\n");

const readmeSource = fs.readFileSync(path.join(ROOT_DIR, "supabase", "README.md"), "utf8");

test("19. supabase/README.md records the two removed signatures", () => {
  assert.match(readmeSource, /complete_new_word_study\(text,\s*text,\s*date\)/);
  assert.match(readmeSource, /complete_word_review\(uuid,\s*uuid,\s*text,\s*date\)/);
});

test("20. supabase/README.md marks the compatibility/rollout phase as complete, not still pending", () => {
  assert.match(readmeSource, /Corrective Migration 6/);
  assert.match(readmeSource, /removed|dropped|complete/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("drop-legacy-learning-rpc-signatures-migration-contract guard passed");
}
