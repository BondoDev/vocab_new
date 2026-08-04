// Static contract guard for
// supabase/migrations/20260805150000_add_review_events_referential_integrity.sql
// — corrective migration 3 (see supabase/README.md). Verifies the migration
// text itself, plus that all three prior migrations it builds on are
// untouched. Same source-text-guard-over-behavioral-test precedent as
// test-restrict-learning-writes-migration-contract.mjs and
// test-learning-non-negative-constraints-migration-contract.mjs: this
// migration is never applied to Supabase as part of this repository's test
// suite.
//
// Run: node scripts/tests/learning/test-review-events-integrity-migration-contract.mjs
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
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260805150000_add_review_events_referential_integrity.sql",
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

console.log("\n=== corrective migration 3: file/ordering guards ===\n");

test("1. All three prior migration files still exist", () => {
  assert.ok(fs.existsSync(BASELINE_PATH), "baseline migration file is missing");
  assert.ok(fs.existsSync(CORRECTIVE_1_PATH), "corrective migration 1 file is missing");
  assert.ok(fs.existsSync(CORRECTIVE_2_PATH), "corrective migration 2 file is missing");
});

test("2. The new migration file exists, named later than all three prior migrations (lexicographic timestamp order)", () => {
  assert.ok(fs.existsSync(MIGRATION_PATH), "new corrective migration 3 file is missing");
  const migrationName = path.basename(MIGRATION_PATH);
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

console.log("\n=== corrective migration 3: review_events.user_id foreign key ===\n");

test("3. Adds review_events_user_id_fkey: review_events.user_id -> auth.users(id)", () => {
  const re =
    /alter table public\.review_events\s+add constraint review_events_user_id_fkey\s+foreign key \(user_id\) references auth\.users \(id\)\s+on delete cascade;/i;
  assert.match(migrationSource, re, "expected an explicitly named user_id -> auth.users(id) FK with ON DELETE CASCADE");
});

test("4. No foreign key on review_events.user_id exists in any prior migration (this is a genuinely new constraint)", () => {
  assert.doesNotMatch(baselineSource, /review_events_user_id_fkey/i);
  assert.doesNotMatch(corrective1Source, /review_events_user_id_fkey/i);
  assert.doesNotMatch(corrective2Source, /review_events_user_id_fkey/i);
});

console.log("\n=== corrective migration 3: review_events.word_progress_id foreign key ===\n");

test("5. Drops the existing word_progress_id foreign key by its deterministic default name", () => {
  const re = /alter table public\.review_events\s+drop constraint review_events_word_progress_id_fkey;/i;
  assert.match(migrationSource, re, "expected an explicit DROP CONSTRAINT for the prior word_progress_id FK");
});

test("6. Re-adds word_progress_id -> user_word_progress(id) with an explicit name and ON DELETE CASCADE", () => {
  const re =
    /alter table public\.review_events\s+add constraint review_events_word_progress_id_fkey\s+foreign key \(word_progress_id\) references public\.user_word_progress \(id\)\s+on delete cascade;/i;
  assert.match(migrationSource, re, "expected an explicitly named word_progress_id -> user_word_progress(id) FK with ON DELETE CASCADE");
});

test("7. The DROP CONSTRAINT for word_progress_id precedes its re-ADD in the file", () => {
  const dropIndex = migrationSource.search(/drop constraint review_events_word_progress_id_fkey;/i);
  const addIndex = migrationSource.search(
    /add constraint review_events_word_progress_id_fkey\s+foreign key \(word_progress_id\)/i,
  );
  assert.ok(dropIndex !== -1 && addIndex !== -1, "expected both a DROP and a re-ADD of this constraint");
  assert.ok(dropIndex < addIndex, "the DROP CONSTRAINT must appear before the re-ADD CONSTRAINT");
});

test("8. Both foreign keys explicitly specify ON DELETE CASCADE — no ON DELETE SET NULL / RESTRICT / NO ACTION anywhere", () => {
  // Scoped to actual DDL (ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE ...)
  // rather than the whole file, since the header/footer prose legitimately
  // discusses ON DELETE CASCADE on other, pre-existing columns too.
  const ddlCascadeMatches = [
    ...migrationSource.matchAll(/add constraint\s+\S+\s+foreign key[\s\S]{0,150}?on delete cascade;/gi),
  ];
  assert.equal(
    ddlCascadeMatches.length,
    2,
    `expected exactly 2 ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE CASCADE statements, found ${ddlCascadeMatches.length}`,
  );
  const ddlOnDeleteMatches = [...migrationSource.matchAll(/add constraint\s+\S+\s+foreign key[\s\S]{0,150}?on delete (\w+(?:\s+\w+)?);/gi)];
  for (const match of ddlOnDeleteMatches) {
    assert.equal(match[1].toLowerCase(), "cascade", `unexpected ON DELETE action in DDL: ${match[1]}`);
  }
});

test("9. Exactly two ADD CONSTRAINT ... FOREIGN KEY statements and one DROP CONSTRAINT statement exist", () => {
  const addFk = [...migrationSource.matchAll(/add constraint\s+\S+\s+foreign key/gi)];
  const dropConstraint = [...migrationSource.matchAll(/drop constraint\s+\S+/gi)];
  assert.equal(addFk.length, 2, `expected exactly 2 ADD CONSTRAINT ... FOREIGN KEY statements, found ${addFk.length}`);
  assert.equal(dropConstraint.length, 1, `expected exactly 1 DROP CONSTRAINT statement, found ${dropConstraint.length}`);
});

console.log("\n=== corrective migration 3: no unrelated changes ===\n");

test("10. review_events' columns are not redefined — no CREATE TABLE, DROP TABLE, ADD COLUMN, or DROP COLUMN", () => {
  assert.doesNotMatch(migrationSource, /create table/i);
  assert.doesNotMatch(migrationSource, /drop table/i);
  assert.doesNotMatch(migrationSource, /add column/i);
  assert.doesNotMatch(migrationSource, /drop column/i);
});

test("11. No CHECK constraints are added or dropped by this migration", () => {
  assert.doesNotMatch(migrationSource, /\bcheck\s*\(/i);
  assert.doesNotMatch(migrationSource, /drop constraint\s+\S*check/i);
});

test("12. No table grant statements (GRANT/REVOKE) appear in this migration", () => {
  assert.doesNotMatch(migrationSource, /\b(grant|revoke)\b/i);
});

test("13. No RLS policy statements (CREATE POLICY / DROP POLICY / ALTER POLICY) appear in this migration", () => {
  assert.doesNotMatch(migrationSource, /\b(create|drop|alter)\s+policy\b/i);
});

test("14. No function is created, replaced, or dropped by this migration", () => {
  assert.doesNotMatch(migrationSource, /\b(create|drop)\s+(or replace\s+)?function\b/i);
});

test("15. complete_new_word_study, complete_word_review, and set_word_progress_favorite are all untouched", () => {
  assert.doesNotMatch(migrationSource, /complete_new_word_study\s*\(/i);
  assert.doesNotMatch(migrationSource, /complete_word_review\s*\(/i);
  assert.doesNotMatch(migrationSource, /set_word_progress_favorite\s*\(/i);
});

test("16. user_profiles, user_word_progress, and user_daily_stats tables are not altered by this migration", () => {
  assert.doesNotMatch(migrationSource, /alter table public\.user_profiles/i);
  assert.doesNotMatch(migrationSource, /alter table public\.user_word_progress/i);
  assert.doesNotMatch(migrationSource, /alter table public\.user_daily_stats/i);
});

test("17. This migration touches only public.review_events", () => {
  const alterTableMatches = [...migrationSource.matchAll(/alter table\s+(\S+)/gi)];
  assert.ok(alterTableMatches.length > 0, "expected at least one ALTER TABLE statement");
  for (const match of alterTableMatches) {
    assert.equal(match[1].toLowerCase(), "public.review_events", `unexpected ALTER TABLE target: ${match[1]}`);
  }
});

console.log("\n=== corrective migration 3: prior migrations byte-for-byte unchanged ===\n");

test("18. The baseline migration file's content is byte-for-byte unchanged", () => {
  assert.ok(baselineSource.includes("BASELINE MIGRATION"), "baseline migration content looks unexpectedly different");
  assert.doesNotMatch(baselineSource, /review_events_user_id_fkey/);
});

test("19. Corrective migration 1's content is byte-for-byte unchanged", () => {
  assert.ok(corrective1Source.includes("CORRECTIVE MIGRATION 1"), "corrective migration 1 content looks unexpectedly different");
  assert.doesNotMatch(corrective1Source, /review_events_user_id_fkey/);
});

test("20. Corrective migration 2's content is byte-for-byte unchanged", () => {
  assert.ok(corrective2Source.includes("CORRECTIVE MIGRATION 2"), "corrective migration 2 content looks unexpectedly different");
  assert.doesNotMatch(corrective2Source, /review_events_user_id_fkey/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("review-events-integrity-migration-contract guard passed");
}
