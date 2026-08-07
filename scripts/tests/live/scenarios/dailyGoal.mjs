// Live E2E for update_daily_goal — task brief section 12.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { callRpc, restGet, restMutate } from "../lib/liveHttp.mjs";
import { assertOk, assertError } from "../lib/liveAssert.mjs";
// Real frontend response parser — see onboarding.mjs's header for why this
// import is safe under a bare Node process.
import { parseUpdateDailyGoalRow } from "../../../../src/lib/dailyGoalUpdate.ts";

function firstRow(response) {
  return Array.isArray(response.json) ? response.json[0] : response.json;
}

function subtractOneDayISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function run(ctx, t) {
  t.section("Daily goal (update_daily_goal)");
  const targetLanguage = ctx.targetLanguage;

  let todayDateISO;
  await t.test("Determine today's server-derived learning date (never assumed from this process's own clock/timezone)", async () => {
    const response = await callRpc(ctx.config, "get_current_learning_date", {}, {
      accessToken: ctx.userA.session.accessToken,
    });
    assertOk(response, "get_current_learning_date for daily-goal fixture setup");
    todayDateISO = firstRow(response)?.stat_date;
    assert.ok(typeof todayDateISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(todayDateISO));
  });

  await t.test("Create a real 'today' daily-stats row via the Study RPC (a legitimate learning RPC, not a direct write)", async () => {
    const wordId = `e2e-daily-goal-${crypto.randomUUID()}`;
    const response = await callRpc(
      ctx.config,
      "complete_new_word_study",
      { p_word_id: wordId, p_target_language: targetLanguage, p_study_time_seconds: 10 },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "complete_new_word_study fixture for the daily-goal test");
  });

  const historicalDateISO = () => subtractOneDayISO(todayDateISO);

  await t.test("Seed a historical (yesterday) daily-stats row via a privileged fixture insert (service role; no learning RPC can backdate stat_date)", async () => {
    const response = await restMutate(
      ctx.config,
      "/rest/v1/user_daily_stats",
      "POST",
      {
        user_id: ctx.userA.session.userId,
        target_language: targetLanguage,
        stat_date: historicalDateISO(),
        new_words_completed: 3,
        reviews_completed: 0,
        study_time_seconds: 0,
        review_time_seconds: 0,
        custom_practice_time_seconds: 0,
        daily_goal: 30,
      },
      { useServiceRole: true, prefer: "return=representation" },
    );
    assertOk(response, "privileged fixture insert of a historical user_daily_stats row");
  });

  await t.test("A supported preset succeeds and updates user_profiles.daily_goal", async () => {
    const response = await callRpc(ctx.config, "update_daily_goal", { p_daily_goal: 20 }, {
      accessToken: ctx.userA.session.accessToken,
    });
    assertOk(response, "update_daily_goal(20)");

    const parsed = parseUpdateDailyGoalRow(firstRow(response));
    assert.equal(parsed.dailyGoal, 20);
    assert.equal(parsed.statDateISO, todayDateISO);
    assert.ok(parsed.updatedDailyStatsRows >= 1, "Expected today's fixture row to be counted as updated.");

    const profile = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=daily_goal`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(profile, "read A's profile daily_goal after the update");
    assert.equal(profile.json[0].daily_goal, 20);
  });

  await t.test("Today's user_daily_stats.daily_goal snapshot was updated", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_daily_stats?user_id=eq.${encodeURIComponent(ctx.userA.session.userId)}&target_language=eq.${encodeURIComponent(targetLanguage)}&stat_date=eq.${todayDateISO}&select=daily_goal`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "read today's user_daily_stats row after update_daily_goal");
    assert.equal(response.json.length, 1);
    assert.equal(response.json[0].daily_goal, 20);
  });

  await t.test("The historical (yesterday) snapshot was NOT rewritten", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_daily_stats?user_id=eq.${encodeURIComponent(ctx.userA.session.userId)}&target_language=eq.${encodeURIComponent(targetLanguage)}&stat_date=eq.${historicalDateISO()}&select=daily_goal`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "read the historical user_daily_stats row after update_daily_goal");
    assert.equal(response.json.length, 1);
    assert.equal(response.json[0].daily_goal, 30, "Historical rows must keep their own stamped goal forever — update_daily_goal only ever matches today's date.");
  });

  await t.test("An unsupported value (in-range but not one of the five presets) is rejected", async () => {
    const response = await callRpc(ctx.config, "update_daily_goal", { p_daily_goal: 25 }, {
      accessToken: ctx.userA.session.accessToken,
    });
    assertError(response, "update_daily_goal(25) — not one of 10/15/20/30/50");

    const profile = await restGet(
      ctx.config,
      `/rest/v1/user_profiles?id=eq.${encodeURIComponent(ctx.userA.session.userId)}&select=daily_goal`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assert.equal(profile.json[0].daily_goal, 20, "A rejected update must not have changed the stored goal.");
  });
}
