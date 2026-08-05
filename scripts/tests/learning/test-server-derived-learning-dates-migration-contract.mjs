// Contract guard for Timezone Phase 2's server-derived learning-date
// migration. This is a source-level migration guard; live database behavior
// is covered by the smoke-test plan after the migration is explicitly
// applied.
//
// Run: node scripts/tests/learning/test-server-derived-learning-dates-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260806150000_add_server_derived_learning_dates.sql",
);
const source = fs.readFileSync(migrationPath, "utf8");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function functionBlock(name, signaturePattern) {
  const match = source.match(
    new RegExp(
      `create or replace function public\\.${name}\\(\\s*${signaturePattern}\\s*\\)[\\s\\S]*?\\$function\\$;`,
      "i",
    ),
  );
  assert.ok(match, `${name}(${signaturePattern}) block must exist`);
  return match[0];
}

function executableBody(block) {
  const match = block.match(/as\s+\$function\$\s*([\s\S]*?)\s*\$function\$;/i);
  assert.ok(match, "function body must be extractable");
  return match[1];
}

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

console.log("\n=== server-derived learning dates migration contract ===\n");

test("1. Date-memory columns are added without NOT NULL backfills", () => {
  assert.match(source, /alter table public\.user_word_progress\s+add column if not exists first_studied_stat_date date null;/i);
  assert.match(source, /alter table public\.review_events\s+add column if not exists stat_date date null;/i);
  assert.match(source, /alter table public\.custom_practice_events\s+add column if not exists stat_date date null;/i);
  assert.doesNotMatch(source, /update public\.user_daily_stats/i);
  assert.doesNotMatch(source, /update public\.review_events\s+set\s+stat_date/i);
  assert.doesNotMatch(source, /update public\.custom_practice_events\s+set\s+stat_date/i);
});

test("2. Shared helper requires auth, validates timezone, uses UTC fallback and statement_timestamp", () => {
  const block = functionBlock("resolve_authenticated_learning_date", "");
  assert.match(block, /security definer/i);
  assert.match(block, /set search_path to ''/i);
  assert.match(block, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(block, /if v_user_id is null/i);
  assert.match(block, /v_resolved_timezone text := 'UTC'/i);
  assert.match(block, /public\.user_profiles/i);
  assert.match(block, /pg_catalog\.pg_timezone_names/i);
  assert.match(block, /statement_timestamp\(\) at time zone v_resolved_timezone/i);
});

test("3. get_current_learning_date is authenticated-only and exposes no date input", () => {
  const block = functionBlock("get_current_learning_date", "");
  assert.match(block, /returns table\(stat_date date\)/i);
  assert.match(block, /public\.resolve_authenticated_learning_date\(\)/i);
  assert.doesNotMatch(block, /p_stat_date|p_timezone/i);
  assert.match(source, /revoke execute on function public\.get_current_learning_date\(\) from public;/i);
  assert.match(source, /revoke execute on function public\.get_current_learning_date\(\) from anon;/i);
  assert.match(source, /grant execute on function public\.get_current_learning_date\(\) to authenticated;/i);
});

test("4. New primary RPC signatures have no p_stat_date and resolve v_stat_date once", () => {
  const study = functionBlock("complete_new_word_study", "p_word_id text,\\s*p_target_language text,\\s*p_study_time_seconds integer");
  const review = functionBlock("complete_word_review", "p_event_id uuid,\\s*p_word_progress_id uuid,\\s*p_result text,\\s*p_review_time_seconds integer");
  const custom = functionBlock("complete_custom_practice_word", "p_event_id uuid,\\s*p_target_language text,\\s*p_custom_practice_time_seconds integer");

  for (const block of [study, review, custom]) {
    assert.doesNotMatch(block, /p_stat_date/i);
    assert.equal([...block.matchAll(/resolve_authenticated_learning_date\(\)/gi)].length, 1);
  }
});

test("5. Compatibility wrappers keep old signatures, ignore p_stat_date, and delegate", () => {
  const study = functionBlock("complete_new_word_study", "p_word_id text,\\s*p_target_language text,\\s*p_stat_date date,\\s*p_study_time_seconds integer");
  const review = functionBlock("complete_word_review", "p_event_id uuid,\\s*p_word_progress_id uuid,\\s*p_result text,\\s*p_stat_date date,\\s*p_review_time_seconds integer");
  const custom = functionBlock("complete_custom_practice_word", "p_event_id uuid,\\s*p_target_language text,\\s*p_stat_date date,\\s*p_custom_practice_time_seconds integer");
  const wrapperBodies = [
    executableBody(study),
    executableBody(review),
    executableBody(custom),
  ].map(stripSqlComments);

  assert.match(source, /Temporary Study compatibility wrapper\. p_stat_date is ignored/i);
  assert.match(source, /Temporary Review compatibility wrapper\. p_stat_date is ignored/i);
  assert.match(source, /Temporary Custom Practice compatibility wrapper\. p_stat_date is ignored/i);
  assert.match(study, /complete_new_word_study\(p_word_id, p_target_language, p_study_time_seconds\)/);
  assert.match(review, /complete_word_review\(p_event_id, p_word_progress_id, p_result, p_review_time_seconds\)/);
  assert.match(custom, /complete_custom_practice_word\(p_event_id, p_target_language, p_custom_practice_time_seconds\)/);
  for (const body of wrapperBodies) {
    assert.doesNotMatch(body, /\bp_stat_date\b/i, "wrapper executable body must not read, validate, or forward p_stat_date");
    assert.doesNotMatch(body, /if\s+.*p_stat_date|p_stat_date\s+is\s+null|=\s*p_stat_date/i);
  }
});

test("6. New event/progress writes store the server-derived date", () => {
  assert.match(source, /first_studied_stat_date[\s\S]*?v_stat_date/i);
  assert.match(source, /insert into public\.review_events \([\s\S]*?stat_date[\s\S]*?\) values \([\s\S]*?v_stat_date/i);
  assert.match(source, /insert into public\.custom_practice_events \([\s\S]*?stat_date[\s\S]*?p_custom_practice_time_seconds, v_stat_date/i);
});

test("7. Duplicate replay reads stored stat_date instead of deriving another authoritative date", () => {
  const study = functionBlock("complete_new_word_study", "p_word_id text,\\s*p_target_language text,\\s*p_study_time_seconds integer");
  const review = functionBlock("complete_word_review", "p_event_id uuid,\\s*p_word_progress_id uuid,\\s*p_result text,\\s*p_review_time_seconds integer");
  const custom = functionBlock("complete_custom_practice_word", "p_event_id uuid,\\s*p_target_language text,\\s*p_custom_practice_time_seconds integer");

  assert.match(study, /uwp\.first_studied_stat_date/i);
  assert.match(study, /uds\.stat_date = v_original_stat_date/i);
  assert.match(review, /v_existing\.stat_date/i);
  assert.match(review, /uds\.stat_date = v_existing\.stat_date/i);
  assert.match(custom, /v_existing\.stat_date/i);
  assert.match(custom, /uds\.stat_date = v_original_stat_date/i);
});

test("8. Custom Practice duplicate replay uses stored event language for daily-stat attribution", () => {
  const custom = functionBlock("complete_custom_practice_word", "p_event_id uuid,\\s*p_target_language text,\\s*p_custom_practice_time_seconds integer");
  const body = executableBody(custom);
  const existingFastPath = body.match(/if found then\s+([\s\S]*?)\s+else\s+insert into public\.custom_practice_events/i);
  const conflictReplay = body.match(/else\s+select \* into v_existing from public\.custom_practice_events[\s\S]*?v_original_target_language := v_existing\.target_language;[\s\S]*?end if;/i);
  const replayDailyStatsQuery = body.match(/select uds\.custom_practice_time_seconds[\s\S]*?and uds\.stat_date = v_original_stat_date;/i);

  assert.ok(existingFastPath, "custom-practice existing-event replay block must be found");
  assert.ok(conflictReplay, "custom-practice concurrent-conflict replay block must be found");
  assert.ok(replayDailyStatsQuery, "custom-practice replay daily-stat query must be found");
  assert.match(existingFastPath[1], /v_original_stat_date := v_existing\.stat_date;/i);
  assert.match(existingFastPath[1], /v_original_target_language := v_existing\.target_language;/i);
  assert.match(conflictReplay[0], /v_original_stat_date := v_existing\.stat_date;/i);
  assert.match(conflictReplay[0], /v_original_target_language := v_existing\.target_language;/i);
  assert.match(replayDailyStatsQuery[0], /uds\.target_language = v_original_target_language/i);
  assert.doesNotMatch(replayDailyStatsQuery[0], /\bp_target_language\b/i, "duplicate replay daily-stat query must not use retry request language");
});

test("9. Client execution grants exclude anon/public for every new and wrapper RPC", () => {
  const signatures = [
    "complete_new_word_study\\(text, text, integer\\)",
    "complete_new_word_study\\(text, text, date, integer\\)",
    "complete_word_review\\(uuid, uuid, text, integer\\)",
    "complete_word_review\\(uuid, uuid, text, date, integer\\)",
    "complete_custom_practice_word\\(uuid, text, integer\\)",
    "complete_custom_practice_word\\(uuid, text, date, integer\\)",
  ];

  for (const signature of signatures) {
    assert.match(source, new RegExp(`revoke execute on function public\\.${signature} from public;`, "i"));
    assert.match(source, new RegExp(`revoke execute on function public\\.${signature} from anon;`, "i"));
    assert.match(source, new RegExp(`grant execute on function public\\.${signature} to authenticated;`, "i"));
  }
});

console.log(`\n-----------------------------------------`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`-----------------------------------------\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("server-derived-learning-dates migration contract passed");
}
