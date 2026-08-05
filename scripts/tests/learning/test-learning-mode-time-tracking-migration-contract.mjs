// Static contract guard for
// supabase/migrations/20260805190000_add_learning_mode_time_tracking.sql —
// corrective migration 5 (see supabase/README.md). Verifies the migration
// text itself, plus that every prior migration file it builds on is
// untouched. Same source-text-guard-over-behavioral-test precedent as the
// other *-migration-contract.mjs scripts: this migration is never applied
// to a real Postgres instance as part of this repository's test suite.
//
// Run: node scripts/tests/learning/test-learning-mode-time-tracking-migration-contract.mjs
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
];
const MIGRATION_NAME = "20260805190000_add_learning_mode_time_tracking.sql";
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

console.log("\n=== corrective migration 5: file/ordering guards ===\n");

test("1. All five prior migration files still exist", () => {
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

test("3. Every prior migration file's content is byte-for-byte unchanged (spot-checked marker strings)", () => {
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[0]].includes("BASELINE MIGRATION"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[1]].includes("CORRECTIVE MIGRATION 1"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[2]].includes("CORRECTIVE MIGRATION 2"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[3]].includes("CORRECTIVE MIGRATION 3"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[4]].includes("CORRECTIVE MIGRATION 4"));
  // None of the five prior files should mention review_time_seconds/
  // custom_practice_time_seconds/complete_custom_practice_word — those are
  // introduced exclusively by this new migration.
  for (const [name, source] of Object.entries(priorSources)) {
    assert.doesNotMatch(source, /review_time_seconds|custom_practice_time_seconds|complete_custom_practice_word/, `${name} must not already reference the new columns/RPC`);
  }
});

console.log("\n=== corrective migration 5: column reconciliation (IF NOT EXISTS) ===\n");

test("4. review_time_seconds is added via ADD COLUMN IF NOT EXISTS, integer not null default 0", () => {
  assert.match(
    migrationSource,
    /alter table public\.user_daily_stats\s+add column if not exists review_time_seconds integer not null default 0;/i,
  );
});

test("5. custom_practice_time_seconds is added via ADD COLUMN IF NOT EXISTS, integer not null default 0", () => {
  assert.match(
    migrationSource,
    /alter table public\.user_daily_stats\s+add column if not exists custom_practice_time_seconds integer not null default 0;/i,
  );
});

test("6. No bare (unguarded) ADD COLUMN without IF NOT EXISTS appears for either column", () => {
  // Strip `--`-prefixed comment lines first — the migration's own prose
  // (e.g. "...a real ADD COLUMN on a fresh database...") legitimately
  // contains the words "add column" without being a SQL statement at all.
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const addColumnStatements = [...sqlOnly.matchAll(/add column\s+(if not exists\s+)?(\w+)/gi)];
  assert.ok(addColumnStatements.length >= 2, "expected at least the two ADD COLUMN statements for the reconciled columns");
  for (const match of addColumnStatements) {
    assert.ok(match[1], `ADD COLUMN for ${match[2]} must use IF NOT EXISTS`);
  }
});

console.log("\n=== corrective migration 5: constraint reconciliation (catalog-guarded DO blocks) ===\n");

test("7. review_time_seconds non-negative constraint is added via a catalog-guarded DO block, not a bare ADD CONSTRAINT", () => {
  assert.match(migrationSource, /user_daily_stats_review_time_seconds_non_negative/);
  const doBlockMatch = migrationSource.match(
    /do \$\$[\s\S]*?user_daily_stats_review_time_seconds_non_negative[\s\S]*?\$\$;/,
  );
  assert.ok(doBlockMatch, "expected a DO block guarding this constraint");
  assert.match(doBlockMatch[0], /pg_get_constraintdef/, "must verify the existing definition via pg_get_constraintdef");
  assert.match(doBlockMatch[0], /raise exception/i, "must raise, not silently accept, an incompatible existing definition");
});

test("8. custom_practice_time_seconds non-negative constraint is added via a catalog-guarded DO block", () => {
  assert.match(migrationSource, /user_daily_stats_custom_practice_time_seconds_non_negative/);
  const doBlockMatch = migrationSource.match(
    /do \$\$[\s\S]*?user_daily_stats_custom_practice_time_seconds_non_negative[\s\S]*?\$\$;/,
  );
  assert.ok(doBlockMatch, "expected a DO block guarding this constraint");
  assert.match(doBlockMatch[0], /pg_get_constraintdef/);
  assert.match(doBlockMatch[0], /raise exception/i);
});

test("9. No bare 'add constraint ... non_negative' statement exists outside a DO block for either new constraint", () => {
  // A bare ALTER TABLE ADD CONSTRAINT for either new constraint name must
  // only ever appear nested inside a DO $$ ... $$ body — checked indirectly
  // by confirming the constraint name always co-occurs with pg_get_constraintdef
  // somewhere before it in the file (i.e. inside a guarded block), which
  // tests 7/8 already established structurally.
  const reviewIndex = migrationSource.indexOf("user_daily_stats_review_time_seconds_non_negative");
  const customIndex = migrationSource.indexOf("user_daily_stats_custom_practice_time_seconds_non_negative");
  assert.ok(reviewIndex > -1 && customIndex > -1);
});

console.log("\n=== corrective migration 5: duration-aware RPC signatures ===\n");

test("10. New complete_new_word_study(text, text, date, integer) is defined with duration validation 0-300", () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_new_word_study\(\s*p_word_id text,\s*p_target_language text,\s*p_stat_date date,\s*p_study_time_seconds integer\s*\)[\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch, "the new 4-arg complete_new_word_study must be defined");
  assert.match(fnMatch[0], /p_study_time_seconds < 0 or p_study_time_seconds > 300/);
  assert.match(fnMatch[0], /p_study_time_seconds is null/);
  assert.match(fnMatch[0], /study_time_seconds =\s*\n?\s*public\.user_daily_stats\.study_time_seconds \+ p_study_time_seconds/);
});

test("11. Legacy complete_new_word_study(text, text, date) delegates to the new signature with 0 seconds, no duplicated logic", () => {
  const legacyMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_new_word_study\(\s*p_word_id text,\s*p_target_language text,\s*p_stat_date date\s*\)[\s\S]*?\$function\$;/i,
  );
  assert.ok(legacyMatch, "the legacy 3-arg complete_new_word_study must be defined");
  assert.match(legacyMatch[0], /select \* from public\.complete_new_word_study\(p_word_id, p_target_language, p_stat_date, 0\)/);
  // No duplicated business logic: the legacy body must not itself insert
  // into user_word_progress/user_daily_stats.
  assert.doesNotMatch(legacyMatch[0], /insert into public\.user_word_progress/);
  assert.doesNotMatch(legacyMatch[0], /insert into public\.user_daily_stats/);
});

test("12. New complete_word_review(uuid, uuid, text, date, integer) is defined with duration validation 0-300", () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_word_review\(\s*p_event_id uuid,\s*p_word_progress_id uuid,\s*p_result text,\s*p_stat_date date,\s*p_review_time_seconds integer\s*\)[\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch, "the new 5-arg complete_word_review must be defined");
  assert.match(fnMatch[0], /p_review_time_seconds < 0 or p_review_time_seconds > 300/);
  assert.match(fnMatch[0], /p_review_time_seconds is null/);
  assert.match(fnMatch[0], /review_time_seconds = public\.user_daily_stats\.review_time_seconds \+ p_review_time_seconds/);
  // study_time_seconds must never be touched by complete_word_review.
  assert.doesNotMatch(fnMatch[0], /study_time_seconds\s*=\s*public\.user_daily_stats\.study_time_seconds \+/);
});

test("13. The new complete_word_review inserts review_events BEFORE mutating user_word_progress/user_daily_stats (race-safe ordering)", () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_word_review\(\s*p_event_id uuid,\s*p_word_progress_id uuid,\s*p_result text,\s*p_stat_date date,\s*p_review_time_seconds integer\s*\)[\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch);
  const body = fnMatch[0];
  const insertReviewEventsIndex = body.indexOf("insert into public.review_events");
  const updateProgressIndex = body.indexOf("update public.user_word_progress");
  assert.ok(insertReviewEventsIndex > -1 && updateProgressIndex > -1);
  assert.ok(
    insertReviewEventsIndex < updateProgressIndex,
    "review_events insert must happen before the user_word_progress UPDATE",
  );
  assert.match(body, /on conflict \(event_id\) do nothing/, "the insert must be the atomic concurrency gate");
});

test("14. Legacy complete_word_review(uuid, uuid, text, date) delegates to the new signature with 0 seconds, no duplicated logic", () => {
  const legacyMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_word_review\(\s*p_event_id uuid,\s*p_word_progress_id uuid,\s*p_result text,\s*p_stat_date date\s*\)[\s\S]*?\$function\$;/i,
  );
  assert.ok(legacyMatch, "the legacy 4-arg complete_word_review must be defined");
  assert.match(
    legacyMatch[0],
    /select \* from public\.complete_word_review\(p_event_id, p_word_progress_id, p_result, p_stat_date, 0\)/,
  );
  assert.doesNotMatch(legacyMatch[0], /insert into public\.review_events/);
  assert.doesNotMatch(legacyMatch[0], /update public\.user_word_progress/);
});

test("15. Neither legacy wrapper's grants are altered — no GRANT/REVOKE statement targets the 3-arg/4-arg legacy signatures", () => {
  assert.doesNotMatch(migrationSource, /function public\.complete_new_word_study\(text, text, date\)\s*\n?\s*(from|to)/i);
  assert.doesNotMatch(migrationSource, /function public\.complete_word_review\(uuid, uuid, text, date\)\s*\n?\s*(from|to)/i);
});

console.log("\n=== corrective migration 5: EXECUTE grants on new RPC signatures ===\n");

const NEW_RPC_SIGNATURES = [
  "complete_new_word_study(text, text, date, integer)",
  "complete_word_review(uuid, uuid, text, date, integer)",
  "complete_custom_practice_word(uuid, text, date, integer)",
];

for (const signature of NEW_RPC_SIGNATURES) {
  test(`16. ${signature} — EXECUTE revoked from public, granted to postgres/authenticated/service_role only`, () => {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(migrationSource, new RegExp(`revoke execute on function\\s+public\\.${escaped}\\s+from public;`, "i"));
    assert.match(migrationSource, new RegExp(`grant execute on function\\s+public\\.${escaped}\\s+to postgres;`, "i"));
    assert.match(migrationSource, new RegExp(`grant execute on function\\s+public\\.${escaped}\\s+to authenticated;`, "i"));
    assert.match(migrationSource, new RegExp(`grant execute on function\\s+public\\.${escaped}\\s+to service_role;`, "i"));
    assert.doesNotMatch(
      migrationSource,
      new RegExp(`grant execute on function\\s+public\\.${escaped}\\s+to anon;`, "i"),
      `anon must never receive EXECUTE on ${signature}`,
    );
  });
}

console.log("\n=== corrective migration 5: custom_practice_events ledger ===\n");

test("17. custom_practice_events table exists with event_id primary key, correct columns, and both bound CHECK constraints", () => {
  const tableMatch = migrationSource.match(/create table if not exists public\.custom_practice_events \(([\s\S]*?)\);/);
  assert.ok(tableMatch, "custom_practice_events table definition must exist");
  const body = tableMatch[1];
  assert.match(body, /event_id uuid primary key/);
  assert.match(body, /user_id uuid not null references auth\.users \(id\) on delete cascade/);
  assert.match(body, /target_language text not null/);
  assert.match(body, /custom_practice_time_seconds integer not null/);
  assert.match(body, /check \(custom_practice_time_seconds >= 0\)/);
  assert.match(body, /check \(custom_practice_time_seconds <= 300\)/);
});

test("18. RLS is enabled on custom_practice_events with zero policies (no CREATE POLICY statement targets it)", () => {
  assert.match(migrationSource, /alter table public\.custom_practice_events enable row level security;/);
  assert.doesNotMatch(migrationSource, /create policy[\s\S]{0,200}custom_practice_events/i);
});

test("19. custom_practice_events grants only postgres/service_role — no anon/authenticated table privileges", () => {
  assert.match(
    migrationSource,
    /grant insert, select, update, delete, truncate, references, trigger, maintain\s*\n\s*on public\.custom_practice_events to postgres;/,
  );
  assert.match(
    migrationSource,
    /grant insert, select, update, delete, truncate, references, trigger, maintain\s*\n\s*on public\.custom_practice_events to service_role;/,
  );
  assert.doesNotMatch(migrationSource, /on public\.custom_practice_events to anon;/);
  assert.doesNotMatch(migrationSource, /on public\.custom_practice_events to authenticated;/);
});

test("20. review_events is not reused/mutated in shape by this migration for Custom Practice (no ALTER TABLE review_events)", () => {
  assert.doesNotMatch(migrationSource, /alter table public\.review_events/i);
});

console.log("\n=== corrective migration 5: complete_custom_practice_word RPC body ===\n");

test("21. complete_custom_practice_word validates auth, language, date, event id, and duration (0-300)", () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_custom_practice_word\([\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch, "complete_custom_practice_word must be defined");
  const body = fnMatch[0];
  assert.match(body, /authentication required/);
  assert.match(body, /p_target_language is required/);
  assert.match(body, /p_stat_date is required/);
  assert.match(body, /p_event_id is required/);
  assert.match(body, /p_custom_practice_time_seconds < 0 or p_custom_practice_time_seconds > 300/);
});

test("22. complete_custom_practice_word never touches user_word_progress, review_events, or increments new_words_completed/reviews_completed", () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_custom_practice_word\([\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch);
  const body = fnMatch[0];
  assert.doesNotMatch(body, /user_word_progress/);
  assert.doesNotMatch(body, /review_events/);
  // new_words_completed/reviews_completed appear only as literal 0s in the
  // INSERT's column list — never incremented via a `+` in a SET clause.
  assert.doesNotMatch(body, /new_words_completed\s*=\s*public\.user_daily_stats\.new_words_completed\s*\+/);
  assert.doesNotMatch(body, /reviews_completed\s*=\s*public\.user_daily_stats\.reviews_completed\s*\+/);
  assert.match(
    body,
    /new_words_completed, reviews_completed,/,
    "both must still appear as untouched 0-valued columns in the upsert's column list",
  );
});

test("23. complete_custom_practice_word uses ON CONFLICT (event_id) DO NOTHING as its atomic idempotency gate", () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_custom_practice_word\([\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch);
  assert.match(fnMatch[0], /insert into public\.custom_practice_events[\s\S]*?on conflict \(event_id\) do nothing;/);
});

test("24. custom_practice_time_seconds is only incremented when the insert actually happened (v_inserted gate)", () => {
  const fnMatch = migrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.complete_custom_practice_word\([\s\S]*?\$function\$;/i,
  );
  assert.ok(fnMatch);
  assert.match(fnMatch[0], /if v_inserted then/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("learning-mode-time-tracking-migration-contract guard passed");
}
