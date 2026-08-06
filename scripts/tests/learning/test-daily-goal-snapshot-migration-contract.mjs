// Contract guard for Streak Phase 1's historical daily-goal snapshot
// migration. This is a source-level migration guard; live database
// behavior is covered by the smoke-test plan after the migration is
// explicitly applied.
//
// Run: node scripts/tests/learning/test-daily-goal-snapshot-migration-contract.mjs
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
  "20260806190000_add_daily_goal_snapshot_and_update_rpc.sql",
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

// The only supported daily-goal values — DailyGoalSelector's five presets.
// Not a numeric range: 7/25/42/199 must be rejected exactly like 0/999.
const SUPPORTED_DAILY_GOAL_VALUES = [10, 15, 20, 30, 50];
const UNSUPPORTED_IN_RANGE_VALUES = [1, 7, 9, 11, 25, 42, 51, 199];

// Parses a `x in (10, 15, 20, 30, 50)`-style clause out of a chunk of SQL
// and returns the actual numbers found, so tests can prove acceptance/
// rejection by evaluating real membership rather than just pattern-matching
// the literal text.
function parseInClauseNumbers(sqlChunk, label) {
  const match = sqlChunk.match(/\bin\s*\(\s*([\d,\s]+?)\s*\)/i);
  assert.ok(match, `${label} must use an explicit IN (...) list, not a numeric range`);
  return match[1].split(",").map((part) => Number(part.trim()));
}

function assertExactPresetSet(sqlChunk, label) {
  const values = parseInClauseNumbers(sqlChunk, label);
  assert.deepEqual(values, SUPPORTED_DAILY_GOAL_VALUES, `${label} must allow exactly 10, 15, 20, 30, 50 — found [${values.join(", ")}]`);
  for (const supported of SUPPORTED_DAILY_GOAL_VALUES) {
    assert.ok(values.includes(supported), `${label} must accept ${supported}`);
  }
  for (const unsupported of UNSUPPORTED_IN_RANGE_VALUES) {
    assert.ok(!values.includes(unsupported), `${label} must reject ${unsupported} even though it falls within 1-200`);
  }
}

console.log("\n=== daily-goal snapshot migration contract ===\n");

test("1. user_daily_stats.daily_goal is added nullable with no default", () => {
  assert.match(source, /alter table public\.user_daily_stats\s+add column if not exists daily_goal integer null;/i);
  assert.doesNotMatch(source, /daily_goal integer.*default/i);
});

test("2. user_daily_stats.daily_goal has a named nullable exact-preset CHECK (10, 15, 20, 30, 50 — not a 1-200 range)", () => {
  const match = source.match(
    /alter table public\.user_daily_stats\s+add constraint user_daily_stats_daily_goal_allowed_values_check\s+check \(daily_goal is null or daily_goal in \(([\d,\s]+)\)\);/i,
  );
  assert.ok(match, "named nullable exact-preset CHECK must exist");
  assertExactPresetSet(match[0], "user_daily_stats_daily_goal_allowed_values_check");
  assert.doesNotMatch(source, /daily_goal\s+between\s+1\s+and\s+200/i, "must not use a 1-200 range check anywhere");
});

test("3. user_profiles.daily_goal gets a named exact-preset CHECK (10, 15, 20, 30, 50), guarded by an explicit precondition", () => {
  assert.match(source, /do \$\$[\s\S]*?raise exception[\s\S]*?using errcode = '23514';[\s\S]*?\$\$;/i);
  const preconditionMatch = source.match(/where daily_goal not in \(([\d,\s]+)\);/i);
  assert.ok(preconditionMatch, "precondition must check membership in the exact preset set, not a numeric range");
  assertExactPresetSet(preconditionMatch[0], "user_profiles precondition check");
  assert.doesNotMatch(source, /where daily_goal < 1 or daily_goal > 200/i, "precondition must not use a 1-200 range comparison");

  const constraintMatch = source.match(
    /alter table public\.user_profiles\s+add constraint user_profiles_daily_goal_allowed_values_check\s+check \(daily_goal in \(([\d,\s]+)\)\);/i,
  );
  assert.ok(constraintMatch, "named exact-preset CHECK must exist");
  assertExactPresetSet(constraintMatch[0], "user_profiles_daily_goal_allowed_values_check");

  // The precondition check must run (and be able to abort the migration)
  // strictly before the CHECK constraint itself is added.
  const doBlockIndex = source.search(/do \$\$[\s\S]*?raise exception[\s\S]*?\$\$;/i);
  const constraintIndex = source.indexOf("user_profiles_daily_goal_allowed_values_check");
  assert.ok(doBlockIndex >= 0 && constraintIndex > doBlockIndex, "precondition DO block must precede the CHECK constraint");
});

test("4. This migration never bulk-rewrites existing user_profiles or user_daily_stats rows", () => {
  // Strip every function body first: UPDATE statements *inside*
  // update_daily_goal/the three learning RPCs are legitimate, scoped,
  // single-caller writes triggered later by user action, not a migration-
  // time backfill of existing rows. Nothing should remain outside them.
  const withoutFunctionBodies = source.replace(/create or replace function[\s\S]*?\$function\$;/gi, "");
  assert.doesNotMatch(withoutFunctionBodies, /update\s+public\.user_profiles/i);
  assert.doesNotMatch(withoutFunctionBodies, /update\s+public\.user_daily_stats/i);
});

test("5. Study/Review/Custom-Practice INSERT branches all supply daily_goal from the current profile", () => {
  const study = functionBlock("complete_new_word_study", "p_word_id text,\\s*p_target_language text,\\s*p_study_time_seconds integer");
  const review = functionBlock("complete_word_review", "p_event_id uuid,\\s*p_word_progress_id uuid,\\s*p_result text,\\s*p_review_time_seconds integer");
  const custom = functionBlock("complete_custom_practice_word", "p_event_id uuid,\\s*p_target_language text,\\s*p_custom_practice_time_seconds integer");

  for (const [name, block] of [
    ["complete_new_word_study", study],
    ["complete_word_review", review],
    ["complete_custom_practice_word", custom],
  ]) {
    assert.match(block, /v_daily_goal integer;/i, `${name} must declare v_daily_goal`);
    assert.match(
      block,
      /v_daily_goal := coalesce\(\s*\(\s*select up\.daily_goal\s*from public\.user_profiles as up\s*where up\.id = v_user_id\s*\),\s*15\s*\);/i,
      `${name} must resolve v_daily_goal from the current profile, falling back to 15`,
    );
    const validationMatch = block.match(/if v_daily_goal not in \(([\d,\s]+)\) then/i);
    assert.ok(validationMatch, `${name} must validate the resolved goal against the exact preset set, not a 1-200 range`);
    assertExactPresetSet(validationMatch[0], `${name}'s resolved-goal validation`);
    assert.doesNotMatch(block, /v_daily_goal\s*<\s*1\s*or\s*v_daily_goal\s*>\s*200/i, `${name} must not use a 1-200 range comparison`);
    assert.match(block, /insert into public\.user_daily_stats \([\s\S]*?daily_goal[\s\S]*?\) *\n *values/i, `${name}'s INSERT column list must include daily_goal`);
  }
});

test("6. ON CONFLICT DO UPDATE branches never modify daily_goal, and keep the named conflict constraint", () => {
  const study = functionBlock("complete_new_word_study", "p_word_id text,\\s*p_target_language text,\\s*p_study_time_seconds integer");
  const review = functionBlock("complete_word_review", "p_event_id uuid,\\s*p_word_progress_id uuid,\\s*p_result text,\\s*p_review_time_seconds integer");
  const custom = functionBlock("complete_custom_practice_word", "p_event_id uuid,\\s*p_target_language text,\\s*p_custom_practice_time_seconds integer");

  for (const [name, block] of [
    ["complete_new_word_study", study],
    ["complete_word_review", review],
    ["complete_custom_practice_word", custom],
  ]) {
    assert.match(block, /on conflict on constraint user_daily_stats_language_date_unique/i, `${name} must keep the named conflict constraint`);
    assert.doesNotMatch(block, /on conflict\s*\(\s*user_id\s*,\s*target_language\s*,\s*stat_date\s*\)/i, `${name} must not reintroduce an ambiguous tuple conflict target`);

    const doUpdateMatch = block.match(/do update\s+set([\s\S]*?);/i);
    assert.ok(doUpdateMatch, `${name} must have a DO UPDATE SET clause`);
    assert.doesNotMatch(doUpdateMatch[1], /daily_goal\s*=/i, `${name}'s DO UPDATE SET clause must not touch daily_goal`);
  }
});

test("7. Existing business logic (auth/ownership/validation/idempotency) is preserved in all three RPCs", () => {
  const study = functionBlock("complete_new_word_study", "p_word_id text,\\s*p_target_language text,\\s*p_study_time_seconds integer");
  const review = functionBlock("complete_word_review", "p_event_id uuid,\\s*p_word_progress_id uuid,\\s*p_result text,\\s*p_review_time_seconds integer");
  const custom = functionBlock("complete_custom_practice_word", "p_event_id uuid,\\s*p_target_language text,\\s*p_custom_practice_time_seconds integer");

  for (const block of [study, review, custom]) {
    assert.match(block, /security definer/i);
    assert.match(block, /set search_path to ''/i);
    assert.match(block, /authentication required/i);
    assert.match(block, /resolve_authenticated_learning_date\(\)/i);
  }

  assert.match(study, /on conflict \(user_id, word_id, target_language\)\s*\n\s*do nothing;/i, "Study idempotency conflict target must be unchanged");
  assert.match(review, /for update;/i, "Review must still lock the owned progress row");
  assert.match(review, /on conflict \(event_id\) do nothing;/i, "Review event idempotency must be unchanged");
  assert.match(custom, /on conflict \(event_id\) do nothing;/i, "Custom Practice event idempotency must be unchanged");
});

test("8. update_daily_goal validates auth, rejects null/unsupported values with 22023, and requires an existing profile", () => {
  const rpc = functionBlock("update_daily_goal", "p_daily_goal integer");
  assert.match(rpc, /security definer/i);
  assert.match(rpc, /set search_path to ''/i);
  assert.match(rpc, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(rpc, /if v_user_id is null then/i);
  assert.match(rpc, /if p_daily_goal is null then/i);

  const validationMatch = rpc.match(/if p_daily_goal not in \(([\d,\s]+)\) then/i);
  assert.ok(validationMatch, "must validate against the exact preset set, not a 1-200 range");
  assertExactPresetSet(validationMatch[0], "update_daily_goal's p_daily_goal validation");
  assert.doesNotMatch(rpc, /p_daily_goal\s*<\s*1\s*or\s*p_daily_goal\s*>\s*200/i, "must not use a 1-200 range comparison");

  const validationBlock = rpc.match(/if p_daily_goal not in \([\d,\s]+\) then([\s\S]*?)end if;/i);
  assert.ok(validationBlock, "validation block must exist");
  assert.match(validationBlock[1], /using errcode = '22023';/i, "an unsupported daily_goal must raise SQLSTATE 22023");

  assert.match(rpc, /v_profile_exists/i, "must check the authenticated profile exists");
  assert.match(rpc, /if not v_profile_exists then/i);
});

test("8b. update_daily_goal's validation accepts every preset and rejects every unsupported in-range value", () => {
  const rpc = functionBlock("update_daily_goal", "p_daily_goal integer");
  const validationMatch = rpc.match(/if p_daily_goal not in \(([\d,\s]+)\) then/i);
  const allowedValues = validationMatch[1].split(",").map((part) => Number(part.trim()));

  for (const goal of SUPPORTED_DAILY_GOAL_VALUES) {
    assert.ok(allowedValues.includes(goal), `update_daily_goal must accept ${goal}`);
  }
  for (const goal of [0, ...UNSUPPORTED_IN_RANGE_VALUES, 200, 201]) {
    assert.ok(!allowedValues.includes(goal), `update_daily_goal must reject ${goal}`);
  }
});

test("9. update_daily_goal derives stat_date once, server-side, before either write", () => {
  const rpc = functionBlock("update_daily_goal", "p_daily_goal integer");
  assert.equal([...rpc.matchAll(/resolve_authenticated_learning_date\(\)/gi)].length, 1);
  const resolveIndex = rpc.search(/v_stat_date := public\.resolve_authenticated_learning_date\(\);/i);
  const profileUpdateIndex = rpc.search(/update public\.user_profiles as up/i);
  const statsUpdateIndex = rpc.search(/update public\.user_daily_stats as uds/i);
  assert.ok(resolveIndex >= 0 && resolveIndex < profileUpdateIndex && resolveIndex < statsUpdateIndex);
});

test("10. update_daily_goal updates only today's user_daily_stats rows, across every target_language, never previous dates", () => {
  const rpc = functionBlock("update_daily_goal", "p_daily_goal integer");
  const statsUpdateMatch = rpc.match(/update public\.user_daily_stats as uds\s+set daily_goal = p_daily_goal\s+where([\s\S]*?);/i);
  assert.ok(statsUpdateMatch, "user_daily_stats UPDATE must exist");
  assert.match(statsUpdateMatch[1], /uds\.user_id = v_user_id/i);
  assert.match(statsUpdateMatch[1], /uds\.stat_date = v_stat_date/i);
  assert.doesNotMatch(statsUpdateMatch[1], /target_language/i, "must not filter by target_language — every language's today row is affected");
  assert.doesNotMatch(statsUpdateMatch[1], /</, "must not contain a less-than date comparison reaching earlier dates");
});

test("11. update_daily_goal touches only daily_goal/updated_at on user_profiles, no unrelated field", () => {
  const rpc = functionBlock("update_daily_goal", "p_daily_goal integer");
  const profileUpdateMatch = rpc.match(/update public\.user_profiles as up\s+set([\s\S]*?)\s+where up\.id = v_user_id;/i);
  assert.ok(profileUpdateMatch, "user_profiles UPDATE must exist");
  assert.match(profileUpdateMatch[1], /daily_goal = p_daily_goal/i);
  assert.match(profileUpdateMatch[1], /updated_at = now\(\)/i);
  assert.doesNotMatch(profileUpdateMatch[1], /last_active_at|nickname|native_language|learning_language|current_level|user_age|birth_month|birth_day|onboarding_completed|timezone/i);
});

test("12. update_daily_goal returns daily_goal, stat_date, and updated_daily_stats_rows", () => {
  const rpc = functionBlock("update_daily_goal", "p_daily_goal integer");
  assert.match(rpc, /returns table\(daily_goal integer, stat_date date, updated_daily_stats_rows integer\)/i);
  assert.match(rpc, /return query\s+select p_daily_goal, v_stat_date, v_row_count;/i);
});

test("13. update_daily_goal grants exclude public/anon and include authenticated/postgres/service_role", () => {
  assert.match(source, /revoke execute on function public\.update_daily_goal\(integer\) from public;/i);
  assert.match(source, /revoke execute on function public\.update_daily_goal\(integer\) from anon;/i);
  assert.match(source, /grant execute on function public\.update_daily_goal\(integer\) to postgres;/i);
  assert.match(source, /grant execute on function public\.update_daily_goal\(integer\) to authenticated;/i);
  assert.match(source, /grant execute on function public\.update_daily_goal\(integer\) to service_role;/i);
});

test("14. No grant/revoke statements accompany the three CREATE OR REPLACE learning RPCs (existing grants are preserved as-is)", () => {
  const learningRpcSection = source.slice(
    source.indexOf("create or replace function public.complete_new_word_study"),
    source.indexOf("create or replace function public.update_daily_goal"),
  );
  assert.doesNotMatch(learningRpcSection, /\bgrant\b|\brevoke\b/i);
});

console.log(`\n-----------------------------------------`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`-----------------------------------------\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("daily-goal-snapshot migration contract passed");
}
