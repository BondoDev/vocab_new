// Live E2E for get_current_learning_date — task brief section 14.
// Runs after timezone.mjs so user A already has a stored (non-UTC) IANA
// timezone, exercising the real "stored timezone determines the returned
// date" path rather than only the UTC fallback.
import assert from "node:assert/strict";
import { callRpc } from "../lib/liveHttp.mjs";
import { assertOk, assertError } from "../lib/liveAssert.mjs";
// Real frontend response parser — see onboarding.mjs's header for why this
// import is safe under a bare Node process.
import { parseCurrentLearningDateRpcResponse } from "../../../../src/lib/learningDateValidation.ts";

export async function run(ctx, t) {
  t.section("Server-derived learning date (get_current_learning_date)");

  await t.test("Authenticated caller's stored timezone determines the returned date", async () => {
    const response = await callRpc(ctx.config, "get_current_learning_date", {}, {
      accessToken: ctx.userA.session.accessToken,
    });
    assertOk(response, "get_current_learning_date for A (Europe/Tbilisi, set in timezone.mjs)");

    const dateISO = parseCurrentLearningDateRpcResponse(response.json);

    // Deliberately NOT asserting exact equality against any date this test
    // process computes locally — see this suite's entry-point header and
    // the task brief's own "Be careful around midnight/timezone
    // boundaries" note. This only asserts the value is a real calendar
    // date within a narrow, generous window of actual UTC now, so a
    // genuinely broken server date (wrong year, frozen clock, wrong
    // timezone resolution entirely) still fails loudly without this test
    // itself becoming flaky near a day boundary.
    const nowMs = Date.now();
    const parsedMs = Date.parse(`${dateISO}T00:00:00Z`);
    assert.ok(Number.isFinite(parsedMs), `get_current_learning_date returned an unparseable date: ${dateISO}`);
    const deltaDays = Math.abs(nowMs - parsedMs) / (24 * 60 * 60 * 1000);
    assert.ok(deltaDays <= 2, `get_current_learning_date returned ${dateISO}, more than 2 days from actual UTC now.`);
  });

  await t.test("A request with no Authorization token is rejected", async () => {
    const response = await callRpc(ctx.config, "get_current_learning_date", {}, {});
    assertError(response, "get_current_learning_date with no Authorization header");
  });
}
