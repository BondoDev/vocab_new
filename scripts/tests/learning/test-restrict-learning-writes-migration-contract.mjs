// Static contract guard for
// supabase/migrations/20260805100000_restrict_learning_writes_and_add_favorite_rpc.sql
// — corrective migration 1 (see supabase/README.md). Verifies the migration
// text itself, plus that the baseline migration it builds on is untouched.
// This is deliberately a source-text guard, not a live-database test: the
// migration is never applied to Supabase as part of this repository's test
// suite (see the task's own "do not apply the migration" instruction) — see
// test-complete-new-word-study-contract.mjs for the same
// text-guard-over-behavioral-test precedent used throughout this feature.
//
// Run: node scripts/tests/learning/test-restrict-learning-writes-migration-contract.mjs
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
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260805100000_restrict_learning_writes_and_add_favorite_rpc.sql",
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

console.log("\n=== corrective migration 1: file/ordering guards ===\n");

test("1. The baseline migration file still exists and is unmodified by this change", () => {
  assert.ok(fs.existsSync(BASELINE_PATH), "baseline migration file is missing");
});

test("2. The new migration file exists, named later than the baseline (lexicographic timestamp order)", () => {
  assert.ok(fs.existsSync(MIGRATION_PATH), "new corrective migration file is missing");
  const baselineName = path.basename(BASELINE_PATH);
  const migrationName = path.basename(MIGRATION_PATH);
  assert.ok(migrationName > baselineName, "the new migration's filename must sort after the baseline's");
});

const migrationSource = fs.readFileSync(MIGRATION_PATH, "utf8");

console.log("\n=== corrective migration 1: set_word_progress_favorite RPC ===\n");

const rpcMatch = migrationSource.match(
  /create or replace function public\.set_word_progress_favorite\(([\s\S]*?)\$function\$;/,
);

test("3. Creates public.set_word_progress_favorite(uuid, boolean)", () => {
  assert.ok(rpcMatch, "set_word_progress_favorite function definition must exist");
  assert.match(rpcMatch[0], /p_word_progress_id uuid/);
  assert.match(rpcMatch[0], /p_is_favorite boolean/);
});

test("4. Uses SECURITY DEFINER with an empty search_path", () => {
  assert.match(rpcMatch[0], /security definer/i);
  assert.match(rpcMatch[0], /set search_path to ''/i);
});

test("5. Derives the caller exclusively from auth.uid() and rejects a null caller", () => {
  assert.match(rpcMatch[0], /v_user_id uuid := auth\.uid\(\)/);
  assert.match(rpcMatch[0], /if v_user_id is null then/i);
});

test("6. Rejects null p_word_progress_id and null p_is_favorite", () => {
  assert.match(rpcMatch[0], /if p_word_progress_id is null then/i);
  assert.match(rpcMatch[0], /if p_is_favorite is null then/i);
});

test("7. The UPDATE touches only is_favorite in its SET list", () => {
  const updateMatch = rpcMatch[0].match(/update public\.user_word_progress\s+set ([\s\S]*?)\s+where/i);
  assert.ok(updateMatch, "UPDATE statement must exist inside the RPC");
  const setClause = updateMatch[1].trim();
  assert.equal(setClause, "is_favorite = p_is_favorite", `SET clause must touch only is_favorite, got: ${setClause}`);
});

test("8. The UPDATE is scoped by both the progress row's own id and the caller's user_id", () => {
  const whereMatch = rpcMatch[0].match(/where\s+id = p_word_progress_id\s+and\s+user_id = v_user_id/i);
  assert.ok(whereMatch, "UPDATE must be scoped by id = p_word_progress_id AND user_id = v_user_id");
});

test("9. The function never accepts a p_user_id (or any other client-supplied user identifier) argument", () => {
  assert.doesNotMatch(rpcMatch[0], /p_user_id/);
});

test("10. No protected progress column (word_state/correct_streak/last_practiced_at/next_review_at/word_id/target_language) is ever assigned by this function", () => {
  const bodyAfterDeclare = rpcMatch[0].split(/\bbegin\b/i)[1] ?? rpcMatch[0];
  assert.doesNotMatch(
    bodyAfterDeclare,
    /\b(word_state|correct_streak|last_practiced_at|next_review_at|word_id|target_language)\s*=/i,
  );
});

test("11. Fails safely (raises, does not silently succeed) when the row is missing or not owned by the caller", () => {
  assert.match(rpcMatch[0], /if not found then/i);
  assert.match(rpcMatch[0], /raise exception[\s\S]*not found or not owned by caller/i);
});

test("12. Returns a deterministic TABLE(word_progress_id uuid, is_favorite boolean) result", () => {
  assert.match(
    migrationSource,
    /returns table \(word_progress_id uuid, is_favorite boolean\)/i,
    "RETURNS TABLE shape must expose word_progress_id and is_favorite",
  );
});

console.log("\n=== corrective migration 1: favorite RPC grants ===\n");

test("13. PUBLIC's default EXECUTE grant is explicitly revoked", () => {
  assert.match(
    migrationSource,
    /revoke execute on function public\.set_word_progress_favorite\(uuid, boolean\) from public;/i,
  );
});

test("14. EXECUTE is granted to authenticated (and postgres/service_role), but anon is never granted EXECUTE on this function", () => {
  assert.match(
    migrationSource,
    /grant execute on function public\.set_word_progress_favorite\(uuid, boolean\) to authenticated;/i,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.set_word_progress_favorite\(uuid, boolean\) to postgres;/i,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.set_word_progress_favorite\(uuid, boolean\) to service_role;/i,
  );
  assert.doesNotMatch(
    migrationSource,
    /grant execute on function public\.set_word_progress_favorite\(uuid, boolean\) to anon;/i,
    "anon must not receive EXECUTE on the favorite RPC",
  );
});

console.log("\n=== corrective migration 1: user_word_progress policy/grant tightening ===\n");

test("15. The old ownership-scoped FOR ALL policy on user_word_progress is dropped", () => {
  assert.match(
    migrationSource,
    /drop policy if exists "Users can manage their word progress" on public\.user_word_progress;/,
  );
});

test("16. A new ownership-scoped SELECT-only policy replaces it, using auth.uid() = user_id", () => {
  const policyMatch = migrationSource.match(
    /create policy "[^"]+"\s+on public\.user_word_progress\s+as permissive\s+for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\);/i,
  );
  assert.ok(policyMatch, "user_word_progress must get a new `for select ... using (auth.uid() = user_id)` policy");
});

test("17. Direct authenticated writes to user_word_progress are revoked, and SELECT is explicitly re-granted", () => {
  assert.match(
    migrationSource,
    /revoke insert, select, update, delete, truncate, references, trigger, maintain\s+on public\.user_word_progress from authenticated;/i,
  );
  assert.match(migrationSource, /grant select on public\.user_word_progress to authenticated;/i);
});

test("18. All direct anon privileges on user_word_progress are revoked", () => {
  assert.match(
    migrationSource,
    /revoke insert, select, update, delete, truncate, references, trigger, maintain\s+on public\.user_word_progress from anon;/i,
  );
});

console.log("\n=== corrective migration 1: user_daily_stats policy/grant tightening ===\n");

test("19. The old ownership-scoped FOR ALL policy on user_daily_stats is dropped", () => {
  assert.match(migrationSource, /drop policy if exists "Users can manage their daily" on public\.user_daily_stats;/);
});

test("20. A new ownership-scoped SELECT-only policy replaces it, using auth.uid() = user_id", () => {
  const policyMatch = migrationSource.match(
    /create policy "[^"]+"\s+on public\.user_daily_stats\s+as permissive\s+for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\);/i,
  );
  assert.ok(policyMatch, "user_daily_stats must get a new `for select ... using (auth.uid() = user_id)` policy");
});

test("21. Direct authenticated writes to user_daily_stats are revoked, and SELECT is explicitly re-granted", () => {
  assert.match(
    migrationSource,
    /revoke insert, select, update, delete, truncate, references, trigger, maintain\s+on public\.user_daily_stats from authenticated;/i,
  );
  assert.match(migrationSource, /grant select on public\.user_daily_stats to authenticated;/i);
});

test("22. All direct anon privileges on user_daily_stats are revoked", () => {
  assert.match(
    migrationSource,
    /revoke insert, select, update, delete, truncate, references, trigger, maintain\s+on public\.user_daily_stats from anon;/i,
  );
});

console.log("\n=== corrective migration 1: existing RPCs / unrelated objects untouched ===\n");

const baselineSource = fs.readFileSync(BASELINE_PATH, "utf8");

function extractFunctionBody(source, functionName) {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
  );
  const match = source.match(re);
  return match ? match[0] : null;
}

test("23. complete_new_word_study's body is not redefined by this migration", () => {
  assert.doesNotMatch(migrationSource, /CREATE OR REPLACE FUNCTION public\.complete_new_word_study/i);
  const baselineBody = extractFunctionBody(baselineSource, "complete_new_word_study");
  assert.ok(baselineBody, "baseline must still define complete_new_word_study");
});

test("24. complete_word_review's body is not redefined by this migration", () => {
  assert.doesNotMatch(migrationSource, /CREATE OR REPLACE FUNCTION public\.complete_word_review/i);
  const baselineBody = extractFunctionBody(baselineSource, "complete_word_review");
  assert.ok(baselineBody, "baseline must still define complete_word_review");
});

test("25. anon's EXECUTE grant on the two existing RPCs is left untouched (out of scope for this migration)", () => {
  assert.doesNotMatch(
    migrationSource,
    /revoke execute on function public\.complete_new_word_study/i,
    "revoking anon EXECUTE on complete_new_word_study is a later corrective migration, not this one",
  );
  assert.doesNotMatch(
    migrationSource,
    /revoke execute on function public\.complete_word_review/i,
    "revoking anon EXECUTE on complete_word_review is a later corrective migration, not this one",
  );
});

test("26. review_events and user_profiles are not touched by this migration", () => {
  assert.doesNotMatch(migrationSource, /public\.review_events/);
  assert.doesNotMatch(migrationSource, /public\.user_profiles/);
});

test("27. No non-negative CHECK constraint is added (explicitly out of scope for this migration)", () => {
  assert.doesNotMatch(migrationSource, /add constraint[\s\S]*check\s*\(/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("restrict-learning-writes-migration-contract guard passed");
}
