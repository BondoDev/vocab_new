// Direct behavioral coverage for the profile-load merge/fallback logic and
// the account-onboarding open decision (test/profile-load-and-onboarding,
// 2026-08-07) — the confirmed test-coverage gap left after the profile-write
// narrow-RPC work (see scripts/tests/architecture/test-user-profiles-narrow-write-boundary.mjs)
// and the language-sync fix (scripts/tests/account/test-account-language-sync.mjs).
//
// Exercises the real production code, not a reimplementation of it:
// src/app/utils/accountProfileCompleteness.ts (normalizeUserProfile,
// isUserProfileComplete, and their per-field normalizers — moved out of
// src/lib/userProfile.ts by this same task specifically so this file can
// load them directly) and src/app/utils/accountProfile.ts
// (buildMergedUserProfile, buildFallbackUserProfile,
// shouldOpenAccountOnboarding), both loaded via Node's native TypeScript
// stripping.
//
// src/lib/userProfile.ts itself (readSupabaseUserProfile, writeStoredUserProfile,
// ...) and src/app/hooks/useUserProfileLoad.ts cannot be loaded this way: the
// former pulls in src/lib/supabaseAuth.ts, which reads import.meta.env at
// module scope (a Vite-only construct) and uses the codebase's dominant
// extensionless-relative-import convention throughout its own dependency
// chain — the same "cannot be loaded directly without a bundler" constraint
// test-account-language-sync.mjs documents for useAccountLanguageConfirm.ts/
// useAccountOnboarding.ts. useUserProfileLoad's own effect/lifecycle
// contract (single fetch per authUserId, stale-response guarding, state
// resets) is instead pinned below as source-text/data-flow checks — see
// section [5] — because this repository has no React hook-execution test
// harness (no vitest/jest/@testing-library dependency; every existing test
// here is a plain Node script) and adding one is out of scope for a
// test-coverage task.
//
// Run: node --experimental-strip-types scripts/tests/account/test-profile-load-and-onboarding.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeUserProfile,
  buildStoredUserProfile,
  isUserProfileComplete,
} from "../../../src/app/utils/accountProfileCompleteness.ts";
import {
  buildMergedUserProfile,
  buildFallbackUserProfile,
  shouldOpenAccountOnboarding,
} from "../../../src/app/utils/accountProfile.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

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

// A fully complete, onboarded profile — every case below is expressed as a
// deviation from this baseline so each test isolates exactly one field.
const COMPLETE_PROFILE = {
  nickname: "Nini",
  languageLevel: "B1",
  age: 25,
  birthMonth: "05",
  birthDay: "20",
  nativeLanguage: "en",
  practiceLanguage: "es",
  onboardingCompleted: true,
  dailyGoal: 15,
  updatedAt: "2026-08-01T00:00:00.000Z",
  timezone: "Asia/Tbilisi",
  timezoneUpdatedAt: "2026-08-01T00:00:00.000Z",
};

function withField(overrides) {
  return { ...COMPLETE_PROFILE, ...overrides };
}

async function main() {
  console.log("\n[1] shouldOpenAccountOnboarding — onboarding-open decision");

  test("no Supabase profile row at all (profile === null): opens", () => {
    assert.equal(shouldOpenAccountOnboarding(false, null), true);
  });

  test("no Supabase profile row, even with an otherwise-complete in-memory profile: opens", () => {
    // hasSupabaseProfileRow=false short-circuits the OR regardless of the
    // profile argument's own completeness — the account genuinely has no
    // saved row yet, so onboarding must run no matter what's cached locally.
    assert.equal(shouldOpenAccountOnboarding(false, COMPLETE_PROFILE), true);
  });

  test("Supabase row exists but profile is entirely empty: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, {}), true);
    assert.equal(shouldOpenAccountOnboarding(true, null), true);
    assert.equal(shouldOpenAccountOnboarding(true, undefined), true);
  });

  test("Supabase row exists and profile is fully complete: does not open", () => {
    assert.equal(shouldOpenAccountOnboarding(true, COMPLETE_PROFILE), false);
  });

  test("onboarding_completed=false with otherwise-complete fields: does not open (documented current behavior)", () => {
    // shouldOpenAccountOnboarding delegates completeness to
    // isUserProfileComplete, which normalizes and checks only the seven
    // required fields — it never inspects onboardingCompleted itself. A
    // profile row saved with onboarding_completed=false but every required
    // field already valid is therefore treated as complete and does NOT
    // reopen onboarding. This is the real, current behavior of the shipped
    // code, pinned as-is per this task's "do not invent desired behavior"
    // instruction — not a claim that it's the only sensible choice.
    const profile = withField({ onboardingCompleted: false });
    assert.equal(isUserProfileComplete(profile), true);
    assert.equal(shouldOpenAccountOnboarding(true, profile), false);
  });

  test("missing nickname: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ nickname: "" })), true);
  });

  test("whitespace-only nickname normalizes to empty and opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ nickname: "   " })), true);
  });

  test("missing native language: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ nativeLanguage: "" })), true);
  });

  test("invalid native language code: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ nativeLanguage: "xx" })), true);
  });

  test("missing practice/learning language: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ practiceLanguage: "" })), true);
  });

  test("invalid practice language code: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ practiceLanguage: "xx" })), true);
  });

  test("missing CEFR level: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ languageLevel: "" })), true);
  });

  test("invalid CEFR level code: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ languageLevel: "Z9" })), true);
  });

  test("missing age: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ age: null })), true);
  });

  test("age below the valid range (9): opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ age: 9 })), true);
  });

  test("age above the valid range (101): opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ age: 101 })), true);
  });

  test("age given as a non-numeric value: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ age: "25" })), true);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ age: Number.NaN })), true);
  });

  test("age at the valid boundaries (10 and 100): does not open", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ age: 10 })), false);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ age: 100 })), false);
  });

  test("missing/invalid birth month: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthMonth: "" })), true);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthMonth: "13" })), true);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthMonth: "00" })), true);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthMonth: "5" })), true);
  });

  test("birth month at the valid boundaries (01 and 12): does not open", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthMonth: "01" })), false);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthMonth: "12" })), false);
  });

  test("missing/invalid birth day: opens", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthDay: "" })), true);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthDay: "32" })), true);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthDay: "00" })), true);
  });

  test("birth day at the valid boundaries (01 and 31): does not open", () => {
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthDay: "01" })), false);
    assert.equal(shouldOpenAccountOnboarding(true, withField({ birthDay: "31" })), false);
  });

  console.log("\n[2] buildMergedUserProfile — Supabase row present and complete");

  test("authoritative saved profile wins for every saved field over local cache and current selection", () => {
    const storedProfile = {
      nickname: "OldCachedNick",
      languageLevel: "A1",
      age: 12,
      birthMonth: "01",
      birthDay: "01",
      nativeLanguage: "fr",
      practiceLanguage: "de",
      onboardingCompleted: true,
      dailyGoal: 10,
      updatedAt: "2026-01-01T00:00:00.000Z",
      timezone: "Europe/Paris",
      timezoneUpdatedAt: "2026-01-01T00:00:00.000Z",
    };
    const supabaseProfile = {
      nickname: "NewSavedNick",
      languageLevel: "B2",
      age: 30,
      birthMonth: "06",
      birthDay: "15",
      nativeLanguage: "en",
      practiceLanguage: "es",
      onboardingCompleted: true,
      dailyGoal: 30,
      updatedAt: "2026-08-01T00:00:00.000Z",
      timezone: "Asia/Tbilisi",
      timezoneUpdatedAt: "2026-08-01T00:00:00.000Z",
    };

    const merged = buildMergedUserProfile({
      storedProfile,
      supabaseProfile,
      // A stale anonymous/live selection distinct from every saved value —
      // must not win over the account's real saved languages.
      yourLanguage: "it",
      practiceLanguage: "ru",
    });

    assert.equal(merged.nickname, "NewSavedNick");
    assert.equal(merged.languageLevel, "B2");
    assert.equal(merged.age, 30);
    assert.equal(merged.birthMonth, "06");
    assert.equal(merged.birthDay, "15");
    assert.equal(merged.nativeLanguage, "en");
    assert.equal(merged.practiceLanguage, "es");
    assert.equal(merged.onboardingCompleted, true);
  });

  test("complete saved language pair wins over a stale anonymous/local language selection", () => {
    const merged = buildMergedUserProfile({
      storedProfile: { nativeLanguage: "fr", practiceLanguage: "de" },
      supabaseProfile: { nativeLanguage: "en", practiceLanguage: "es" },
      yourLanguage: "it",
      practiceLanguage: "ru",
    });
    assert.equal(merged.nativeLanguage, "en");
    assert.equal(merged.practiceLanguage, "es");
  });

  test("a supported saved daily goal is preserved as-is", () => {
    const merged = buildMergedUserProfile({
      storedProfile: { dailyGoal: 10 },
      supabaseProfile: { dailyGoal: 30 },
      yourLanguage: "en",
      practiceLanguage: "es",
    });
    assert.equal(merged.dailyGoal, 30);
  });

  test("a saved timezone is preserved as-is", () => {
    const merged = buildMergedUserProfile({
      storedProfile: { timezone: "Europe/Paris" },
      supabaseProfile: { timezone: "Asia/Tbilisi" },
      yourLanguage: "en",
      practiceLanguage: "es",
    });
    assert.equal(merged.timezone, "Asia/Tbilisi");
  });

  console.log("\n[3] buildMergedUserProfile / buildFallbackUserProfile — missing Supabase row");

  test("with no Supabase row, the local/cached profile is used as-is (current design)", () => {
    const merged = buildMergedUserProfile({
      storedProfile: { nickname: "CachedNick", nativeLanguage: "fr", practiceLanguage: "de" },
      supabaseProfile: null,
      yourLanguage: "",
      practiceLanguage: "",
    });
    assert.equal(merged.nickname, "CachedNick");
    assert.equal(merged.nativeLanguage, "fr");
    assert.equal(merged.practiceLanguage, "de");
  });

  test("with no Supabase row and no local cache, current live language selection fills the pair", () => {
    const merged = buildMergedUserProfile({
      storedProfile: null,
      supabaseProfile: null,
      yourLanguage: "en",
      practiceLanguage: "es",
    });
    assert.equal(merged.nativeLanguage, "en");
    assert.equal(merged.practiceLanguage, "es");
    assert.equal(merged.nickname, "");
  });

  test("with no Supabase row, the resulting profile is never fabricated as complete, and onboarding is required", () => {
    const merged = buildMergedUserProfile({
      storedProfile: { nickname: "CachedNick", nativeLanguage: "fr", practiceLanguage: "de" },
      supabaseProfile: null,
      yourLanguage: "",
      practiceLanguage: "",
    });
    assert.equal(isUserProfileComplete(merged), false);
    assert.equal(shouldOpenAccountOnboarding(false, merged), true);
  });

  test("buildFallbackUserProfile (the failed-load path) matches buildMergedUserProfile's no-Supabase-row behavior", () => {
    const fallback = buildFallbackUserProfile({
      storedProfile: { nickname: "CachedNick", nativeLanguage: "fr", practiceLanguage: "de" },
      yourLanguage: "",
      practiceLanguage: "",
    });
    assert.equal(fallback.nickname, "CachedNick");
    assert.equal(fallback.nativeLanguage, "fr");
    assert.equal(fallback.practiceLanguage, "de");
    assert.equal(isUserProfileComplete(fallback), false);
  });

  console.log("\n[4] buildMergedUserProfile — partial Supabase profile (row exists but incomplete)");

  // Simulates a real profile-load merge: a previously fully-onboarded local
  // cache (a different device, or a stale cache predating a server-side
  // reset) meeting a freshly-created-but-not-yet-onboarded Supabase row
  // (only nickname/onboarding_completed=false present; every other field is
  // still at its own not-yet-set default, exactly as
  // src/lib/userProfile.ts's fromSupabaseProfileRow would produce for such
  // a row).
  const staleCompleteCache = {
    nickname: "OldCachedNick",
    languageLevel: "B1",
    age: 25,
    birthMonth: "05",
    birthDay: "20",
    nativeLanguage: "en",
    practiceLanguage: "es",
    onboardingCompleted: true,
    dailyGoal: 30,
    updatedAt: "2026-01-01T00:00:00.000Z",
    timezone: "Europe/Paris",
    timezoneUpdatedAt: "2026-01-01T00:00:00.000Z",
  };
  const freshPartialRow = {
    nickname: "",
    languageLevel: "",
    age: null,
    birthMonth: "",
    birthDay: "",
    nativeLanguage: "",
    practiceLanguage: "",
    onboardingCompleted: false,
    dailyGoal: 15, // fromSupabaseProfileRow's normalizeDailyGoal(null) default
    updatedAt: "2026-08-01T00:00:00.000Z",
    timezone: null,
    timezoneUpdatedAt: null,
  };
  const partialMerge = buildMergedUserProfile({
    storedProfile: staleCompleteCache,
    supabaseProfile: freshPartialRow,
    yourLanguage: "fr",
    practiceLanguage: "de",
  });

  test("nickname/native/practice language fall back to the local cache when the Supabase row's own value is blank", () => {
    assert.equal(partialMerge.nickname, "OldCachedNick");
    assert.equal(partialMerge.nativeLanguage, "en");
    assert.equal(partialMerge.practiceLanguage, "es");
  });

  test("every other field takes the (blank/default) Supabase value even when the local cache had a complete one — no OR-fallback for these fields", () => {
    assert.equal(partialMerge.languageLevel, "");
    assert.equal(partialMerge.age, null);
    assert.equal(partialMerge.birthMonth, "");
    assert.equal(partialMerge.birthDay, "");
  });

  test("daily goal takes the Supabase row's default (15), not the locally cached value (30)", () => {
    assert.equal(partialMerge.dailyGoal, 15);
  });

  test("timezone takes the Supabase row's null, not the locally cached value", () => {
    assert.equal(partialMerge.timezone, null);
  });

  test("onboarding flag is false: the raw Supabase flag is false, and the merged fields are also incomplete", () => {
    assert.equal(partialMerge.onboardingCompleted, false);
    assert.equal(isUserProfileComplete(partialMerge), false);
    assert.equal(shouldOpenAccountOnboarding(true, partialMerge), true);
  });

  test("normalizeUserProfile's onboardingCompleted also requires the raw flag itself (not just field completeness) — distinct from isUserProfileComplete", () => {
    // A hand-built merge input where every required field is present but
    // the raw onboardingCompleted flag is false: normalizeUserProfile ANDs
    // the raw flag with completeness, so the *stored* onboardingCompleted
    // ends up false even though isUserProfileComplete (which never looks at
    // the flag) reports the profile as complete. This is the source of the
    // "onboarding_completed=false with otherwise-complete fields" case
    // covered in section [1].
    const merged = buildMergedUserProfile({
      storedProfile: null,
      supabaseProfile: { ...COMPLETE_PROFILE, onboardingCompleted: false },
      yourLanguage: "",
      practiceLanguage: "",
    });
    assert.equal(merged.onboardingCompleted, false);
    assert.equal(isUserProfileComplete(merged), true);
    assert.equal(shouldOpenAccountOnboarding(true, merged), false);
  });

  console.log("\n[5] normalizeUserProfile — invalid stored value fallback (read-side normalizers)");

  test("an unsupported language code normalizes to empty, not passed through", () => {
    const normalized = normalizeUserProfile(withField({ nativeLanguage: "zz" }));
    assert.equal(normalized.nativeLanguage, "");
  });

  test("an invalid CEFR level normalizes to empty, not passed through", () => {
    const normalized = normalizeUserProfile(withField({ languageLevel: "Z9" }));
    assert.equal(normalized.languageLevel, "");
    // Case-sensitive: the exact five codes only.
    assert.equal(normalizeUserProfile(withField({ languageLevel: "b1" })).languageLevel, "");
  });

  test("an unsupported daily goal falls back to the default (15), not rounded or clamped", () => {
    assert.equal(normalizeUserProfile(withField({ dailyGoal: 25 })).dailyGoal, 15);
    assert.equal(normalizeUserProfile(withField({ dailyGoal: -5 })).dailyGoal, 15);
    assert.equal(normalizeUserProfile(withField({ dailyGoal: 0 })).dailyGoal, 15);
    // A numeric-looking string is not a number — still falls back.
    assert.equal(normalizeUserProfile(withField({ dailyGoal: "15" })).dailyGoal, 15);
  });

  test("a malformed numeric age (string, NaN, non-finite) normalizes to null, not coerced", () => {
    assert.equal(normalizeUserProfile(withField({ age: "25" })).age, null);
    assert.equal(normalizeUserProfile(withField({ age: Number.NaN })).age, null);
    assert.equal(normalizeUserProfile(withField({ age: Infinity })).age, null);
  });

  test("a malformed birth month/day (wrong type or digit count) normalizes to empty, not coerced", () => {
    assert.equal(normalizeUserProfile(withField({ birthMonth: 5 })).birthMonth, "");
    assert.equal(normalizeUserProfile(withField({ birthDay: 3 })).birthDay, "");
    assert.equal(normalizeUserProfile(withField({ birthMonth: "5" })).birthMonth, "");
  });

  test("nickname is trimmed and capped at 40 characters", () => {
    assert.equal(normalizeUserProfile(withField({ nickname: "  Nini  " })).nickname, "Nini");
    const longNickname = "N".repeat(50);
    assert.equal(normalizeUserProfile(withField({ nickname: longNickname })).nickname.length, 40);
  });

  console.log("\n[6] useUserProfileLoad lifecycle — data-flow/structural guards");
  console.log("    (hook-level execution is impractical here: no React hook-testing harness");
  console.log("     — no vitest/jest/@testing-library dependency — exists in this repository,");
  console.log("     and useUserProfileLoad's own import chain pulls in supabaseAuth.ts's");
  console.log("     import.meta.env/extensionless-import chain, so it cannot be loaded directly");
  console.log("     by a bundler-free Node script either. These checks pin the lifecycle");
  console.log("     contract structurally instead — the same tradeoff documented in");
  console.log("     test-account-language-sync.mjs and test-learning-profile-data-flow.mjs.)");

  console.log("\n[6] stored profile timestamp ownership");

  test("writeStoredUserProfile normalization preserves the supplied authoritative server updatedAt", () => {
    const serverTimestamp = "2026-08-07T10:11:12.000Z";
    const stored = buildStoredUserProfile(withField({ updatedAt: serverTimestamp }));
    assert.equal(stored.updatedAt, serverTimestamp);
  });

  test("writeStoredUserProfile normalization leaves updatedAt null when no authoritative server value is supplied", () => {
    const stored = buildStoredUserProfile(withField({ updatedAt: null }));
    assert.equal(stored.updatedAt, null);
  });

  test("onboarding storage merge preserves complete_user_profile_onboarding's returned server updated_at", () => {
    const requestProfile = withField({
      nickname: "RequestNick",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const rpcProfile = {
      nickname: "ServerNick",
      updatedAt: "2026-08-07T10:11:12.000Z",
    };
    const stored = buildStoredUserProfile({ ...requestProfile, ...rpcProfile });
    assert.equal(stored.nickname, "ServerNick");
    assert.equal(stored.updatedAt, "2026-08-07T10:11:12.000Z");
  });

  test("profile storage code does not generate a browser timestamp for updatedAt", () => {
    const source = read("src/lib/userProfile.ts");
    const match = source.match(/export function writeStoredUserProfile\([\s\S]*?\n\}/);
    assert.ok(match, "could not locate writeStoredUserProfile");
    assert.doesNotMatch(match[0], /new Date\(|Date\.now\(|toISOString\(/);
  });

  const loadHookSource = read("src/app/hooks/useUserProfileLoad.ts");
  const effectBodyMatch = loadHookSource.match(
    /useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[authUserId\]\);/,
  );
  assert.ok(effectBodyMatch, "could not locate useUserProfileLoad's authUserId effect body");
  const effectBody = effectBodyMatch[1];

  test("no authUserId: resolves without ever calling readSupabaseUserProfile", () => {
    const guardMatch = effectBody.match(/if \(!authUserId\) \{([\s\S]*?)\n {4}\}/);
    assert.ok(guardMatch, "could not locate the !authUserId early-return guard");
    assert.doesNotMatch(guardMatch[1], /readSupabaseUserProfile/);
    assert.match(guardMatch[1], /setIsProfileLoaded\(true\)/);
    assert.match(guardMatch[1], /return;/);
  });

  test("no authUserId: resets profile state to empty and closes onboarding (sign-out path)", () => {
    const guardMatch = effectBody.match(/if \(!authUserId\) \{([\s\S]*?)\n {4}\}/);
    assert.match(guardMatch[1], /setUserProfile\(EMPTY_USER_PROFILE\)/);
    assert.match(guardMatch[1], /setIsAccountOnboardingOpen\(false\)/);
    assert.match(guardMatch[1], /setAccountOnboardingError\(null\)/);
  });

  test("authenticated user: exactly one readSupabaseUserProfile call site in the load effect", () => {
    const matches = effectBody.match(/readSupabaseUserProfile\(/g) ?? [];
    assert.equal(matches.length, 1, "expected exactly one readSupabaseUserProfile call site");
  });

  test("authUserId change: isProfileLoaded is reset to false synchronously, before the async fetch starts", () => {
    // Must appear before the `void (async () => {` IIFE so a user switch is
    // never briefly reported as "loaded" using the previous user's data.
    const resetIndex = effectBody.indexOf("setIsProfileLoaded(false)");
    const asyncIndex = effectBody.indexOf("void (async ()");
    assert.ok(resetIndex !== -1 && asyncIndex !== -1, "could not locate both markers");
    assert.ok(resetIndex < asyncIndex, "setIsProfileLoaded(false) must run before the async fetch starts");
  });

  test("a stale in-flight response cannot overwrite newer user state: cancelled flag guards every state write after an await", () => {
    assert.match(effectBody, /let cancelled = false;/);
    // Guarded immediately after the Supabase read...
    assert.match(effectBody, /if \(cancelled\) \{\s*\n\s*return;\s*\n\s*\}/);
    // ...and the cleanup function sets it on unmount/re-run (authUserId change).
    assert.match(loadHookSource, /return \(\) => \{\s*\n\s*cancelled = true;\s*\n\s*\};/);
  });

  test("successful load updates userProfile, onboarding-open state, and isProfileLoaded together", () => {
    assert.match(effectBody, /setUserProfile\(nextProfile\)/);
    assert.match(
      effectBody,
      /setIsAccountOnboardingOpen\(\s*\n\s*shouldOpenAccountOnboarding\(hasSupabaseProfileRow, nextProfile\),?\s*\n\s*\)/,
    );
    assert.match(effectBody, /setIsProfileLoaded\(true\)/);
  });

  test("a missing Supabase row (hasSupabaseProfileRow=false) still resolves loading and still evaluates onboarding", () => {
    assert.match(effectBody, /const hasSupabaseProfileRow = Boolean\(supabaseProfile\);/);
    // The same setIsAccountOnboardingOpen/setIsProfileLoaded calls checked
    // above run unconditionally on the success path — hasSupabaseProfileRow
    // being false does not short-circuit them, only feeds into
    // shouldOpenAccountOnboarding's own decision (covered in section [1]).
  });

  test("a failed load (catch branch) still resolves loading and forces onboarding open (hasSupabaseProfileRow=true is hardcoded)", () => {
    const catchMatch = loadHookSource.match(/\} catch \(error\) \{([\s\S]*?)\r?\n\s*\}\)\(\);/);
    assert.ok(catchMatch, "could not locate the load effect's catch branch");
    assert.match(catchMatch[1], /setUserProfile\(fallbackProfile\)/);
    assert.match(
      catchMatch[1],
      /setIsAccountOnboardingOpen\(\s*\n\s*shouldOpenAccountOnboarding\(true, fallbackProfile\),?\s*\n\s*\)/,
    );
    assert.match(catchMatch[1], /setIsProfileLoaded\(true\)/);
  });

  test("timezone initialization only runs when signed in, a Supabase row exists, and no timezone is already set", () => {
    assert.match(
      effectBody,
      /if \(session && hasSupabaseProfileRow && !nextProfile\.timezone\) \{/,
    );
  });

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("profile-load-and-onboarding tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
