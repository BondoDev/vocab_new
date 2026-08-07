// Live E2E for the three learning-progress RPCs — task brief section 15
// (real behavior) and section 16 (idempotency).
//
// Response-contract note (task brief section 17): complete_new_word_study /
// complete_word_review / complete_custom_practice_word's own response
// parsers (parseCompleteNewWordStudyRow, parseCompleteWordReviewRow,
// parseCompleteCustomPracticeWordRow in src/lib/newWordProgress.ts /
// src/lib/customPracticeProgress.ts) are not exported, and — unlike the
// four profile-RPC parser modules this suite imports directly elsewhere
// (userProfileOnboarding.ts, userProfileLanguages.ts, dailyGoalUpdate.ts,
// userProfileTimezone.ts, learningDateValidation.ts) — the modules that
// define them transitively import src/lib/supabaseAuth.ts, which reads
// import.meta.env at module load time (Vite-only) and throws immediately
// under this suite's bare `node --experimental-strip-types` process. The
// shape-assertion helpers below re-check the same field/type contract
// those three interfaces document (CompleteNewWordStudyResult /
// CompleteWordReviewResult / CompleteCustomPracticeWordResult) directly
// against the raw snake_case RPC row instead.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { callRpc, restGet } from "../lib/liveHttp.mjs";
import { assertOk, assertError, assertTimestampCloseToNow } from "../lib/liveAssert.mjs";

const WORD_STATES = ["seen", "learning", "familiar", "strong", "mastered"];
const STAT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function firstRow(response) {
  return Array.isArray(response.json) ? response.json[0] : response.json;
}

function assertCompleteNewWordStudyShape(row, context) {
  assert.equal(typeof row.inserted, "boolean", `${context}: inserted must be boolean`);
  assert.equal(typeof row.already_completed, "boolean", `${context}: already_completed must be boolean`);
  assert.equal(typeof row.new_words_completed_today, "number", `${context}: new_words_completed_today must be a number`);
  assert.ok(
    row.stat_date === null || STAT_DATE_PATTERN.test(row.stat_date),
    `${context}: stat_date must be null or YYYY-MM-DD`,
  );
}

function assertCompleteWordReviewShape(row, context) {
  assert.equal(typeof row.already_processed, "boolean", `${context}: already_processed must be boolean`);
  assert.ok(WORD_STATES.includes(row.previous_state), `${context}: previous_state invalid (${row.previous_state})`);
  assert.ok(WORD_STATES.includes(row.new_state), `${context}: new_state invalid (${row.new_state})`);
  assert.equal(typeof row.previous_correct_streak, "number");
  assert.equal(typeof row.new_correct_streak, "number");
  assert.equal(typeof row.promoted, "boolean");
  assert.equal(typeof row.demoted, "boolean");
  assert.ok(["correct", "incorrect", "skipped"].includes(row.result), `${context}: result invalid (${row.result})`);
  assert.equal(typeof row.reviews_completed_today, "number");
  assert.equal(typeof row.last_practiced_at, "string");
  assert.equal(typeof row.next_review_at, "string");
}

function assertCompleteCustomPracticeShape(row, context) {
  assert.equal(typeof row.already_processed, "boolean", `${context}: already_processed must be boolean`);
  assert.equal(typeof row.custom_practice_time_seconds_today, "number");
  assert.ok(
    row.stat_date === null || STAT_DATE_PATTERN.test(row.stat_date),
    `${context}: stat_date must be null or YYYY-MM-DD`,
  );
}

export async function run(ctx, t) {
  t.section("Learning RPCs: Study, Review, Custom Practice");
  const targetLanguage = ctx.targetLanguage;
  const wordId = `e2e-learning-${crypto.randomUUID()}`;

  // ---- Study -------------------------------------------------------
  await t.test("Unauthenticated complete_new_word_study is rejected", async () => {
    const response = await callRpc(ctx.config, "complete_new_word_study", {
      p_word_id: wordId,
      p_target_language: targetLanguage,
      p_study_time_seconds: 5,
    }, {});
    assertError(response, "complete_new_word_study with no Authorization header");
  });

  let studyRow;
  await t.test("Authenticated Study completion inserts a new word for the caller", async () => {
    const response = await callRpc(ctx.config, "complete_new_word_study", {
      p_word_id: wordId,
      p_target_language: targetLanguage,
      p_study_time_seconds: 12,
    }, { accessToken: ctx.userA.session.accessToken });
    assertOk(response, "complete_new_word_study (first call)");
    studyRow = firstRow(response);
    assertCompleteNewWordStudyShape(studyRow, "complete_new_word_study first call");
    assert.equal(studyRow.inserted, true);
    assert.equal(studyRow.already_completed, false);
  });

  await t.test("A retried Study completion (same word) is idempotent", async () => {
    const response = await callRpc(ctx.config, "complete_new_word_study", {
      p_word_id: wordId,
      p_target_language: targetLanguage,
      p_study_time_seconds: 12,
    }, { accessToken: ctx.userA.session.accessToken });
    assertOk(response, "complete_new_word_study (retry)");
    const row = firstRow(response);
    assertCompleteNewWordStudyShape(row, "complete_new_word_study retry");
    assert.equal(row.inserted, false);
    assert.equal(row.already_completed, true);
    assert.equal(
      row.new_words_completed_today,
      studyRow.new_words_completed_today,
      "A duplicate Study save must not increment the daily count again.",
    );
  });

  let wordProgressId;
  await t.test("The resulting user_word_progress row belongs to the caller", async () => {
    const response = await restGet(
      ctx.config,
      `/rest/v1/user_word_progress?user_id=eq.${encodeURIComponent(ctx.userA.session.userId)}&word_id=eq.${encodeURIComponent(wordId)}&target_language=eq.${encodeURIComponent(targetLanguage)}&select=id,word_state`,
      { accessToken: ctx.userA.session.accessToken },
    );
    assertOk(response, "read the newly studied word's progress row");
    assert.equal(response.json.length, 1);
    assert.equal(response.json[0].word_state, "seen");
    wordProgressId = response.json[0].id;
  });

  // ---- Review --------------------------------------------------------
  await t.test("Unauthenticated complete_word_review is rejected", async () => {
    const response = await callRpc(ctx.config, "complete_word_review", {
      p_event_id: crypto.randomUUID(),
      p_word_progress_id: wordProgressId,
      p_result: "correct",
      p_review_time_seconds: 5,
    }, {});
    assertError(response, "complete_word_review with no Authorization header");
  });

  const reviewEventId = crypto.randomUUID();
  let reviewRow;
  await t.test("Authenticated Review completion transitions word state (seen -> learning on first correct)", async () => {
    const response = await callRpc(ctx.config, "complete_word_review", {
      p_event_id: reviewEventId,
      p_word_progress_id: wordProgressId,
      p_result: "correct",
      p_review_time_seconds: 8,
    }, { accessToken: ctx.userA.session.accessToken });
    assertOk(response, "complete_word_review (first call)");
    reviewRow = firstRow(response);
    assertCompleteWordReviewShape(reviewRow, "complete_word_review first call");
    assert.equal(reviewRow.already_processed, false);
    assert.equal(reviewRow.previous_state, "seen");
    assert.equal(reviewRow.new_state, "learning");
    assert.equal(reviewRow.promoted, true);
    assertTimestampCloseToNow(reviewRow.last_practiced_at, "last_practiced_at after a review");
  });

  await t.test("A retried Review completion (same event id) is idempotent — the ORIGINAL transition is returned, not a reprocess with new input", async () => {
    const response = await callRpc(ctx.config, "complete_word_review", {
      p_event_id: reviewEventId,
      p_word_progress_id: wordProgressId,
      p_result: "incorrect", // deliberately different from the original "correct" — must be ignored
      p_review_time_seconds: 8,
    }, { accessToken: ctx.userA.session.accessToken });
    assertOk(response, "complete_word_review (retry with a different, ignored p_result)");
    const row = firstRow(response);
    assert.equal(row.already_processed, true);
    assert.equal(row.new_state, reviewRow.new_state, "A retried event id must return the originally-applied transition.");
    assert.equal(row.new_correct_streak, reviewRow.new_correct_streak);
    assert.equal(row.result, reviewRow.result, "The original result ('correct') must be returned, never the retry's 'incorrect'.");
  });

  await t.test("Another user (B) cannot review A's word_progress_id (ownership check inside the RPC)", async () => {
    const response = await callRpc(ctx.config, "complete_word_review", {
      p_event_id: crypto.randomUUID(),
      p_word_progress_id: wordProgressId,
      p_result: "correct",
      p_review_time_seconds: 5,
    }, { accessToken: ctx.userB.session.accessToken });
    assertError(response, "B attempting to review A's word_progress_id");
  });

  // ---- Custom Practice -------------------------------------------------
  const customPracticeEventId = crypto.randomUUID();
  await t.test("Unauthenticated complete_custom_practice_word is rejected", async () => {
    const response = await callRpc(ctx.config, "complete_custom_practice_word", {
      p_event_id: customPracticeEventId,
      p_target_language: targetLanguage,
      p_custom_practice_time_seconds: 20,
    }, {});
    assertError(response, "complete_custom_practice_word with no Authorization header");
  });

  let customPracticeRow;
  await t.test("Authenticated Custom Practice completion records active time only", async () => {
    const response = await callRpc(ctx.config, "complete_custom_practice_word", {
      p_event_id: customPracticeEventId,
      p_target_language: targetLanguage,
      p_custom_practice_time_seconds: 20,
    }, { accessToken: ctx.userA.session.accessToken });
    assertOk(response, "complete_custom_practice_word (first call)");
    customPracticeRow = firstRow(response);
    assertCompleteCustomPracticeShape(customPracticeRow, "complete_custom_practice_word first call");
    assert.equal(customPracticeRow.already_processed, false);
    assert.ok(customPracticeRow.custom_practice_time_seconds_today >= 20);
  });

  await t.test("A retried Custom Practice completion (same event id) is idempotent", async () => {
    const response = await callRpc(ctx.config, "complete_custom_practice_word", {
      p_event_id: customPracticeEventId,
      p_target_language: targetLanguage,
      p_custom_practice_time_seconds: 999, // deliberately different — must be ignored
    }, { accessToken: ctx.userA.session.accessToken });
    assertOk(response, "complete_custom_practice_word (retry with a different, ignored duration)");
    const row = firstRow(response);
    assert.equal(row.already_processed, true);
    assert.equal(
      row.custom_practice_time_seconds_today,
      customPracticeRow.custom_practice_time_seconds_today,
      "A retried event id must not add the new duration again.",
    );
  });
}
