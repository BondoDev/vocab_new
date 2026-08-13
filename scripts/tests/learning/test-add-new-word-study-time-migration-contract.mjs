// Static contract guard for
// supabase/migrations/20260811120000_add_new_word_study_time_and_repurpose_total.sql
// — Study Activity Phase 1's schema/RPC migration. Same source-text-guard-
// over-behavioral-test precedent as every other *-migration-contract.mjs
// script in this directory: this migration is never applied to a real
// Postgres instance as part of this repository's test suite.
//
// Run: node scripts/tests/learning/test-add-new-word-study-time-migration-contract.mjs
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
  "20260805200000_drop_legacy_learning_rpc_signatures.sql",
  "20260806120000_add_user_timezone_foundation.sql",
  "20260806150000_add_server_derived_learning_dates.sql",
  "20260806170000_fix_learning_rpc_daily_stats_conflict_targets.sql",
  "20260806180000_remove_server_date_compatibility_wrappers.sql",
  "20260806190000_add_daily_goal_snapshot_and_update_rpc.sql",
  "20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql",
  "20260807130000_drop_unused_user_profiles_last_active_at.sql",
  "20260807140000_drop_unused_user_profiles_is_new_user.sql",
  "20260808120000_add_learning_language_progress_reset_rpc.sql",
  "20260808130000_add_vocabulary_growth_events_rpc.sql",
];
const MIGRATION_NAME = "20260811120000_add_new_word_study_time_and_repurpose_total.sql";
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

console.log("\n=== Study Activity Phase 1 migration: file/ordering/architecture guards ===\n");

test("1. Every prior migration file still exists", () => {
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

test("3. No later migration undoes this migration's design: new_word_study_time_seconds keeps its column shape and non-negative guard, and any redefinition of the three RPCs still increments the same totals (later migrations are free to add unrelated schema — e.g. My Lists, Settings — this only guards this migration's own invariants)", () => {
  const allNames = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
  const laterNames = allNames.filter((name) => name !== MIGRATION_NAME && name > MIGRATION_NAME);
  assert.ok(
    laterNames.length > 0,
    "expected at least one later migration to exist (e.g. My Lists/Settings) — if this fails, this assertion itself may need updating rather than the fixture",
  );

  for (const name of laterNames) {
    const source = fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");

    assert.doesNotMatch(
      source,
      /alter table public\.user_daily_stats[\s\S]{0,200}drop column[\s\S]{0,80}new_word_study_time_seconds/i,
      `${name} must not drop new_word_study_time_seconds`,
    );
    assert.doesNotMatch(
      source,
      /alter table public\.user_daily_stats[\s\S]{0,200}alter column new_word_study_time_seconds/i,
      `${name} must not retype/reconstrain new_word_study_time_seconds outside this migration's own catalog-guarded DO block`,
    );
    assert.doesNotMatch(
      source,
      /drop constraint[\s\S]{0,40}user_daily_stats_new_word_study_time_seconds_non_negative/i,
      `${name} must not drop the new_word_study_time_seconds non-negative constraint`,
    );

    // If a later migration redefines any of the three RPCs this migration
    // extended, its body must still carry the same study-time accounting —
    // a signature-preserving CREATE OR REPLACE that silently dropped the
    // increment would reintroduce the pre-migration behavior.
    if (/create or replace function public\.complete_new_word_study\(/i.test(source)) {
      assert.match(
        source,
        /new_word_study_time_seconds =\s*\n?\s*public\.user_daily_stats\.new_word_study_time_seconds \+ p_study_time_seconds/,
        `${name} redefines complete_new_word_study but drops its new_word_study_time_seconds increment`,
      );
    }
    if (/create or replace function public\.complete_word_review\(/i.test(source)) {
      assert.match(
        source,
        /study_time_seconds = public\.user_daily_stats\.study_time_seconds \+ p_review_time_seconds/,
        `${name} redefines complete_word_review but drops its study_time_seconds increment`,
      );
    }
    if (/create or replace function public\.complete_custom_practice_word\(/i.test(source)) {
      assert.match(
        source,
        /study_time_seconds =\s*\n?\s*public\.user_daily_stats\.study_time_seconds \+ p_custom_practice_time_seconds/,
        `${name} redefines complete_custom_practice_word but drops its study_time_seconds increment`,
      );
    }
  }
});

const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8");
const priorSource20260806190000 = fs.readFileSync(
  path.join(MIGRATIONS_DIR, "20260806190000_add_daily_goal_snapshot_and_update_rpc.sql"),
  "utf8",
);

test("4. The prior RPC-defining migration (20260806190000) is byte-unchanged (spot-checked marker string)", () => {
  assert.ok(priorSource20260806190000.includes("STREAK PHASE 1"));
});

console.log("\n=== Study Activity Phase 1 migration: new_word_study_time_seconds column ===\n");

test("5. new_word_study_time_seconds is added via ADD COLUMN IF NOT EXISTS, integer not null default 0", () => {
  assert.match(
    migrationSource,
    /alter table public\.user_daily_stats\s+add column if not exists new_word_study_time_seconds integer not null default 0;/i,
  );
});

test("6. Its non-negative constraint is added via a catalog-guarded DO block, not a bare ADD CONSTRAINT", () => {
  const doBlockMatch = migrationSource.match(
    /do \$\$[\s\S]*?user_daily_stats_new_word_study_time_seconds_non_negative[\s\S]*?\$\$;/,
  );
  assert.ok(doBlockMatch, "expected a DO block guarding this constraint");
  assert.match(doBlockMatch[0], /pg_get_constraintdef/, "must verify the existing definition via pg_get_constraintdef");
  assert.match(doBlockMatch[0], /raise exception/i, "must raise, not silently accept, an incompatible existing definition");
});

console.log("\n=== Study Activity Phase 1 migration: one-time backfill ===\n");

test("7. The backfill copies the old study_time_seconds value into new_word_study_time_seconds exactly", () => {
  assert.match(
    migrationSource,
    /set new_word_study_time_seconds = study_time_seconds,/,
  );
});

test("8. The same statement turns study_time_seconds into the true total (adds review + custom practice)", () => {
  assert.match(
    migrationSource,
    /study_time_seconds = study_time_seconds \+ review_time_seconds \+ custom_practice_time_seconds/,
  );
});

test("9. The backfill is guarded (best-effort re-run protection), not an unconditional UPDATE", () => {
  const updateMatch = migrationSource.match(/update public\.user_daily_stats[\s\S]*?where new_word_study_time_seconds = 0;/);
  assert.ok(updateMatch, "expected the backfill UPDATE to carry a WHERE guard");
});

test("10. No fabricated 'uncategorized' bucket/column is introduced as an actual SQL identifier (the word may appear only in `--` comment prose explaining why none is needed)", () => {
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /uncategorized/i);
});

console.log("\n=== Study Activity Phase 1 migration: RPC signatures unchanged, bodies extended ===\n");

test("11. complete_new_word_study keeps its exact current 3-argument signature", () => {
  const fnMatch = migrationSource.match(
    /create or replace function public\.complete_new_word_study\(\s*p_word_id text,\s*p_target_language text,\s*p_study_time_seconds integer\s*\)[\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch, "complete_new_word_study(text, text, integer) must be defined with this exact signature");
  const body = fnMatch[0];
  assert.match(
    body,
    /insert into public\.user_daily_stats \(\s*user_id,\s*target_language,\s*stat_date,\s*new_words_completed,\s*reviews_completed,\s*study_time_seconds,\s*new_word_study_time_seconds,\s*daily_goal\s*\)/,
    "INSERT column list must include new_word_study_time_seconds",
  );
  assert.match(
    body,
    /new_word_study_time_seconds =\s*\n?\s*public\.user_daily_stats\.new_word_study_time_seconds \+ p_study_time_seconds/,
    "ON CONFLICT UPDATE must increment new_word_study_time_seconds",
  );
  assert.match(
    body,
    /study_time_seconds =\s*\n?\s*public\.user_daily_stats\.study_time_seconds \+ p_study_time_seconds/,
    "the total (study_time_seconds) must still be incremented too",
  );
});

test("12. complete_word_review keeps its exact current 4-argument signature", () => {
  const fnMatch = migrationSource.match(
    /create or replace function public\.complete_word_review\(\s*p_event_id uuid,\s*p_word_progress_id uuid,\s*p_result text,\s*p_review_time_seconds integer\s*\)[\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch, "complete_word_review(uuid, uuid, text, integer) must be defined with this exact signature");
  const body = fnMatch[0];
  assert.match(body, /review_time_seconds = public\.user_daily_stats\.review_time_seconds \+ p_review_time_seconds/);
  assert.match(
    body,
    /study_time_seconds = public\.user_daily_stats\.study_time_seconds \+ p_review_time_seconds/,
    "the total (study_time_seconds) must now also be incremented on review",
  );
  // Never increments new_word_study_time_seconds — this RPC's only mode
  // column is review_time_seconds.
  assert.doesNotMatch(body, /new_word_study_time_seconds =\s*\n?\s*public\.user_daily_stats\.new_word_study_time_seconds \+/);
});

test("13. complete_custom_practice_word keeps its exact current 3-argument signature", () => {
  const fnMatch = migrationSource.match(
    /create or replace function public\.complete_custom_practice_word\(\s*p_event_id uuid,\s*p_target_language text,\s*p_custom_practice_time_seconds integer\s*\)[\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch, "complete_custom_practice_word(uuid, text, integer) must be defined with this exact signature");
  const body = fnMatch[0];
  assert.match(
    body,
    /custom_practice_time_seconds =\s*\n?\s*public\.user_daily_stats\.custom_practice_time_seconds \+ p_custom_practice_time_seconds/,
  );
  assert.match(
    body,
    /study_time_seconds =\s*\n?\s*public\.user_daily_stats\.study_time_seconds \+ p_custom_practice_time_seconds/,
    "the total (study_time_seconds) must now also be incremented on custom practice",
  );
});

test("14. No GRANT/REVOKE SQL statements appear anywhere — identical-signature CREATE OR REPLACE preserves existing grants (comment prose may still mention the words)", () => {
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /^\s*grant\s/im);
  assert.doesNotMatch(sqlOnly, /^\s*revoke\s/im);
});

test("15. No new table is created — additive column + backfill + RPC redefinition only", () => {
  assert.doesNotMatch(migrationSource, /create table/i);
});

test("16. review_events/custom_practice_events idempotency and word-progress/promotion logic are untouched (present, byte-identical fragments)", () => {
  assert.match(migrationSource, /on conflict \(event_id\) do nothing/);
  assert.match(migrationSource, /v_promoted := true; v_new_streak := 0;/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("add-new-word-study-time migration contract guard passed");
}
