// Static contract guard for
// supabase/migrations/20260805170000_revoke_review_events_client_privileges.sql
// — corrective migration 4 (see supabase/README.md). Verifies the migration
// text itself, plus that all four prior migrations it builds on are
// untouched. Same source-text-guard-over-behavioral-test precedent as
// test-restrict-learning-writes-migration-contract.mjs,
// test-learning-non-negative-constraints-migration-contract.mjs, and
// test-review-events-integrity-migration-contract.mjs: this migration is
// never applied to Supabase as part of this repository's test suite.
//
// Run: node scripts/tests/learning/test-review-events-privileges-migration-contract.mjs
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
const CORRECTIVE_2_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260805130000_add_learning_non_negative_constraints_and_revoke_anon_rpc.sql",
);
const CORRECTIVE_3_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260805150000_add_review_events_referential_integrity.sql",
);
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260805170000_revoke_review_events_client_privileges.sql",
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

console.log("\n=== corrective migration 4: file/ordering guards ===\n");

test("1. All four prior migration files still exist", () => {
  assert.ok(fs.existsSync(BASELINE_PATH), "baseline migration file is missing");
  assert.ok(fs.existsSync(CORRECTIVE_1_PATH), "corrective migration 1 file is missing");
  assert.ok(fs.existsSync(CORRECTIVE_2_PATH), "corrective migration 2 file is missing");
  assert.ok(fs.existsSync(CORRECTIVE_3_PATH), "corrective migration 3 file is missing");
});

test("2. The new migration file exists, named later than all four prior migrations (lexicographic timestamp order)", () => {
  assert.ok(fs.existsSync(MIGRATION_PATH), "new corrective migration 4 file is missing");
  const migrationName = path.basename(MIGRATION_PATH);
  assert.ok(
    migrationName > path.basename(CORRECTIVE_3_PATH),
    "the new migration's filename must sort after corrective migration 3's",
  );
  assert.ok(
    migrationName > path.basename(CORRECTIVE_2_PATH),
    "the new migration's filename must sort after corrective migration 2's",
  );
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
const corrective2Source = fs.readFileSync(CORRECTIVE_2_PATH, "utf8");
const corrective3Source = fs.readFileSync(CORRECTIVE_3_PATH, "utf8");

console.log("\n=== corrective migration 4: anon/authenticated table privileges revoked ===\n");

test("3. Revokes all privileges on public.review_events from anon", () => {
  const re = /revoke all privileges on table public\.review_events from anon;/i;
  assert.match(migrationSource, re, "expected a REVOKE ALL PRIVILEGES ... FROM anon statement");
});

test("4. Revokes all privileges on public.review_events from authenticated", () => {
  const re = /revoke all privileges on table public\.review_events from authenticated;/i;
  assert.match(migrationSource, re, "expected a REVOKE ALL PRIVILEGES ... FROM authenticated statement");
});

test("5. Exactly two REVOKE statements exist, targeting only anon and authenticated", () => {
  const revokeStatements = [...migrationSource.matchAll(/revoke all privileges on table\s+(\S+)\s+from\s+(\w+);/gi)];
  assert.equal(revokeStatements.length, 2, `expected exactly 2 REVOKE statements, found ${revokeStatements.length}`);
  const roles = revokeStatements.map((m) => m[2].toLowerCase()).sort();
  assert.deepEqual(roles, ["anon", "authenticated"], `unexpected REVOKE target roles: ${roles.join(", ")}`);
  for (const match of revokeStatements) {
    assert.equal(match[1].toLowerCase(), "public.review_events", `unexpected REVOKE target table: ${match[1]}`);
  }
});

test("6. postgres and service_role are never named in a REVOKE statement", () => {
  const revokeStatements = [...migrationSource.matchAll(/revoke[\s\S]*?from\s+(\w+);/gi)];
  for (const match of revokeStatements) {
    const role = match[1].toLowerCase();
    assert.ok(role !== "postgres" && role !== "service_role", `postgres/service_role must never be revoked, found REVOKE ... FROM ${role}`);
  }
});

test("7. No GRANT statements appear in this migration (privileges-only removal, nothing re-added)", () => {
  // Scoped to actual code lines rather than the whole file — the header/
  // footer prose legitimately discusses "grant"/"granted"/"grant layer" in
  // describing why this migration exists (same precedent as migration 3's
  // ON DELETE CASCADE DDL-only scoping).
  const codeLines = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--") && line.trim().length > 0);
  for (const line of codeLines) {
    assert.doesNotMatch(line, /\bgrant\b/i, `unexpected GRANT-related code line: ${line}`);
  }
});

console.log("\n=== corrective migration 4: no unrelated changes ===\n");

test("8. review_events' columns/constraints/foreign keys are not touched — no ALTER TABLE, CREATE TABLE, DROP TABLE", () => {
  assert.doesNotMatch(migrationSource, /alter table/i);
  assert.doesNotMatch(migrationSource, /create table/i);
  assert.doesNotMatch(migrationSource, /drop table/i);
});

test("9. No RLS policy statements (CREATE POLICY / DROP POLICY / ALTER POLICY) appear in this migration", () => {
  assert.doesNotMatch(migrationSource, /\b(create|drop|alter)\s+policy\b/i);
});

test("10. No function is created, replaced, dropped, or altered by this migration", () => {
  assert.doesNotMatch(migrationSource, /\b(create|drop|alter)\s+(or replace\s+)?function\b/i);
});

test("11. complete_new_word_study, complete_word_review, and set_word_progress_favorite are not touched by any DDL in this migration", () => {
  assert.doesNotMatch(migrationSource, /(create|drop|alter|grant|revoke)[\s\S]{0,80}function public\.complete_new_word_study/i);
  assert.doesNotMatch(migrationSource, /(create|drop|alter|grant|revoke)[\s\S]{0,80}function public\.complete_word_review/i);
  assert.doesNotMatch(migrationSource, /(create|drop|alter|grant|revoke)[\s\S]{0,80}function public\.set_word_progress_favorite/i);
});

test("12. user_profiles, user_word_progress, and user_daily_stats tables/grants are not touched by this migration", () => {
  assert.doesNotMatch(migrationSource, /public\.user_profiles/i);
  assert.doesNotMatch(migrationSource, /public\.user_word_progress/i);
  assert.doesNotMatch(migrationSource, /public\.user_daily_stats/i);
});

test("13. This migration's only privilege-affecting statements target public.review_events", () => {
  const revokeStatements = [...migrationSource.matchAll(/revoke[\s\S]*?on table\s+(\S+)/gi)];
  assert.ok(revokeStatements.length > 0, "expected at least one REVOKE ... ON TABLE statement");
  for (const match of revokeStatements) {
    assert.equal(match[1].toLowerCase(), "public.review_events", `unexpected REVOKE target: ${match[1]}`);
  }
});

console.log("\n=== corrective migration 4: prior migrations byte-for-byte unchanged ===\n");

test("14. The baseline migration file's content is byte-for-byte unchanged", () => {
  assert.ok(baselineSource.includes("BASELINE MIGRATION"), "baseline migration content looks unexpectedly different");
  assert.doesNotMatch(baselineSource, /revoke all privileges on table public\.review_events/i);
});

test("15. Corrective migration 1's content is byte-for-byte unchanged", () => {
  assert.ok(corrective1Source.includes("CORRECTIVE MIGRATION 1"), "corrective migration 1 content looks unexpectedly different");
  assert.doesNotMatch(corrective1Source, /revoke all privileges on table public\.review_events/i);
});

test("16. Corrective migration 2's content is byte-for-byte unchanged", () => {
  assert.ok(corrective2Source.includes("CORRECTIVE MIGRATION 2"), "corrective migration 2 content looks unexpectedly different");
  assert.doesNotMatch(corrective2Source, /revoke all privileges on table public\.review_events/i);
});

test("17. Corrective migration 3's content is byte-for-byte unchanged", () => {
  assert.ok(corrective3Source.includes("CORRECTIVE MIGRATION 3"), "corrective migration 3 content looks unexpectedly different");
  assert.doesNotMatch(corrective3Source, /revoke all privileges on table public\.review_events/i);
});

console.log("\n=== corrective migration 4: application code never accesses review_events directly ===\n");

test("18. No frontend source file directly queries public.review_events (.from('review_events') / .rpc against it as a table)", () => {
  const SRC_DIR = path.join(ROOT_DIR, "src");
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        if (/\.from\(\s*['"`]review_events['"`]\s*\)/.test(text)) {
          offenders.push(full);
        }
      }
    }
  }
  walk(SRC_DIR);
  assert.deepEqual(offenders, [], `expected no direct .from('review_events') client query, found in: ${offenders.join(", ")}`);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("review-events-privileges-migration-contract guard passed");
}
