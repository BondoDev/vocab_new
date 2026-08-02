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
}

export function createInitialSessionState(queue: ResolvedStudyQueueItem[]): SessionState {
  return {
    queue,
    currentWordIndex: 0,
    currentStep: "word_intro",
    completedConceptIds: [],
    currentWordOutcomes: emptyOutcomes(),
    hasStarted: false,
    isComplete: false,
  };
}

export type SessionAction =
  | { type: "BEGIN" }
  | { type: "START_EXERCISES" }
  | { type: "COMPLETE_EXERCISE"; step: GuidedExerciseStep; outcome: ExerciseOutcome };

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

      // Completing the last exercise finishes the word: advance straight to
      // the next word's intro (or session_complete if this was the last
      // queued word) — there is no separate "word learned" step to visit.
      // The session component shows a toast for this instead, using the
      // word it already holds before dispatching this action.
      //
      // NOTE(Phase 3 persistence boundary): this is the exact moment a
      // future phase should atomically write one user_word_progress row +
      // increment user_daily_stats for this word (see this module's header
      // and the feature's top-level comments for the full plan). Nothing is
      // written here — Phase 2 is frontend-only.
      const finishedItem = state.queue[state.currentWordIndex];
      const completedConceptIds = finishedItem
        ? [...state.completedConceptIds, finishedItem.conceptId]
        : state.completedConceptIds;
      const isLastWord = state.currentWordIndex >= state.queue.length - 1;

      if (isLastWord) {
        return {
          ...state,
          currentWordOutcomes,
          completedConceptIds,
          currentStep: "session_complete",
          isComplete: true,
        };
      }

      return {
        ...state,
        currentWordOutcomes: emptyOutcomes(),
        completedConceptIds,
        currentWordIndex: state.currentWordIndex + 1,
        currentStep: "word_intro",
      };
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

// Rule (documented once, applied everywhere): the horizontal progress bar
// fill represents *completed* words (completedConceptIds.length), while the
// "Word X of Y" label shows the *current* position (currentWordIndex + 1).
// Example: viewing word 4 of 15 -> label "Word 4 of 15", fill "3 of 15".
export function getSessionProgress(state: SessionState): SessionProgress {
  return {
    currentPosition: Math.min(state.currentWordIndex + 1, Math.max(state.queue.length, 1)),
    totalWords: state.queue.length,
    completedWords: state.completedConceptIds.length,
  };
}

// Returns 1/2/3 during an exercise step, null otherwise (word_intro and
// session_complete have no "Exercise X of 3" to show).
export function getExerciseStepNumber(step: SessionStep): 1 | 2 | 3 | null {
  const index = EXERCISE_STEP_ORDER.indexOf(step as GuidedExerciseStep);
  return index === -1 ? null : ((index + 1) as 1 | 2 | 3);
}
