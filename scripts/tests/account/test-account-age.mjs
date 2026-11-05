// Automatic age: calendar rules, minimum-age rule, profile mapping for new
// and existing users, response parsers, and the SQL migration contract.
//
// Covers src/app/utils/accountAge.ts (the TypeScript mirror of the SQL
// helpers in supabase/migrations/20261105160000_add_inferred_birth_year_and_current_age.sql),
// accountOnboardingAge.ts's Settings/confirmation rule, the two RPC
// response parsers, and src/lib/userProfile.ts's read/cache mapping. The
// latter imports import.meta.env through supabaseAuth.ts, so it is bundled
// with esbuild (defining a dummy env) and exercised against a mocked fetch
// and an in-memory localStorage; no network or database is used. The SQL
// itself cannot run here (no local Postgres), so section [8] pins its
// contract as source text and [1]-[3] check the TypeScript mirror against
// the same formulas.
//
// Run: node --experimental-strip-types scripts/tests/account/test-account-age.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  ageOn,
  birthDayForMonth,
  birthDayValuesForMonth,
  birthdayInYear,
  calendarDateInTimeZone,
  getDeclaredAgeIssue,
  inferBirthYear,
  isLeapYear,
  isValidBirthDate,
} from "../../../src/app/utils/accountAge.ts";
import { getOnboardingAgeIssue, isAllowedProfileAge } from "../../../src/app/utils/accountOnboardingAge.ts";
import { normalizeAge, normalizeUserProfile } from "../../../src/app/utils/accountProfileCompleteness.ts";
import { parseUpdateUserProfileDemographicsRow } from "../../../src/lib/userProfileDemographics.ts";
import { parseCompleteUserProfileOnboardingRow } from "../../../src/lib/userProfileOnboarding.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗  ${name}\n       ${error.message}`);
  }
}
const d = (year, month, day) => ({ year, month, day });

console.log("\n[1] Birthdays before/after today and growth over years\n");

await test("birthday later this year: not yet a year older", () => {
  assert.equal(ageOn(2000, 12, 20, d(2026, 11, 5)), 25);
});
await test("birthday earlier this year: already a year older", () => {
  assert.equal(ageOn(2000, 3, 1, d(2026, 11, 5)), 26);
});
await test("age increases exactly on the birthday, not the day before", () => {
  assert.equal(ageOn(2000, 6, 15, d(2026, 6, 14)), 25);
  assert.equal(ageOn(2000, 6, 15, d(2026, 6, 15)), 26);
});
await test("not on January 1 and not on the declaration anniversary", () => {
  // Declared 20 on 2026-11-05 with an 08-20 birthday.
  const birthYear = inferBirthYear(20, 8, 20, d(2026, 11, 5));
  assert.equal(ageOn(birthYear, 8, 20, d(2027, 1, 1)), 20, "Jan 1 does not age");
  assert.equal(ageOn(birthYear, 8, 20, d(2027, 11, 5)), 21, "anniversary: one birthday has passed");
  assert.equal(ageOn(birthYear, 8, 20, d(2027, 8, 19)), 20);
  assert.equal(ageOn(birthYear, 8, 20, d(2027, 8, 20)), 21);
});
await test("increases by one per birthday over multiple years", () => {
  const birthYear = inferBirthYear(18, 4, 10, d(2026, 11, 5));
  for (let offset = 0; offset <= 10; offset += 1) {
    assert.equal(ageOn(birthYear, 4, 10, d(2027 + offset, 4, 9)), 18 + offset);
    assert.equal(ageOn(birthYear, 4, 10, d(2027 + offset, 4, 10)), 19 + offset);
  }
});
await test("inferBirthYear is the exact inverse of ageOn for every day of the year", () => {
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= 28; day += 1) {
      for (const today of [d(2026, 1, 1), d(2026, 6, 15), d(2026, 12, 31), d(2028, 2, 29)]) {
        const birthYear = inferBirthYear(30, month, day, today);
        assert.equal(ageOn(birthYear, month, day, today), 30, `${month}/${day} on ${JSON.stringify(today)}`);
      }
    }
  }
});

console.log("\n[2] Time-zone boundaries\n");

await test("the same instant is a different calendar day in different zones", () => {
  const instant = new Date("2026-03-14T23:30:00Z");
  assert.deepEqual(calendarDateInTimeZone(instant, "UTC"), d(2026, 3, 14));
  assert.deepEqual(calendarDateInTimeZone(instant, "Pacific/Auckland"), d(2026, 3, 15));
  assert.deepEqual(calendarDateInTimeZone(instant, "America/Los_Angeles"), d(2026, 3, 14));
});
await test("the birthday arrives at local midnight in the user's zone", () => {
  const instant = new Date("2026-03-14T23:30:00Z");
  assert.equal(ageOn(2000, 3, 15, calendarDateInTimeZone(instant, "Pacific/Auckland")), 26);
  assert.equal(ageOn(2000, 3, 15, calendarDateInTimeZone(instant, "America/Los_Angeles")), 25);
});
await test("first time zone corrects a UTC-based onboarding inference (initialize_user_timezone)", () => {
  // Declared "20" in Auckland on the morning of the 20th birthday; UTC is
  // still the day before, so the onboarding inference (UTC) is a year early.
  const declaredAt = new Date("2026-08-19T22:00:00Z");
  const utcInference = inferBirthYear(20, 8, 20, calendarDateInTimeZone(declaredAt, "UTC"));
  const localInference = inferBirthYear(20, 8, 20, calendarDateInTimeZone(declaredAt, "Pacific/Auckland"));
  assert.equal(utcInference, 2005);
  assert.equal(localInference, 2006, "re-inferred from the same instant in the real zone");
  assert.equal(ageOn(localInference, 8, 20, d(2027, 8, 19)), 20, "no early birthday a year later");
  assert.equal(ageOn(utcInference, 8, 20, d(2027, 8, 19)), 21, "what the uncorrected value would show");
});
await test("unknown or missing zones fall back to UTC (like the server's user_local_date)", () => {
  const instant = new Date("2026-03-14T23:30:00Z");
  assert.deepEqual(calendarDateInTimeZone(instant, "Not/AZone"), d(2026, 3, 14));
  assert.deepEqual(calendarDateInTimeZone(instant, null), d(2026, 3, 14));
});

console.log("\n[3] Leap years and impossible dates\n");

await test("leap-year rule", () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
});
await test("Feb 29 birthday is celebrated on March 1 in non-leap years", () => {
  assert.deepEqual(birthdayInYear(2026, 2, 29), d(2026, 3, 1));
  assert.deepEqual(birthdayInYear(2028, 2, 29), d(2028, 2, 29));
  assert.equal(ageOn(2004, 2, 29, d(2026, 2, 28)), 21, "never early");
  assert.equal(ageOn(2004, 2, 29, d(2026, 3, 1)), 22);
  assert.equal(ageOn(2004, 2, 29, d(2028, 2, 28)), 23);
  assert.equal(ageOn(2004, 2, 29, d(2028, 2, 29)), 24, "on the day in leap years");
});
await test("impossible dates are rejected; Feb 29 itself is valid", () => {
  for (const [month, day] of [[2, 30], [2, 31], [4, 31], [6, 31], [9, 31], [11, 31], [13, 1], [0, 1], [1, 0], [1, 32]]) {
    assert.equal(isValidBirthDate(month, day), false, `${month}/${day}`);
    assert.equal(getDeclaredAgeIssue(30, month, day, d(2026, 11, 5)), "invalidBirthDate");
  }
  assert.equal(isValidBirthDate(2, 29), true);
  assert.equal(isValidBirthDate(12, 31), true);
});
await test("a Feb 29 birthday must fit the birth year implied by the age", () => {
  // 2026-11-05: age 22 -> born 2004 (leap) ok; age 20 -> 2006 (not leap).
  assert.equal(getDeclaredAgeIssue(22, 2, 29, d(2026, 11, 5)), null);
  assert.equal(getDeclaredAgeIssue(20, 2, 29, d(2026, 11, 5)), "leapDayMismatch");
  // 2026-02-28, before the (March 1) birthday: age 21 -> 2004 ok.
  assert.equal(getDeclaredAgeIssue(21, 2, 29, d(2026, 2, 28)), null);
});
await test("day pickers only offer real days and drop a day the new month lacks", () => {
  assert.equal(birthDayValuesForMonth("02").length, 29);
  assert.equal(birthDayValuesForMonth("04").length, 30);
  assert.equal(birthDayValuesForMonth("01").length, 31);
  assert.equal(birthDayValuesForMonth("").length, 31);
  assert.equal(birthDayForMonth("04", "31"), "");
  assert.equal(birthDayForMonth("02", "29"), "29");
  assert.equal(birthDayForMonth("02", "30"), "");
  assert.equal(birthDayForMonth("03", "31"), "31");
});

console.log("\n[4] Minimum age 16 (onboarding, Settings, confirmation)\n");

await test("onboarding: below 16 is rejected, 16-100 accepted", () => {
  assert.equal(getOnboardingAgeIssue(15), "belowMinimum");
  assert.equal(getOnboardingAgeIssue(16), null);
  assert.equal(getOnboardingAgeIssue(100), null);
  assert.equal(getOnboardingAgeIssue(101), "aboveMaximum");
});
await test("Settings/confirmation: 16+ accounts can never go below 16", () => {
  assert.equal(isAllowedProfileAge(15, 16), false);
  assert.equal(isAllowedProfileAge(15, 30), false);
  assert.equal(isAllowedProfileAge(15, null), false);
});
await test("legacy under-16 account: may confirm its true (higher) age, never lower", () => {
  assert.equal(isAllowedProfileAge(14, 14), true, "unchanged");
  assert.equal(isAllowedProfileAge(15, 14), true, "one birthday later");
  assert.equal(isAllowedProfileAge(13, 14), false, "lowering");
  assert.equal(isAllowedProfileAge(14.5, 14), false, "not a whole number");
  assert.equal(isAllowedProfileAge(16, 14), true);
});

console.log("\n[5] Profile normalization and response parsers\n");

await test("current ages above the 100 input maximum still read as complete", () => {
  assert.equal(normalizeAge(101), 101);
  assert.equal(normalizeAge(9), null);
});
await test("a known birth year always clears the confirmation request", () => {
  assert.equal(normalizeUserProfile({ ageConfirmationRequired: true, birthYear: null }).ageConfirmationRequired, true);
  assert.equal(normalizeUserProfile({ ageConfirmationRequired: true, birthYear: 2000 }).ageConfirmationRequired, false);
  assert.equal(normalizeUserProfile({ birthYear: 1800 }).birthYear, null);
});
await test("demographics parser: new fields parsed; legacy response still parses", () => {
  const base = { user_age: 30, birth_month: 5, birth_day: 9, updated_at: "2026-11-05T10:00:00Z" };
  const next = parseUpdateUserProfileDemographicsRow({ ...base, birth_year: 1996, age_confirmed_at: "2026-11-05T10:00:00Z", current_age: 30 });
  assert.equal(next.birthYear, 1996);
  assert.equal(next.currentAge, 30);
  const legacy = parseUpdateUserProfileDemographicsRow(base);
  assert.equal(legacy.birthYear, null);
  assert.equal(legacy.currentAge, null);
  assert.throws(() => parseUpdateUserProfileDemographicsRow({ ...base, birth_year: "1996" }));
});
await test("onboarding parser: new fields parsed", () => {
  const row = parseCompleteUserProfileOnboardingRow({
    nickname: "Ann", native_language: "en", learning_language: "es", current_level: "A1",
    user_age: 20, birth_month: 8, birth_day: 20, onboarding_completed: true, daily_goal: 15,
    timezone: "Europe/Berlin", timezone_updated_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-05T10:00:00Z",
    birth_year: 2006, age_confirmed_at: "2026-11-05T10:00:00Z", current_age: 20,
  });
  assert.equal(row.birthYear, 2006);
  assert.equal(row.currentAge, 20);
});

console.log("\n[6] Profile read: new users, existing users, legacy database, cache\n");

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "account-age-"));
const bundlePath = path.join(bundleDir, "userProfile.mjs");
await build({
  entryPoints: [path.join(ROOT_DIR, "src/lib/userProfile.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  outfile: bundlePath,
  logLevel: "warning",
  define: {
    "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "https://example.invalid", VITE_SUPABASE_ANON_KEY: "anon" }),
  },
});
const store = new Map();
globalThis.window = {
  localStorage: {
    get length() { return store.size; },
    key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
  addEventListener() {},
  dispatchEvent() {},
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const requests = [];
let respond = () => ({ status: 200, body: [] });
globalThis.fetch = async (url) => {
  requests.push(String(url));
  const { status, body } = respond(String(url));
  return { ok: status < 300, status, json: async () => body };
};
const profile = await import(pathToFileURL(bundlePath).href);
const session = { access_token: "a", refresh_token: "r", expires_at: 4102444800, user: { id: "user-1" } };
const row = {
  id: "user-1", nickname: "Ann", native_language: "en", learning_language: "es", current_level: "A1",
  user_age: 20, birth_month: 8, birth_day: 20, onboarding_completed: true, daily_goal: 15,
  updated_at: "2025-01-01T00:00:00Z", timezone: "UTC", timezone_updated_at: "2025-01-01T00:00:00Z",
};

await test("new/confirmed user: the server's current_age is the displayed age", async () => {
  respond = () => ({ status: 200, body: [{ ...row, user_age: 20, birth_year: 2004, age_confirmed_at: "2024-01-01T00:00:00Z", current_age: 22 }] });
  const result = await profile.readSupabaseUserProfile(session);
  assert.equal(result.age, 22);
  assert.equal(result.birthYear, 2004);
  assert.equal(result.ageConfirmationRequired, false);
  assert.match(requests.at(-1), /select=.*birth_year,age_confirmed_at,current_age/);
});
await test("existing user without a birth year: stored age kept, one-time confirmation requested", async () => {
  respond = () => ({ status: 200, body: [{ ...row, user_age: 20, birth_year: null, age_confirmed_at: null, current_age: null }] });
  const result = await profile.readSupabaseUserProfile(session);
  assert.equal(result.age, 20, "no birth year is guessed from updated_at");
  assert.equal(result.birthYear, null);
  assert.equal(result.ageConfirmationRequired, true);
});
await test("incomplete profile (onboarding pending) is not asked for confirmation", async () => {
  respond = () => ({ status: 200, body: [{ ...row, onboarding_completed: false, birth_year: null, age_confirmed_at: null, current_age: null }] });
  const result = await profile.readSupabaseUserProfile(session);
  assert.equal(result.ageConfirmationRequired, false);
});
await test("database without the migration: falls back to the legacy columns, no prompt", async () => {
  requests.length = 0;
  respond = (url) => url.includes("current_age")
    ? { status: 400, body: { code: "42703", message: "column user_profiles.current_age does not exist" } }
    : { status: 200, body: [row] };
  const result = await profile.readSupabaseUserProfile(session);
  assert.equal(requests.length, 2);
  assert.equal(result.age, 20);
  assert.equal(result.ageConfirmationRequired, false);
});
await test("other read errors are not swallowed by the fallback", async () => {
  respond = () => ({ status: 500, body: { code: "XX000", message: "boom" } });
  await assert.rejects(() => profile.readSupabaseUserProfile(session));
});
await test("cached profile recomputes the age from the birth year (cache cannot go stale)", () => {
  store.set("supabase.auth.session", JSON.stringify(session));
  profile.writeStoredUserProfile("user-1", {
    nickname: "Ann", languageLevel: "A1", age: 18, birthMonth: "01", birthDay: "01",
    nativeLanguage: "en", practiceLanguage: "es", onboardingCompleted: true, timezone: "UTC",
    birthYear: 2000, ageConfirmedAt: "2018-06-01T00:00:00Z",
  });
  const today = calendarDateInTimeZone(new Date(), "UTC");
  assert.equal(profile.readStoredUserProfile("user-1").age, ageOn(2000, 1, 1, today));
});
await test("onboarding request carries no time-zone field (time-zone writes stay with the time-zone RPCs)", async () => {
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => [{
      nickname: "Ann", native_language: "en", learning_language: "es", current_level: "A1", user_age: 20,
      birth_month: 8, birth_day: 20, onboarding_completed: true, daily_goal: 15, timezone: null,
      timezone_updated_at: null, updated_at: "2026-11-05T10:00:00Z", birth_year: 2006,
      age_confirmed_at: "2026-11-05T10:00:00Z", current_age: 20,
    }] };
  };
  const result = await profile.completeUserProfileOnboarding(session, {
    nickname: "Ann", nativeLanguage: "en", practiceLanguage: "es", languageLevel: "A1",
    age: 20, birthMonth: "08", birthDay: "20",
  });
  assert.equal(Object.keys(bodies[0]).some((key) => /timezone/i.test(key)), false);
  assert.equal(result.age, 20);
  assert.equal(result.birthYear, 2006);
  assert.equal(result.ageConfirmationRequired, false);
});
fs.rmSync(bundleDir, { recursive: true, force: true });

console.log("\n[7] UI wiring (source contracts)\n");

const read = (relativePath) => fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
await test("onboarding validates real dates / Feb 29 and limits day options", () => {
  assert.match(read("src/app/utils/accountOnboarding.ts"), /getDeclaredAgeIssue\(/);
  assert.match(read("src/app/components/dialogs/AccountOnboardingDialog.tsx"), /birthDayValuesForMonth\(profile\.birthMonth\)/);
});
await test("Settings blocks impossible dates and limits day options", () => {
  const source = read("src/features/user-profile/sections/settings/SettingsSection.tsx");
  assert.match(source, /birthDateIssue === null/);
  assert.match(source, /birthDayValuesForMonth\(birthMonthDraft\)/);
});
await test("age confirmation is wired into every App route branch, skippable, never over other flows", () => {
  const app = read("src/app/App.tsx");
  const recoveryCount = (app.match(/\{passwordRecoveryDialog\}/g) ?? []).length;
  assert.equal((app.match(/\{ageConfirmationDialog\}/g) ?? []).length, recoveryCount);
  assert.match(app, /isAccountOnboardingOpen \|\|\s*isPasswordRecoveryActive \|\|\s*accountLanguageConfirm\.isOpen \|\|\s*isLearningSessionActive/);
  const hook = read("src/app/hooks/useAgeConfirmation.ts");
  assert.match(hook, /sessionStorage\.setItem\(AGE_CONFIRMATION_SNOOZE_KEY, "1"\)/);
  assert.match(hook, /updateUserProfileDemographics\(/);
});
await test("all seven interface files define the new strings", () => {
  for (const language of ["english", "spanish", "french", "german", "italian", "portuguese", "russian"]) {
    const data = JSON.parse(read(`src/data/interface/${language}_interface.json`));
    for (const key of ["title", "description", "confirm", "later", "saving", "saveError"]) {
      assert.ok(data.ageConfirmation?.[key], `${language} ageConfirmation.${key}`);
    }
    assert.ok(data.accountOnboarding.errors.birthDateInvalid, `${language} birthDateInvalid`);
    assert.ok(data.accountOnboarding.errors.birthDateLeapDay, `${language} birthDateLeapDay`);
  }
});

console.log("\n[8] SQL migration contract\n");

const sql = read("supabase/migrations/20261105160000_add_inferred_birth_year_and_current_age.sql");
const fn = (name) => {
  const match = sql.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$function\\$;`));
  assert.ok(match, `missing function ${name}`);
  return match[0];
};
await test("adds nullable columns only; no backfill or rewrite of existing rows", () => {
  assert.match(sql, /add column if not exists birth_year smallint null/);
  assert.match(sql, /add column if not exists age_confirmed_at timestamptz null/);
  // Every UPDATE targets the caller's own row inside an RPC.
  const updates = sql.match(/update public\.user_profiles[\s\S]*?;/g) ?? [];
  assert.equal(updates.length, 2);
  for (const update of updates) assert.match(update, /where up\.id = v_user_id/);
  assert.doesNotMatch(sql, /delete from|truncate/i);
});
await test("SQL calendar rules match the TypeScript mirror", () => {
  assert.match(fn("birthday_in_year"), /p_month = 2 and p_day = 29[\s\S]*make_date\(p_year, 3, 1\)/);
  assert.match(fn("age_on_date"), /p_on < public\.birthday_in_year\(extract\(year from p_on\)::integer, p_month, p_day\) then 1/);
  assert.match(fn("infer_birth_year"), /extract\(year from p_on\)::integer - p_age/);
  assert.match(fn("birth_date_is_valid"), /make_date\(2000, p_month, 1\)/);
  assert.match(fn("user_local_date"), /pg_catalog\.now\(\) at time zone coalesce\([\s\S]*'UTC'\)/);
});
await test("current_age is a read-only computed field, null without a birth year", () => {
  const body = fn("current_age");
  assert.match(body, /p_profile public\.user_profiles/);
  assert.match(body, /when p_profile\.birth_year is null then null/);
  assert.doesNotMatch(body, /security definer/);
});
await test("onboarding keeps 16-100, validates dates and Feb 29, infers the birth year", () => {
  const body = fn("complete_user_profile_onboarding");
  assert.match(body, /p_user_age < 16 or p_user_age > 100/);
  assert.match(body, /birth_date_is_valid\(p_birth_month, p_birth_day\)/);
  assert.match(body, /birth_year_matches_birthday\(v_birth_year/);
  assert.match(body, /infer_birth_year\(p_user_age, p_birth_month, p_birth_day, v_today\)/);
  assert.doesNotMatch(body, /p_timezone|set_config|timezone =/, "onboarding never writes the time zone");
  assert.match(sql, /drop function if exists public\.complete_user_profile_onboarding\(text, text, text, text, integer, integer, integer\)/);
});
await test("initialize_user_timezone re-infers the birth year once, from the declaration instant", () => {
  const body = fn("initialize_user_timezone");
  assert.match(body, /and up\.timezone is null/, "only when storing the first time zone");
  assert.match(body, /infer_birth_year\(up\.user_age, up\.birth_month, up\.birth_day,\s*\(up\.age_confirmed_at at time zone v_timezone\)::date\)/);
  assert.match(body, /else up\.birth_year/);
  assert.match(body, /'initialize_user_timezone: profile row not found'/);
});
await test("demographics: below 16 only for an under-16 account and never below its current age", () => {
  const body = fn("update_user_profile_demographics");
  assert.match(body, /p_user_age < 16 and \(v_baseline_age is null or p_user_age < v_baseline_age\)/);
  assert.match(body, /when v_profile\.birth_year is not null[\s\S]*age_on_date[\s\S]*else v_profile\.user_age/);
  assert.match(body, /birth_year = v_birth_year,\s*age_confirmed_at = v_now/);
});
await test("runs in one explicit transaction, with the schema reload before COMMIT", () => {
  const statements = sql.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("--"));
  assert.equal(statements[0], "begin;", "first statement opens the transaction");
  assert.equal(statements.at(-1), "commit;", "last statement commits");
  assert.ok(sql.indexOf("notify pgrst") < sql.lastIndexOf("commit;"));
  assert.equal((sql.match(/^\s*(begin|commit);/gim) ?? []).length, 2, "no nested or early commit");
});
await test("no anon access to any new or changed function; schema cache reloaded", () => {
  for (const name of ["birth_date_is_valid", "birth_year_matches_birthday", "birthday_in_year", "age_on_date", "infer_birth_year", "user_local_date", "current_age", "complete_user_profile_onboarding", "update_user_profile_demographics", "initialize_user_timezone"]) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${name}\\([^)]*\\) from public, anon;`), name);
  }
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("account-age tests passed");
}
