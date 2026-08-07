// Live E2E for complete_user_profile_onboarding — task brief section 8.
// Onboards both disposable users (B needs a real profile row too, for the
// RLS-ownership and language-update scenarios that run after this one).
import assert from "node:assert/strict";
import { callRpc, restGet } from "../lib/liveHttp.mjs";
import { assertOk, assertError, assertTimestampCloseToNow } from "../lib/liveAssert.mjs";
// Real frontend response parser, imported directly and run against the
// live RPC response — task brief section 17 ("feed live response objects
// through the actual parser/helper functions used by the frontend").
// Safe to import bare here: userProfileOnboarding.ts only imports
// supabaseError.ts, never src/lib/supabaseAuth.ts, so it carries no
// import.meta.env dependency under a bare Node process.
import { parseCompleteUserProfileOnboardingRow } from "../../../../src/lib/userProfileOnboarding.ts";

const VALID_ONBOARDING_INPUT = {
  p_nickname: "E2E Runner",
  p_native_language: "en",
  p_learning_language: "es",
  p_current_level: "A1",
  p_user_age: 25,
  p_birth_month: 6,
  p_birth_day: 15,
};

function firstRow(response) {
  return Array.isArray(response.json) ? response.json[0] : response.json;
}

async function onboard(ctx, user, overrides = {}) {
  return callRpc(
    ctx.config,
    "complete_user_profile_onboarding",
    { ...VALID_ONBOARDING_INPUT, ...overrides },
    { accessToken: user.session.accessToken },
  );
}

export async function run(ctx, t) {
  t.section("Profile onboarding (complete_user_profile_onboarding)");

  await t.test("Authenticated user A can complete onboarding with valid values", async () => {
    const response = await onboard(ctx, ctx.userA);
    assertOk(response, "complete_user_profile_onboarding for user A");

    const parsed = parseCompleteUserProfileOnboardingRow(firstRow(response));
    assert.equal(parsed.nickname, "E2E Runner");
    assert.equal(parsed.nativeLanguage, "en");
    assert.equal(parsed.learningLanguage, "es");
    assert.equal(parsed.currentLevel, "A1");
    assert.equal(parsed.userAge, 25);
    assert.equal(parsed.birthMonth, 6);
    assert.equal(parsed.birthDay, 15);
    assert.equal(parsed.onboardingCompleted, true, "onboarding_completed must always be true after a valid call.");
    assert.equal(parsed.dailyGoal, 15, "A brand-new row must get the table default (15), never a caller-supplied value — onboarding has no p_daily_goal parameter at all.");
    assert.equal(parsed.timezone, null, "Onboarding must never set timezone.");
    assertTimestampCloseToNow(parsed.updatedAt, "onboarding updated_at is server-generated");

    ctx.state.userAOnboarding = parsed;
  });

  await t.test("The onboarded row belongs to the authenticated caller, not a caller-suppliable id", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=id,nickname`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "select own profile row after onboarding");
    assert.equal(response.json.length, 1);
    assert.equal(response.json[0].id, ctx.userA.session.userId);
    assert.equal(response.json[0].nickname, "E2E Runner");
  });

  await t.test("Onboard user B too (needed for later RLS-ownership / language-update scenarios)", async () => {
    const response = await onboard(ctx, ctx.userB, {
      p_nickname: "E2E Runner B",
      p_native_language: "de",
      p_learning_language: "fr",
    });
    assertOk(response, "complete_user_profile_onboarding for user B");
    const parsed = parseCompleteUserProfileOnboardingRow(firstRow(response));
    assert.equal(parsed.nativeLanguage, "de");
    assert.equal(parsed.learningLanguage, "fr");
  });

  await t.test("An invalid current_level is rejected and does not change the stored row", async () => {
    const before = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=current_level,updated_at`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(before, "read A's profile before the invalid onboarding call");

    const response = await onboard(ctx, ctx.userA, { p_current_level: "Z9" });
    assertError(response, "complete_user_profile_onboarding with an invalid current_level");

    const after = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=current_level,updated_at`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assert.deepEqual(after.json[0], before.json[0], "A rejected onboarding call must not change the stored row.");
  });

  await t.test("An invalid native_language is rejected", async () => {
    const response = await onboard(ctx, ctx.userA, { p_native_language: "xx" });
    assertError(response, "complete_user_profile_onboarding with an invalid native_language");
  });

  await t.test("An invalid user_age is rejected", async () => {
    const response = await onboard(ctx, ctx.userA, { p_user_age: 5 });
    assertError(response, "complete_user_profile_onboarding with user_age below the 10-100 bound");
  });
}
