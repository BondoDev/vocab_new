// Contract guard for the update_user_profile_learning_preferences backend
// primitive (Settings Current Level editing follow-up —
// supabase/migrations/20260813140000_add_update_user_profile_learning_preferences_rpc.sql).
//
// Source-text guard, like every migration-contract test in this repository —
// there is no live Supabase project available to this suite. Mirrors
// test-update-user-nickname-migration-contract.mjs's own structure.
//
// Run: node scripts/tests/learning/test-update-user-profile-learning-preferences-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260813140000_add_update_user_profile_learning_preferences_rpc.sql",
);
const RESTRICT_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql",
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

assert.ok(fs.existsSync(MIGRATION_PATH), "the update_user_profile_learning_preferences migration file is missing");
const source = fs.readFileSync(MIGRATION_PATH, "utf8");
const restrictSource = fs.readFileSync(RESTRICT_MIGRATION_PATH, "utf8");

const rpcMatch = source.match(
  /create or replace function public\.update_user_profile_learning_preferences\(([\s\S]*?)\$function\$;/,
);
assert.ok(rpcMatch, "update_user_profile_learning_preferences function definition must exist");
const rpcBody = rpcMatch[0];

console.log("\n=== update_user_profile_learning_preferences: signature and identity ===\n");

test("1. Accepts exactly p_native_language, p_learning_language, p_current_level (all text) — no p_user_id anywhere", () => {
  assert.match(
    rpcBody,
    /create or replace function public\.update_user_profile_learning_preferences\(\s*p_native_language text,\s*p_learning_language text,\s*p_current_level text\s*\)/,
  );
  assert.doesNotMatch(rpcBody, /p_user_id/i);
  assert.doesNotMatch(rpcBody, /p_target_user_id/i);
});

test("2. Uses SECURITY DEFINER with an empty search_path", () => {
  assert.match(rpcBody, /security definer/i);
  assert.match(rpcBody, /set search_path to ''/i);
});

test("3. Derives the caller exclusively from auth.uid() and rejects a null caller", () => {
  assert.match(rpcBody, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(rpcBody, /if v_user_id is null then/i);
  assert.match(rpcBody, /authentication required/i);
});

test("4. Returns exactly (native_language text, learning_language text, current_level text, updated_at timestamptz)", () => {
  assert.match(
    source,
    /returns table \(\s*native_language text,\s*learning_language text,\s*current_level text,\s*updated_at timestamptz\s*\)/i,
  );
});

console.log("\n=== update_user_profile_learning_preferences: validation ===\n");

test("5. Rejects a null/unsupported p_native_language before touching the database", () => {
  assert.match(
    rpcBody,
    /if p_native_language is null or p_native_language not in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\) then/i,
  );
  assert.match(rpcBody, /p_native_language must be one of en, es, fr, pt, it, de, ru/i);
});

test("6. Rejects a null/unsupported p_learning_language before touching the database", () => {
  assert.match(
    rpcBody,
    /if p_learning_language is null or p_learning_language not in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\) then/i,
  );
  assert.match(rpcBody, /p_learning_language must be one of en, es, fr, pt, it, de, ru/i);
});

test("7. Rejects a null/unsupported p_current_level against the exact six-code CEFR set — never alphabetical/loose matching", () => {
  assert.match(
    rpcBody,
    /if p_current_level is null or p_current_level not in \('A1', 'A2', 'B1', 'B2', 'C1', 'C2'\) then/i,
  );
  assert.match(rpcBody, /p_current_level must be one of A1, A2, B1, B2, C1, C2/i);
});

test("8. Checks the profile row exists and raises P0002 if not (never an implicit insert)", () => {
  assert.match(rpcBody, /v_profile_exists/);
  assert.match(rpcBody, /if not v_profile_exists then/i);
  assert.match(rpcBody, /errcode = 'P0002'/);
});

console.log("\n=== update_user_profile_learning_preferences: atomic write scope ===\n");

test("9. Exactly one UPDATE statement exists in the function body (one atomic write, not two sequential ones)", () => {
  const updateStatements = rpcBody.match(/update public\.user_profiles as up/gi) ?? [];
  assert.equal(updateStatements.length, 1);
});

test("10. The UPDATE sets exactly native_language, learning_language, current_level, and updated_at — never any other column", () => {
  const updateMatch = rpcBody.match(/update public\.user_profiles as up\s+set\s+([\s\S]*?)\s+where/i);
  assert.ok(updateMatch, "expected an UPDATE ... SET ... WHERE statement");
  const setClause = updateMatch[1];
  const setColumns = [...setClause.matchAll(/(\w+)\s*=/g)].map((m) => m[1]);
  assert.deepEqual(
    setColumns.sort(),
    ["native_language", "learning_language", "current_level", "updated_at"].sort(),
  );
});

test("11. The UPDATE is scoped to the caller's own row only (where up.id = v_user_id)", () => {
  assert.match(rpcBody, /where\s+up\.id = v_user_id/i);
});

test("12. The function never references nickname/user_age/birth_month/birth_day/onboarding_completed/daily_goal/timezone/timezone_updated_at", () => {
  assert.doesNotMatch(
    rpcBody,
    /\bnickname\b|\buser_age\b|\bbirth_month\b|\bbirth_day\b|\bonboarding_completed\b|\bdaily_goal\b|\btimezone\b/i,
  );
});

test("13. The function never references user_daily_stats/user_word_progress/review_events/custom_practice_events — no progress mutation", () => {
  assert.doesNotMatch(rpcBody, /user_daily_stats/);
  assert.doesNotMatch(rpcBody, /user_word_progress/);
  assert.doesNotMatch(rpcBody, /review_events/);
  assert.doesNotMatch(rpcBody, /custom_practice_events/);
});

console.log("\n=== update_user_profile_learning_preferences: grants ===\n");

test("14. EXECUTE is revoked from public and anon", () => {
  assert.match(
    source,
    /revoke execute on function public\.update_user_profile_learning_preferences\(text, text, text\) from public;/i,
  );
  assert.match(
    source,
    /revoke execute on function public\.update_user_profile_learning_preferences\(text, text, text\) from anon;/i,
  );
});

test("15. EXECUTE is granted to authenticated", () => {
  assert.match(
    source,
    /grant execute on function public\.update_user_profile_learning_preferences\(text, text, text\) to authenticated;/i,
  );
});

test("16. EXECUTE is also granted to postgres and service_role", () => {
  assert.match(
    source,
    /grant execute on function public\.update_user_profile_learning_preferences\(text, text, text\) to postgres;/i,
  );
  assert.match(
    source,
    /grant execute on function public\.update_user_profile_learning_preferences\(text, text, text\) to service_role;/i,
  );
});

console.log("\n=== update_user_profile_learning_preferences: no unrelated scope creep ===\n");

test("17. This migration does not redefine update_user_profile_languages/complete_user_profile_onboarding or touch their grants (old RPC kept intact)", () => {
  assert.doesNotMatch(source, /create or replace function public\.update_user_profile_languages\(/i);
  assert.doesNotMatch(source, /create or replace function public\.complete_user_profile_onboarding/i);
  assert.doesNotMatch(source, /revoke execute on function public\.update_user_profile_languages\(/i);
  assert.doesNotMatch(source, /revoke execute on function public\.complete_user_profile_onboarding/i);
});

test("18. No other function is created or replaced by this migration", () => {
  const allFunctionDefs = [...source.matchAll(/create or replace function public\.(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(allFunctionDefs)], ["update_user_profile_learning_preferences"]);
});

test("19. No policy, constraint, or table grant/revoke is touched by this migration (only function-level EXECUTE grants)", () => {
  assert.doesNotMatch(source, /drop policy/i);
  assert.doesNotMatch(source, /create policy/i);
  assert.doesNotMatch(source, /add constraint/i);
  assert.doesNotMatch(source, /^\s*revoke insert, select, update, delete/im);
  assert.doesNotMatch(source, /^\s*grant insert, select, update, delete/im);
});

test("20. No new table/column is created (function-only migration)", () => {
  assert.doesNotMatch(source, /create table/i);
  assert.doesNotMatch(source, /add column/i);
});

test("21. The pre-existing update_user_profile_languages(text, text) signature this migration must not collide with is confirmed present in the restrict migration (sanity check, not a modification)", () => {
  assert.match(restrictSource, /create or replace function public\.update_user_profile_languages\(\s*p_native_language text,\s*p_learning_language text\s*\)/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("update-user-profile-learning-preferences-migration-contract tests failed");
  process.exit(1);
}

console.log("update-user-profile-learning-preferences-migration-contract tests passed");
