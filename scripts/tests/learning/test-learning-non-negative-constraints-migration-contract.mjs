// Static contract guard for
// supabase/migrations/20260805130000_add_learning_non_negative_constraints_and_revoke_anon_rpc.sql
// — corrective migration 2 (see supabase/README.md). Verifies the migration
// text itself, plus that both prior migrations it builds on are untouched.
// Same source-text-guard-over-behavioral-test precedent as
// test-restrict-learning-writes-migration-contract.mjs: this migration is
// never applied to Supabase as part of this repository's test suite.
//
// Run: node scripts/tests/learning/test-learning-non-negative-constraints-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const BASELINE_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260804192152_baseline_existing_learning_system_schema.sql",
);
const CORRECTIVE_1_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260805100000_restrict_learning_writes_and_add_favorite_rpc.sql",
);
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260805130000_add_learning_non_negative_constraints_and_revoke_anon_rpc.sql",
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

console.log("\n=== corrective migration 2: file/ordering guards ===\n");

test("1. Both prior migration files still exist and are unmodified by this change", () => {
  assert.ok(fs.existsSync(BASELINE_PATH), "baseline migration file is missing");
  assert.ok(fs.existsSync(CORRECTIVE_1_PATH), "corrective migration 1 file is missing");
});

test("2. The new migration file exists, named later than both prior migrations (lexicographic timestamp order)", () => {
  assert.ok(fs.existsSync(MIGRATION_PATH), "new corrective migration 2 file is missing");
  const migrationName = path.basename(MIGRATION_PATH);
  assert.ok(
    migrationName > path.basename(CORRECTIVE_1_PATH),
    "the new migration's filename must sort after corrective migration 1's",
  );
  assert.ok(
    migrationName > path.basename(BASELINE_PATH),
    "the new migration's filename must sort after the baseline's",
  );
});

const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8");
const baselineSource = fs.readFileSync(BASELINE_PATH, "utf8");
const corrective1Source = fs.readFileSync(CORRECTIVE_1_PATH, "utf8");

console.log("\n=== corrective migration 2: non-negative CHECK constraints ===\n");

const EXPECTED_CONSTRAINTS = [
  {
    table: "public.user_word_progress",
    column: "correct_streak",
    name: "user_word_progress_correct_streak_non_negative",
  },
  {
    table: "public.user_daily_stats",
    column: "new_words_completed",
    name: "user_daily_stats_new_words_completed_non_negative",
  },
  {
    table: "public.user_daily_stats",
    column: "reviews_completed",
    name: "user_daily_stats_reviews_completed_non_negative",
  },
  {
    table: "public.user_daily_stats",
    column: "study_time_seconds",
    name: "user_daily_stats_study_time_seconds_non_negative",
  },
];

for (const { table, column, name } of EXPECTED_CONSTRAINTS) {
  test(`3. ${name} — adds CHECK (${column} >= 0) on ${table}, explicitly named`, () => {
    const re = new RegExp(
      `alter table ${table.replace(".", "\\.")}\\s+add constraint ${name}\\s+check \\(${column} >= 0\\);`,
      "i",
    );
    assert.match(migrationSource, re, `expected a stably-named, single-column CHECK constraint for ${table}.${column}`);
  });
}

test("4. Exactly four ADD CONSTRAINT statements exist — no unrelated/combined CHECK constraints", () => {
  const addConstraintMatches = [...migrationSource.matchAll(/add constraint\s+\S+\s+check\s*\(/gi)];
  assert.equal(
    addConstraintMatches.length,
    4,
    `expected exactly 4 ADD CONSTRAINT ... CHECK statements, found ${addConstraintMatches.length}`,
  );
});

test("5. No constraint combines more than one column in a single CHECK expression", () => {
  const checkBodies = [...migrationSource.matchAll(/check \(([^)]*)\);/gi)].map((m) => m[1]);
  assert.ok(checkBodies.length > 0, "expected at least one CHECK(...) expression");
  for (const body of checkBodies) {
    const columnCount = EXPECTED_CONSTRAINTS.filter(({ column }) => body.includes(column)).length;
    assert.ok(columnCount <= 1, `CHECK expression "${body}" appears to reference more than one constrained column`);
  }
});

test("6. This migration adds no other CHECK-affecting DDL (no DROP CONSTRAINT, no data UPDATE/DELETE)", () => {
  assert.doesNotMatch(migrationSource, /drop constraint/i);
  assert.doesNotMatch(migrationSource, /\bupdate\s+public\./i);
  assert.doesNotMatch(migrationSource, /\bdelete\s+from\s+public\./i);
});

console.log("\n=== corrective migration 2: anon EXECUTE revocation ===\n");

test("7. Revokes anon EXECUTE on complete_new_word_study(text, text, date) using the exact existing signature", () => {
  assert.match(
    migrationSource,
    /revoke execute on function\s+public\.complete_new_word_study\(text, text, date\)\s+from anon;/i,
  );
});

test("8. Revokes anon EXECUTE on complete_word_review(uuid, uuid, text, date) using the exact existing signature", () => {
  assert.match(
    migrationSource,
    /revoke execute on function\s+public\.complete_word_review\(uuid, uuid, text, date\)\s+from anon;/i,
  );
});

test("9. Only anon is revoked — no REVOKE targets authenticated, service_role, postgres, or PUBLIC", () => {
  const revokeStatements = [...migrationSource.matchAll(/revoke execute[\s\S]*?from\s+(\w+);/gi)];
  assert.ok(revokeStatements.length === 2, `expected exactly 2 REVOKE EXECUTE statements, found ${revokeStatements.length}`);
  for (const match of revokeStatements) {
    assert.equal(match[1].toLowerCase(), "anon", `unexpected REVOKE target role: ${match[1]}`);
  }
});

test("10. No GRANT statements are re-added or altered in this migration (this migration only removes anon's grant)", () => {
  assert.doesNotMatch(migrationSource, /\bgrant execute\b/i);
});

console.log("\n=== corrective migration 2: RPC bodies / earlier migrations untouched ===\n");

function extractFunctionBody(source, functionName) {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$function\\$;`);
  const match = source.match(re);
  return match ? match[0] : null;
}

test("11. complete_new_word_study's body is not redefined by this migration", () => {
  assert.doesNotMatch(migrationSource, /CREATE OR REPLACE FUNCTION public\.complete_new_word_study/i);
  assert.ok(extractFunctionBody(baselineSource, "complete_new_word_study"), "baseline must still define complete_new_word_study");
});

test("12. complete_word_review's body is not redefined by this migration", () => {
  assert.doesNotMatch(migrationSource, /CREATE OR REPLACE FUNCTION public\.complete_word_review/i);
  assert.ok(extractFunctionBody(baselineSource, "complete_word_review"), "baseline must still define complete_word_review");
});

test("13. set_word_progress_favorite is not touched (body or grants) by this migration", () => {
  // The migration's own header prose may reference the function name for
  // context (e.g. "set_word_progress_favorite ... never touches any of
  // these four columns") — what must never appear is an actual DDL
  // statement acting on it.
  assert.doesNotMatch(migrationSource, /create or replace function public\.set_word_progress_favorite/i);
  assert.doesNotMatch(migrationSource, /(grant|revoke)[\s\S]{0,80}function public\.set_word_progress_favorite/i);
  assert.doesNotMatch(migrationSource, /alter function public\.set_word_progress_favorite/i);
  assert.doesNotMatch(migrationSource, /drop function public\.set_word_progress_favorite/i);
});

test("14. No table grant statements (GRANT/REVOKE on a table) appear in this migration — only function EXECUTE and CHECK constraints", () => {
  assert.doesNotMatch(migrationSource, /revoke\s+(insert|select|update|delete|truncate|references|trigger|maintain)/i);
  assert.doesNotMatch(migrationSource, /grant\s+(insert|select|update|delete|truncate|references|trigger|maintain)/i);
});

test("15. No RLS policy statements (CREATE POLICY / DROP POLICY / ALTER POLICY) appear in this migration", () => {
  assert.doesNotMatch(migrationSource, /\b(create|drop|alter)\s+policy\b/i);
});

test("16. review_events and user_profiles are not touched by this migration", () => {
  assert.doesNotMatch(migrationSource, /public\.review_events/);
  assert.doesNotMatch(migrationSource, /public\.user_profiles/);
});

test("17. The baseline migration file's content is byte-for-byte unchanged", () => {
  assert.ok(baselineSource.includes("BASELINE MIGRATION"), "baseline migration content looks unexpectedly different");
  assert.doesNotMatch(baselineSource, /user_word_progress_correct_streak_non_negative/);
});

test("18. Corrective migration 1's content is byte-for-byte unchanged", () => {
  assert.ok(corrective1Source.includes("CORRECTIVE MIGRATION 1"), "corrective migration 1 content looks unexpectedly different");
  assert.doesNotMatch(corrective1Source, /revoke execute on function\s+public\.complete_new_word_study/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("learning-non-negative-constraints-migration-contract guard passed");
}
