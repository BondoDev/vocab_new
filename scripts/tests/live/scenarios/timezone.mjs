// Live E2E for initialize_user_timezone — task brief section 13.
import assert from "node:assert/strict";
import { callRpc, restGet, restMutate } from "../lib/liveHttp.mjs";
import { assertOk, assertError, assertTimestampCloseToNow } from "../lib/liveAssert.mjs";
// Real frontend response parser — see onboarding.mjs's header for why this
// import is safe under a bare Node process.
import { parseInitializeUserTimezoneRow } from "../../../../src/lib/userProfileTimezone.ts";

const VALID_TZ = "Europe/Tbilisi";
const OTHER_VALID_TZ = "America/New_York";
const INVALID_TZ = "Not/AZone";

function firstRow(response) {
  return Array.isArray(response.json) ? response.json[0] : response.json;
}

export async function run(ctx, t) {
  t.section("Timezone initialization (initialize_user_timezone)");

  await t.test("A freshly onboarded profile's timezone starts null", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=timezone`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "read A's timezone before initialization");
    assert.equal(response.json[0].timezone, null);
  });

  await t.test("A valid IANA timezone is accepted and initializes the row", async () => {
    const response = await callRpc(ctx.config, "initialize_user_timezone", { p_timezone: VALID_TZ }, {
      accessToken: ctx.userA.session.accessToken,
    });
    assertOk(response, "initialize_user_timezone with a valid IANA zone");

    const parsed = parseInitializeUserTimezoneRow(firstRow(response));
    assert.equal(parsed.timezone, VALID_TZ);
    assert.equal(parsed.initialized, true);
    assertTimestampCloseToNow(parsed.timezoneUpdatedAt, "timezone_updated_at on first initialization");

    ctx.state.userATimezoneUpdatedAt = parsed.timezoneUpdatedAt;
  });

  await t.test("A second initialization call does not overwrite the stored timezone", async () => {
    const response = await callRpc(ctx.config, "initialize_user_timezone", { p_timezone: OTHER_VALID_TZ }, {
      accessToken: ctx.userA.session.accessToken,
    });
    assertOk(response, "initialize_user_timezone called a second time");

    const parsed = parseInitializeUserTimezoneRow(firstRow(response));
    assert.equal(parsed.timezone, VALID_TZ, "Timezone must stay at its first-initialized value.");
    assert.equal(parsed.initialized, false);
    assert.equal(
      parsed.timezoneUpdatedAt,
      ctx.state.userATimezoneUpdatedAt,
      "timezone_updated_at must not move on a no-op initialization.",
    );
  });

  await t.test("An invalid IANA timezone name is rejected", async () => {
    const response = await callRpc(ctx.config, "initialize_user_timezone", { p_timezone: INVALID_TZ }, {
      accessToken: ctx.userA.session.accessToken,
    });
    assertError(response, "initialize_user_timezone with an invalid timezone name");
  });

  await t.test("Direct table write of timezone remains blocked (trigger-guarded, RPC-only)", async () => {
    const response = await restMutate(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}`,
      "PATCH",
      { timezone: "UTC" },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertError(response, "direct PATCH of user_profiles.timezone");

    const after = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=timezone`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assert.equal(after.json[0].timezone, VALID_TZ, "A blocked direct write must not have changed the stored timezone.");
  });
}
