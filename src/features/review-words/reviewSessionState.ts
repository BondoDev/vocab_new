// Pure state machine for the Review Words session (Phases 2 and 3).
// Deliberately its own module, separate from
// src/features/study-new-words/newWordStudySessionState.ts — Review Words
// has its own step set, its own per-word result shape, and its own
// persistence boundary, so overloading that module's states/actions with
// review-only concerns would blur two unrelated flows into one. No React,
// no Supabase — only type-only imports (erased at runtime) plus a value
// import of the plan builder above (also import-free beyond the shuffle
// helper) — so this stays loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-review-session.mjs.
import {
  buildReviewSessionPlan,
  extendReviewSessionPlan,
  type GroupExerciseId,
  type ReviewSessionPlan,
  type TypingExerciseId,
} from "./reviewSessionPlan.ts";
import type { ReviewOutcome } from "../../data/learning/reviewOutcomeTransition.ts";
import type { WordState } from "../../data/learning/wordReviewSchedule.ts";

export type ReviewSessionStep =
  | "loading"
  | "word_exercise"
  // Entered the instant a word_exercise reaches a final local outcome
  // (correct/incorrect/skipped). The session component is responsible for
  // issuing the complete_word_review RPC call while this step is showing
  // and dispatching SAVE_REVIEW_SUCCEEDED/SAVE_REVIEW_FAILED with the
  // result — nothing in this reducer performs the write itself (mirrors
  // Study New Words' "saving_word" boundary, kept as this module's own
  // separate step/actions rather than reusing that one).
  | "saving_review"
  // Reached only after the RPC call failed. The word's local outcome,
  // eventId, and position are all untouched, so RETRY_SAVE_REVIEW can
  // return to saving_review without repeating the exercise.
  | "review_save_error"
  | "group_exercise"
  | "block_complete"
  // Continuous reviewing: every prepared word is done and the next batch
  // hasn't arrived yet. APPEND_QUEUE resumes from here; QUEUE_EXHAUSTED
  // (the next batch came back empty under the selection rules) moves to
  // all_caught_up. The component shows loading / retry while waiting.
  | "awaiting_more"
  // No eligible word is left for this session — distinct from a failed
  // batch request, which keeps the session in awaiting_more with a retry.
  | "all_caught_up"
  // The summary: reached only through FINISH_REVIEW (the learner decides
  // when to stop), or BEGIN with an empty queue.
  | "session_complete"
  | "error";

export interface ReviewWordResult {
  conceptId: string;
  // user_word_progress row id — required to call complete_word_review.
  progressRowId: string;
  // Stable per-word-encounter id (see reviewSessionPlan.ts's
  // ReviewWordAssignment.eventId) reused verbatim across every retry of
  // this word's save.
  eventId: string;
  typingExerciseId: TypingExerciseId;
  // null until the word_exercise step determines a final outcome.
  outcome: ReviewOutcome | null;
  // True only once complete_word_review has actually succeeded for this
  // word (including an idempotent "already processed" replay, which counts
  // as success) — this is the source of truth for "reviewed" in
  // getReviewSessionProgress, not merely "attempted".
  saved: boolean;
  // Recorded from the RPC's response for potential future display; not
  // used to drive any further transition locally — the database remains
  // authoritative.
  resultingState: WordState | null;
  resultingStreak: number | null;
  // Group exercises are reinforcement-only in this phase: participating in
  // one never promotes/demotes a word, never touches correct_streak or a
  // deadline, and is never persisted as its own review event (see
  // GROUP_EXERCISE_COMPLETE below). These two fields exist purely for local
  // session tracking/display.
  groupExerciseParticipated: boolean;
  groupExerciseSuccess: boolean | null;
}

export interface ReviewGroupResult {
  // The exact four concept ids that were individually reviewed just before
  // this group exercise — never substituted, never re-derived after the
  // fact, so a future statistics phase can trust this list matches what the
  // learner actually saw together.
  conceptIds: string[];
  groupExerciseId: GroupExerciseId;
  completed: boolean;
  success: boolean;
}

export interface ReviewQueueItemLike {
  conceptId: string;
  progressRowId: string;
}

export interface ReviewSessionState {
  plan: ReviewSessionPlan;
  currentStep: ReviewSessionStep;
  // Restored by RETRY — the step EXERCISE_ERROR was dispatched from, so a
  // safe retry returns the learner to the same exercise instead of
  // guessing where to resume.
  previousStep: ReviewSessionStep;
  currentBlockIndex: number;
  currentWordIndexInBlock: number;
  // One entry per queue item, in original queue order — wordResults[i]
  // corresponds to queue item i (see createInitialReviewSessionState).
  wordResults: ReviewWordResult[];
  groupResults: ReviewGroupResult[];
  isComplete: boolean;
}

export function createInitialReviewSessionState(
  queue: ReviewQueueItemLike[],
  randomFn: () => number = Math.random,
  generateEventId?: () => string,
): ReviewSessionState {
  const plan =
    generateEventId !== undefined
      ? buildReviewSessionPlan(queue.length, randomFn, generateEventId)
      : buildReviewSessionPlan(queue.length, randomFn);

  const wordResults: ReviewWordResult[] = plan.blocks
    .flatMap((block) => block.words)
    .map((assignment) => ({
      conceptId: queue[assignment.queueIndex]?.conceptId ?? "",
      progressRowId: queue[assignment.queueIndex]?.progressRowId ?? "",
      eventId: assignment.eventId,
      typingExerciseId: assignment.typingExerciseId,
      outcome: null,
      saved: false,
      resultingState: null,
      resultingStreak: null,
      groupExerciseParticipated: false,
      groupExerciseSuccess: null,
    }));

  return {
    plan,
    currentStep: "loading",
    previousStep: "loading",
    currentBlockIndex: 0,
    currentWordIndexInBlock: 0,
    wordResults,
    groupResults: [],
    isComplete: plan.blocks.length === 0,
  };
}

export interface SavedReviewResult {
  newState: WordState;
  newCorrectStreak: number;
}

export type ReviewSessionAction =
  | { type: "BEGIN" }
  // Next batch prepared by the component (already deduplicated against
  // every concept in the session) — extends the plan and wordResults.
  | { type: "APPEND_QUEUE"; items: ReviewQueueItemLike[] }
  | { type: "QUEUE_EXHAUSTED" }
  // "Finish Review": end the session now and show the summary. Saved
  // reviews stay saved; the word on screen (unsaved) simply isn't counted.
  | { type: "FINISH_REVIEW" }
  | { type: "WORD_OUTCOME_DETERMINED"; outcome: ReviewOutcome }
  | { type: "SAVE_REVIEW_SUCCEEDED"; result: SavedReviewResult }
  | { type: "SAVE_REVIEW_FAILED" }
  | { type: "RETRY_SAVE_REVIEW" }
  | { type: "GROUP_EXERCISE_COMPLETE"; success: boolean }
  | { type: "CONTINUE_AFTER_BLOCK" }
  | { type: "EXERCISE_ERROR" }
  | { type: "RETRY" };

export function getCurrentBlock(state: ReviewSessionState) {
  return state.plan.blocks[state.currentBlockIndex] ?? null;
}

export function getCurrentWordAssignment(state: ReviewSessionState) {
  const block = getCurrentBlock(state);
  return block?.words[state.currentWordIndexInBlock] ?? null;
}

export interface ReviewSessionProgress {
  wordsReviewed: number;
  totalWords: number;
}

// "Reviewed" means persisted (saved === true), not merely attempted — a
// word whose save is still pending or has failed does not count yet,
// matching the requirement that leaving mid-session keeps exactly the
// words that actually reached a successful RPC call.
export function getReviewSessionProgress(state: ReviewSessionState): ReviewSessionProgress {
  return {
    wordsReviewed: state.wordResults.filter((result) => result.saved).length,
    totalWords: state.wordResults.length,
  };
}

function updateWordResult(
  wordResults: ReviewWordResult[],
  queueIndex: number,
  patch: Partial<ReviewWordResult>,
): ReviewWordResult[] {
  if (queueIndex < 0 || queueIndex >= wordResults.length) {
    return wordResults;
  }
  return wordResults.map((result, index) => (index === queueIndex ? { ...result, ...patch } : result));
}

// Moves to the first word of the next block, or — at the end of everything
// prepared so far — waits for the next batch. Reaching the end of the plan
// never completes the session by itself: the session length is the
// learner's choice (FINISH_REVIEW), not the batch size.
function moveToNextBlockOrAwait(state: ReviewSessionState, patch: Partial<ReviewSessionState>): ReviewSessionState {
  const hasNextBlock = state.currentBlockIndex + 1 < state.plan.blocks.length;
  if (hasNextBlock) {
    return {
      ...state,
      ...patch,
      currentBlockIndex: state.currentBlockIndex + 1,
      currentWordIndexInBlock: 0,
      currentStep: "word_exercise",
    };
  }
  return { ...state, ...patch, currentStep: "awaiting_more" };
}

// Shared by SAVE_REVIEW_SUCCEEDED: decides whether to move to the next word
// in this block, into this block's group exercise, or on to the next block
// (or awaiting_more).
function advanceAfterWordSaved(state: ReviewSessionState, wordResults: ReviewWordResult[]): ReviewSessionState {
  const block = getCurrentBlock(state);
  if (!block) {
    return { ...state, wordResults, previousStep: state.currentStep, currentStep: "error" };
  }

  const isLastWordInBlock = state.currentWordIndexInBlock >= block.words.length - 1;
  if (!isLastWordInBlock) {
    return {
      ...state,
      wordResults,
      currentWordIndexInBlock: state.currentWordIndexInBlock + 1,
      currentStep: "word_exercise",
    };
  }

  // Finished every word in this block. A full block moves into its group
  // exercise; a short remainder block (no group exercise — a batch whose
  // size isn't a multiple of 4) moves straight on.
  if (block.groupExerciseId) {
    return { ...state, wordResults, currentStep: "group_exercise" };
  }
  return moveToNextBlockOrAwait(state, { wordResults });
}

export function reduceReviewSessionState(
  state: ReviewSessionState,
  action: ReviewSessionAction,
): ReviewSessionState {
  switch (action.type) {
    case "BEGIN": {
      if (state.currentStep !== "loading") {
        return state;
      }
      if (state.plan.blocks.length === 0) {
        return { ...state, currentStep: "session_complete", isComplete: true };
      }
      return { ...state, currentStep: "word_exercise" };
    }

    case "WORD_OUTCOME_DETERMINED": {
      if (state.currentStep !== "word_exercise") {
        return state;
      }
      const assignment = getCurrentWordAssignment(state);
      if (!assignment) {
        return { ...state, previousStep: state.currentStep, currentStep: "error" };
      }
      const wordResults = updateWordResult(state.wordResults, assignment.queueIndex, {
        outcome: action.outcome,
      });
      return { ...state, wordResults, currentStep: "saving_review" };
    }

    case "SAVE_REVIEW_SUCCEEDED": {
      if (state.currentStep !== "saving_review") {
        return state;
      }
      const assignment = getCurrentWordAssignment(state);
      if (!assignment) {
        return { ...state, previousStep: state.currentStep, currentStep: "error" };
      }
      const wordResults = updateWordResult(state.wordResults, assignment.queueIndex, {
        saved: true,
        resultingState: action.result.newState,
        resultingStreak: action.result.newCorrectStreak,
      });
      return advanceAfterWordSaved(state, wordResults);
    }

    case "SAVE_REVIEW_FAILED": {
      if (state.currentStep !== "saving_review") {
        return state;
      }
      return { ...state, currentStep: "review_save_error" };
    }

    case "RETRY_SAVE_REVIEW": {
      if (state.currentStep !== "review_save_error") {
        return state;
      }
      return { ...state, currentStep: "saving_review" };
    }

    case "GROUP_EXERCISE_COMPLETE": {
      if (state.currentStep !== "group_exercise") {
        return state;
      }
      const block = getCurrentBlock(state);
      if (!block || !block.groupExerciseId) {
        return { ...state, previousStep: state.currentStep, currentStep: "error" };
      }

      const conceptIds = block.words.map((assignment) => state.wordResults[assignment.queueIndex]?.conceptId ?? "");
      let wordResults = state.wordResults;
      for (const assignment of block.words) {
        wordResults = updateWordResult(wordResults, assignment.queueIndex, {
          groupExerciseParticipated: true,
          groupExerciseSuccess: action.success,
        });
      }

      const groupResults = [
        ...state.groupResults,
        {
          conceptIds,
          groupExerciseId: block.groupExerciseId,
          completed: true,
          success: action.success,
        },
      ];

      return moveToNextBlockOrAwait(state, { wordResults, groupResults });
    }

    case "APPEND_QUEUE": {
      // Ignored once the session has ended (a late batch must never reopen
      // a finished session) or when there's nothing to add.
      if (state.isComplete || state.currentStep === "all_caught_up" || action.items.length === 0) {
        return state;
      }
      const plan = extendReviewSessionPlan(state.plan, action.items.length);
      const appendedAssignments = plan.blocks.slice(state.plan.blocks.length).flatMap((block) => block.words);
      const appendedResults: ReviewWordResult[] = appendedAssignments.map((assignment) => {
        const item = action.items[assignment.queueIndex - state.plan.totalWords];
        return {
          conceptId: item?.conceptId ?? "",
          progressRowId: item?.progressRowId ?? "",
          eventId: assignment.eventId,
          typingExerciseId: assignment.typingExerciseId,
          outcome: null,
          saved: false,
          resultingState: null,
          resultingStreak: null,
          groupExerciseParticipated: false,
          groupExerciseSuccess: null,
        };
      });
      const extended = { ...state, plan, wordResults: [...state.wordResults, ...appendedResults] };
      // Waiting at the end of the old plan: continue with the first new block.
      if (state.currentStep === "awaiting_more") {
        return {
          ...extended,
          currentBlockIndex: state.plan.blocks.length,
          currentWordIndexInBlock: 0,
          currentStep: "word_exercise",
        };
      }
      return extended;
    }

    case "QUEUE_EXHAUSTED": {
      if (state.currentStep !== "awaiting_more") {
        return state;
      }
      return { ...state, currentStep: "all_caught_up" };
    }

    case "FINISH_REVIEW": {
      // Not while a save is in flight (its result would be dropped and the
      // word left out of the summary); a no-op once already finished.
      if (state.currentStep === "saving_review" || state.isComplete) {
        return state;
      }
      return { ...state, currentStep: "session_complete", isComplete: true };
    }

    case "CONTINUE_AFTER_BLOCK": {
      if (state.currentStep !== "block_complete") {
        return state;
      }
      return {
        ...state,
        currentBlockIndex: state.currentBlockIndex + 1,
        currentWordIndexInBlock: 0,
        currentStep: "word_exercise",
      };
    }

    case "EXERCISE_ERROR": {
      if (state.currentStep === "error") {
        return state;
      }
      return { ...state, previousStep: state.currentStep, currentStep: "error" };
    }

    case "RETRY": {
      if (state.currentStep !== "error") {
        return state;
      }
      return { ...state, currentStep: state.previousStep };
    }

    default:
      return state;
  }
}
