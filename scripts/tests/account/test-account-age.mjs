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
await test("birth year normalization keeps only plausible years", () => {
  assert.equal(normalizeUserProfile({ birthYear: 2000 }).birthYear, 2000);
  assert.equal(normalizeUserProfile({ birthYear: 1800 }).birthYear, null);
  assert.equal("ageConfirmationRequired" in normalizeUserProfile({}), false, "no confirmation-prompt state");
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
  assert.match(requests.at(-1), /select=.*birth_year,age_confirmed_at,current_age/);
});
await test("existing user without a birth year: stored age displayed, nothing guessed", async () => {
  respond = () => ({ status: 200, body: [{ ...row, user_age: 20, birth_year: null, age_confirmed_at: null, current_age: null }] });
  const result = await profile.readSupabaseUserProfile(session);
  assert.equal(result.age, 20, "no birth year is guessed from updated_at");
  assert.equal(result.birthYear, null);
});
await test("database without the migration: falls back to the legacy columns, no prompt", async () => {
  requests.length = 0;
  respond = (url) => url.includes("current_age")
    ? { status: 400, body: { code: "42703", message: "column user_profiles.current_age does not exist" } }
    : { status: 200, body: [row] };
  const result = await profile.readSupabaseUserProfile(session);
  assert.equal(requests.length, 2);
  assert.equal(result.age, 20);
  assert.equal(result.birthYear, null);
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
const onboardingRow = {
  nickname: "Ann", native_language: "en", learning_language: "es", current_level: "A1", user_age: 20,
  birth_month: 8, birth_day: 20, onboarding_completed: true, daily_goal: 15, timezone: null,
  timezone_updated_at: null, updated_at: "2026-11-05T10:00:00Z", birth_year: 2006,
  age_confirmed_at: "2026-11-05T10:00:00Z", current_age: 20,
};
const onboardingInput = {
  nickname: "Ann", nativeLanguage: "en", practiceLanguage: "es", languageLevel: "A1",
  age: 20, birthMonth: "08", birthDay: "20", timeZone: "Pacific/Honolulu",
};
// Replays the given responses in order and records every request body.
const scriptOnboardingResponses = (...responses) => {
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    const { status, body } = responses[Math.min(bodies.length - 1, responses.length - 1)];
    return { ok: status < 300, status, json: async () => body };
  };
  return bodies;
};
const pgrst202 = (signature) => ({
  status: 404,
  body: {
    code: "PGRST202",
    message: `Could not find the function public.complete_user_profile_onboarding(${signature}) in the schema cache`,
    details: "Searched for the function with the given parameters, but no matches were found in the schema cache.",
    hint: null,
  },
});
const SIGNATURE_WITH_ZONE = "p_birth_day, p_birth_month, p_current_level, p_learning_language, p_native_language, p_nickname, p_timezone, p_user_age";
const SIGNATURE_WITHOUT_ZONE = "p_birth_day, p_birth_month, p_current_level, p_learning_language, p_native_language, p_nickname, p_user_age";

await test("onboarding sends the validated zone as p_timezone and no stored time-zone field", async () => {
  const bodies = scriptOnboardingResponses({ status: 200, body: [onboardingRow] });
  const result = await profile.completeUserProfileOnboarding(session, onboardingInput);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].p_timezone, "Pacific/Honolulu");
  assert.deepEqual(Object.keys(bodies[0]).filter((key) => /timezone/i.test(key)), ["p_timezone"]);
  assert.equal(result.age, 20);
  assert.equal(result.birthYear, 2006);
});
await test("an unknown browser zone is sent as null (server: stored zone, else UTC)", async () => {
  const bodies = scriptOnboardingResponses({ status: 200, body: [onboardingRow] });
  await profile.completeUserProfileOnboarding(session, { ...onboardingInput, timeZone: null });
  assert.equal(bodies[0].p_timezone, null);
});
await test("database without the migration (PGRST202 naming p_timezone): one retry with seven arguments", async () => {
  const bodies = scriptOnboardingResponses(pgrst202(SIGNATURE_WITH_ZONE), { status: 200, body: [onboardingRow] });
  const result = await profile.completeUserProfileOnboarding(session, onboardingInput);
  assert.equal(bodies.length, 2);
  assert.equal("p_timezone" in bodies[1], false);
  assert.deepEqual(Object.keys(bodies[1]).sort(), Object.keys(bodies[0]).filter((key) => key !== "p_timezone").sort());
  assert.equal(result.birthYear, 2006);
});
await test("the retry happens at most once (PGRST202 again is thrown)", async () => {
  const bodies = scriptOnboardingResponses(pgrst202(SIGNATURE_WITH_ZONE), pgrst202(SIGNATURE_WITHOUT_ZONE));
  await assert.rejects(profile.completeUserProfileOnboarding(session, onboardingInput), (error) => error.code === "PGRST202");
  assert.equal(bodies.length, 2);
});
await test("unrelated errors are never retried", async () => {
  for (const response of [
    pgrst202("p_nickname"), // PGRST202 that does not name p_timezone
    { status: 404, body: { code: "PGRST202", message: "Could not find the function public.other_rpc(p_timezone) in the schema cache" } },
    { status: 400, body: { code: "22023", message: "complete_user_profile_onboarding: p_user_age must be between 16 and 100" } },
    { status: 400, body: { code: "22023", message: "complete_user_profile_onboarding: February 29 does not exist in the birth year implied by p_user_age" } },
    { status: 300, body: { code: "PGRST203", message: "Could not choose the best candidate function between: public.complete_user_profile_onboarding(p_timezone ...)" } },
    { status: 500, body: { message: "internal error" } },
  ]) {
    const bodies = scriptOnboardingResponses(response);
    await assert.rejects(profile.completeUserProfileOnboarding(session, onboardingInput));
    assert.equal(bodies.length, 1, response.body.message);
  }
});
await test("a voluntary Settings save initializes automatic age for an existing user", async () => {
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => [{
      user_age: 21, birth_month: 8, birth_day: 20, updated_at: "2026-11-05T10:00:00Z",
      birth_year: 2005, age_confirmed_at: "2026-11-05T10:00:00Z", current_age: 21,
    }] };
  };
  const result = await profile.updateUserProfileDemographics(session, { age: 21, birthMonth: "08", birthDay: "20" });
  assert.match(bodies[0].url, /\/rpc\/update_user_profile_demographics$/);
  assert.deepEqual(bodies[0].body, { p_user_age: 21, p_birth_month: 8, p_birth_day: 20 });
  assert.equal(result.age, 21);
  assert.equal(result.birthYear, 2005);
  assert.equal(result.ageConfirmedAt, "2026-11-05T10:00:00Z");
});
await test("against a database without the migration a Settings save still works (no birth year)", async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [{
    user_age: 21, birth_month: 8, birth_day: 20, updated_at: "2026-11-05T10:00:00Z",
  }] });
  const result = await profile.updateUserProfileDemographics(session, { age: 21, birthMonth: "08", birthDay: "20" });
  assert.equal(result.age, 21);
  assert.equal("birthYear" in result, false);
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
await test("existing users are never prompted: no age-confirmation popup, hook, state, or strings", () => {
  for (const removed of ["src/app/components/dialogs/AgeConfirmationDialog.tsx", "src/app/hooks/useAgeConfirmation.ts"]) {
    assert.equal(fs.existsSync(path.join(ROOT_DIR, removed)), false, removed);
  }
  for (const file of ["src/app/App.tsx", "src/lib/userProfile.ts", "src/app/utils/accountProfileCompleteness.ts"]) {
    assert.doesNotMatch(read(file), /ageConfirmation(Dialog|Required)|useAgeConfirmation/, file);
  }
});
await test("all seven interface files keep the date errors and drop the popup strings", () => {
  for (const language of ["english", "spanish", "french", "german", "italian", "portuguese", "russian"]) {
    const data = JSON.parse(read(`src/data/interface/${language}_interface.json`));
    assert.equal(data.ageConfirmation, undefined, `${language} ageConfirmation removed`);
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

console.log("\n[9] Onboarding in the browser's validated time zone (20261106120000)\n");

// The database behavior itself is verified by the pgTAP suite
// (supabase/tests/database/onboarding_leap_day_time_zone.test.sql, run by
// .github/workflows/database-tests.yml). This section covers the client
// (one zone for validation and request) and pins the SQL, pgTAP, and CI
// files as source text. Instants and zones are explicit.

const onboardingBundlePath = path.join(bundleDir, "accountOnboarding.mjs");
await build({
  entryPoints: [path.join(ROOT_DIR, "src/app/utils/accountOnboarding.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  outfile: onboardingBundlePath,
  logLevel: "warning",
  define: {
    "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "https://example.invalid", VITE_SUPABASE_ANON_KEY: "anon" }),
  },
});
const { prepareAccountOnboardingSubmit } = await import(pathToFileURL(onboardingBundlePath).href);
const prepare = (age, birthMonth, birthDay, extra) => prepareAccountOnboardingSubmit({
  authUserId: "user-1",
  userProfile: {
    nickname: "Ann", nativeLanguage: "en", practiceLanguage: "es", languageLevel: "A1",
    age, birthMonth, birthDay, onboardingCompleted: false,
  },
  yourLanguage: "en",
  practiceLanguage: "es",
  ...extra,
});
const localDate = (iso, zone) => calendarDateInTimeZone(new Date(iso), zone);

await test("Honolulu, Feb 28 -> Mar 1: validated on the local date and that zone is returned for the request", () => {
  const today = localDate("2026-03-01T06:00:00Z", "Pacific/Honolulu");
  assert.deepEqual(today, d(2026, 2, 28));
  const result = prepare(17, "02", "29", { timeZone: "Pacific/Honolulu", today });
  assert.equal(result.ok, true);
  assert.equal(result.timeZone, "Pacific/Honolulu");
  assert.equal(inferBirthYear(17, 2, 29, today), 2008);
});
await test("Tokyo, 16th birthday on Feb 29: accepted with that zone", () => {
  const today = localDate("2028-02-28T15:30:00Z", "Asia/Tokyo");
  assert.deepEqual(today, d(2028, 2, 29));
  const result = prepare(16, "02", "29", { timeZone: "Asia/Tokyo", today });
  assert.equal(result.ok, true);
  assert.equal(result.timeZone, "Asia/Tokyo");
});
await test("under 16 rejected; claiming 16 the day before a Feb 29 16th birthday is rejected", () => {
  assert.equal(prepare(15, "06", "15", { timeZone: "UTC", today: d(2026, 11, 6) }).errorKey, "accountOnboarding.errors.ageMinimum");
  const today = localDate("2028-02-29T06:00:00Z", "Pacific/Honolulu"); // Feb 28, 20:00 locally
  assert.equal(prepare(16, "02", "29", { timeZone: "Pacific/Honolulu", today }).errorKey, "accountOnboarding.errors.birthDateLeapDay");
});
await test("the zone is detected once when not injected, and null passes through", () => {
  assert.equal(prepare(30, "06", "15", { today: d(2026, 6, 15) }).timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(prepare(30, "06", "15", { timeZone: null, today: d(2026, 6, 15) }).timeZone, null);
  const source = read("src/app/utils/accountOnboarding.ts");
  assert.equal(source.match(/detectBrowserTimezone\(\)/g)?.length, 1, "one detection");
  assert.match(source, /calendarDateInTimeZone\(new Date\(\), timeZone\)/, "validation uses that value");
  assert.match(read("src/app/hooks/useAccountOnboarding.ts"), /timeZone: submitPreparation\.timeZone/, "the request uses that value");
});
await test("UTC midnight, positive/negative offsets, Dec 31 -> Jan 1 (client calendar)", () => {
  assert.deepEqual(localDate("2026-02-28T23:59:59.999Z", "UTC"), d(2026, 2, 28));
  assert.deepEqual(localDate("2026-03-01T00:00:00.000Z", "UTC"), d(2026, 3, 1));
  assert.deepEqual(localDate("2026-02-28T10:00:00Z", "Pacific/Kiritimati"), d(2026, 3, 1));
  assert.deepEqual(localDate("2026-03-01T11:59:00Z", "Etc/GMT+12"), d(2026, 2, 28));
  assert.equal(ageOn(2010, 1, 1, localDate("2026-12-31T20:00:00Z", "Asia/Tokyo")), 17);
  assert.equal(ageOn(2010, 1, 1, localDate("2026-12-31T20:00:00Z", "America/New_York")), 16);
});
await test("TS mirror: an honest declaration validated in any zone infers the true birth year on that zone's date", () => {
  const HOUR = 3_600_000;
  const zones = ["Pacific/Kiritimati", "Pacific/Auckland", "Asia/Tokyo", "Asia/Kolkata", "Europe/Berlin", "UTC",
    "America/Sao_Paulo", "America/New_York", "Pacific/Honolulu", "Pacific/Pago_Pago", "Etc/GMT+12"];
  let checked = 0;
  for (const [birthYear, month, day, from, to] of [
    [2008, 2, 29, "2026-02-27T00:00:00Z", "2026-03-03T00:00:00Z"],
    [2012, 2, 29, "2028-02-27T00:00:00Z", "2028-03-03T00:00:00Z"],
    [2010, 1, 1, "2026-12-30T00:00:00Z", "2027-01-02T00:00:00Z"],
    [2009, 6, 15, "2026-06-13T00:00:00Z", "2026-06-17T00:00:00Z"],
  ]) {
    for (let ms = Date.parse(from); ms <= Date.parse(to); ms += HOUR) {
      for (const zone of zones) {
        const local = calendarDateInTimeZone(new Date(ms), zone);
        const age = ageOn(birthYear, month, day, local);
        if (age < 16) continue;
        checked += 1;
        assert.equal(getDeclaredAgeIssue(age, month, day, local), null);
        assert.equal(inferBirthYear(age, month, day, local), birthYear, `${zone} ${new Date(ms).toISOString()}`);
      }
    }
  }
  assert.ok(checked > 1000);
});

const fixSql = read("supabase/migrations/20261106120000_fix_onboarding_leap_day_utc_boundary.sql").replace(/\r\n/g, "\n");
const fixFn = fixSql.match(/create or replace function public\.complete_user_profile_onboarding\([\s\S]*?\$function\$;/)?.[0];
const helperFn = fixSql.match(/create or replace function public\.onboarding_reference_date\([\s\S]*?\$function\$;/)?.[0];
const NEW_SIGNATURE = "text, text, text, text, integer, integer, integer, text";
await test("migration: old 7-argument function dropped, 8-argument one with p_timezone DEFAULT NULL", () => {
  assert.ok(fixFn && helperFn);
  assert.match(fixSql, /drop function if exists public\.complete_user_profile_onboarding\(text, text, text, text, integer, integer, integer\);/);
  assert.ok(fixSql.indexOf("drop function if exists public.complete_user_profile_onboarding") < fixSql.indexOf(fixFn));
  assert.match(fixFn, /p_birth_day integer,\n {2}p_timezone text default null\n\)/);
});
await test("migration: applied body otherwise byte-identical (only the v_today source changes)", () => {
  const original = fn("complete_user_profile_onboarding").replace(/\r\n/g, "\n");
  const reverted = fixFn
    .replace("  p_birth_day integer,\n  p_timezone text default null\n)", "  p_birth_day integer\n)")
    .replace(
      /  -- Stored zone first[^\n]*\n  -- else UTC[^\n]*\n  v_today := public\.onboarding_reference_date\(v_stored_timezone, p_timezone, v_now\);/,
      "  v_today := public.user_local_date(v_stored_timezone);",
    );
  assert.equal(reverted, original);
});
await test("migration: helper takes an explicit instant; stored zone wins, then supplied, unknown -> UTC", () => {
  assert.match(helperFn, /p_stored_timezone text,\s*p_timezone text,\s*p_at timestamptz/);
  assert.match(helperFn, /p_at at time zone coalesce\(/);
  assert.match(helperFn, /where tzn\.name = coalesce\(p_stored_timezone, p_timezone\)/);
  assert.match(helperFn, /'UTC'\)\)::date/);
  assert.doesNotMatch(helperFn, /now\(\)|user_profiles|insert|update/i);
});
await test("migration: p_timezone is never written; age and Feb 29 checks untouched", () => {
  assert.doesNotMatch(fixFn, /set_config|timezone =|timezone_updated_at =/);
  assert.doesNotMatch(fixFn.match(/insert into public\.user_profiles \(([\s\S]*?)\)/)[1], /timezone/);
  assert.match(fixFn, /p_user_age < 16 or p_user_age > 100/);
  assert.match(fixFn, /February 29 does not exist in the birth year implied by p_user_age/);
  assert.doesNotMatch(fixSql, /alter table|add column|update public\.|delete from|truncate/i);
});
await test("migration: privileges; helper not callable by anon/authenticated", () => {
  assert.match(fixSql, new RegExp(`revoke execute on function public\\.complete_user_profile_onboarding\\(${NEW_SIGNATURE}\\) from public, anon;`));
  assert.match(fixSql, new RegExp(`grant execute on function public\\.complete_user_profile_onboarding\\(${NEW_SIGNATURE}\\) to postgres, authenticated, service_role;`));
  assert.match(fixSql, /revoke execute on function public\.onboarding_reference_date\(text, text, timestamptz\) from public, anon, authenticated;/);
  assert.match(fixSql, /grant execute on function public\.onboarding_reference_date\(text, text, timestamptz\) to postgres, service_role;/);
  assert.match(fixFn, /security definer/);
});
await test("migration: one transaction; aborts unless exactly the new signature remains", () => {
  const statements = fixSql.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("--"));
  assert.equal(statements[0], "begin;");
  assert.equal(statements.at(-1), "commit;");
  assert.equal((fixSql.match(/^\s*(begin|commit);/gim) ?? []).length, 2);
  assert.match(fixSql, /p_user_age integer, p_birth_month integer, p_birth_day integer, p_timezone text'\n {2}\] then\n {4}raise exception/);
  assert.ok(fixSql.indexOf("raise exception 'complete_user_profile_onboarding: unexpected signatures") < fixSql.lastIndexOf("notify pgrst, 'reload schema';"));
  assert.ok(fixSql.indexOf("notify pgrst, 'reload schema';") < fixSql.lastIndexOf("commit;"));
});
await test("pgTAP suite exists, is self-contained, and rolls back", () => {
  const tap = read("supabase/tests/database/onboarding_leap_day_time_zone.test.sql");
  assert.match(tap, /^begin;$/m);
  assert.match(tap, /select \* from finish\(\);\s*rollback;\s*$/);
  for (const needle of ["Pacific/Honolulu", "Asia/Tokyo", "Pacific/Kiritimati", "Etc/GMT+12", "Not/AZone",
    "exactly one complete_user_profile_onboarding", "seven-argument call still works", "stored zone takes precedence",
    "under 16 is rejected", "anon may not call the RPC", "anon may not call the helper"]) {
    assert.ok(tap.includes(needle), needle);
  }
  assert.doesNotMatch(tap, /supabase\.co|service_role_key|password/i, "no hosted project or secrets");
});
await test("CI: database tests run only for supabase/ changes, locally, with no secrets", () => {
  const workflow = read(".github/workflows/database-tests.yml");
  assert.match(workflow, /paths:\n\s+- "supabase\/\*\*"/);
  assert.match(workflow, /supabase db start/);
  assert.match(workflow, /supabase test db/);
  assert.doesNotMatch(workflow, /secrets\.|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|db push|--linked|link /);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("account-age tests passed");
}
