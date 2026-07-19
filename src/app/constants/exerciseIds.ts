// Canonical exercise-identifier contract, shared by learning-setup, practice,
// and the app-level preferences hook.
//
// These five string values are persisted verbatim under the
// `app.selectedExercises` localStorage key (see
// src/app/hooks/useStoredAppPreferences.ts) and are also used as i18n-key
// segments (see src/data/interface/*_interface.json and the setup/help UI
// that builds translation keys from an exercise id). Renaming, reordering,
// or removing any of these five values changes persisted user data and
// breaks translation lookups — do not do so as part of a refactor.
//
// Plain data only: no React, no browser globals, no CSS, no JSON imports —
// safe to import from browser code, hooks, Node scripts, SSR, or Worker code.

export const EXERCISE_IDS = [
  "wordTyping",
  "halfWritten",
  "brokenWord",
  "connectWords",
  "listening",
] as const;

export type ExerciseId = (typeof EXERCISE_IDS)[number];

export function isExerciseId(value: string): value is ExerciseId {
  return (EXERCISE_IDS as readonly string[]).includes(value);
}

// The two complementary subsets practice classifies exercises into:
// typing/recall/construction exercises (single-word input) vs.
// four-word/reinforcement exercises (pairing). Previously hand-duplicated
// independently in typingRepeatQueue.ts and VocabularyPractice.tsx. Adding a
// 6th exercise id must extend exactly one of these two arrays.
export const TYPING_EXERCISE_IDS = [
  "wordTyping",
  "halfWritten",
  "brokenWord",
] as const satisfies readonly ExerciseId[];

export const FOUR_WORD_EXERCISE_IDS = [
  "connectWords",
  "listening",
] as const satisfies readonly ExerciseId[];
