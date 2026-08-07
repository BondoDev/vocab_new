// Direct PostgREST write rejection against user_profiles — task brief
// section 9. One of the highest-value live assertions: static
// migration-contract tests can read the GRANT/REVOKE statements in a
// migration file, but only a real request against the deployed project
// proves the grants/RLS were actually applied there.
import assert from "node:assert/strict";
import { restGet, restMutate } from "../lib/liveHttp.mjs";
import { assertOk, assertError } from "../lib/liveAssert.mjs";

export async function run(ctx, t) {
  t.section("Direct user_profiles writes are rejected (authenticated anon-key session)");

  await t.test("Authenticated SELECT of the caller's own profile row still works", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=id`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "direct SELECT of own user_profiles row");
    assert.equal(response.json.length, 1);
  });

  await t.test("A direct INSERT into user_profiles is rejected", async () => {
    const response = await restMutate(
      ctx.config,
      "/rest/v1/user_profiles",
      "POST",
      { id: ctx.userA.session.userId, nickname: "should-not-insert" },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertError(response, "direct INSERT into user_profiles as authenticated");
  });

  await t.test("A direct UPDATE of the caller's own user_profiles row is rejected", async () => {
    const response = await restMutate(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}`,
      "PATCH",
      { nickname: "hijacked-via-direct-write" },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertError(response, "direct UPDATE of own user_profiles row as authenticated");

    const after = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=nickname`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assert.notEqual(
      after.json[0]?.nickname,
      "hijacked-via-direct-write",
      "A rejected direct UPDATE must not have changed the row.",
    );
  });

  await t.test("A direct DELETE of the caller's own user_profiles row is rejected", async () => {
    const response = await restMutate(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}`,
      "DELETE",
      undefined,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertError(response, "direct DELETE of own user_profiles row as authenticated");

    const after = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=id`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assert.equal(after.json.length, 1, "The row must still exist after a rejected direct DELETE.");
  });
}
