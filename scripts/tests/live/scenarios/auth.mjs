// Live authentication behavior — the foundation every other scenario
// depends on. See supabase/README.md's task brief section 7: "Verify
// actual Supabase Auth behavior... Do not merely inspect SQL source."
import assert from "node:assert/strict";
import { callRpc } from "../lib/liveHttp.mjs";
import { assertOk, assertError } from "../lib/liveAssert.mjs";

export async function run(ctx, t) {
  t.section("Authentication");

  await t.test("Disposable user A's sign-in produced a usable access token", () => {
    assert.ok(ctx.userA.session.accessToken, "Missing access token for user A.");
    assert.ok(ctx.userA.session.userId, "Missing user id for user A.");
  });

  await t.test("Authenticated session can call a protected RPC (get_current_learning_date)", async () => {
    const response = await callRpc(ctx.config, "get_current_learning_date", {}, {
      accessToken: ctx.userA.session.accessToken,
    });
    assertOk(response, "get_current_learning_date as authenticated user A");
  });

  await t.test("A request with no Authorization token is rejected by a protected RPC", async () => {
    const response = await callRpc(ctx.config, "get_current_learning_date", {}, {});
    assertError(response, "get_current_learning_date with no Authorization header (anon role)");
  });

  await t.test("A request with an invalid bearer token is rejected by a protected RPC", async () => {
    const response = await callRpc(ctx.config, "get_current_learning_date", {}, {
      accessToken: "not-a-real.jwt.token",
    });
    assertError(response, "get_current_learning_date with a malformed bearer token");
  });
}
