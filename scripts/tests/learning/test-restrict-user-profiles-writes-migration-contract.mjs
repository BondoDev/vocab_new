// Contract guard for Profile Phase 1's user_profiles write-boundary
// migration
// (supabase/migrations/20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql).
// This is a source-level migration guard; live database behavior is covered
// by the smoke-test plan after the migration is explicitly applied — see
// scripts/tests/architecture/test-user-profiles-narrow-write-boundary.mjs
// for the frontend-side half of this same boundary.
//
// Run: node scripts/tests/learning/test-restrict-user-profiles-writes-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  "20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql",
);
const DROP_LAST_ACTIVE_AT_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260807130000_drop_unused_user_profiles_last_active_at.sql",
);
const DROP_IS_NEW_USER_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260807140000_drop_unused_user_profiles_is_new_user.sql",
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

test("0. Profile Phase 1, Phase 2, and Phase 3 migration files exist in chronological order", () => {
  assert.ok(fs.existsSync(BASELINE_PATH), "baseline migration file is missing");
  assert.ok(fs.existsSync(MIGRATION_PATH), "Profile Phase 1 migration file is missing");
  assert.ok(fs.existsSync(DROP_LAST_ACTIVE_AT_MIGRATION_PATH), "Profile Phase 2 migration file is missing");
  assert.ok(fs.existsSync(DROP_IS_NEW_USER_MIGRATION_PATH), "Profile Phase 3 migration file is missing");
  const migrationsDir = path.join(ROOT_DIR, "supabase", "migrations");
  const allNames = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(
    allNames[allNames.length - 1],
    path.basename(DROP_IS_NEW_USER_MIGRATION_PATH),
    "the Profile Phase 3 migration must sort after every other migration filename",
  );
});

const source = fs.readFileSync(MIGRATION_PATH, "utf8");
const dropLastActiveAtSource = fs.readFileSync(DROP_LAST_ACTIVE_AT_MIGRATION_PATH, "utf8");
const dropIsNewUserSource = fs.readFileSync(DROP_IS_NEW_USER_MIGRATION_PATH, "utf8");
const baselineSource = fs.readFileSync(BASELINE_PATH, "utf8");

function functionBlock(name, signaturePattern, sourceText = source) {
  const re = new RegExp(
    `create or replace function public\\.${name}\\(\\s*${signaturePattern}\\s*\\)[\\s\\S]*?\\$function\\$;`,
    "i",
  );
  const match = sourceText.match(re);
  assert.ok(match, `${name}(${signaturePattern}) block must exist`);
  return match[0];
}

console.log("\n=== Profile Phase 1: precondition-guarded CHECK constraints ===\n");

const CONSTRAINT_CASES = [
  {
    label: "native_language",
    constraintName: "user_profiles_native_language_allowed_values_check",
    columnPattern: /check \(native_language in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\)\)/i,
    preconditionColumn: "native_language",
  },
  {
    label: "learning_language",
    constraintName: "user_profiles_learning_language_allowed_values_check",
    columnPattern: /check \(learning_language in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\)\)/i,
    preconditionColumn: "learning_language",
  },
  {
    label: "current_level",
    constraintName: "user_profiles_current_level_allowed_values_check",
    columnPattern: /check \(current_level in \('A1', 'A2', 'B1', 'B2', 'C1', 'C2'\)\)/i,
    preconditionColumn: "current_level",
  },
];

for (const { label, constraintName, columnPattern } of CONSTRAINT_CASES) {
  test(`1. ${label} gets a named exact allow-list CHECK, guarded by a precondition`, () => {
    const constraintRegex = new RegExp(
      `alter table public\\.user_profiles\\s+add constraint ${constraintName}\\s+${columnPattern.source}`,
      "i",
    );
    assert.match(source, constraintRegex, `${constraintName} must exist with the exact allow-list`);

    const doBlockIndex = source.search(
      new RegExp(`do \\$\\$[\\s\\S]*?${label}[\\s\\S]*?raise exception[\\s\\S]*?using errcode = '23514';[\\s\\S]*?\\$\\$;`, "i"),
    );
    const constraintIndex = source.indexOf(constraintName);
    assert.ok(doBlockIndex >= 0, `a precondition DO block mentioning ${label} must exist`);
    assert.ok(constraintIndex > doBlockIndex, `precondition DO block for ${label} must precede its CHECK constraint`);
  });
}

test("2. user_age gets a named 10-100 range CHECK, guarded by a precondition (not the frontend's looser bounds)", () => {
  assert.match(
    source,
    /alter table public\.user_profiles\s+add constraint user_profiles_user_age_range_check\s+check \(user_age >= 10 and user_age <= 100\);/i,
  );
  const doBlockIndex = source.search(/do \$\$[\s\S]*?user_age[\s\S]*?raise exception[\s\S]*?using errcode = '23514';[\s\S]*?\$\$;/i);
  const constraintIndex = source.indexOf("user_profiles_user_age_range_check");
  assert.ok(doBlockIndex >= 0 && constraintIndex > doBlockIndex);
});

test("3. birth_month gets a named 1-12 range CHECK, birth_day gets a named 1-31 range CHECK, both precondition-guarded", () => {
  assert.match(
    source,
    /alter table public\.user_profiles\s+add constraint user_profiles_birth_month_range_check\s+check \(birth_month >= 1 and birth_month <= 12\);/i,
  );
  assert.match(
    source,
    /alter table public\.user_profiles\s+add constraint user_profiles_birth_day_range_check\s+check \(birth_day >= 1 and birth_day <= 31\);/i,
  );
  const monthDoIndex = source.search(/do \$\$[\s\S]*?birth_month[\s\S]*?raise exception[\s\S]*?using errcode = '23514';[\s\S]*?\$\$;/i);
  const monthConstraintIndex = source.indexOf("user_profiles_birth_month_range_check");
  assert.ok(monthDoIndex >= 0 && monthConstraintIndex > monthDoIndex);

  const dayDoIndex = source.search(/do \$\$[\s\S]*?birth_day[\s\S]*?raise exception[\s\S]*?using errcode = '23514';[\s\S]*?\$\$;/i);
  const dayConstraintIndex = source.indexOf("user_profiles_birth_day_range_check");
  assert.ok(dayDoIndex >= 0 && dayConstraintIndex > dayDoIndex);
});

test("4. nickname gets a named nonempty-after-trim, max-40-character CHECK, precondition-guarded, without an ASCII-only letter rule", () => {
  assert.match(
    source,
    /alter table public\.user_profiles\s+add constraint user_profiles_nickname_length_check\s+check \(char_length\(btrim\(nickname\)\) > 0 and char_length\(nickname\) <= 40\);/i,
  );
  const doBlockIndex = source.search(/do \$\$[\s\S]*?nickname[\s\S]*?raise exception[\s\S]*?using errcode = '23514';[\s\S]*?\$\$;/i);
  const constraintIndex = source.indexOf("user_profiles_nickname_length_check");
  assert.ok(doBlockIndex >= 0 && constraintIndex > doBlockIndex);
  // Deliberately no Unicode "starts with a letter" reproduction as an actual
  // CHECK predicate — scoped to the constraint's own CHECK clause (not the
  // whole file, which legitimately explains this decision in prose in the
  // header) so no regex-based letter-class constraint exists on nickname.
  const nicknameConstraintMatch = source.match(
    /add constraint user_profiles_nickname_length_check\s+check \(([^;]*)\);/i,
  );
  assert.ok(nicknameConstraintMatch, "nickname constraint clause must be found");
  assert.doesNotMatch(nicknameConstraintMatch[1], /~|\\p\{L\}|starts_with_letter/i);
});

test("5. Existing daily_goal CHECK constraint is not recreated, redefined, or dropped by this migration (this file's own header may still mention it in prose)", () => {
  assert.doesNotMatch(source, /add constraint user_profiles_daily_goal_allowed_values_check/i);
  assert.doesNotMatch(source, /drop constraint user_profiles_daily_goal_allowed_values_check/i);
});

console.log("\n=== Profile Phase 1: complete_user_profile_onboarding RPC ===\n");

const onboardingSig =
  "p_nickname text,\\s*p_native_language text,\\s*p_learning_language text,\\s*p_current_level text,\\s*p_user_age integer,\\s*p_birth_month integer,\\s*p_birth_day integer";
const onboardingRpc = functionBlock("complete_user_profile_onboarding", onboardingSig, dropLastActiveAtSource);

test("6. Uses SECURITY DEFINER with an empty search_path", () => {
  assert.match(onboardingRpc, /security definer/i);
  assert.match(onboardingRpc, /set search_path to ''/i);
});

test("7. Derives the caller exclusively from auth.uid() and rejects a null caller", () => {
  assert.match(onboardingRpc, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(onboardingRpc, /if v_user_id is null then/i);
  assert.match(onboardingRpc, /using errcode = '28000';/);
});

test("8. Never accepts a p_user_id or any other client-supplied user identifier", () => {
  assert.doesNotMatch(onboardingRpc, /p_user_id/);
});

test("9. Never accepts daily_goal, timezone, onboarding-completed, or timestamp parameters", () => {
  const signatureMatch = onboardingRpc.match(/create or replace function public\.complete_user_profile_onboarding\(([\s\S]*?)\)\s*\nreturns/i);
  assert.ok(signatureMatch, "function signature must be found");
  assert.doesNotMatch(
    signatureMatch[1],
    /p_daily_goal|p_timezone|p_onboarding_completed|p_created_at|p_updated_at|p_last_active_at|p_is_new_user/i,
  );
});

test("10. Validates every field against the exact same allow-lists/ranges as the frontend normalizers", () => {
  assert.match(onboardingRpc, /p_native_language not in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\)/i);
  assert.match(onboardingRpc, /p_learning_language not in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\)/i);
  assert.match(onboardingRpc, /p_current_level not in \('A1', 'A2', 'B1', 'B2', 'C1', 'C2'\)/i);
  assert.match(onboardingRpc, /p_user_age < 10 or p_user_age > 100/i);
  assert.match(onboardingRpc, /p_birth_month < 1 or p_birth_month > 12/i);
  assert.match(onboardingRpc, /p_birth_day < 1 or p_birth_day > 31/i);
  assert.match(onboardingRpc, /char_length\(v_nickname\) > 40/i);
  assert.match(onboardingRpc, /char_length\(v_nickname\) = 0/i);
});

test("11. Uses a single atomic INSERT ... ON CONFLICT (id) DO UPDATE — not a two-branch existence check", () => {
  assert.match(onboardingRpc, /insert into public\.user_profiles \(/i);
  assert.match(onboardingRpc, /on conflict \(id\) do update/i);
  assert.doesNotMatch(onboardingRpc, /select 1 from public\.user_profiles/i, "must not run a separate existence-check SELECT");
});

test("12. Neither the INSERT column list nor the ON CONFLICT DO UPDATE SET list ever names daily_goal, timezone, timezone_updated_at, created_at, or is_new_user", () => {
  const insertMatch = onboardingRpc.match(/insert into public\.user_profiles \(([\s\S]*?)\)\s*\n\s*values/i);
  assert.ok(insertMatch, "INSERT column list must exist");
  assert.doesNotMatch(insertMatch[1], /\bdaily_goal\b|\btimezone\b|timezone_updated_at|\bcreated_at\b|is_new_user/i);

  const setMatch = onboardingRpc.match(/on conflict \(id\) do update\s+set([\s\S]*?);/i);
  assert.ok(setMatch, "ON CONFLICT DO UPDATE SET clause must exist");
  assert.doesNotMatch(setMatch[1], /\bdaily_goal\s*=|\btimezone\s*=|timezone_updated_at\s*=|\bcreated_at\s*=|is_new_user\s*=/i);
});

test("13. onboarding_completed is always set to true by the function itself, never taken from a parameter", () => {
  const insertValuesMatch = onboardingRpc.match(/values \(([\s\S]*?)\)\s*\n\s*on conflict/i);
  assert.ok(insertValuesMatch, "INSERT VALUES list must exist");
  assert.match(insertValuesMatch[1], /\btrue\b/, "onboarding_completed must be a literal true in the VALUES list");
  const setMatch = onboardingRpc.match(/on conflict \(id\) do update\s+set([\s\S]*?);/i);
  assert.match(setMatch[1], /onboarding_completed = true/i);
  assert.doesNotMatch(onboardingRpc, /p_onboarding_completed/i);
});

test("14. updated_at is stamped from the function's own server-side v_now, and last_active_at is no longer written", () => {
  assert.match(onboardingRpc, /v_now timestamptz := now\(\)/i);
  const insertMatch = onboardingRpc.match(/insert into public\.user_profiles \(([\s\S]*?)\)\s*\n\s*values/i);
  assert.doesNotMatch(insertMatch[1], /last_active_at/i);
  assert.match(insertMatch[1], /updated_at/i);
  const setMatch = onboardingRpc.match(/on conflict \(id\) do update\s+set([\s\S]*?);/i);
  assert.doesNotMatch(setMatch[1], /last_active_at/i);
  assert.match(setMatch[1], /updated_at = excluded\.updated_at/i);
});

test("15. Returns a deterministic single-row table including the authoritative daily_goal/timezone/timezone_updated_at/updated_at values", () => {
  assert.match(
    onboardingRpc,
    /returns table \(\s*nickname text,\s*native_language text,\s*learning_language text,\s*current_level text,\s*user_age integer,\s*birth_month smallint,\s*birth_day smallint,\s*onboarding_completed boolean,\s*daily_goal integer,\s*timezone text,\s*timezone_updated_at timestamptz,\s*updated_at timestamptz\s*\)/i,
  );
  assert.match(onboardingRpc, /return query\s+select[\s\S]*?from public\.user_profiles as up\s+where up\.id = v_user_id;/i);
});

console.log("\n=== Profile Phase 1: complete_user_profile_onboarding grants ===\n");

test("16. PUBLIC's and anon's EXECUTE grants are explicitly revoked; authenticated/postgres/service_role receive EXECUTE", () => {
  const sig = "text, text, text, text, integer, integer, integer";
  assert.match(dropLastActiveAtSource, new RegExp(`revoke execute on function public\\.complete_user_profile_onboarding\\(${sig}\\) from public;`, "i"));
  assert.match(dropLastActiveAtSource, new RegExp(`revoke execute on function public\\.complete_user_profile_onboarding\\(${sig}\\) from anon;`, "i"));
  assert.match(dropLastActiveAtSource, new RegExp(`grant execute on function public\\.complete_user_profile_onboarding\\(${sig}\\) to postgres;`, "i"));
  assert.match(dropLastActiveAtSource, new RegExp(`grant execute on function public\\.complete_user_profile_onboarding\\(${sig}\\) to authenticated;`, "i"));
  assert.match(dropLastActiveAtSource, new RegExp(`grant execute on function public\\.complete_user_profile_onboarding\\(${sig}\\) to service_role;`, "i"));
});

test("16b. No grant execute statement on complete_user_profile_onboarding ever targets anon or public — a stray re-grant elsewhere in the file would fail this", () => {
  const grantsToRoles = [
    ...dropLastActiveAtSource.matchAll(/grant execute on function public\.complete_user_profile_onboarding\([^)]*\) to (\w+);/gi),
  ].map((match) => match[1].toLowerCase());
  assert.deepEqual(
    [...new Set(grantsToRoles)].sort(),
    ["authenticated", "postgres", "service_role"].sort(),
    `expected EXECUTE granted only to authenticated/postgres/service_role, found: ${JSON.stringify(grantsToRoles)}`,
  );
});

console.log("\n=== Profile Phase 1: update_user_profile_languages RPC ===\n");

const languagesRpc = functionBlock("update_user_profile_languages", "p_native_language text,\\s*p_learning_language text");

test("17. Uses SECURITY DEFINER with an empty search_path, derives the caller from auth.uid()", () => {
  assert.match(languagesRpc, /security definer/i);
  assert.match(languagesRpc, /set search_path to ''/i);
  assert.match(languagesRpc, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(languagesRpc, /if v_user_id is null then/i);
});

test("18. Never accepts a p_user_id, daily_goal, timezone, onboarding, or demographic parameter — only the two language fields", () => {
  const signatureMatch = languagesRpc.match(/create or replace function public\.update_user_profile_languages\(([\s\S]*?)\)\s*\nreturns/i);
  assert.ok(signatureMatch, "function signature must be found");
  const params = signatureMatch[1].trim();
  assert.match(params, /^p_native_language text,\s*p_learning_language text$/);
});

test("19. Validates both languages against the exact same allow-list as onboarding", () => {
  assert.match(languagesRpc, /p_native_language not in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\)/i);
  assert.match(languagesRpc, /p_learning_language not in \('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'\)/i);
});

test("20. Rejects a caller with no existing profile row (SQLSTATE P0002) rather than implicitly creating one", () => {
  assert.match(languagesRpc, /v_profile_exists/i);
  assert.match(languagesRpc, /if not v_profile_exists then/i);
  assert.match(languagesRpc, /using errcode = 'P0002';/);
  assert.doesNotMatch(languagesRpc, /insert into public\.user_profiles/i, "must never insert a profile row");

  // Ordering, not just presence: the existence check and its P0002 raise
  // must appear in the source BEFORE the UPDATE statement, not after — a
  // plpgsql RAISE EXCEPTION aborts the whole function (and the surrounding
  // transaction) before any later statement runs, so this ordering is what
  // actually guarantees "no unrelated row is ever touched for a missing
  // profile," not merely that both pieces of code happen to exist somewhere
  // in the function body.
  const existsCheckIndex = languagesRpc.search(/if not v_profile_exists then/i);
  const raiseIndex = languagesRpc.indexOf("using errcode = 'P0002';");
  const updateIndex = languagesRpc.search(/update public\.user_profiles as up/i);
  assert.ok(existsCheckIndex >= 0 && raiseIndex >= 0 && updateIndex >= 0, "all three anchors must be found");
  assert.ok(existsCheckIndex < updateIndex, "the existence check must precede the UPDATE statement");
  assert.ok(raiseIndex < updateIndex, "the P0002 raise must precede the UPDATE statement");
});

test("21. The UPDATE touches only native_language, learning_language, and updated_at — nothing else", () => {
  const updateMatch = languagesRpc.match(/update public\.user_profiles as up\s+set([\s\S]*?)\s+where up\.id = v_user_id;/i);
  assert.ok(updateMatch, "UPDATE statement must exist");
  assert.match(updateMatch[1], /native_language = p_native_language/i);
  assert.match(updateMatch[1], /learning_language = p_learning_language/i);
  assert.match(updateMatch[1], /updated_at = v_now/i);
  assert.doesNotMatch(
    updateMatch[1],
    /daily_goal|timezone|nickname|current_level|user_age|birth_month|birth_day|onboarding_completed|last_active_at|created_at|is_new_user/i,
  );
});

test("22. Idempotent: submitting the same already-stored pair re-runs the identical UPDATE with no special-case branch", () => {
  assert.equal([...languagesRpc.matchAll(/update public\.user_profiles/gi)].length, 1, "exactly one UPDATE statement, no conditional duplicate-suppression branch");
});

test("23. Returns a deterministic single-row table of exactly native_language/learning_language/updated_at", () => {
  assert.match(languagesRpc, /returns table \(\s*native_language text,\s*learning_language text,\s*updated_at timestamptz\s*\)/i);
  assert.match(languagesRpc, /return query\s+select p_native_language, p_learning_language, v_now;/i);
});

console.log("\n=== Profile Phase 1: update_user_profile_languages grants ===\n");

test("24. PUBLIC's and anon's EXECUTE grants are explicitly revoked; authenticated/postgres/service_role receive EXECUTE", () => {
  const sig = "text, text";
  assert.match(source, new RegExp(`revoke execute on function public\\.update_user_profile_languages\\(${sig}\\) from public;`, "i"));
  assert.match(source, new RegExp(`revoke execute on function public\\.update_user_profile_languages\\(${sig}\\) from anon;`, "i"));
  assert.match(source, new RegExp(`grant execute on function public\\.update_user_profile_languages\\(${sig}\\) to postgres;`, "i"));
  assert.match(source, new RegExp(`grant execute on function public\\.update_user_profile_languages\\(${sig}\\) to authenticated;`, "i"));
  assert.match(source, new RegExp(`grant execute on function public\\.update_user_profile_languages\\(${sig}\\) to service_role;`, "i"));
});

test("24b. No grant execute statement on update_user_profile_languages ever targets anon or public — a stray re-grant elsewhere in the file would fail this", () => {
  const grantsToRoles = [
    ...source.matchAll(/grant execute on function public\.update_user_profile_languages\([^)]*\) to (\w+);/gi),
  ].map((match) => match[1].toLowerCase());
  assert.deepEqual(
    [...new Set(grantsToRoles)].sort(),
    ["authenticated", "postgres", "service_role"].sort(),
    `expected EXECUTE granted only to authenticated/postgres/service_role, found: ${JSON.stringify(grantsToRoles)}`,
  );
});

console.log("\n=== Profile Phase 1: RLS policy replacement ===\n");

test("25. The old ownership-scoped FOR ALL policy on user_profiles is dropped", () => {
  assert.match(source, /drop policy if exists "Users can manage their profiles" on public\.user_profiles;/);
});

test("26. A new, distinctly-named ownership-scoped SELECT-only policy replaces it, using auth.uid() = id", () => {
  assert.match(
    source,
    /create policy "Users can view their own profile"\s+on public\.user_profiles\s+as permissive\s+for select\s+to authenticated\s+using \(auth\.uid\(\) = id\);/i,
  );
});

console.log("\n=== Profile Phase 1: table-grant tightening ===\n");

test("27. Direct authenticated writes to user_profiles are revoked, and SELECT is explicitly re-granted", () => {
  assert.match(
    source,
    /revoke insert, select, update, delete, truncate, references, trigger, maintain\s+on public\.user_profiles from authenticated;/i,
  );
  assert.match(source, /grant select on public\.user_profiles to authenticated;/i);
});

test("27b. No other table-level grant on user_profiles to authenticated exists anywhere in this file — a re-added INSERT/UPDATE/DELETE grant would fail this", () => {
  // Scoped to table grants specifically (`on public.user_profiles to
  // authenticated`), not the two unrelated `grant execute on function ...
  // to authenticated` statements for the new RPCs — those are expected and
  // untouched by this check via the `on public\.user_profiles` anchor.
  const tableGrantsToAuthenticated = [
    ...source.matchAll(/grant\s+([a-z, ]+?)\s+on public\.user_profiles to authenticated;/gi),
  ].map((match) => match[1].trim().toLowerCase());
  assert.deepEqual(
    tableGrantsToAuthenticated,
    ["select"],
    `expected exactly one table-level grant to authenticated (SELECT only), found: ${JSON.stringify(tableGrantsToAuthenticated)}`,
  );
});

test("28. All direct anon privileges on user_profiles are revoked", () => {
  assert.match(
    source,
    /revoke insert, select, update, delete, truncate, references, trigger, maintain\s+on public\.user_profiles from anon;/i,
  );
});

test("28b. No table-level grant on user_profiles to anon exists anywhere in this file", () => {
  const tableGrantsToAnon = [...source.matchAll(/grant\s+([a-z, ]+?)\s+on public\.user_profiles to anon;/gi)];
  assert.deepEqual(tableGrantsToAnon, [], `expected zero table-level grants to anon, found: ${tableGrantsToAnon.length}`);
});

console.log("\n=== Profile Phase 1: untouched objects / no bulk rewrite ===\n");

test("29. This migration never bulk-rewrites existing user_profiles rows outside the two new function bodies", () => {
  const withoutFunctionBodies = source.replace(/create or replace function[\s\S]*?\$function\$;/gi, "");
  assert.doesNotMatch(withoutFunctionBodies, /update\s+public\.user_profiles/i);
  assert.doesNotMatch(withoutFunctionBodies, /insert\s+into\s+public\.user_profiles/i);
});

test("30. update_daily_goal, initialize_user_timezone, prevent_direct_user_timezone_write, and every learning table/RPC are left untouched", () => {
  assert.doesNotMatch(source, /create or replace function public\.update_daily_goal/i);
  assert.doesNotMatch(source, /create or replace function public\.initialize_user_timezone/i);
  assert.doesNotMatch(source, /create or replace function public\.prevent_direct_user_timezone_write/i);
  assert.doesNotMatch(source, /public\.user_word_progress/);
  assert.doesNotMatch(source, /public\.user_daily_stats/);
  assert.doesNotMatch(source, /public\.review_events/);
  assert.doesNotMatch(source, /public\.custom_practice_events/);
});

test("31. The baseline migration's user_profiles table definition and existing daily_goal CHECK are unmodified by this file", () => {
  assert.match(baselineSource, /create table if not exists public\.user_profiles/i);
  assert.doesNotMatch(source, /create table[\s\S]*?public\.user_profiles/i, "must not redefine the table");
  assert.doesNotMatch(source, /drop constraint user_profiles_daily_goal_allowed_values_check/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

console.log("\n=== Profile Phase 2: unused last_active_at removal ===\n");

test("32. Profile Phase 2 drops user_profiles.last_active_at", () => {
  assert.match(
    dropLastActiveAtSource,
    /alter table public\.user_profiles\s+drop column if exists last_active_at;/i,
  );
});

test("33. Profile Phase 2 replaces only the onboarding RPC and does not broaden profile write authority", () => {
  assert.match(dropLastActiveAtSource, /create or replace function public\.complete_user_profile_onboarding/i);
  assert.doesNotMatch(dropLastActiveAtSource, /create or replace function public\.update_user_profile_languages/i);
  assert.doesNotMatch(dropLastActiveAtSource, /create or replace function public\.update_daily_goal/i);
  assert.doesNotMatch(dropLastActiveAtSource, /create or replace function public\.initialize_user_timezone/i);
  assert.doesNotMatch(dropLastActiveAtSource, /grant\s+(insert|update|delete|all)/i);
});

test("34. Current frontend code does not declare or consume a lastActiveAt profile property", () => {
  const searchableRoots = ["src"];
  const offenders = [];
  for (const root of searchableRoots) {
    const stack = [path.join(ROOT_DIR, root)];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (!/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue;
        const relativePath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");
        if (relativePath === "scripts/tests/learning/test-restrict-user-profiles-writes-migration-contract.mjs") continue;
        const content = fs.readFileSync(fullPath, "utf8");
        if (/lastActiveAt|last_active_at/.test(content)) {
          offenders.push(relativePath);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `unexpected runtime/test dependency on last_active_at: ${offenders.join(", ")}`);
});

console.log("\n=== Profile Phase 3: unused is_new_user removal ===\n");

test("35. Profile Phase 3 drops user_profiles.is_new_user", () => {
  assert.match(
    dropIsNewUserSource,
    /alter table public\.user_profiles\s+drop column if exists is_new_user;/i,
  );
});

test("36. Profile Phase 3 does not replace or broaden any RPC — is_new_user was never referenced by one", () => {
  assert.doesNotMatch(dropIsNewUserSource, /create or replace function/i);
  assert.doesNotMatch(dropIsNewUserSource, /grant\s+(insert|update|delete|all)/i);
});

test("37. Neither Profile Phase 1's nor Profile Phase 2's onboarding RPC ever names is_new_user in its INSERT or SET list", () => {
  for (const rpcSource of [source, dropLastActiveAtSource]) {
    const insertMatch = rpcSource.match(/insert into public\.user_profiles \(([\s\S]*?)\)\s*\n\s*values/i);
    assert.doesNotMatch(insertMatch[1], /is_new_user/i);
    const setMatch = rpcSource.match(/on conflict \(id\) do update\s+set([\s\S]*?);/i);
    assert.doesNotMatch(setMatch[1], /is_new_user/i);
  }
});

test("38. Current frontend code does not declare or consume an isNewUser profile property", () => {
  const searchableRoots = ["src"];
  const offenders = [];
  for (const root of searchableRoots) {
    const stack = [path.join(ROOT_DIR, root)];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (!/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue;
        const relativePath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");
        if (relativePath === "scripts/tests/learning/test-restrict-user-profiles-writes-migration-contract.mjs") continue;
        const content = fs.readFileSync(fullPath, "utf8");
        if (/isNewUser|is_new_user/.test(content)) {
          offenders.push(relativePath);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `unexpected runtime/test dependency on is_new_user: ${offenders.join(", ")}`);
});

test("39. shouldOpenAccountOnboarding remains driven only by profile-row presence and completeness, never is_new_user", () => {
  const accountProfilePath = path.join(ROOT_DIR, "src", "app", "utils", "accountProfile.ts");
  const accountProfileSource = fs.readFileSync(accountProfilePath, "utf8");
  const fnMatch = accountProfileSource.match(
    /export function shouldOpenAccountOnboarding\([\s\S]*?\n\}/,
  );
  assert.ok(fnMatch, "shouldOpenAccountOnboarding must still exist in src/app/utils/accountProfile.ts");
  assert.doesNotMatch(fnMatch[0], /isNewUser|is_new_user/i);
  assert.match(fnMatch[0], /hasSupabaseProfileRow/);
  assert.match(fnMatch[0], /isUserProfileComplete/);
});

console.log(`\nFinal total: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("restrict-user-profiles-writes-migration-contract guard passed");
}
