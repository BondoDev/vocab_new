// Contract guard for the update_user_nickname backend primitive (Settings
// nickname-editing follow-up —
// supabase/migrations/20260813130000_add_update_user_nickname_rpc.sql).
//
// Source-text guard, like every migration-contract test in this repository
// — there is no live Supabase project available to this suite.
//
// Run: node scripts/tests/learning/test-update-user-nickname-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const MIGRATION_PATH = path.join(ROOT_DIR, "supabase", "migrations", "20260813130000_add_update_user_nickname_rpc.sql");
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

assert.ok(fs.existsSync(MIGRATION_PATH), "the update_user_nickname migration file is missing");
const source = fs.readFileSync(MIGRATION_PATH, "utf8");
const restrictSource = fs.readFileSync(RESTRICT_MIGRATION_PATH, "utf8");

const rpcMatch = source.match(/create or replace function public\.update_user_nickname\(([\s\S]*?)\$function\$;/);
assert.ok(rpcMatch, "update_user_nickname function definition must exist");
const rpcBody = rpcMatch[0];

console.log("\n=== update_user_nickname: signature and identity ===\n");

test("1. Accepts exactly one parameter, p_nickname text — no p_user_id anywhere", () => {
  assert.match(rpcBody, /create or replace function public\.update_user_nickname\(\s*p_nickname text\s*\)/);
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

test("4. Returns exactly (nickname text, updated_at timestamptz) — no other field", () => {
  assert.match(
    source,
    /returns table \(\s*nickname text,\s*updated_at timestamptz\s*\)/i,
  );
});

console.log("\n=== update_user_nickname: validation (reuses the same rules as the table CHECK and onboarding) ===\n");

test("5. Trims surrounding whitespace before validating/storing (btrim, same as complete_user_profile_onboarding)", () => {
  assert.match(rpcBody, /v_nickname text := btrim\(p_nickname\)/);
});

test("6. Rejects a null/empty-after-trim p_nickname before touching the database", () => {
  assert.match(rpcBody, /if p_nickname is null or char_length\(v_nickname\) = 0 then/i);
  assert.match(rpcBody, /p_nickname is required/i);
});

test("7. Rejects a nickname over 40 characters — the same cap user_profiles_nickname_length_check enforces", () => {
  assert.match(rpcBody, /if char_length\(v_nickname\) > 40 then/i);
  assert.match(rpcBody, /must be at most 40 characters/i);
  assert.match(restrictSource, /check \(char_length\(btrim\(nickname\)\) > 0 and char_length\(nickname\) <= 40\)/i);
});

test("8. Never reproduces a 'starts with a letter' rule at the database level (frontend-only, same as the table CHECK's own documented decision)", () => {
  assert.doesNotMatch(rpcBody, /\\p\{L\}/);
  assert.doesNotMatch(rpcBody, /starts_with_letter/i);
});

test("9. Checks the profile row exists and raises P0002 if not (never an implicit insert), mirroring update_user_timezone/update_user_profile_languages' own precedent", () => {
  assert.match(rpcBody, /v_profile_exists/);
  assert.match(rpcBody, /if not v_profile_exists then/i);
  assert.match(rpcBody, /errcode = 'P0002'/);
});

console.log("\n=== update_user_nickname: write scope ===\n");

test("10. The UPDATE sets exactly nickname and updated_at — never any other column", () => {
  const updateMatch = rpcBody.match(/update public\.user_profiles as up\s+set\s+([\s\S]*?)\s+where/i);
  assert.ok(updateMatch, "expected an UPDATE ... SET ... WHERE statement");
  const setClause = updateMatch[1];
  const setColumns = [...setClause.matchAll(/(\w+)\s*=/g)].map((m) => m[1]);
  assert.deepEqual(setColumns.sort(), ["nickname", "updated_at"].sort());
});

test("11. The UPDATE is scoped to the caller's own row only (where up.id = v_user_id)", () => {
  assert.match(rpcBody, /where\s+up\.id = v_user_id/i);
});

test("12. No uniqueness check is performed against other rows (nickname is a display name, not a unique username)", () => {
  assert.doesNotMatch(rpcBody, /count\(\*\)/i);
  assert.doesNotMatch(rpcBody, /unique/i);
});

test("13. The function never references native_language/learning_language/current_level/user_age/birth_month/birth_day/onboarding_completed/daily_goal/timezone/timezone_updated_at", () => {
  assert.doesNotMatch(
    rpcBody,
    /\bnative_language\b|\blearning_language\b|\bcurrent_level\b|\buser_age\b|\bbirth_month\b|\bbirth_day\b|\bonboarding_completed\b|\bdaily_goal\b|\btimezone\b/i,
  );
});

test("14. The function never references user_daily_stats/user_word_progress/review_events/custom_practice_events", () => {
  assert.doesNotMatch(rpcBody, /user_daily_stats/);
  assert.doesNotMatch(rpcBody, /user_word_progress/);
  assert.doesNotMatch(rpcBody, /review_events/);
  assert.doesNotMatch(rpcBody, /custom_practice_events/);
});

console.log("\n=== update_user_nickname: grants ===\n");

test("15. EXECUTE is revoked from public and anon", () => {
  assert.match(source, /revoke execute on function public\.update_user_nickname\(text\) from public;/i);
  assert.match(source, /revoke execute on function public\.update_user_nickname\(text\) from anon;/i);
});

test("16. EXECUTE is granted to authenticated", () => {
  assert.match(source, /grant execute on function public\.update_user_nickname\(text\) to authenticated;/i);
});

test("17. EXECUTE is also granted to postgres and service_role", () => {
  assert.match(source, /grant execute on function public\.update_user_nickname\(text\) to postgres;/i);
  assert.match(source, /grant execute on function public\.update_user_nickname\(text\) to service_role;/i);
});

console.log("\n=== update_user_nickname: no unrelated scope creep ===\n");

test("18. This migration does not redefine complete_user_profile_onboarding/update_user_profile_languages or touch their grants", () => {
  assert.doesNotMatch(source, /create or replace function public\.complete_user_profile_onboarding/i);
  assert.doesNotMatch(source, /create or replace function public\.update_user_profile_languages/i);
  assert.doesNotMatch(source, /revoke execute on function public\.complete_user_profile_onboarding/i);
  assert.doesNotMatch(source, /revoke execute on function public\.update_user_profile_languages/i);
});

test("19. No other function is created or replaced by this migration", () => {
  const allFunctionDefs = [...source.matchAll(/create or replace function public\.(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(allFunctionDefs)], ["update_user_nickname"]);
});

test("20. No policy, constraint, or table grant/revoke is touched by this migration (only function-level EXECUTE grants)", () => {
  assert.doesNotMatch(source, /drop policy/i);
  assert.doesNotMatch(source, /create policy/i);
  assert.doesNotMatch(source, /add constraint/i);
  assert.doesNotMatch(source, /^\s*revoke insert, select, update, delete/im);
  assert.doesNotMatch(source, /^\s*grant insert, select, update, delete/im);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("update-user-nickname-migration-contract tests failed");
  process.exit(1);
}

console.log("update-user-nickname-migration-contract tests passed");
