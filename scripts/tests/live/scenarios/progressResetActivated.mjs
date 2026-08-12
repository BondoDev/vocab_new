// Live E2E for reset_learning_language_progress AFTER activation — Settings
// backend follow-up. Supersedes progressResetDisabled.mjs, whose entire
// premise ("authenticated cannot execute this RPC at all") is the exact
// thing this task intentionally changes: see
// supabase/migrations/20260812130000_activate_learning_progress_reset_rpc.sql
// for the grant and its own security-audit header.
//
// This scenario proves the three properties that actually matter once the
// RPC is reachable from a normal session — not just "it runs", but that its
// existing (unchanged) scoping holds against two real accounts:
//   1. resetting one language deletes only that language's rows, in all
//      four owned tables, for the calling user;
//   2. the SAME calling user's OTHER language is completely untouched;
//   3. a DIFFERENT user's data in the SAME language is completely
//      untouched (there is no p_user_id — the only thing that could ever
//      leak cross-account is a scoping bug in the WHERE clauses
//      themselves, which this test exercises against a live database);
//   4. the account/profile row itself (including learning_language, the
//      profile's own "currently active" language) is byte-for-byte
//      unchanged — the function never references user_profiles.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { callRpc, restGet } from "../lib/liveHttp.mjs";
import { assertOk, assertError } from "../lib/liveAssert.mjs";

const PROFILE_SELECT =
  "id,nickname,native_language,learning_language,current_level,user_age,birth_month,birth_day,onboarding_completed,daily_goal,timezone,timezone_updated_at,updated_at";

function firstRow(response) {
  return Array.isArray(response.json) ? response.json[0] : response.json;
}

async function readOwnProfile(ctx, user) {
  const response = await restGet(
    ctx.config,
    `/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.session.userId)}&select=${PROFILE_SELECT}`,
    { accessToken: user.session.accessToken },
  );
  assertOk(response, `read ${user.session.userId}'s own profile`);
  return response.json[0];
}

// Privileged (service_role) row-count reads — used for the cross-table/
// cross-user assertions below, which must see the true state regardless of
// which user's token would otherwise be allowed to read it via RLS.
async function countRows(ctx, table, userId, targetLanguage) {
  const response = await restGet(
    ctx.config,
    `/rest/v1/${table}?user_id=eq.${encodeURIComponent(userId)}&target_language=eq.${encodeURIComponent(targetLanguage)}&select=id`,
    { useServiceRole: true },
  );
  assertOk(response, `privileged count of ${table} for user=${userId} language=${targetLanguage}`);
  return response.json.length;
}

// Creates one row in each of the four reset-scoped tables for the given
// user/language, via the same real learning RPCs learningRpcs.mjs already
// exercises — never a direct table INSERT, so this fixture data has the
// same shape production data would.
async function seedLearningProgress(ctx, user, targetLanguage) {
  const wordId = `e2e-reset-${crypto.randomUUID()}`;

  const studyResponse = await callRpc(
    ctx.config,
    "complete_new_word_study",
    { p_word_id: wordId, p_target_language: targetLanguage, p_study_time_seconds: 10 },
    { accessToken: user.session.accessToken },
  );
  assertOk(studyResponse, `seed complete_new_word_study for ${targetLanguage}`);

  const progressResponse = await restGet(
    ctx.config,
    `/rest/v1/user_word_progress?user_id=eq.${encodeURIComponent(user.session.userId)}&word_id=eq.${encodeURIComponent(wordId)}&target_language=eq.${encodeURIComponent(targetLanguage)}&select=id`,
    { accessToken: user.session.accessToken },
  );
  assertOk(progressResponse, "read seeded word_progress id");
  const wordProgressId = progressResponse.json[0].id;

  const reviewResponse = await callRpc(
    ctx.config,
    "complete_word_review",
    {
      p_event_id: crypto.randomUUID(),
      p_word_progress_id: wordProgressId,
      p_result: "correct",
      p_review_time_seconds: 6,
    },
    { accessToken: user.session.accessToken },
  );
  assertOk(reviewResponse, `seed complete_word_review for ${targetLanguage}`);

  const customPracticeResponse = await callRpc(
    ctx.config,
    "complete_custom_practice_word",
    { p_event_id: crypto.randomUUID(), p_target_language: targetLanguage, p_custom_practice_time_seconds: 15 },
    { accessToken: user.session.accessToken },
  );
  assertOk(customPracticeResponse, `seed complete_custom_practice_word for ${targetLanguage}`);
}

export async function run(ctx, t) {
  t.section("Learning-progress reset activation (reset_learning_language_progress)");

  await t.test("Unauthenticated call is rejected", async () => {
    const response = await callRpc(ctx.config, "reset_learning_language_progress", {
      p_target_language: ctx.targetLanguage,
    }, {});
    assertError(response, "reset_learning_language_progress with no Authorization header");
  });

  await t.test("An invalid target language is rejected", async () => {
    const response = await callRpc(
      ctx.config,
      "reset_learning_language_progress",
      { p_target_language: "zz" },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertError(response, "reset_learning_language_progress with an unsupported language code");
  });

  // "fr" is deliberately a language neither user's learning-RPC fixtures
  // (ctx.targetLanguage = "es", used by learningRpcs.mjs) have ever touched
  // before this scenario — a clean second language to prove untouched.
  const RESET_LANGUAGE = ctx.targetLanguage; // "es"
  const OTHER_LANGUAGE = "fr";

  await t.test("Fixture: seed A with progress in two languages, and B with progress in the reset language", async () => {
    await seedLearningProgress(ctx, ctx.userA, RESET_LANGUAGE);
    await seedLearningProgress(ctx, ctx.userA, OTHER_LANGUAGE);
    await seedLearningProgress(ctx, ctx.userB, RESET_LANGUAGE);

    for (const table of ["user_word_progress", "review_events", "custom_practice_events", "user_daily_stats"]) {
      assert.ok(
        (await countRows(ctx, table, ctx.userA.session.userId, RESET_LANGUAGE)) >= 1,
        `fixture: A must have at least one ${table} row for ${RESET_LANGUAGE} before reset`,
      );
      assert.ok(
        (await countRows(ctx, table, ctx.userA.session.userId, OTHER_LANGUAGE)) >= 1,
        `fixture: A must have at least one ${table} row for ${OTHER_LANGUAGE} before reset`,
      );
      assert.ok(
        (await countRows(ctx, table, ctx.userB.session.userId, RESET_LANGUAGE)) >= 1,
        `fixture: B must have at least one ${table} row for ${RESET_LANGUAGE} before reset`,
      );
    }
  });

  let profileBeforeReset;
  await t.test("Snapshot A's full profile row before reset", async () => {
    profileBeforeReset = await readOwnProfile(ctx, ctx.userA);
    assert.equal(profileBeforeReset.id, ctx.userA.session.userId);
  });

  let resetRow;
  await t.test("Authenticated A can reset their own progress in the target language", async () => {
    const response = await callRpc(
      ctx.config,
      "reset_learning_language_progress",
      { p_target_language: RESET_LANGUAGE },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "reset_learning_language_progress for A");
    resetRow = firstRow(response);

    assert.equal(resetRow.reset, true);
    assert.equal(resetRow.target_language, RESET_LANGUAGE);
    assert.ok(resetRow.word_progress_deleted >= 1, "expected at least the seeded word_progress row to be deleted");
    assert.ok(resetRow.daily_stats_deleted >= 1, "expected at least one daily_stats row to be deleted");
    assert.ok(resetRow.review_events_deleted >= 1, "expected at least the seeded review_events row to be deleted");
    assert.ok(
      resetRow.custom_practice_events_deleted >= 1,
      "expected at least the seeded custom_practice_events row to be deleted",
    );
  });

  await t.test("A's reset-language rows are gone in all four tables", async () => {
    for (const table of ["user_word_progress", "review_events", "custom_practice_events", "user_daily_stats"]) {
      const count = await countRows(ctx, table, ctx.userA.session.userId, RESET_LANGUAGE);
      assert.equal(count, 0, `A must have zero ${table} rows for ${RESET_LANGUAGE} after reset`);
    }
  });

  await t.test("A's OTHER-language rows are completely untouched", async () => {
    for (const table of ["user_word_progress", "review_events", "custom_practice_events", "user_daily_stats"]) {
      const count = await countRows(ctx, table, ctx.userA.session.userId, OTHER_LANGUAGE);
      assert.ok(count >= 1, `A's ${table} rows for ${OTHER_LANGUAGE} must survive A's reset of ${RESET_LANGUAGE}`);
    }
  });

  await t.test("User B's data in the SAME language is completely untouched by A's reset", async () => {
    for (const table of ["user_word_progress", "review_events", "custom_practice_events", "user_daily_stats"]) {
      const count = await countRows(ctx, table, ctx.userB.session.userId, RESET_LANGUAGE);
      assert.ok(
        count >= 1,
        `B's ${table} rows for ${RESET_LANGUAGE} must survive A's reset of their own ${RESET_LANGUAGE} progress`,
      );
    }
  });

  await t.test("A's profile row (including learning_language) is byte-for-byte unchanged by the reset", async () => {
    const profileAfterReset = await readOwnProfile(ctx, ctx.userA);
    assert.deepEqual(
      profileAfterReset,
      profileBeforeReset,
      "reset_learning_language_progress must never modify user_profiles, including learning_language",
    );
  });

  await t.test("A repeated reset of an already-empty language succeeds idempotently with zero counts", async () => {
    const response = await callRpc(
      ctx.config,
      "reset_learning_language_progress",
      { p_target_language: RESET_LANGUAGE },
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "reset_learning_language_progress called a second time on an already-reset language");
    const row = firstRow(response);
    assert.equal(row.reset, true, "a repeated call must still report success, never a not-found error");
    assert.equal(row.word_progress_deleted, 0);
    assert.equal(row.daily_stats_deleted, 0);
    assert.equal(row.review_events_deleted, 0);
    assert.equal(row.custom_practice_events_deleted, 0);
  });
}
