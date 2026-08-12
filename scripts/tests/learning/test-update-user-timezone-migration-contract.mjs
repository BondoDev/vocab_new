// Contract guard for the update_user_timezone backend primitive (Settings
// backend follow-up —
// supabase/migrations/20260812120000_add_update_user_timezone_rpc.sql).
//
// Source-text guard, like every migration-contract test in this repository
// — there is no live Supabase project available to this suite.
//
// Run: node scripts/tests/learning/test-update-user-timezone-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const MIGRATION_PATH = path.join(ROOT_DIR, "supabase", "migrations", "20260812120000_add_update_user_timezone_rpc.sql");
const FOUNDATION_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260806120000_add_user_timezone_foundation.sql",
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

assert.ok(fs.existsSync(MIGRATION_PATH), "the update_user_timezone migration file is missing");
const source = fs.readFileSync(MIGRATION_PATH, "utf8");
const foundationSource = fs.readFileSync(FOUNDATION_MIGRATION_PATH, "utf8");

const rpcMatch = source.match(/create or replace function public\.update_user_timezone\(([\s\S]*?)\$function\$;/);
assert.ok(rpcMatch, "update_user_timezone function definition must exist");
const rpcBody = rpcMatch[0];

console.log("\n=== update_user_timezone: signature and identity ===\n");

test("1. Accepts exactly one parameter, p_timezone text — no p_user_id anywhere", () => {
  assert.match(rpcBody, /create or replace function public\.update_user_timezone\(\s*p_timezone text\s*\)/);
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

test("4. Returns the same RETURNS TABLE shape family as initialize_user_timezone (timezone, timezone_updated_at, + one boolean named `updated`)", () => {
  assert.match(
    source,
    /returns table \(\s*timezone text,\s*timezone_updated_at timestamptz,\s*updated boolean\s*\)/i,
  );
});

console.log("\n=== update_user_timezone: validation reuse (never a second validation system) ===\n");

test("5. Validates against pg_catalog.pg_timezone_names — the exact same source initialize_user_timezone uses", () => {
  assert.match(rpcBody, /pg_catalog\.pg_timezone_names/);
  assert.match(foundationSource, /pg_catalog\.pg_timezone_names/);
});

test("6. Rejects a null/empty p_timezone before touching the database", () => {
  assert.match(rpcBody, /if p_timezone is null or length\(v_timezone\) = 0 then/i);
});

test("7. Checks the profile row exists and raises P0002 if not (never an implicit insert), mirroring update_user_profile_languages' own precedent", () => {
  assert.match(rpcBody, /v_profile_exists/);
  assert.match(rpcBody, /if not v_profile_exists then/i);
  assert.match(rpcBody, /errcode = 'P0002'/);
});

console.log("\n=== update_user_timezone: replacement semantics (the whole point of this RPC) ===\n");

test("8. Sets the transaction-local trigger-bypass flag before its own UPDATE (reuses prevent_direct_user_timezone_write's existing protocol, adds no new bypass mechanism)", () => {
  assert.match(rpcBody, /set_config\('app\.allow_user_timezone_write', 'on', true\)/);
  assert.match(foundationSource, /app\.allow_user_timezone_write/);
});

test("9. The UPDATE is unconditional — no 'where ... timezone is null' guard (this is what makes it a real replacement, unlike initialize_user_timezone)", () => {
  const updateMatch = rpcBody.match(/update public\.user_profiles as up\s+set([\s\S]*?);/i);
  assert.ok(updateMatch, "expected an UPDATE statement");
  assert.doesNotMatch(updateMatch[0], /timezone is null/i);
});

test("10. The UPDATE sets exactly timezone, timezone_updated_at, and updated_at — never any other column", () => {
  const updateMatch = rpcBody.match(/update public\.user_profiles as up\s+set\s+([\s\S]*?)\s+where/i);
  assert.ok(updateMatch, "expected an UPDATE ... SET ... WHERE statement");
  const setClause = updateMatch[1];
  const setColumns = [...setClause.matchAll(/(\w+)\s*=/g)].map((m) => m[1]);
  assert.deepEqual(setColumns.sort(), ["timezone", "timezone_updated_at", "updated_at"].sort());
});

test("11. The UPDATE is scoped to the caller's own row only (where up.id = v_user_id)", () => {
  assert.match(rpcBody, /where\s+up\.id = v_user_id/i);
});

test("12. No branch ever returns updated = false on a successful call (every code path after validation performs the write)", () => {
  const returnMatches = [...rpcBody.matchAll(/return query select\s+([\s\S]*?);/gi)];
  assert.equal(returnMatches.length, 1, "expected exactly one return statement");
  assert.match(returnMatches[0][1].trim(), /,\s*true\s*$/);
});

console.log("\n=== update_user_timezone: no historical stats rewrite, no unrelated fields ===\n");

test("13. The function never references user_daily_stats/user_word_progress/review_events/custom_practice_events", () => {
  assert.doesNotMatch(rpcBody, /user_daily_stats/);
  assert.doesNotMatch(rpcBody, /user_word_progress/);
  assert.doesNotMatch(rpcBody, /review_events/);
  assert.doesNotMatch(rpcBody, /custom_practice_events/);
});

test("14. The function never references nickname/native_language/learning_language/current_level/daily_goal/onboarding fields", () => {
  assert.doesNotMatch(rpcBody, /\bnickname\b|\bnative_language\b|\blearning_language\b|\bcurrent_level\b|\bdaily_goal\b|\bonboarding_completed\b/i);
});

console.log("\n=== update_user_timezone: grants ===\n");

test("15. EXECUTE is revoked from public and anon", () => {
  assert.match(source, /revoke execute on function public\.update_user_timezone\(text\) from public;/i);
  assert.match(source, /revoke execute on function public\.update_user_timezone\(text\) from anon;/i);
});

test("16. EXECUTE is granted to authenticated (this is a Settings-callable RPC from day one, unlike reset_learning_language_progress)", () => {
  assert.match(source, /grant execute on function public\.update_user_timezone\(text\) to authenticated;/i);
});

test("17. EXECUTE is also granted to postgres and service_role", () => {
  assert.match(source, /grant execute on function public\.update_user_timezone\(text\) to postgres;/i);
  assert.match(source, /grant execute on function public\.update_user_timezone\(text\) to service_role;/i);
});

console.log("\n=== update_user_timezone: initialize_user_timezone is untouched ===\n");

test("18. This migration does not redefine initialize_user_timezone or touch its grants", () => {
  assert.doesNotMatch(source, /create or replace function public\.initialize_user_timezone/i);
  assert.doesNotMatch(source, /revoke execute on function public\.initialize_user_timezone/i);
  assert.doesNotMatch(source, /grant execute on function public\.initialize_user_timezone/i);
});

test("19. The original timezone-foundation migration's initialize_user_timezone definition is unchanged (still null-only)", () => {
  assert.match(foundationSource, /where up\.id = v_user_id\s*\n\s*and up\.timezone is null;/i);
});

test("20. No other function is created or replaced by this migration", () => {
  const allFunctionDefs = [...source.matchAll(/create or replace function public\.(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(allFunctionDefs)], ["update_user_timezone"]);
});

test("21. No policy, constraint, or table grant/revoke is touched by this migration (only function-level EXECUTE grants)", () => {
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
  console.error("update-user-timezone-migration-contract tests failed");
  process.exit(1);
}

console.log("update-user-timezone-migration-contract tests passed");
