// Contract guard for Timezone Phase 1 browser detection and silent profile
// initialization.
//
// Run: node --experimental-strip-types scripts/tests/account/test-timezone-initialization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectBrowserTimezone,
} from "../../../src/app/utils/browserTimezone.ts";
import {
  parseCurrentLearningDateRpcResponse,
} from "../../../src/lib/learningDateValidation.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

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

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

console.log("\n=== timezone initialization frontend contract ===\n");

const originalIntl = globalThis.Intl;

test("1. Browser helper returns a trimmed timezone when Intl provides one", () => {
  globalThis.Intl = {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({ timeZone: "  Asia/Tbilisi  " }),
    }),
  };
  assert.equal(detectBrowserTimezone(), "Asia/Tbilisi");
});

test("2. Browser helper treats UTC as a valid detected timezone", () => {
  globalThis.Intl = {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({ timeZone: "UTC" }),
    }),
  };
  assert.equal(detectBrowserTimezone(), "UTC");
});

test("3. Browser helper safely returns null when Intl is unavailable", () => {
  globalThis.Intl = undefined;
  assert.equal(detectBrowserTimezone(), null);
});

test("4. Browser helper safely returns null on DateTimeFormat failure or empty values", () => {
  globalThis.Intl = {
    DateTimeFormat: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(detectBrowserTimezone(), null);

  globalThis.Intl = {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({ timeZone: "   " }),
    }),
  };
  assert.equal(detectBrowserTimezone(), null);
});

globalThis.Intl = originalIntl;

const userProfileSource = read("src/lib/userProfile.ts");
const userProfileTimezoneSource = read("src/lib/userProfileTimezone.ts");
const loadHookSource = read("src/app/hooks/useUserProfileLoad.ts");
const learningDateSource = read("src/lib/learningDate.ts");
const learningDateValidationSource = read("src/lib/learningDateValidation.ts");

test("5. Profile load selects timezone and timezone_updated_at", () => {
  assert.match(userProfileSource, /select=id,nickname,native_language,learning_language,current_level,user_age,birth_month,birth_day,onboarding_completed,daily_goal,updated_at,timezone,timezone_updated_at/);
});

test("6. UserProfile represents timezone as nullable and does not force UTC", () => {
  assert.match(userProfileSource, /timezone:\s*string \| null/);
  assert.match(userProfileSource, /timezoneUpdatedAt:\s*string \| null/);
  assert.match(userProfileSource, /timezone:\s*null/);
  assert.doesNotMatch(userProfileSource, /timezone:\s*"UTC"/);
});

test("7. Neither narrow profile RPC's request body sends timezone fields (Profile Phase 1 removed the generic upsert entirely)", () => {
  assert.doesNotMatch(
    userProfileSource,
    /function toSupabaseProfilePatch/,
    "the broad generic profile upsert must no longer exist",
  );
  const onboardingFnMatch = userProfileSource.match(/export async function completeUserProfileOnboarding\(([\s\S]*?)\r?\n\}/);
  const languagesFnMatch = userProfileSource.match(/export async function updateUserProfileLanguages\(([\s\S]*?)\r?\n\}/);
  assert.ok(onboardingFnMatch, "completeUserProfileOnboarding must exist");
  assert.ok(languagesFnMatch, "updateUserProfileLanguages must exist");
  const onboardingBodyMatch = onboardingFnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/);
  const languagesBodyMatch = languagesFnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/);
  assert.ok(onboardingBodyMatch, "completeUserProfileOnboarding must send a JSON request body");
  assert.ok(languagesBodyMatch, "updateUserProfileLanguages must send a JSON request body");
  assert.doesNotMatch(onboardingBodyMatch[1], /\btimezone\b|timezone_updated_at|p_timezone/i);
  assert.doesNotMatch(languagesBodyMatch[1], /\btimezone\b|timezone_updated_at|p_timezone/i);
});

test("8. Timezone initialization uses the narrow RPC helper", () => {
  assert.match(userProfileSource, /export async function initializeUserTimezone/);
  assert.match(userProfileSource, /"\/rest\/v1\/rpc\/initialize_user_timezone"/);
  assert.match(userProfileSource, /body: JSON\.stringify\(\{ p_timezone: timezone \}\)/);
});

test("8a. RPC response parser preserves initialized=false without boolean coercion", () => {
  assert.match(userProfileTimezoneSource, /initialized:\s*rpcRow\.initialized/);
  assert.doesNotMatch(userProfileTimezoneSource, /Boolean\(\s*rpcRow\.initialized\s*\)|Boolean\(\s*row\.initialized\s*\)/);
});

test("8b. RPC response parser rejects malformed rows instead of coercing values", () => {
  assert.match(userProfileTimezoneSource, /!row \|\| typeof row !== "object" \|\| Array\.isArray\(row\)/);
  assert.match(userProfileTimezoneSource, /typeof rpcRow\.initialized !== "boolean"/);
  assert.match(userProfileTimezoneSource, /initialized must be a boolean/);
  assert.match(userProfileTimezoneSource, /requireInitializeUserTimezoneString\(rpcRow\.timezone, "timezone"\)/);
  assert.match(userProfileTimezoneSource, /requireInitializeUserTimezoneString\(rpcRow\.timezone_updated_at, "timezone_updated_at"\)/);
  assert.match(userProfileTimezoneSource, /typeof value !== "string" \|\| !value\.trim\(\)/);
  assert.match(userProfileTimezoneSource, /ClassifiedSupabaseError\([\s\S]*"unexpected_response"/);
  assert.doesNotMatch(userProfileTimezoneSource, /normalizeTimezone|normalizeTimestamp/);
});

test("9. Profile load initializes only for authenticated existing profiles with null timezone", () => {
  assert.match(loadHookSource, /if \(session && hasSupabaseProfileRow && !nextProfile\.timezone\)/);
  assert.match(loadHookSource, /detectBrowserTimezone\(\)/);
  assert.match(loadHookSource, /initializeUserTimezone\(session, detectedTimezone\)/);
});

test("10. Successful initialization updates shared profile state and preserves an existing in-memory timezone", () => {
  assert.match(loadHookSource, /setUserProfile\(\(current\) => \{/);
  assert.match(loadHookSource, /if \(current\.timezone\)\s*\{\s*return current;/);
  assert.match(loadHookSource, /timezone: result\.timezone/);
  assert.match(loadHookSource, /timezoneUpdatedAt: result\.timezoneUpdatedAt/);
});

test("11. Failed initialization is non-blocking and uses safe Supabase diagnostics", () => {
  const initStart = loadHookSource.indexOf("void initializeUserTimezone(session, detectedTimezone)");
  const initEnd = loadHookSource.indexOf("      } catch (error) {", initStart);
  assert.ok(initStart >= 0 && initEnd > initStart, "initializeUserTimezone promise chain must be found");
  const initBlock = loadHookSource.slice(initStart, initEnd);
  assert.match(initBlock, /catch\(\(error\) => \{/);
  assert.match(loadHookSource, /describeSupabaseError\("initializeUserTimezone", error\)/);
  assert.doesNotMatch(initBlock, /setIsProfileLoaded\(false\)/);
  assert.doesNotMatch(initBlock, /setIsAccountOnboardingOpen\(/);
});

test("12. No geolocation, IP lookup, offset storage, or timezone logging is introduced", () => {
  const timezoneSources = [
    read("src/app/utils/browserTimezone.ts"),
    loadHookSource,
    userProfileSource,
  ].join("\n");
  assert.doesNotMatch(timezoneSources, /geolocation|getCurrentPosition|watchPosition/i);
  assert.doesNotMatch(timezoneSources, /ipify|ipinfo|geoip|x-forwarded-for|getTimezoneOffset/i);
  assert.doesNotMatch(timezoneSources, /console\.log\([^)]*timezone/i);
});

test("13. Server learning-date RPC has no browser-date fallback", () => {
  assert.match(learningDateSource, /"\/rest\/v1\/rpc\/get_current_learning_date"/);
  assert.match(learningDateSource, /parseCurrentLearningDateRpcResponse/);
  assert.match(learningDateValidationSource, /LEARNING_DATE_PATTERN/);
  assert.match(learningDateValidationSource, /Date\.UTC/);
  assert.doesNotMatch(`${learningDateSource}\n${learningDateValidationSource}`, /Date\.parse|getLocalCalendarDateISO|Date\.now/);
});

test("14. Server learning-date parser accepts exactly one valid row", () => {
  assert.equal(parseCurrentLearningDateRpcResponse([{ stat_date: "2026-02-28" }]), "2026-02-28");
});

test("15. Server learning-date parser rejects invalid response shapes", () => {
  assert.throws(() => parseCurrentLearningDateRpcResponse([]), /unexpected row count/);
  assert.throws(() => parseCurrentLearningDateRpcResponse([{ stat_date: "2026-02-28" }, { stat_date: "2026-03-01" }]), /unexpected row count/);
  assert.throws(() => parseCurrentLearningDateRpcResponse({ stat_date: "2026-02-28" }), /non-array response/);
  assert.throws(() => parseCurrentLearningDateRpcResponse([null]), /malformed row/);
  assert.throws(() => parseCurrentLearningDateRpcResponse([["2026-02-28"]]), /malformed row/);
  assert.throws(() => parseCurrentLearningDateRpcResponse([{ value: "2026-02-28" }]), /malformed date/);
});

test("16. Server learning-date parser rejects malformed or impossible calendar dates", () => {
  for (const badDate of [
    "2026-13-01",
    "2026-00-10",
    "2026-01-00",
    "2026-02-30",
    "2025-02-29",
    " 2026-02-28",
    "2026-02-28 ",
    "date=2026-02-28",
  ]) {
    assert.throws(() => parseCurrentLearningDateRpcResponse([{ stat_date: badDate }]), /malformed date/);
  }
});

test("17. Server learning-date parser accepts valid leap day", () => {
  assert.equal(parseCurrentLearningDateRpcResponse([{ stat_date: "2024-02-29" }]), "2024-02-29");
});

console.log(`\n-----------------------------------------`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`-----------------------------------------\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("timezone initialization frontend contract passed");
}
