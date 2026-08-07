// Contract guard for the learning-progress-reset backend primitive
// (supabase/migrations/20260808120000_add_learning_language_progress_reset_rpc.sql).
// See supabase/README.md's "Learning Progress Reset" section for the full
// audit this migration implements.
//
// This is a source-text guard, like every migration-contract test in this
// repository (test-delete-account-function-contract.mjs,
// test-restrict-learning-writes-migration-contract.mjs, etc.) — there is no
// live Supabase project available to this repo's test suite, and this
// migration is prepared/reviewed only, not applied.
//
// Sections: identity/ownership; language-code validation; deletion
// scope/order (all four tables, one language, one user, no reliance on FK
// cascade); the deployment gate — PostgreSQL EXECUTE privilege, NOT a
// runtime config flag: no app.learning_progress_reset_enabled /
// current_setting(...) anywhere, EXECUTE revoked from
// public/anon/authenticated, and no grant to authenticated anywhere in this
// migration; idempotency/response shape; grants (only postgres/service_role
// hold EXECUTE); and that user_profiles and every unrelated object are
// untouched.
//
// Run: node scripts/tests/learning/test-learning-progress-reset-migration-contract.mjs
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
  "20260808120000_add_learning_language_progress_reset_rpc.sql",
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

assert.ok(fs.existsSync(MIGRATION_PATH), "the learning-progress-reset migration file is missing");
const source = fs.readFileSync(MIGRATION_PATH, "utf8");

const rpcMatch = source.match(
  /create or replace function public\.reset_learning_language_progress\(([\s\S]*?)\$function\$;/,
);
assert.ok(rpcMatch, "reset_learning_language_progress function definition must exist");
const rpcBody = rpcMatch[0];

console.log("\n=== learning progress reset: identity ===\n");

test("1. Accepts exactly one parameter, p_target_language text — no p_user_id/p_target_user_id anywhere", () => {
  assert.match(rpcBody, /create or replace function public\.reset_learning_language_progress\(\s*p_target_language text\s*\)/);
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

console.log("\n=== learning progress reset: language validation ===\n");

test("4. Rejects a null/empty p_target_language", () => {
  assert.match(rpcBody, /if p_target_language is null or length\(v_target_language\) = 0 then/i);
});

test("5. Validates against the same seven-code allow-list as user_profiles (en, es, fr, pt, it, de, ru)", () => {
  const allowListMatch = rpcBody.match(/if v_target_language not in \(([^)]+)\) then/i);
  assert.ok(allowListMatch, "expected an explicit IN (...) allow-list check");
  const codes = allowListMatch[1]
    .split(",")
    .map((code) => code.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(codes.sort(), ["de", "en", "es", "fr", "it", "pt", "ru"].sort());
});

console.log("\n=== learning progress reset: deletion scope and order ===\n");

function deleteBlock(tableName) {
  const re = new RegExp(`delete from public\\.${tableName}\\s+where\\s+user_id = v_user_id\\s+and\\s+target_language = v_target_language;`, "i");
  return rpcBody.match(re);
}

test("6. Deletes review_events scoped by (user_id, target_language)", () => {
  assert.ok(deleteBlock("review_events"), "review_events DELETE must be scoped by user_id and target_language");
});

test("7. Deletes custom_practice_events scoped by (user_id, target_language)", () => {
  assert.ok(deleteBlock("custom_practice_events"), "custom_practice_events DELETE must be scoped by user_id and target_language");
});

test("8. Deletes user_word_progress scoped by (user_id, target_language)", () => {
  assert.ok(deleteBlock("user_word_progress"), "user_word_progress DELETE must be scoped by user_id and target_language");
});

test("9. Deletes user_daily_stats scoped by (user_id, target_language)", () => {
  assert.ok(deleteBlock("user_daily_stats"), "user_daily_stats DELETE must be scoped by user_id and target_language");
});

test("10. review_events and custom_practice_events are deleted BEFORE user_word_progress (never relies on FK cascade)", () => {
  const reviewIndex = rpcBody.search(/delete from public\.review_events/i);
  const customPracticeIndex = rpcBody.search(/delete from public\.custom_practice_events/i);
  const wordProgressIndex = rpcBody.search(/delete from public\.user_word_progress/i);
  const dailyStatsIndex = rpcBody.search(/delete from public\.user_daily_stats/i);
  assert.ok(
    [reviewIndex, customPracticeIndex, wordProgressIndex, dailyStatsIndex].every((i) => i > -1),
    "expected all four DELETE statements to exist",
  );
  assert.ok(reviewIndex < wordProgressIndex, "review_events must be deleted before user_word_progress");
  assert.ok(customPracticeIndex < wordProgressIndex, "custom_practice_events must be deleted before user_word_progress");
  assert.ok(wordProgressIndex < dailyStatsIndex, "user_word_progress must be deleted before user_daily_stats (declared order)");
});

test("11. No DELETE statement is scoped only by user_id (every one also matches target_language — no accidental cross-language wipe)", () => {
  const bareUserIdDeletes = [
    ...rpcBody.matchAll(/delete from public\.\w+\s+where\s+user_id = v_user_id\s*;/gi),
  ];
  assert.equal(bareUserIdDeletes.length, 0, "every DELETE must also be scoped by target_language");
});

test("12. user_profiles is never referenced by this function (learning_language is left untouched)", () => {
  assert.doesNotMatch(rpcBody, /user_profiles/);
  assert.doesNotMatch(rpcBody, /learning_language\s*=/i);
});

console.log("\n=== learning progress reset: deployment gate (PostgreSQL EXECUTE privilege) ===\n");

// The old runtime-config-flag gate (app.learning_progress_reset_enabled /
// current_setting(...)) is REPLACED by PostgreSQL EXECUTE privilege — see
// the migration's own "PRODUCTION DEPLOYMENT GATE" header section. These
// tests prove the old mechanism is fully gone, not merely unused.
const codeOnly = source
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

test("13. No app.learning_progress_reset_enabled config flag is read or set by this migration's executable code (the header's prose may name it historically, explaining the replacement)", () => {
  assert.doesNotMatch(codeOnly, /app\.learning_progress_reset_enabled/);
});

test("14. No current_setting(...) runtime gate check exists in the function body", () => {
  assert.doesNotMatch(rpcBody, /current_setting\(/i);
});

test("15. No `alter database ... set` deployment step exists anywhere (activation is a versioned grant, not an out-of-band command)", () => {
  assert.doesNotMatch(codeOnly, /alter database/i);
});

test("16. EXECUTE is revoked from public, anon, AND authenticated — fail-closed by privilege, not by a runtime flag", () => {
  assert.match(source, /revoke execute on function public\.reset_learning_language_progress\(text\) from public;/i);
  assert.match(source, /revoke execute on function public\.reset_learning_language_progress\(text\) from anon;/i);
  assert.match(source, /revoke execute on function public\.reset_learning_language_progress\(text\) from authenticated;/i);
});

test("17. No `grant execute ... to authenticated` exists anywhere in this migration (future activation is a separate migration)", () => {
  assert.doesNotMatch(codeOnly, /grant execute on function public\.reset_learning_language_progress\(text\) to authenticated/i);
});

console.log("\n=== learning progress reset: idempotency and response shape ===\n");

test("18. No not-found/no-op error path exists — every DELETE proceeds regardless of prior row existence", () => {
  const bodyAfterValidation = rpcBody.slice(rpcBody.search(/if v_target_language not in/i));
  assert.doesNotMatch(bodyAfterValidation, /if not found then/i);
});

test("19. Returns a deterministic, narrow RETURNS TABLE shape (reset, target_language, and four *_deleted counts)", () => {
  assert.match(
    source,
    /returns table \(\s*reset boolean,\s*target_language text,\s*word_progress_deleted integer,\s*daily_stats_deleted integer,\s*review_events_deleted integer,\s*custom_practice_events_deleted integer\s*\)/i,
  );
});

test("20. Always returns reset = true on success (no conditional false branch)", () => {
  const returnMatch = rpcBody.match(/return query\s+select\s+([\s\S]*?);/i);
  assert.ok(returnMatch, "expected a `return query select ...` statement");
  assert.match(returnMatch[1].trim(), /^true,/);
});

console.log("\n=== learning progress reset: grants ===\n");

test("21. PUBLIC's default EXECUTE grant is explicitly revoked", () => {
  assert.match(source, /revoke execute on function public\.reset_learning_language_progress\(text\) from public;/i);
});

test("22. anon's EXECUTE grant is explicitly revoked", () => {
  assert.match(source, /revoke execute on function public\.reset_learning_language_progress\(text\) from anon;/i);
});

test("23. EXECUTE is granted only to postgres and service_role — NOT to authenticated (the fail-closed deployment state)", () => {
  assert.match(source, /grant execute on function public\.reset_learning_language_progress\(text\) to postgres;/i);
  assert.match(source, /grant execute on function public\.reset_learning_language_progress\(text\) to service_role;/i);
  const grantLines = [...source.matchAll(/^\s*grant execute on function public\.reset_learning_language_progress\(text\) to (\w+);/gim)].map(
    (m) => m[1],
  );
  assert.deepEqual(grantLines.sort(), ["postgres", "service_role"].sort());
});

console.log("\n=== learning progress reset: unrelated objects untouched ===\n");

test("24. No other function is created or replaced by this migration", () => {
  const allFunctionDefs = [...source.matchAll(/create or replace function public\.(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(allFunctionDefs)], ["reset_learning_language_progress"]);
});

test("25. No policy, grant, or constraint on any table other than via this one function is changed", () => {
  assert.doesNotMatch(source, /drop policy/i);
  assert.doesNotMatch(source, /create policy/i);
  assert.doesNotMatch(source, /add constraint/i);
  assert.doesNotMatch(source, /^\s*revoke insert, select, update, delete/im);
});

test("26. This migration's executable code never touches auth.users directly — it is a data-reset primitive, not an account-deletion primitive", () => {
  assert.doesNotMatch(codeOnly, /from\s+auth\.users/i);
  assert.doesNotMatch(codeOnly, /deleteUser/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("learning-progress-reset-migration-contract tests failed");
  process.exit(1);
}

console.log("learning-progress-reset-migration-contract tests passed");
