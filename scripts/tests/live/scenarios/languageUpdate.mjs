// Live E2E for update_user_profile_languages — task brief section 11.
import assert from "node:assert/strict";
import { callRpc, restGet } from "../lib/liveHttp.mjs";
import { assertOk, assertError } from "../lib/liveAssert.mjs";
import { assertTimestampMovedForward } from "../lib/liveAssert.mjs";
// Real frontend response parser — see onboarding.mjs's header for why this
// import is safe under a bare Node process (no supabaseAuth.ts in its
// import chain).
import { parseUpdateUserProfileLanguagesRow } from "../../../../src/lib/userProfileLanguages.ts";

function firstRow(response) {
  return Array.isArray(response.json) ? response.json[0] : response.json;
}

export async function run(ctx, t) {
  t.section("Language update (update_user_profile_languages)");

  await t.test("A valid language change succeeds and changes only the two language fields", async () => {
    const before = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=nickname,current_level,user_age,daily_goal,updated_at`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(before, "read A's profile before the language update");
    const beforeRow = before.json[0];

    const response = await callRpc(
      ctx.config,
      "update_user_profile_languages",
      { p_native_language: "pt", p_learning_language: "de" },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "update_user_profile_languages for A");

    const parsed = parseUpdateUserProfileLanguagesRow(firstRow(response));
    assert.equal(parsed.nativeLanguage, "pt");
    assert.equal(parsed.learningLanguage, "de");
    assertTimestampMovedForward(beforeRow.updated_at, parsed.updatedAt, "updated_at after a language change");

    const after = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=nickname,current_level,user_age,daily_goal,native_language,learning_language`,
      { accessToken: ctx.userA.session.accessToken },
    );
    const afterRow = after.json[0];
    assert.equal(afterRow.native_language, "pt");
    assert.equal(afterRow.learning_language, "de");
    assert.equal(afterRow.nickname, beforeRow.nickname, "nickname must be unchanged by a language-only update.");
    assert.equal(afterRow.current_level, beforeRow.current_level, "current_level must be unchanged.");
    assert.equal(afterRow.user_age, beforeRow.user_age, "user_age must be unchanged.");
    assert.equal(afterRow.daily_goal, beforeRow.daily_goal, "daily_goal must be unchanged — this RPC never touches it.");
  });

  await t.test("An invalid language code is rejected", async () => {
    const response = await callRpc(
      ctx.config,
      "update_user_profile_languages",
      { p_native_language: "zz", p_learning_language: "de" },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertError(response, "update_user_profile_languages with an invalid native_language");
  });

  await t.test("User B's profile is unaffected by A's language update", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userB.session.userId)}&select=native_language,learning_language`,
      { useServiceRole: true },
    );
    assertOk(response, "privileged read of B's languages after A's update");
    assert.equal(response.json[0].native_language, "de", "Set at B's onboarding, untouched since.");
    assert.equal(response.json[0].learning_language, "fr", "Set at B's onboarding, untouched since.");
  });
}
