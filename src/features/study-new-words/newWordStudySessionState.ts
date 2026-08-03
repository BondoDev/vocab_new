// Pure state machine for the Study New Words guided session (Phase 2). No
// React, no Supabase, no side effects — only a type-only import (erased at
// runtime), so this stays loadable directly via `node --experimental-strip-types`
// for scripts/tests/learning/test-new-word-study-session.mjs, matching
// src/data/learning/newWordStudyQueue.ts's own testability approach.
//
// A single `currentStep` discriminant (not scattered booleans like
// showIntro/isBrokenDone/showHalf) determines what the UI renders — every
// transition is a named, explicit case in reduceSessionState below, so the
// full set of reachable states/transitions can be audited by reading this
// one file.
import type { ResolvedStudyQueueItem } from "../../data/learning/newWordStudyQueue";

export type SessionStep =
  | "word_intro"
  | "broken_word"
  | "half_word"
  | "full_typing"
  // Phase 3 persistence boundary: entered the instant full_typing finishes,
  // left only by SAVE_SUCCEEDED/SAVE_FAILED. The session component is
  // responsible for issuing the completion-persistence write while this step
  // is showing and dispatching one of those two actions with the result —
  // nothing in this reducer performs the write itself (see test 10 in
  // scripts/tests/learning/test-new-word-study-session.mjs, which still
  // guards that no Supabase call is ever imported/reachable from this file).
  //
  // There is no separate "word_complete" screen: a successful save advances
  // straight to the next word's intro (or session_complete) in the same
  // SAVE_SUCCEEDED transition — the session component's job is only to show
  // a brief acknowledgment (a toast), not to block on an extra Next Word
  // click. See SAVE_SUCCEEDED below.
  | "saving_word"
  // Reached only after the RPC call failed. currentWordOutcomes and
  // currentWordIndex are untouched, so RETRY_SAVE can return to saving_word
  // without repeating any of the three exercises.
  | "save_error"
  | "session_complete";

// The fixed teaching order (greater support -> full recall). This is a
// hardcoded sequence, not a configurable list — Custom Practice's exercise
// selection/filters must never influence it (see EXERCISE_STEP_ORDER below).
export type GuidedExerciseStep = "broken_word" | "half_word" | "full_typing";

const EXERCISE_STEP_ORDER: readonly GuidedExerciseStep[] = ["broken_word", "half_word", "full_typing"];

// Single source of truth for "how many exercises per word" — the word-intro
// card's helper text reads this instead of a hardcoded number, so the two
// can never drift out of sync.
export const GUIDED_EXERCISE_COUNT = EXERCISE_STEP_ORDER.length;

// full_typing is deliberately absent here: completing it doesn't move to
// another exercise step, it finishes the word (see the COMPLETE_EXERCISE
// case below), which is special-cased because "what's next" depends on
// whether this was the last queued word.
const NEXT_STEP: Record<"broken_word" | "half_word", GuidedExerciseStep> = {
  broken_word: "half_word",
  half_word: "full_typing",
};

export interface ExerciseOutcome {
  completed: boolean;
  // True when the user used the exercise's reveal/hint affordance to reach
  // completion rather than recalling the word themselves. Recorded (not
  // discarded) so a future persistence phase can distinguish "recalled" from
  // "shown the answer" — see the COMPLETE_EXERCISE case below for exactly
  // where that future write would hook in.
  revealed: boolean;
  attempts: number;
}

const EMPTY_OUTCOME: ExerciseOutcome = { completed: false, revealed: false, attempts: 0 };

export interface CurrentWordOutcomes {
  broken_word: ExerciseOutcome;
  half_word: ExerciseOutcome;
  full_typing: ExerciseOutcome;
}

function emptyOutcomes(): CurrentWordOutcomes {
  return { broken_word: EMPTY_OUTCOME, half_word: EMPTY_OUTCOME, full_typing: EMPTY_OUTCOME };
}

export interface SessionState {
  queue: ResolvedStudyQueueItem[];
  currentWordIndex: number;
  currentStep: SessionStep;
  // Concept ids for words that have finished all three exercises — the
  // source of truth for "words completed" progress (see getSessionProgress
  // below). Deliberately not a richer per-word history:
  // once a word is done, its exercise-level outcomes are no longer needed by
  // this phase (nothing persists them yet), so keeping only the id avoids
  // accumulating unbounded UI state across a whole session.
  completedConceptIds: string[];
  currentWordOutcomes: CurrentWordOutcomes;
  hasStarted: boolean;
  isComplete: boolean;
  // The full daily target (e.g. 15), not this session's queue length. A
  // session's queue only ever holds the *remaining* words for today
  // (dailyGoal - wordsCompletedBeforeSession, from Phase 1's selection
  // logic), so using queue.length as "totalWords" would make progress reset
  // to "of <remaining>" every time a learner returns mid-goal instead of
  // continuing to count against the whole day — see getSessionProgress.
  dailyGoal: number;
  // How many new words were already completed today *before* this session
  // began (read once from Phase 1's queue-prep result, then held fixed for
  // the session's lifetime — this session's own completions accumulate
  // separately in completedConceptIds so the two are never double-counted).
  wordsCompletedBeforeSession: number;
}

export interface CreateInitialSessionStateParams {
  queue: ResolvedStudyQueueItem[];
  dailyGoal: number;
  wordsCompletedBeforeSession: number;
}

export function createInitialSessionState({
  queue,
  dailyGoal,
  wordsCompletedBeforeSession,
}: CreateInitialSessionStateParams): SessionState {
  return {
    queue,
    currentWordIndex: 0,
    currentStep: "word_intro",
    completedConceptIds: [],
    currentWordOutcomes: emptyOutcomes(),
    hasStarted: false,
    isComplete: false,
    dailyGoal,
    wordsCompletedBeforeSession,
  };
}

export type SessionAction =
  | { type: "BEGIN" }
  | { type: "START_EXERCISES" }
  | { type: "COMPLETE_EXERCISE"; step: GuidedExerciseStep; outcome: ExerciseOutcome }
  // Dispatched by the session component once the completion-persistence
  // write resolves successfully (including the idempotent "already
  // completed" case, which the requirement treats as a safe success, not an
  // error). This is also what advances the queue — see the reducer case
  // below.
  | { type: "SAVE_SUCCEEDED" }
  // Dispatched once the RPC call rejects. Never advances the queue.
  | { type: "SAVE_FAILED" }
  // Dispatched by the Retry action in the save_error UI. The component reads
  // currentStep === "saving_word" (again) as its cue to re-issue the exact
  // same idempotent RPC request.
  | { type: "RETRY_SAVE" };

export function reduceSessionState(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "BEGIN": {
      // Empty queue cannot start — the Begin Session button is also disabled
      // for this case, but the reducer enforces it independently so an
      // unexpected dispatch can never fake a session into existence.
      if (state.hasStarted || state.queue.length === 0) {
        return state;
      }
      return {
        ...state,
        hasStarted: true,
        currentWordIndex: 0,
        currentStep: "word_intro",
        currentWordOutcomes: emptyOutcomes(),
      };
    }

    case "START_EXERCISES": {
      if (state.currentStep !== "word_intro") {
        return state;
      }
      // Always the first step of the fixed sequence — there is no branch
      // here that could start on half_word/full_typing instead.
      return { ...state, currentStep: EXERCISE_STEP_ORDER[0] };
    }

    case "COMPLETE_EXERCISE": {
      // Reject completion events that don't match the step currently being
      // shown (e.g. a stale callback from an unmounted exercise) — this is
      // what makes the fixed order tamper-proof: nothing can complete
      // half_word while broken_word is still on screen.
      if (state.currentStep !== action.step) {
        return state;
      }

      const currentWordOutcomes = {
        ...state.currentWordOutcomes,
        [action.step]: action.outcome,
      };

      if (action.step !== "full_typing") {
        return { ...state, currentStep: NEXT_STEP[action.step], currentWordOutcomes };
      }

      // Completing the last exercise no longer finishes the word directly:
      // it hands off to the persistence boundary. The word is only counted
      // "done" (added to completedConceptIds) once SAVE_SUCCEEDED confirms
      // the write — see that case below.
      return { ...state, currentStep: "saving_word", currentWordOutcomes };
    }

    case "SAVE_SUCCEEDED": {
      if (state.currentStep !== "saving_word") {
        return state;
      }

      const finishedItem = state.queue[state.currentWordIndex];
      // Guards against double-counting if SAVE_SUCCEEDED is ever dispatched
      // twice for the same word (defense in depth — the RPC itself is the
      // real idempotency guarantee, this just keeps local state consistent
      // with it).
      const alreadyCounted = finishedItem ? state.completedConceptIds.includes(finishedItem.conceptId) : true;
      const completedConceptIds =
        finishedItem && !alreadyCounted
          ? [...state.completedConceptIds, finishedItem.conceptId]
          : state.completedConceptIds;

      // A successful save advances the queue immediately — there is no
      // intermediate "word_complete" screen/button to wait on. The session
      // component shows a brief toast acknowledgment using the word it
      // already held before dispatching this action.
      const isLastWord = state.currentWordIndex >= state.queue.length - 1;
      if (isLastWord) {
        return { ...state, completedConceptIds, currentStep: "session_complete", isComplete: true };
      }

      return {
        ...state,
        completedConceptIds,
        currentWordOutcomes: emptyOutcomes(),
        currentWordIndex: state.currentWordIndex + 1,
        currentStep: "word_intro",
      };
    }

    case "SAVE_FAILED": {
      if (state.currentStep !== "saving_word") {
        return state;
      }
      return { ...state, currentStep: "save_error" };
    }

    case "RETRY_SAVE": {
      if (state.currentStep !== "save_error") {
        return state;
      }
      return { ...state, currentStep: "saving_word" };
    }

    default:
      return state;
  }
}

export function getCurrentQueueItem(state: SessionState): ResolvedStudyQueueItem | null {
  return state.queue[state.currentWordIndex] ?? null;
}

export interface SessionProgress {
  currentPosition: number;
  totalWords: number;
  completedWords: number;
}

// Rule (documented once, applied everywhere): both numbers are relative to
// the *whole day's* goal (dailyGoal), not this session's queue length —
// completedWords includes words finished earlier today, before this session
// even started, and currentPosition continues counting from there. This
// matters for a learner who leaves mid-goal and comes back later: their
// second session's queue only holds the remaining words, but "Word X of Y"
// must keep counting against the original daily goal instead of resetting
// to "of <remaining>". Example: goal 15, 5 already done earlier today,
// viewing the 4th word of this session's (10-word) queue -> label
// "Word 9 of 15", fill "8 of 15" (5 earlier + 3 completed this session).
export function getSessionProgress(state: SessionState): SessionProgress {
  const totalWords = state.dailyGoal > 0 ? state.dailyGoal : state.queue.length;
  return {
    currentPosition: Math.min(
      state.wordsCompletedBeforeSession + state.currentWordIndex + 1,
      Math.max(totalWords, 1),
    ),
    totalWords,
    completedWords: state.wordsCompletedBeforeSession + state.completedConceptIds.length,
  };
}

// Returns 1/2/3 during an exercise step, null otherwise (word_intro and
// session_complete have no "Exercise X of 3" to show).
export function getExerciseStepNumber(step: SessionStep): 1 | 2 | 3 | null {
  const index = EXERCISE_STEP_ORDER.indexOf(step as GuidedExerciseStep);
  return index === -1 ? null : ((index + 1) as 1 | 2 | 3);
}
