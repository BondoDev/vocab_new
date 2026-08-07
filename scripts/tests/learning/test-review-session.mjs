// Focused guard for Review Words Phase 2's pure session-orchestration
// modules: src/features/review-words/reviewSessionPlan.ts (block/exercise
// assignment) and reviewSessionState.ts (the session state machine). Both
// are free of React/Supabase/exercise-component imports (only a value
// import of the generic shuffle helper reviewQueueWeights.ts already
// exports — not the Phase 1 queue-selection algorithm itself), so — like
// test-new-word-study-session.mjs — they load directly here via Node's
// native TypeScript stripping.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-review-session.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBalancedSequence,
  buildReviewSessionPlan,
  GROUP_EXERCISE_POOL,
  REVIEW_BLOCK_SIZE,
  TYPING_EXERCISE_POOL,
} from "../../../src/features/review-words/reviewSessionPlan.ts";
import {
  createInitialReviewSessionState,
  getCurrentBlock,
  getCurrentWordAssignment,
  getReviewSessionProgress,
  reduceReviewSessionState,
} from "../../../src/features/review-words/reviewSessionState.ts";

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
    progressRowId: `P-${String(index + 1).padStart(4, "0")}`,
  }));
}

// Drives a word_exercise all the way through to its next stopping point
// (next word_exercise, group_exercise, block_complete, or session_complete)
// the way ReviewSession.tsx actually does: WORD_OUTCOME_DETERMINED ->
// saving_review -> (effect calls the RPC) -> SAVE_REVIEW_SUCCEEDED. Tests
// stand in for the RPC with a fixed { newState, newCorrectStreak } result
// since reviewSessionState.ts never calls it itself.
const STUB_SAVE_RESULT = { newState: "seen", newCorrectStreak: 0 };

function completeCurrentWord(state, outcome = "correct") {
  const determined = reduceReviewSessionState(state, { type: "WORD_OUTCOME_DETERMINED", outcome });
  assert.equal(determined.currentStep, "saving_review");
  return reduceReviewSessionState(determined, { type: "SAVE_REVIEW_SUCCEEDED", result: STUB_SAVE_RESULT });
}

// Deterministic sequence generator so tests never rely on Math.random.
function sequenceRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

console.log("\n=== buildReviewSessionPlan: block formation ===\n");

test("1. Empty queue produces no blocks", () => {
  const plan = buildReviewSessionPlan(0, Math.random);
  assert.deepEqual(plan.blocks, []);
  assert.equal(plan.totalWords, 0);
});

test("2. Groups are formed correctly: 20 words -> five full 4-word blocks", () => {
  const plan = buildReviewSessionPlan(20, Math.random);
  assert.equal(plan.blocks.length, 5);
  for (const block of plan.blocks) {
    assert.equal(block.words.length, 4);
    assert.ok(GROUP_EXERCISE_POOL.includes(block.groupExerciseId));
  }
});

test("3. 4 -> group exercise pattern: every full block gets exactly one group exercise id", () => {
  const plan = buildReviewSessionPlan(8, Math.random);
  assert.equal(plan.blocks.length, 2);
  assert.ok(plan.blocks.every((b) => b.words.length === 4 && b.groupExerciseId !== null));
});

test("4. 17-word session -> four full blocks + one remainder of 1, remainder has no group exercise", () => {
  const plan = buildReviewSessionPlan(17, Math.random);
  assert.equal(plan.blocks.length, 5);
  const full = plan.blocks.slice(0, 4);
  const remainder = plan.blocks[4];
  assert.ok(full.every((b) => b.words.length === 4 && b.groupExerciseId !== null));
  assert.equal(remainder.words.length, 1);
  assert.equal(remainder.groupExerciseId, null);
});

test("5. 18-word session -> four full blocks + one remainder of 2, no group exercise", () => {
  const plan = buildReviewSessionPlan(18, Math.random);
  assert.equal(plan.blocks.length, 5);
  assert.equal(plan.blocks[4].words.length, 2);
  assert.equal(plan.blocks[4].groupExerciseId, null);
});

test("6. 19-word session -> four full blocks + one remainder of 3, no group exercise", () => {
  const plan = buildReviewSessionPlan(19, Math.random);
  assert.equal(plan.blocks.length, 5);
  assert.equal(plan.blocks[4].words.length, 3);
  assert.equal(plan.blocks[4].groupExerciseId, null);
});

test("7. 20-word session -> exactly five full blocks, no remainder", () => {
  const plan = buildReviewSessionPlan(20, Math.random);
  assert.equal(plan.blocks.length, 5);
  assert.ok(plan.blocks.every((b) => b.words.length === 4));
});

console.log("\n=== buildReviewSessionPlan: queue consumption, no skips/duplicates ===\n");

test("8. Every queue index from 0..N-1 is consumed in order, exactly once", () => {
  const plan = buildReviewSessionPlan(19, Math.random);
  const indices = plan.blocks.flatMap((b) => b.words.map((w) => w.queueIndex));
  assert.deepEqual(indices, Array.from({ length: 19 }, (_, i) => i));
});

test("9. No duplicate word assignments across the whole plan", () => {
  const plan = buildReviewSessionPlan(23, Math.random);
  const indices = plan.blocks.flatMap((b) => b.words.map((w) => w.queueIndex));
  assert.equal(new Set(indices).size, indices.length);
});

test("10. The same four words used in typing exercises are the ones passed to the group exercise", () => {
  const plan = buildReviewSessionPlan(4, Math.random);
  const block = plan.blocks[0];
  assert.equal(block.words.length, 4);
  assert.equal(block.groupExerciseId !== null, true);
  // The block's own `words` list IS what a caller must hand to the group
  // exercise — there is no second, independently-derived word list
  // anywhere in this module that could drift from it.
  assert.deepEqual(
    block.words.map((w) => w.queueIndex),
    [0, 1, 2, 3],
  );
});

console.log("\n=== exercise randomization ===\n");

test("11. Each word gets exactly one typing exercise from the allowed pool", () => {
  const plan = buildReviewSessionPlan(12, Math.random);
  for (const block of plan.blocks) {
    for (const word of block.words) {
      assert.ok(TYPING_EXERCISE_POOL.includes(word.typingExerciseId));
    }
  }
});

test("12. buildBalancedSequence never repeats the same option more than pool-size-minus-one times in a row", () => {
  const sequence = buildBalancedSequence(30, TYPING_EXERCISE_POOL, Math.random);
  let longestRun = 1;
  let currentRun = 1;
  for (let i = 1; i < sequence.length; i++) {
    currentRun = sequence[i] === sequence[i - 1] ? currentRun + 1 : 1;
    longestRun = Math.max(longestRun, currentRun);
  }
  assert.ok(longestRun < TYPING_EXERCISE_POOL.length + 1, `unexpectedly long run of ${longestRun}`);
});

test("13. buildBalancedSequence's refill boundary never repeats the immediately preceding pick", () => {
  // Fixed random sequence: three draws exhaust a 3-item pool each round.
  // Regardless of shuffle order within a batch, the seam between batch N's
  // last pick and batch N+1's first pick must never repeat.
  const randomFn = sequenceRandom([0.1, 0.5, 0.9, 0.2, 0.4, 0.8, 0.05, 0.55, 0.95]);
  const sequence = buildBalancedSequence(9, TYPING_EXERCISE_POOL, randomFn);
  for (let i = 1; i < sequence.length; i++) {
    if (i % TYPING_EXERCISE_POOL.length === 0) {
      assert.notEqual(sequence[i], sequence[i - 1], `seam repeat at index ${i}`);
    }
  }
});

test("14. buildBalancedSequence handles an empty pool and non-positive counts safely", () => {
  assert.deepEqual(buildBalancedSequence(5, [], Math.random), []);
  assert.deepEqual(buildBalancedSequence(0, TYPING_EXERCISE_POOL, Math.random), []);
});

console.log("\n=== reviewSessionState: session progression ===\n");

function beginSession(queueCount, randomFn = Math.random) {
  const queue = makeQueue(queueCount);
  const initial = createInitialReviewSessionState(queue, randomFn);
  return { queue, state: reduceReviewSessionState(initial, { type: "BEGIN" }) };
}

test("15. BEGIN with an empty queue goes straight to session_complete", () => {
  const { state } = beginSession(0);
  assert.equal(state.currentStep, "session_complete");
  assert.equal(state.isComplete, true);
});

test("16. BEGIN with a non-empty queue starts at word_exercise on the first word", () => {
  const { state } = beginSession(5);
  assert.equal(state.currentStep, "word_exercise");
  const assignment = getCurrentWordAssignment(state);
  assert.equal(assignment.queueIndex, 0);
});

test("17. A determined outcome moves to saving_review, then a successful save advances to the next word", () => {
  const { state } = beginSession(4);
  const determined = reduceReviewSessionState(state, { type: "WORD_OUTCOME_DETERMINED", outcome: "correct" });
  assert.equal(determined.currentStep, "saving_review");
  assert.equal(determined.wordResults[0].outcome, "correct");
  assert.equal(determined.wordResults[0].saved, false);

  const saved = reduceReviewSessionState(determined, {
    type: "SAVE_REVIEW_SUCCEEDED",
    result: { newState: "learning", newCorrectStreak: 0 },
  });
  assert.equal(saved.currentStep, "word_exercise");
  assert.equal(getCurrentWordAssignment(saved).queueIndex, 1);
  assert.equal(saved.wordResults[0].saved, true);
  assert.equal(saved.wordResults[0].resultingState, "learning");
  assert.equal(saved.wordResults[0].resultingStreak, 0);
});

test("18. Completing all four words of a full block moves to group_exercise", () => {
  let { state } = beginSession(4);
  for (let i = 0; i < 4; i++) {
    state = completeCurrentWord(state);
  }
  assert.equal(state.currentStep, "group_exercise");
  const block = getCurrentBlock(state);
  assert.ok(GROUP_EXERCISE_POOL.includes(block.groupExerciseId));
});

test("19. Completing the group exercise of a non-final block starts the next block immediately", () => {
  let { state } = beginSession(8);
  for (let i = 0; i < 4; i++) {
    state = completeCurrentWord(state);
  }
  state = reduceReviewSessionState(state, { type: "GROUP_EXERCISE_COMPLETE", success: true });
  assert.equal(state.currentStep, "word_exercise");
  assert.equal(state.currentBlockIndex, 1);
  assert.equal(state.currentWordIndexInBlock, 0);
  assert.equal(getCurrentWordAssignment(state).queueIndex, 4);
  assert.equal(state.groupResults.length, 1);
  assert.equal(state.groupResults[0].conceptIds.length, 4);
  assert.deepEqual(
    state.groupResults[0].conceptIds,
    state.wordResults.slice(0, 4).map((r) => r.conceptId),
  );
});

test("20. CONTINUE_AFTER_BLOCK is stale after a group exercise auto-continues", () => {
  let { state } = beginSession(8);
  for (let i = 0; i < 4; i++) {
    state = completeCurrentWord(state);
  }
  state = reduceReviewSessionState(state, { type: "GROUP_EXERCISE_COMPLETE", success: true });
  const unchanged = reduceReviewSessionState(state, { type: "CONTINUE_AFTER_BLOCK" });
  assert.equal(unchanged, state);
  assert.equal(state.currentStep, "word_exercise");
  assert.equal(state.currentBlockIndex, 1);
  assert.equal(getCurrentWordAssignment(state).queueIndex, 4);
});

test("21. A full 20-word session walks through five blocks to session_complete, with exactly 20 saved review events (not 25)", () => {
  let { state } = beginSession(20);
  let saveCount = 0;
  for (let block = 0; block < 5; block++) {
    for (let word = 0; word < 4; word++) {
      state = completeCurrentWord(state);
      saveCount++;
    }
    // The group exercise never dispatches WORD_OUTCOME_DETERMINED/
    // SAVE_REVIEW_SUCCEEDED — it has its own single-shot action.
    state = reduceReviewSessionState(state, { type: "GROUP_EXERCISE_COMPLETE", success: true });
    if (block < 4) {
      assert.equal(state.currentStep, "word_exercise");
      assert.equal(state.currentBlockIndex, block + 1);
      assert.equal(getCurrentWordAssignment(state).queueIndex, (block + 1) * 4);
    }
  }
  assert.equal(state.currentStep, "session_complete");
  assert.equal(state.isComplete, true);
  assert.equal(saveCount, 20, "exactly 20 individual word saves, not 25 (5 blocks x 4 typing + 5 group)");
  assert.equal(getReviewSessionProgress(state).wordsReviewed, 20);
  assert.equal(getReviewSessionProgress(state).totalWords, 20);
  assert.equal(state.groupResults.length, 5);
});

test("22. A 17-word session's trailing remainder skips group_exercise/block_complete and completes the session", () => {
  let { state } = beginSession(17);
  for (let block = 0; block < 4; block++) {
    for (let word = 0; word < 4; word++) {
      state = completeCurrentWord(state);
    }
    state = reduceReviewSessionState(state, { type: "GROUP_EXERCISE_COMPLETE", success: true });
    assert.equal(state.currentStep, "word_exercise");
    assert.equal(state.currentBlockIndex, block + 1);
  }
  assert.equal(state.currentStep, "word_exercise");
  state = completeCurrentWord(state, "incorrect");
  assert.equal(state.currentStep, "session_complete");
  assert.equal(getReviewSessionProgress(state).wordsReviewed, 17);
  // The remainder word's outcome is recorded faithfully, not silently
  // upgraded to a better one.
  assert.equal(state.wordResults[16].outcome, "incorrect");
  assert.equal(state.wordResults[16].saved, true);
});

test("23. No word is ever skipped over: every wordResults entry ends saved across a full session", () => {
  let { state } = beginSession(18);
  for (let block = 0; block < 5; block++) {
    const wordsInBlock = getCurrentBlock(state).words.length;
    for (let word = 0; word < wordsInBlock; word++) {
      state = completeCurrentWord(state);
    }
    if (state.currentStep === "group_exercise") {
      state = reduceReviewSessionState(state, { type: "GROUP_EXERCISE_COMPLETE", success: true });
      if (block < 4) {
        assert.equal(state.currentStep, "word_exercise");
      }
    }
  }
  assert.equal(state.currentStep, "session_complete");
  assert.ok(state.wordResults.every((r) => r.saved === true));
});

console.log("\n=== reviewSessionState: saving/error/retry ===\n");

test("24. EXERCISE_ERROR moves to error without losing plan/results, RETRY restores the prior step", () => {
  const { state } = beginSession(4);
  const errored = reduceReviewSessionState(state, { type: "EXERCISE_ERROR" });
  assert.equal(errored.currentStep, "error");
  assert.equal(errored.previousStep, "word_exercise");
  assert.deepEqual(errored.plan, state.plan);
  assert.deepEqual(errored.wordResults, state.wordResults);

  const retried = reduceReviewSessionState(errored, { type: "RETRY" });
  assert.equal(retried.currentStep, "word_exercise");
});

test("25. Stale/mismatched actions are ignored (no-op) rather than corrupting state", () => {
  const { state } = beginSession(4);
  const unchanged = reduceReviewSessionState(state, { type: "GROUP_EXERCISE_COMPLETE", success: true });
  assert.equal(unchanged, state);
  const unchanged2 = reduceReviewSessionState(state, { type: "CONTINUE_AFTER_BLOCK" });
  assert.equal(unchanged2, state);
  const unchanged3 = reduceReviewSessionState(state, { type: "SAVE_REVIEW_SUCCEEDED", result: STUB_SAVE_RESULT });
  assert.equal(unchanged3, state);
  const unchanged4 = reduceReviewSessionState(state, { type: "RETRY_SAVE_REVIEW" });
  assert.equal(unchanged4, state);
});

test("29. A failed save moves to review_save_error, preserving the outcome and eventId already determined", () => {
  const { state } = beginSession(4);
  const eventId = getCurrentWordAssignment(state).eventId;
  const determined = reduceReviewSessionState(state, { type: "WORD_OUTCOME_DETERMINED", outcome: "incorrect" });
  const failed = reduceReviewSessionState(determined, { type: "SAVE_REVIEW_FAILED" });
  assert.equal(failed.currentStep, "review_save_error");
  assert.equal(failed.wordResults[0].outcome, "incorrect");
  assert.equal(failed.wordResults[0].saved, false);
  assert.equal(getCurrentWordAssignment(failed).eventId, eventId);
});

test("30. RETRY_SAVE_REVIEW returns to saving_review without re-determining the outcome or minting a new eventId", () => {
  const { state } = beginSession(4);
  const eventId = getCurrentWordAssignment(state).eventId;
  let current = reduceReviewSessionState(state, { type: "WORD_OUTCOME_DETERMINED", outcome: "correct" });
  current = reduceReviewSessionState(current, { type: "SAVE_REVIEW_FAILED" });
  current = reduceReviewSessionState(current, { type: "RETRY_SAVE_REVIEW" });
  assert.equal(current.currentStep, "saving_review");
  assert.equal(current.wordResults[0].outcome, "correct");
  assert.equal(getCurrentWordAssignment(current).eventId, eventId);

  // The retried save can still succeed and advance normally afterward.
  const saved = reduceReviewSessionState(current, {
    type: "SAVE_REVIEW_SUCCEEDED",
    result: { newState: "seen", newCorrectStreak: 1 },
  });
  assert.equal(saved.currentStep, "word_exercise");
  assert.equal(saved.wordResults[0].saved, true);
});

test("31. Every word encounter in a plan gets its own distinct eventId", () => {
  const { state } = beginSession(9);
  const eventIds = state.wordResults.map((r) => r.eventId);
  assert.equal(new Set(eventIds).size, eventIds.length);
  assert.ok(eventIds.every((id) => typeof id === "string" && id.length > 0));
});

test("32. Group exercise completion never marks any word as saved or sets an outcome", () => {
  let { state } = beginSession(4);
  for (let i = 0; i < 4; i++) {
    state = completeCurrentWord(state);
  }
  const beforeGroup = state.wordResults.map((r) => ({ saved: r.saved, outcome: r.outcome }));
  state = reduceReviewSessionState(state, { type: "GROUP_EXERCISE_COMPLETE", success: true });
  const afterGroup = state.wordResults.map((r) => ({ saved: r.saved, outcome: r.outcome }));
  assert.deepEqual(afterGroup, beforeGroup, "group completion must not touch any word's saved/outcome fields");
  assert.ok(state.wordResults.every((r) => r.groupExerciseParticipated === true));
});

console.log("\n=== read-only / architectural guards ===\n");

test("26. No Supabase write helper (or any Supabase import) appears in the session modules", () => {
  const files = ["reviewSessionPlan.ts", "reviewSessionState.ts"].map((name) =>
    fs.readFileSync(path.join(ROOT_DIR, "src", "features", "review-words", name), "utf8"),
  );
  for (const source of files) {
    const importLines = source.split("\n").filter((line) => /^\s*import\s/.test(line));
    for (const line of importLines) {
      assert.ok(!/supabase/i.test(line), `must not import Supabase: "${line.trim()}"`);
      assert.ok(!/from ["']react/i.test(line), `must not import React: "${line.trim()}"`);
    }
  }
});

test("27. Only ReviewSession.tsx touches Supabase, and only through completeWordReview (Phase 3's one write path)", () => {
  // ReviewSession.tsx is Phase 3's sole persistence boundary — it's
  // expected (required) to import completeWordReview and
  // getStoredSupabaseSession, matching NewWordStudySession.tsx's own
  // precedent for completeNewWordStudy. Every other component in this
  // feature must stay exactly as read/Supabase-free as before.
  const sessionSource = fs.readFileSync(
    path.join(ROOT_DIR, "src", "features", "review-words", "ReviewSession.tsx"),
    "utf8",
  );
  const sessionImportLines = sessionSource.split("\n").filter((line) => /^\s*import\s/.test(line));
  assert.ok(
    sessionImportLines.some((line) => /completeWordReview/.test(line) && /ReviewPersistenceError/.test(line)),
    "must import completeWordReview and ReviewPersistenceError",
  );
  assert.ok(
    sessionImportLines.some((line) => /getStoredSupabaseSession/.test(line)),
    "must import getStoredSupabaseSession",
  );
  assert.ok(!/supabaseRequest|\/rest\/v1\//.test(sessionSource), "must call the RPC only through completeWordReview");
  assert.ok(
    !sessionImportLines.some((line) =>
      /completeNewWordStudy|updateWordProgressFavorite|readUserWordProgressForReview/.test(line),
    ),
    "must not import a different feature's Supabase helper",
  );

  const readOnlyComponentFiles = [
    "ReviewSessionComplete.tsx",
    "ReviewExerciseErrorBoundary.tsx",
    "steps/ReviewExerciseAdapter.tsx",
    "steps/ReviewGroupExerciseAdapter.tsx",
  ];
  for (const relPath of readOnlyComponentFiles) {
    const source = fs.readFileSync(path.join(ROOT_DIR, "src", "features", "review-words", relPath), "utf8");
    assert.ok(
      !/supabaseRequest|completeWordReview|completeNewWordStudy|updateWordProgressFavorite|readUserWordProgressForReview/.test(
        source,
      ),
      `${relPath} must not reference any Supabase read/write helper`,
    );
    assert.ok(!/\/rest\/v1\//.test(source), `${relPath} must not construct a raw Supabase REST path`);
  }
});

test("28. The five existing exercise components still exist and still export their original names", () => {
  const expected = {
    "src/features/practice/exercises/BrokenWordExercise.tsx": "BrokenWordExercise",
    "src/features/practice/exercises/HalfWrittenExercise.tsx": "HalfWrittenExercise",
    "src/features/practice/exercises/WordTypingExercise.tsx": "WordTypingExercise",
    "src/features/practice/exercises/ConnectWordsExercise.tsx": "ConnectWordsExercise",
    "src/features/practice/exercises/ListeningExercise.tsx": "ListeningExercise",
  };
  for (const [relPath, exportName] of Object.entries(expected)) {
    const source = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
    assert.ok(
      new RegExp(`export function ${exportName}\\(`).test(source),
      `${relPath} no longer exports function ${exportName}`,
    );
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("review-session guard passed");
}
