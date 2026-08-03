// Focused guard for the pure Study New Words guided-session state machine
// in src/features/study-new-words/newWordStudySessionState.ts. That module
// has only a type-only import (erased at runtime), so — like
// src/data/learning/newWordStudyQueue.ts and its own test script — it loads
// directly here via Node's native TypeScript stripping, with no Supabase,
// React, or exercise-component dependency.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-new-word-study-session.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createInitialSessionState,
  getExerciseStepNumber,
  getSessionProgress,
  reduceSessionState,
} from "../../../src/features/study-new-words/newWordStudySessionState.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function makeQueue(count) {
  return Array.from({ length: count }, (_, index) => ({
    conceptId: `C-${String(index + 1).padStart(4, "0")}`,
    learningOrder: index + 1,
    targetWord: `word-${index + 1}`,
    translation: `translation-${index + 1}`,
  }));
}

// Wraps createInitialSessionState with sensible defaults for tests that
// only care about queue-relative behavior: dailyGoal defaults to the
// queue's own length and wordsCompletedBeforeSession defaults to 0 — i.e.
// "a fresh first session of the day, nothing completed earlier." Tests that
// specifically exercise the daily-goal-aware progress math pass overrides
// explicitly (see the "daily-goal-aware progress" section below).
function initSession(queue, overrides = {}) {
  return createInitialSessionState({
    queue,
    dailyGoal: overrides.dailyGoal ?? queue.length,
    wordsCompletedBeforeSession: overrides.wordsCompletedBeforeSession ?? 0,
  });
}

const OUTCOME = { completed: true, revealed: false, attempts: 1 };

console.log("\n=== session progression ===\n");

test("1. Begin Session starts at the first word's intro", () => {
  const initial = initSession(makeQueue(3));
  const started = reduceSessionState(initial, { type: "BEGIN" });
  assert.equal(started.hasStarted, true);
  assert.equal(started.currentWordIndex, 0);
  assert.equal(started.currentStep, "word_intro");
});

test("2. Intro advances to broken-word exercise", () => {
  const started = reduceSessionState(initSession(makeQueue(3)), { type: "BEGIN" });
  const next = reduceSessionState(started, { type: "START_EXERCISES" });
  assert.equal(next.currentStep, "broken_word");
});

test("3. Broken-word completion advances to half-word", () => {
  let state = reduceSessionState(initSession(makeQueue(3)), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  assert.equal(state.currentStep, "half_word");
  assert.deepEqual(state.currentWordOutcomes.broken_word, OUTCOME);
});

test("4. Half-word completion advances to full typing", () => {
  let state = reduceSessionState(initSession(makeQueue(3)), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "half_word", outcome: OUTCOME });
  assert.equal(state.currentStep, "full_typing");
});

test("5. Full typing completion hands off to the saving_word persistence boundary (not straight to the next word)", () => {
  const queue = makeQueue(3);
  let state = reduceSessionState(initSession(queue), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "half_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "full_typing", outcome: OUTCOME });
  assert.equal(state.currentStep, "saving_word");
  // Not counted as completed yet — only SAVE_SUCCEEDED counts a word.
  assert.deepEqual(state.completedConceptIds, []);
  assert.equal(state.currentWordIndex, 0);
});

// Drives one word through all three exercises and a successful save; the
// returned state already sits at the next word's word_intro (or
// session_complete if that was the last word) — SAVE_SUCCEEDED both counts
// the word and advances the queue in one transition (there is no separate
// word_complete/NEXT_WORD step).
function finishWord(state) {
  let next = reduceSessionState(state, { type: "START_EXERCISES" });
  next = reduceSessionState(next, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  next = reduceSessionState(next, { type: "COMPLETE_EXERCISE", step: "half_word", outcome: OUTCOME });
  next = reduceSessionState(next, { type: "COMPLETE_EXERCISE", step: "full_typing", outcome: OUTCOME });
  next = reduceSessionState(next, { type: "SAVE_SUCCEEDED" });
  return next;
}

test("6. A successfully saved word advances to the next queue item, preserving order", () => {
  const queue = makeQueue(3);
  let state = reduceSessionState(initSession(queue), { type: "BEGIN" });
  state = finishWord(state);
  assert.equal(state.currentWordIndex, 1);
  assert.equal(state.currentStep, "word_intro");
  assert.deepEqual(state.completedConceptIds, [queue[0].conceptId]);
  assert.deepEqual(state.currentWordOutcomes.broken_word, { completed: false, revealed: false, attempts: 0 });
});

test("7. Final word completion reaches session-complete only once its save succeeds", () => {
  const queue = makeQueue(2);
  let state = reduceSessionState(initSession(queue), { type: "BEGIN" });
  state = finishWord(state); // word 1 done -> word 2 intro
  state = finishWord(state); // word 2 done -> last word, session complete
  assert.equal(state.currentStep, "session_complete");
  assert.equal(state.isComplete, true);
  assert.deepEqual(state.completedConceptIds, [queue[0].conceptId, queue[1].conceptId]);
});

console.log("\n=== progress labels ===\n");

test("8. Progress labels: position/total/completed match the documented rule", () => {
  const queue = makeQueue(15);
  let state = reduceSessionState(initSession(queue), { type: "BEGIN" });
  for (let i = 0; i < 3; i += 1) {
    state = finishWord(state);
  }
  // Now viewing word 4 of 15, with words 1-3 completed.
  const progress = getSessionProgress(state);
  assert.equal(progress.currentPosition, 4);
  assert.equal(progress.totalWords, 15);
  assert.equal(progress.completedWords, 3);
});

test("8b. Exercise step number is 1/2/3 during exercises and null otherwise (including the new persistence steps)", () => {
  assert.equal(getExerciseStepNumber("word_intro"), null);
  assert.equal(getExerciseStepNumber("broken_word"), 1);
  assert.equal(getExerciseStepNumber("half_word"), 2);
  assert.equal(getExerciseStepNumber("full_typing"), 3);
  assert.equal(getExerciseStepNumber("saving_word"), null);
  assert.equal(getExerciseStepNumber("save_error"), null);
  assert.equal(getExerciseStepNumber("session_complete"), null);
});

console.log("\n=== daily-goal-aware progress (returning mid-goal) ===\n");

test("8c. A returning session (goal 15, 5 already done earlier today) shows 'Word 6 of 15' on its first word, not 'Word 1 of 10'", () => {
  // Reproduces the reported bug: daily goal 15, learner already finished 5
  // words in an earlier session today, comes back later. Phase 1's queue
  // only contains the 10 remaining words, but the label must keep counting
  // against the full daily goal instead of resetting to "of 10".
  const queue = makeQueue(10); // dailyGoal(15) - wordsCompletedToday(5)
  const state = reduceSessionState(
    initSession(queue, { dailyGoal: 15, wordsCompletedBeforeSession: 5 }),
    { type: "BEGIN" },
  );
  const progress = getSessionProgress(state);
  assert.equal(progress.currentPosition, 6);
  assert.equal(progress.totalWords, 15);
  assert.equal(progress.completedWords, 5);
});

test("8d. Completing words in a returning session keeps counting from the earlier-today baseline", () => {
  const queue = makeQueue(10);
  let state = reduceSessionState(
    initSession(queue, { dailyGoal: 15, wordsCompletedBeforeSession: 5 }),
    { type: "BEGIN" },
  );
  for (let i = 0; i < 4; i += 1) {
    state = finishWord(state);
  }
  // 5 done earlier + 4 done this session = 9; now viewing the 5th word of
  // this session's queue, i.e. the 10th word of the day overall.
  const progress = getSessionProgress(state);
  assert.equal(progress.currentPosition, 10);
  assert.equal(progress.totalWords, 15);
  assert.equal(progress.completedWords, 9);
});

test("8e. Finishing every word in a returning session reaches exactly the daily goal, never past it", () => {
  const queue = makeQueue(10);
  let state = reduceSessionState(
    initSession(queue, { dailyGoal: 15, wordsCompletedBeforeSession: 5 }),
    { type: "BEGIN" },
  );
  for (let i = 0; i < 10; i += 1) {
    state = finishWord(state);
  }
  assert.equal(state.currentStep, "session_complete");
  const progress = getSessionProgress(state);
  assert.equal(progress.completedWords, 15);
  assert.equal(progress.totalWords, 15);
});

console.log("\n=== guards ===\n");

test("9. Empty queue cannot start", () => {
  const initial = initSession([]);
  const result = reduceSessionState(initial, { type: "BEGIN" });
  assert.equal(result.hasStarted, false);
  assert.equal(result, initial); // no-op: same reference, no transition at all
});

test("10. No Supabase write helper is imported or called by the state module", () => {
  const source = fs.readFileSync(
    path.join(ROOT_DIR, "src", "features", "study-new-words", "newWordStudySessionState.ts"),
    "utf8",
  );
  // Precise checks (not a blanket /supabase/i scan, which also matches this
  // module's own "no Supabase" header comment): no import from a Supabase
  // module, no REST endpoint path, no write-verb network call.
  assert.equal(/from\s+["'][^"']*supabase[^"']*["']/i.test(source), false, "must not import from a supabase module");
  assert.equal(/\/rest\/v1\//.test(source), false, "must not reference a PostgREST endpoint path");
  assert.equal(
    /supabaseRequest|readStudiedConceptIds|readTodayNewWordsCompleted|completeNewWordStudy/.test(source),
    false,
    "must not call any Supabase read/write helper",
  );
});

test("11. Fixed exercise order cannot be reordered or skipped", () => {
  // (a) Starting a session always lands on broken_word first — no action
  // parameter exists to choose a different first exercise.
  let state = reduceSessionState(initSession(makeQueue(2)), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  assert.equal(state.currentStep, "broken_word");

  // (b) Completing "half_word" while broken_word is showing is rejected
  // (can't skip ahead).
  const skipAttempt = reduceSessionState(state, {
    type: "COMPLETE_EXERCISE",
    step: "half_word",
    outcome: OUTCOME,
  });
  assert.equal(skipAttempt.currentStep, "broken_word");
  assert.equal(skipAttempt, state); // no-op

  // (c) After advancing to half_word, re-completing broken_word again is
  // also rejected (can't replay/go backward).
  const advanced = reduceSessionState(state, {
    type: "COMPLETE_EXERCISE",
    step: "broken_word",
    outcome: OUTCOME,
  });
  const replayAttempt = reduceSessionState(advanced, {
    type: "COMPLETE_EXERCISE",
    step: "broken_word",
    outcome: OUTCOME,
  });
  assert.equal(replayAttempt.currentStep, "half_word");
  assert.equal(replayAttempt, advanced); // no-op
});

console.log("\n=== Phase 3: persistence boundary ===\n");

function reachSavingWord(queueLength = 2) {
  const queue = makeQueue(queueLength);
  let state = reduceSessionState(initSession(queue), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "half_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "full_typing", outcome: OUTCOME });
  return { queue, state };
}

test("12. Successful save counts the word and advances straight to the next word_intro (no intermediate screen)", () => {
  const { queue, state } = reachSavingWord();
  const saved = reduceSessionState(state, { type: "SAVE_SUCCEEDED" });
  assert.equal(saved.currentStep, "word_intro");
  assert.deepEqual(saved.completedConceptIds, [queue[0].conceptId]);
  assert.equal(saved.currentWordIndex, 1);
});

test("13. Failed save remains on the same word (does not advance, does not count it)", () => {
  const { state } = reachSavingWord();
  const failed = reduceSessionState(state, { type: "SAVE_FAILED" });
  assert.equal(failed.currentStep, "save_error");
  assert.equal(failed.currentWordIndex, 0);
  assert.deepEqual(failed.completedConceptIds, []);
});

test("14. Retry reuses the completed exercise state instead of repeating exercises", () => {
  const { state } = reachSavingWord();
  const failed = reduceSessionState(state, { type: "SAVE_FAILED" });
  const retried = reduceSessionState(failed, { type: "RETRY_SAVE" });
  assert.equal(retried.currentStep, "saving_word");
  // All three exercise outcomes from before the failure are still intact.
  assert.deepEqual(retried.currentWordOutcomes.broken_word, OUTCOME);
  assert.deepEqual(retried.currentWordOutcomes.half_word, OUTCOME);
  assert.deepEqual(retried.currentWordOutcomes.full_typing, OUTCOME);
});

test("15. A retry that then succeeds proceeds exactly like a first-try success", () => {
  const { queue, state } = reachSavingWord();
  let next = reduceSessionState(state, { type: "SAVE_FAILED" });
  next = reduceSessionState(next, { type: "RETRY_SAVE" });
  next = reduceSessionState(next, { type: "SAVE_SUCCEEDED" });
  assert.equal(next.currentStep, "word_intro");
  assert.equal(next.currentWordIndex, 1);
  assert.deepEqual(next.completedConceptIds, [queue[0].conceptId]);
});

test("16. RETRY_SAVE is a no-op outside save_error (double activation cannot issue a second active save)", () => {
  const { state } = reachSavingWord();
  const retryWhileSaving = reduceSessionState(state, { type: "RETRY_SAVE" });
  assert.equal(retryWhileSaving, state); // no-op: still saving_word, same reference
});

test("17. A duplicate/already-completed RPC result still proceeds through SAVE_SUCCEEDED safely", () => {
  // The reducer treats every SAVE_SUCCEEDED dispatch identically regardless
  // of whether the RPC reported a fresh insert or an idempotent
  // already-completed result — that distinction only affects whether the
  // caller increments a *different* daily-stat display, not this
  // reducer's transition.
  const { queue, state } = reachSavingWord();
  const saved = reduceSessionState(state, { type: "SAVE_SUCCEEDED" });
  assert.equal(saved.currentStep, "word_intro");
  assert.deepEqual(saved.completedConceptIds, [queue[0].conceptId]);
});

test("18. Dispatching SAVE_SUCCEEDED twice in a row does not double-count the word (second dispatch is a no-op)", () => {
  const { queue, state } = reachSavingWord();
  const savedOnce = reduceSessionState(state, { type: "SAVE_SUCCEEDED" });
  // A second SAVE_SUCCEEDED is rejected outright — currentStep already
  // moved to word_intro for the next word, not saving_word — but even so,
  // completedConceptIds must never contain a duplicate entry for word 1.
  const savedTwice = reduceSessionState(savedOnce, { type: "SAVE_SUCCEEDED" });
  assert.equal(savedTwice, savedOnce); // no-op: currentStep is no longer saving_word
  assert.deepEqual(savedTwice.completedConceptIds, [queue[0].conceptId]);
});

test("19. SAVE_SUCCEEDED only advances the queue from saving_word — never from word_intro or full_typing", () => {
  let wordIntroState = reduceSessionState(initSession(makeQueue(2)), { type: "BEGIN" });
  const noopFromIntro = reduceSessionState(wordIntroState, { type: "SAVE_SUCCEEDED" });
  assert.equal(noopFromIntro, wordIntroState); // no-op
  assert.equal(noopFromIntro.currentWordIndex, 0);

  let fullTypingState = reduceSessionState(initSession(makeQueue(2)), { type: "BEGIN" });
  fullTypingState = reduceSessionState(fullTypingState, { type: "START_EXERCISES" });
  const noopFromFullTyping = reduceSessionState(fullTypingState, { type: "SAVE_SUCCEEDED" });
  assert.equal(noopFromFullTyping, fullTypingState); // no-op
});

test("20. The final word reaches session_complete directly on its SAVE_SUCCEEDED — no separate confirmation step needed", () => {
  const queue = makeQueue(1);
  let state = reduceSessionState(initSession(queue), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "half_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "full_typing", outcome: OUTCOME });
  assert.equal(state.currentStep, "saving_word");
  assert.notEqual(state.currentStep, "session_complete");

  const finished = reduceSessionState(state, { type: "SAVE_SUCCEEDED" });
  assert.equal(finished.currentStep, "session_complete");
  assert.equal(finished.isComplete, true);
  assert.deepEqual(finished.completedConceptIds, [queue[0].conceptId]);
});

test("21. The completed-session count (getSessionProgress) reflects only persisted words, never merely-attempted ones", () => {
  const { state } = reachSavingWord(3);
  // Still in saving_word for word 1 — nothing persisted yet.
  assert.equal(getSessionProgress(state).completedWords, 0);
  const saved = reduceSessionState(state, { type: "SAVE_SUCCEEDED" });
  assert.equal(getSessionProgress(saved).completedWords, 1);
});

console.log("\n=== exit copy (source-text) ===\n");

test("22. Exit confirmation copy is honest: already-completed words are saved, the current word is not", () => {
  const interfacePath = path.join(ROOT_DIR, "src", "data", "interface", "english_interface.json");
  const data = JSON.parse(fs.readFileSync(interfacePath, "utf8"));
  const description = data.studyNewWords?.leaveSessionDescription ?? "";
  assert.ok(description.length > 0, "leaveSessionDescription key must exist");
  assert.match(
    description.toLowerCase(),
    /already.*saved|completed.*saved/,
    "must say already-completed words in this session are saved",
  );
  assert.match(
    description.toLowerCase(),
    /not.*saved/,
    "must explicitly say the current word has NOT been saved yet",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("new-word-study-session guard passed");
}
