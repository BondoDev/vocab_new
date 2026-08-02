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

const OUTCOME = { completed: true, revealed: false, attempts: 1 };

console.log("\n=== session progression ===\n");

test("1. Begin Session starts at the first word's intro", () => {
  const initial = createInitialSessionState(makeQueue(3));
  const started = reduceSessionState(initial, { type: "BEGIN" });
  assert.equal(started.hasStarted, true);
  assert.equal(started.currentWordIndex, 0);
  assert.equal(started.currentStep, "word_intro");
});

test("2. Intro advances to broken-word exercise", () => {
  const started = reduceSessionState(createInitialSessionState(makeQueue(3)), { type: "BEGIN" });
  const next = reduceSessionState(started, { type: "START_EXERCISES" });
  assert.equal(next.currentStep, "broken_word");
});

test("3. Broken-word completion advances to half-word", () => {
  let state = reduceSessionState(createInitialSessionState(makeQueue(3)), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  assert.equal(state.currentStep, "half_word");
  assert.deepEqual(state.currentWordOutcomes.broken_word, OUTCOME);
});

test("4. Half-word completion advances to full typing", () => {
  let state = reduceSessionState(createInitialSessionState(makeQueue(3)), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "half_word", outcome: OUTCOME });
  assert.equal(state.currentStep, "full_typing");
});

test("5. Full typing completion advances straight to the next word's intro (no intermediate screen)", () => {
  const queue = makeQueue(3);
  let state = reduceSessionState(createInitialSessionState(queue), { type: "BEGIN" });
  state = reduceSessionState(state, { type: "START_EXERCISES" });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "half_word", outcome: OUTCOME });
  state = reduceSessionState(state, { type: "COMPLETE_EXERCISE", step: "full_typing", outcome: OUTCOME });
  assert.equal(state.currentStep, "word_intro");
  assert.equal(state.currentWordIndex, 1);
  assert.deepEqual(state.completedConceptIds, [queue[0].conceptId]);
});

// Drives one word through all three exercises; the returned state already
// sits at the next word's word_intro (or session_complete if that was the
// last word) — completing full_typing finishes the word directly.
function finishWord(state) {
  let next = reduceSessionState(state, { type: "START_EXERCISES" });
  next = reduceSessionState(next, { type: "COMPLETE_EXERCISE", step: "broken_word", outcome: OUTCOME });
  next = reduceSessionState(next, { type: "COMPLETE_EXERCISE", step: "half_word", outcome: OUTCOME });
  next = reduceSessionState(next, { type: "COMPLETE_EXERCISE", step: "full_typing", outcome: OUTCOME });
  return next;
}

test("6. Completing a word's exercises advances to the next queue item, preserving order", () => {
  const queue = makeQueue(3);
  let state = reduceSessionState(createInitialSessionState(queue), { type: "BEGIN" });
  state = finishWord(state);
  assert.equal(state.currentWordIndex, 1);
  assert.equal(state.currentStep, "word_intro");
  assert.deepEqual(state.completedConceptIds, [queue[0].conceptId]);
  assert.deepEqual(state.currentWordOutcomes.broken_word, { completed: false, revealed: false, attempts: 0 });
});

test("7. Final word completion reaches session-complete", () => {
  const queue = makeQueue(2);
  let state = reduceSessionState(createInitialSessionState(queue), { type: "BEGIN" });
  state = finishWord(state); // word 1 done -> word 2 intro
  state = finishWord(state); // word 2 done -> last word, session complete
  assert.equal(state.currentStep, "session_complete");
  assert.equal(state.isComplete, true);
  assert.deepEqual(state.completedConceptIds, [queue[0].conceptId, queue[1].conceptId]);
});

console.log("\n=== progress labels ===\n");

test("8. Progress labels: position/total/completed match the documented rule", () => {
  const queue = makeQueue(15);
  let state = reduceSessionState(createInitialSessionState(queue), { type: "BEGIN" });
  for (let i = 0; i < 3; i += 1) {
    state = finishWord(state);
  }
  // Now viewing word 4 of 15, with words 1-3 completed.
  const progress = getSessionProgress(state);
  assert.equal(progress.currentPosition, 4);
  assert.equal(progress.totalWords, 15);
  assert.equal(progress.completedWords, 3);
});

test("8b. Exercise step number is 1/2/3 during exercises and null otherwise", () => {
  assert.equal(getExerciseStepNumber("word_intro"), null);
  assert.equal(getExerciseStepNumber("broken_word"), 1);
  assert.equal(getExerciseStepNumber("half_word"), 2);
  assert.equal(getExerciseStepNumber("full_typing"), 3);
  assert.equal(getExerciseStepNumber("session_complete"), null);
});

console.log("\n=== guards ===\n");

test("9. Empty queue cannot start", () => {
  const initial = createInitialSessionState([]);
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
  assert.equal(/supabaseRequest|readStudiedConceptIds|readTodayNewWordsCompleted/.test(source), false, "must not call any Supabase read/write helper");
});

test("11. Fixed exercise order cannot be reordered or skipped", () => {
  // (a) Starting a session always lands on broken_word first — no action
  // parameter exists to choose a different first exercise.
  let state = reduceSessionState(createInitialSessionState(makeQueue(2)), { type: "BEGIN" });
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

console.log("\n=== exit copy (source-text) ===\n");

test("12. Exit confirmation copy never claims progress was saved", () => {
  const interfacePath = path.join(ROOT_DIR, "src", "data", "interface", "english_interface.json");
  const data = JSON.parse(fs.readFileSync(interfacePath, "utf8"));
  const description = data.studyNewWords?.leaveSessionDescription ?? "";
  assert.ok(description.length > 0, "leaveSessionDescription key must exist");
  assert.match(description.toLowerCase(), /not.*saved/, "must explicitly say progress was NOT saved");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("new-word-study-session guard passed");
}
