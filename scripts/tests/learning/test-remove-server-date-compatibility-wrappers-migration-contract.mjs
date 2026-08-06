// Static contract guard for
// supabase/migrations/20260806180000_remove_server_date_compatibility_wrappers.sql
// — Timezone Phase 2 cleanup. Verifies the migration text itself, plus that
// every prior migration file it builds on is untouched. Same source-text
// guard precedent as every other *-migration-contract.mjs script: this
// migration is never applied to a real Postgres instance as part of this
// repository's test suite.
//
// Run: node scripts/tests/learning/test-remove-server-date-compatibility-wrappers-migration-contract.mjs
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
];
const MIGRATION_NAME = "20260806180000_remove_server_date_compatibility_wrappers.sql";
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

console.log("\n=== remove server-date compatibility wrappers migration: file/ordering guards ===\n");

test("1. All ten prior migration files still exist", () => {
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
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[6]].includes("CORRECTIVE MIGRATION 6"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[7]].includes("TIMEZONE PHASE 1"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[8]].includes("TIMEZONE PHASE 2"));
  assert.ok(priorSources[PRIOR_MIGRATION_NAMES[9]].includes("TIMEZONE PHASE 2 corrective migration"));
});

test("4. 20260806150000's wrapper CREATE statements are byte-for-byte unchanged (full-file hash-equivalent spot check)", () => {
  const phase2Migration = priorSources[PRIOR_MIGRATION_NAMES[8]];
  // A handful of load-bearing fragments that must survive verbatim — cheaper
  // than shelling out to git diff, and this script has no git dependency by
  // design (matches every other *-migration-contract.mjs). This migration
  // never rewrites or removes the wrapper CREATE statements themselves —
  // only a later migration (this one) drops the resulting functions.
  assert.match(phase2Migration, /create or replace function public\.complete_new_word_study\(\s*p_word_id text,\s*p_target_language text,\s*p_stat_date date,\s*p_study_time_seconds integer\s*\)/i);
  assert.match(phase2Migration, /create or replace function public\.complete_word_review\(\s*p_event_id uuid,\s*p_word_progress_id uuid,\s*p_result text,\s*p_stat_date date,\s*p_review_time_seconds integer\s*\)/i);
  assert.match(phase2Migration, /create or replace function public\.complete_custom_practice_word\(\s*p_event_id uuid,\s*p_target_language text,\s*p_stat_date date,\s*p_custom_practice_time_seconds integer\s*\)/i);
});

console.log("\n=== remove server-date compatibility wrappers migration: exactly the three wrapper signatures are dropped ===\n");

test("5. DROP FUNCTION IF EXISTS public.complete_new_word_study(text, text, date, integer); appears exactly once", () => {
  const matches = [...migrationSource.matchAll(/DROP FUNCTION IF EXISTS\s+public\.complete_new_word_study\(text, text, date, integer\)\s*;/gi)];
  assert.equal(matches.length, 1, "expected exactly one DROP FUNCTION statement for the Study wrapper signature");
});

test("6. DROP FUNCTION IF EXISTS public.complete_word_review(uuid, uuid, text, date, integer); appears exactly once", () => {
  const matches = [...migrationSource.matchAll(/DROP FUNCTION IF EXISTS\s+public\.complete_word_review\(uuid, uuid, text, date, integer\)\s*;/gi)];
  assert.equal(matches.length, 1, "expected exactly one DROP FUNCTION statement for the Review wrapper signature");
});

test("7. DROP FUNCTION IF EXISTS public.complete_custom_practice_word(uuid, text, date, integer); appears exactly once", () => {
  const matches = [...migrationSource.matchAll(/DROP FUNCTION IF EXISTS\s+public\.complete_custom_practice_word\(uuid, text, date, integer\)\s*;/gi)];
  assert.equal(matches.length, 1, "expected exactly one DROP FUNCTION statement for the Custom Practice wrapper signature");
});

test("8. Exactly three DROP FUNCTION statements exist in the whole file — nothing else is dropped", () => {
  // Strip `--`-prefixed comment lines first — the migration's own prose
  // legitimately says "DROP FUNCTION IF EXISTS" while explaining the
  // rationale, without being a second real statement.
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const matches = [...sqlOnly.matchAll(/DROP FUNCTION/gi)];
  assert.equal(matches.length, 3, `expected exactly 3 real DROP FUNCTION statements, found ${matches.length}`);
});

test("9. No DROP statement targets any active no-date signature", () => {
  assert.doesNotMatch(migrationSource, /DROP FUNCTION[\s\S]{0,80}complete_new_word_study\(text, text, integer\)\s*;/i);
  assert.doesNotMatch(migrationSource, /DROP FUNCTION[\s\S]{0,80}complete_word_review\(uuid, uuid, text, integer\)\s*;/i);
  assert.doesNotMatch(migrationSource, /DROP FUNCTION[\s\S]{0,80}complete_custom_practice_word\(uuid, text, integer\)\s*;/i);
});

test("10. get_current_learning_date and resolve_authenticated_learning_date are never the target of any DDL statement", () => {
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /get_current_learning_date/i);
  assert.doesNotMatch(sqlOnly, /resolve_authenticated_learning_date/i);
});

console.log("\n=== remove server-date compatibility wrappers migration: no CASCADE, no unrelated changes ===\n");

test("11. CASCADE is never used anywhere in this migration", () => {
  assert.doesNotMatch(migrationSource.replace(/--.*$/gm, ""), /\bCASCADE\b/i);
});

test("12. No CREATE/ALTER/DROP statement targets a table, column, constraint, index, or policy", () => {
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

test("13. No GRANT/REVOKE statement appears anywhere — grants on remaining functions are untouched", () => {
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /\bgrant\b/i);
  assert.doesNotMatch(sqlOnly, /\brevoke\b/i);
});

test("14. No CREATE OR REPLACE FUNCTION appears — no function body is redefined by this migration", () => {
  assert.doesNotMatch(migrationSource, /create or replace function/i);
});

test("15. No INSERT/UPDATE/DELETE statement appears — no data is rewritten", () => {
  const sqlOnly = migrationSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(sqlOnly, /\binsert into\b/i);
  assert.doesNotMatch(sqlOnly, /\bupdate\s+public\./i);
  assert.doesNotMatch(sqlOnly, /\bdelete from\b/i);
});

console.log("\n=== remove server-date compatibility wrappers migration: frontend never sends p_stat_date ===\n");

const newWordProgressSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"), "utf8");
const customPracticeProgressSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "customPracticeProgress.ts"), "utf8");

test("16. completeNewWordStudy's request body sends exactly p_word_id/p_target_language/p_study_time_seconds — no p_stat_date", () => {
  const bodyMatch = newWordProgressSource.match(/"\/rest\/v1\/rpc\/complete_new_word_study",\s*\{([\s\S]*?)\},\s*\);/);
  assert.ok(bodyMatch, "the complete_new_word_study RPC call body must be found");
  const body = bodyMatch[1];
  assert.doesNotMatch(body, /p_stat_date/i);
  const sentKeys = [...body.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  assert.deepEqual(
    sentKeys.sort(),
    ["p_study_time_seconds", "p_target_language", "p_word_id"].sort(),
  );
});

test("17. completeWordReview's request body sends exactly p_event_id/p_word_progress_id/p_result/p_review_time_seconds — no p_stat_date", () => {
  const bodyMatch = newWordProgressSource.match(/"\/rest\/v1\/rpc\/complete_word_review",\s*\{([\s\S]*?)\},\s*\);/);
  assert.ok(bodyMatch, "the complete_word_review RPC call body must be found");
  const body = bodyMatch[1];
  assert.doesNotMatch(body, /p_stat_date/i);
  const sentKeys = [...body.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  assert.deepEqual(
    sentKeys.sort(),
    ["p_event_id", "p_result", "p_review_time_seconds", "p_word_progress_id"].sort(),
  );
});

test("18. completeCustomPracticeWord's request body sends exactly p_event_id/p_target_language/p_custom_practice_time_seconds — no p_stat_date", () => {
  const bodyMatch = customPracticeProgressSource.match(/"\/rest\/v1\/rpc\/complete_custom_practice_word",\s*\{([\s\S]*?)\}\);/);
  assert.ok(bodyMatch, "the complete_custom_practice_word RPC call body must be found");
  const body = bodyMatch[1];
  assert.doesNotMatch(body, /p_stat_date/i);
  const sentKeys = [...body.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  assert.deepEqual(
    sentKeys.sort(),
    ["p_custom_practice_time_seconds", "p_event_id", "p_target_language"].sort(),
  );
});

test("19. Exactly one production call site exists for each learning RPC", () => {
  const studySites = [...newWordProgressSource.matchAll(/\/rest\/v1\/rpc\/complete_new_word_study/g)];
  const reviewSites = [...newWordProgressSource.matchAll(/\/rest\/v1\/rpc\/complete_word_review/g)];
  const customSites = [...customPracticeProgressSource.matchAll(/\/rest\/v1\/rpc\/complete_custom_practice_word/g)];
  assert.equal(studySites.length, 1, "expected exactly one complete_new_word_study RPC call site");
  assert.equal(reviewSites.length, 1, "expected exactly one complete_word_review RPC call site");
  assert.equal(customSites.length, 1, "expected exactly one complete_custom_practice_word RPC call site");
});

test("20. No p_stat_date reference remains anywhere under src/", () => {
  const walk = (dir) => {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walk(fullPath));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  };
  const offenders = [];
  for (const file of walk(path.join(ROOT_DIR, "src"))) {
    const content = fs.readFileSync(file, "utf8");
    if (/p_stat_date/i.test(content)) {
      offenders.push(path.relative(ROOT_DIR, file).replace(/\\/g, "/"));
    }
  }
  assert.deepEqual(offenders, [], `unexpected p_stat_date reference(s): ${offenders.join(", ")}`);
});

console.log("\n=== remove server-date compatibility wrappers migration: documentation no longer describes the wrappers as active ===\n");

const supabaseReadmeSource = fs.readFileSync(path.join(ROOT_DIR, "supabase", "README.md"), "utf8");
const architectureDocSource = fs.readFileSync(path.join(ROOT_DIR, "docs", "architecture.md"), "utf8");
const learningReadmeSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "learning", "README.md"),
  "utf8",
);

test("21. supabase/README.md records the three removed wrapper signatures and no longer calls them temporary/pending", () => {
  assert.match(supabaseReadmeSource, /complete_new_word_study\(text,\s*text,\s*date,\s*integer\)/);
  assert.match(supabaseReadmeSource, /complete_word_review\(uuid,\s*uuid,\s*text,\s*date,\s*integer\)/);
  assert.match(supabaseReadmeSource, /complete_custom_practice_word\(uuid,\s*text,\s*date,\s*integer\)/);
  assert.doesNotMatch(supabaseReadmeSource, /wrappers?\..{0,40}remain(s)? (only )?(as )?temporar/i);
  assert.doesNotMatch(supabaseReadmeSource, /Do not remove these wrappers until/i);
});

test("22. docs/architecture.md no longer says learning RPCs still receive client-provided p_stat_date", () => {
  assert.doesNotMatch(architectureDocSource, /still temporarily receive\s+client-provided\s+`?p_stat_date`?/i);
});

test("23. Learning feature README no longer describes the date-taking signatures as remaining wrappers", () => {
  assert.doesNotMatch(learningReadmeSource, /remain only as temporary compatibility wrappers/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("remove-server-date-compatibility-wrappers-migration-contract guard passed");
}
