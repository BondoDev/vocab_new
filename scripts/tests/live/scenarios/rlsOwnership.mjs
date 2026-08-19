// RLS ownership across two disposable users — task brief section 10.
import assert from "node:assert/strict";
import { callRpc, restGet } from "../lib/liveHttp.mjs";
import { assertOk } from "../lib/liveAssert.mjs";

export async function run(ctx, t) {
  t.section("RLS ownership (two disposable users)");

  await t.test("User A can read their own profile", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=id`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "A reading A's own profile");
    assert.equal(response.json.length, 1);
  });

  await t.test("User A cannot read user B's profile row by id (RLS filters it out, not an error)", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userB.session.userId)}&select=id`,
      { accessToken: ctx.userA.session.accessToken },
    );
    // A real 200-with-zero-rows, not a 4xx — PostgREST RLS filtering looks
    // exactly like "no such row" to the requester, never a distinguishable
    // "forbidden" response that would leak whether the row exists.
    assertOk(response, "A querying B's profile row by id");
    assert.equal(response.json.length, 0, "RLS must filter out another user's row entirely.");
  });

  await t.test("update_user_profile_languages derives identity from the session, not a parameter — A's call never touches B's row", async () => {
    const before = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userB.session.userId)}&select=native_language,learning_language,updated_at`,
      { useSecretKey: true }, // privileged read: A cannot see B's row (confirmed above), so this before/after diff needs the secret key
    );
    assertOk(before, "privileged read of B's profile before A's language-update call");

    const response = await callRpc(
      ctx.config,
      "update_user_profile_languages",
      { p_native_language: "it", p_learning_language: "ru" },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "A calling update_user_profile_languages (no user-id parameter exists to attack)");

    const after = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userB.session.userId)}&select=native_language,learning_language,updated_at`,
      { useSecretKey: true },
    );
    assert.deepEqual(after.json[0], before.json[0], "B's row must be completely unaffected by a call A makes.");
  });
}
