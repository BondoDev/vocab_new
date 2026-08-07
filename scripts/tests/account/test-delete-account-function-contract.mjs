// Contract guard for the account-deletion backend primitive
// (supabase/functions/delete-account/index.ts) and the cascade graph it
// relies on. See supabase/README.md's "Account Deletion" section for the
// full audit this guards.
//
// This is a source-text guard, like every migration-contract test in this
// repository (test-restrict-user-profiles-writes-migration-contract.mjs,
// test-review-events-referential-integrity's coverage in
// supabase/README.md, etc.) — there is no live Supabase project or Deno
// runtime available to this repo's test suite, and the Edge Function is not
// deployed as part of it either. Section [1] guards the function's own
// source text (identity/security); section [2] guards the
// ACCOUNT_DELETION_ENABLED production deployment gate specifically; section
// [3] guards that every user-owned table across every migration still
// cascades from auth.users the way the function's own comments/
// documentation claim.
//
// Run: node scripts/tests/account/test-delete-account-function-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const FUNCTION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "functions",
  "delete-account",
  "index.ts",
);
const MIGRATIONS_DIR = path.join(ROOT_DIR, "supabase", "migrations");

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

console.log("\n=== delete-account Edge Function: source contract ===\n");

assert.ok(fs.existsSync(FUNCTION_PATH), "supabase/functions/delete-account/index.ts is missing");
const fnSource = fs.readFileSync(FUNCTION_PATH, "utf8");
// Comment-only lines (this file's header discusses the absent user_id/email
// parameters by name, as documentation) are stripped before the identity
// checks below, so those checks assert against executable code only.
const fnCodeOnly = fnSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

test("1. The function exists as a Deno Edge Function (Deno.serve), not a Node/Express route", () => {
  assert.match(fnSource, /Deno\.serve\(/);
});

test("2. No request parameter named user_id/target_user_id/email exists in executable code", () => {
  assert.doesNotMatch(fnCodeOnly, /\buser_id\b/);
  assert.doesNotMatch(fnCodeOnly, /\btarget_user_id\b/);
  assert.doesNotMatch(fnCodeOnly, /\bemail\b/i);
});

test("3. The request body is never parsed — identity comes only from the Authorization header", () => {
  assert.doesNotMatch(fnCodeOnly, /req\.json\(\)/);
  assert.doesNotMatch(fnCodeOnly, /req\.text\(\)/);
  assert.doesNotMatch(fnCodeOnly, /req\.formData\(\)/);
});

test("4. The caller id is derived from adminClient.auth.getUser(token), never a literal/param", () => {
  assert.match(fnSource, /adminClient\.auth\.getUser\(callerToken\)/);
});

test("5. Only the token-derived id is ever passed to admin.deleteUser — never req.* directly", () => {
  const deleteCallMatch = fnSource.match(/adminClient\.auth\.admin\.deleteUser\(([^)]*)\)/);
  assert.ok(deleteCallMatch, "adminClient.auth.admin.deleteUser(...) call not found");
  assert.equal(deleteCallMatch[1].trim(), "callerId");
  // callerId itself must originate from the getUser() result, not a param.
  assert.match(fnSource, /const callerId = userResult\.user\.id;/);
});

test("6. A missing/malformed Authorization header is rejected before any Supabase call is made", () => {
  const bearerCheckIndex = fnCodeOnly.indexOf("bearerMatch");
  const getUserIndex = fnCodeOnly.indexOf("adminClient.auth.getUser");
  assert.ok(bearerCheckIndex > -1 && getUserIndex > -1, "expected both the bearer check and getUser call to exist");
  assert.ok(bearerCheckIndex < getUserIndex, "the bearer-token check must happen before getUser() is called");
  assert.match(fnSource, /return jsonResponse\(\{ error: "unauthenticated" \}, 401\)/);
});

test("7. A getUser() failure (expired/invalid/already-deleted-user token) is rejected, not treated as success", () => {
  assert.match(fnSource, /if \(userError \|\| !userResult\?\.user\?\.id\)/);
});

test("8. Missing server secrets fail closed (500) rather than falling back to an unprivileged client", () => {
  assert.match(fnSource, /if \(!SUPABASE_URL \|\| !SERVICE_ROLE_KEY\)/);
  assert.match(fnSource, /server_misconfigured/);
});

test("9. The service_role key is read only from a server-side env var, never a VITE_-prefixed one", () => {
  assert.match(fnCodeOnly, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.doesNotMatch(fnCodeOnly, /VITE_/);
});

test("10. A failed Auth deletion returns a clear error, never a false success", () => {
  assert.match(fnSource, /if \(deleteError\)/);
  const deleteErrorBlock = fnSource.slice(fnSource.indexOf("if (deleteError)"), fnSource.indexOf("if (deleteError)") + 200);
  assert.match(deleteErrorBlock, /delete_failed/);
  assert.doesNotMatch(deleteErrorBlock, /deleted: true/);
});

test("11. The success response is minimal — only a deleted flag, no echoed id/email", () => {
  const successMatch = fnSource.match(/return jsonResponse\(\{([^}]*)\}, 200\);/);
  assert.ok(successMatch, "expected a 200 jsonResponse call");
  assert.match(successMatch[1].trim(), /^deleted: true$/);
});

test("12. Non-POST, non-OPTIONS methods are rejected", () => {
  assert.match(fnSource, /req\.method !== "POST"/);
  assert.match(fnSource, /method_not_allowed/);
});

console.log("\n=== Production deployment gate (ACCOUNT_DELETION_ENABLED) ===\n");

test("13. ACCOUNT_DELETION_ENABLED is read server-side, only from Deno.env — never from the request", () => {
  assert.match(fnCodeOnly, /Deno\.env\.get\("ACCOUNT_DELETION_ENABLED"\)/);
  // No header/body/query lookup of this name anywhere — the flag cannot be
  // supplied or overridden by a caller under any spelling.
  assert.doesNotMatch(fnCodeOnly, /req\.[a-zA-Z]+\([^)]*ACCOUNT_DELETION_ENABLED/);
  assert.doesNotMatch(fnCodeOnly, /headers\.get\("ACCOUNT_DELETION_ENABLED"\)/);
});

test("14. The comparison is an exact strict-equality check against the literal string \"true\"", () => {
  assert.match(fnCodeOnly, /ACCOUNT_DELETION_ENABLED !== "true"/);
  // No .toLowerCase()/.trim()/Boolean()/truthy coercion applied to the flag
  // anywhere — "True"/"TRUE"/" true "/"1" must all fail the same as "false"
  // or a missing value; normalizing the value would silently accept more
  // spellings than the one exact string this gate is documented to require.
  assert.doesNotMatch(fnCodeOnly, /ACCOUNT_DELETION_ENABLED\.toLowerCase/);
  assert.doesNotMatch(fnCodeOnly, /ACCOUNT_DELETION_ENABLED\.trim/);
  assert.doesNotMatch(fnCodeOnly, /Boolean\(ACCOUNT_DELETION_ENABLED\)/);
});

test("15. A missing flag disables deletion (undefined !== \"true\" is true, so the gate rejects)", () => {
  // Structural proof, not a runtime call (no Deno runtime in this suite):
  // Deno.env.get returns undefined for an unset var, and undefined is
  // never === "true", so the strict-inequality gate in test 14 rejects by
  // construction — there is no separate "missing" branch that could permit
  // a fall-through, which is itself the property being asserted here.
  assert.doesNotMatch(fnCodeOnly, /ACCOUNT_DELETION_ENABLED\s*\?\?/);
  assert.doesNotMatch(fnCodeOnly, /if \(!ACCOUNT_DELETION_ENABLED\)/);
});

test('16. Only the disabled branch responds with account_deletion_disabled, and it never proceeds to delete', () => {
  // Captures just the if-statement's own body (no nested braces inside it),
  // so this can't accidentally spill into the unrelated code that follows.
  const gateBlockMatch = fnSource.match(/if \(ACCOUNT_DELETION_ENABLED !== "true"\) \{([^}]*)\}/);
  assert.ok(gateBlockMatch, "ACCOUNT_DELETION_ENABLED gate if-block not found");
  assert.match(gateBlockMatch[1], /account_deletion_disabled/);
  assert.doesNotMatch(gateBlockMatch[1], /deleteUser/);
});

test("17. The disabled response is narrow — a single machine-readable error field, no message/reason/config state", () => {
  const disabledMatch = fnSource.match(/return jsonResponse\(\{([^}]*)\}, 403\);/);
  assert.ok(disabledMatch, "expected a 403 jsonResponse call");
  assert.match(disabledMatch[1].trim(), /^error: "account_deletion_disabled"$/);
});

test("18. The gate is checked strictly before admin.deleteUser is ever called", () => {
  const gateIndex = fnCodeOnly.indexOf('ACCOUNT_DELETION_ENABLED !== "true"');
  const deleteCallIndex = fnCodeOnly.indexOf("adminClient.auth.admin.deleteUser(");
  assert.ok(gateIndex > -1 && deleteCallIndex > -1, "expected both the gate check and the deleteUser call to exist");
  assert.ok(gateIndex < deleteCallIndex, "the ACCOUNT_DELETION_ENABLED gate must run before admin.deleteUser is called");
});

test("19. The gate runs after identity is resolved — an unauthenticated caller gets a plain 401, not the disabled response", () => {
  const getUserIndex = fnCodeOnly.indexOf("adminClient.auth.getUser(callerToken)");
  const gateIndex = fnCodeOnly.indexOf('ACCOUNT_DELETION_ENABLED !== "true"');
  assert.ok(getUserIndex > -1 && gateIndex > -1, "expected both getUser and the gate check to exist");
  assert.ok(getUserIndex < gateIndex, "identity must be resolved before the deployment gate is evaluated");
});

console.log("\n=== Account-deletion cascade contract (all user-owned tables) ===\n");

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const allMigrationsText = migrationFiles
  .map((name) => fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"))
  .join("\n");

test("20. Every user-owned table found in the migrations is one of the five audited tables", () => {
  const createdTables = [...allMigrationsText.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  const expected = ["user_profiles", "user_word_progress", "user_daily_stats", "review_events", "custom_practice_events"];
  assert.deepEqual(
    [...new Set(createdTables)].sort(),
    [...expected].sort(),
    "a new user-owned table was added without updating this cascade-contract test and supabase/README.md's Account Deletion section",
  );
});

test("21. user_profiles.id cascades from auth.users", () => {
  assert.match(allMigrationsText, /id uuid primary key references auth\.users \(id\) on delete cascade/);
});

test("22. user_word_progress.user_id cascades from auth.users", () => {
  assert.match(
    allMigrationsText,
    /create table if not exists public\.user_word_progress \(\s*id uuid primary key default gen_random_uuid\(\),\s*user_id uuid not null references auth\.users \(id\) on delete cascade/,
  );
});

test("23. user_daily_stats.user_id cascades from auth.users", () => {
  assert.match(
    allMigrationsText,
    /create table if not exists public\.user_daily_stats \(\s*id uuid primary key default gen_random_uuid\(\),\s*user_id uuid not null references auth\.users \(id\) on delete cascade/,
  );
});

test("24. custom_practice_events.user_id cascades from auth.users", () => {
  assert.match(
    allMigrationsText,
    /create table if not exists public\.custom_practice_events \(\s*event_id uuid primary key,\s*user_id uuid not null references auth\.users \(id\) on delete cascade/,
  );
});

test("25. review_events.user_id has an explicit ON DELETE CASCADE foreign key to auth.users (Corrective Migration 3)", () => {
  assert.match(
    allMigrationsText,
    /add constraint review_events_user_id_fkey\s*\n\s*foreign key \(user_id\) references auth\.users \(id\) on delete cascade;/,
  );
});

test("26. review_events.word_progress_id is ON DELETE CASCADE, not the original NO ACTION (Corrective Migration 3)", () => {
  assert.match(
    allMigrationsText,
    /add constraint review_events_word_progress_id_fkey\s*\n\s*foreign key \(word_progress_id\) references public\.user_word_progress \(id\) on delete cascade;/,
  );
  // The baseline's original, weaker FK (no ON DELETE clause = NO ACTION) is
  // explicitly dropped by Corrective Migration 3 — confirms this isn't just
  // an additive second constraint sitting alongside the unsafe original.
  assert.match(allMigrationsText, /drop constraint review_events_word_progress_id_fkey;/);
});

test("27. No trigger on user_profiles fires on DELETE (would risk blocking the cascade)", () => {
  const triggerMatches = [...allMigrationsText.matchAll(/create trigger \w+\s*\n\s*before ([a-z ]+) on public\.user_profiles/g)];
  assert.ok(triggerMatches.length > 0, "expected at least one trigger definition on user_profiles");
  for (const match of triggerMatches) {
    assert.doesNotMatch(match[1], /delete/i);
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("delete-account-function-contract tests failed");
  process.exit(1);
}

console.log("delete-account-function-contract tests passed");
