import { TYPING_EXERCISE_IDS } from "../../../app/constants/exerciseIds";

export interface TypingRepeatEntry {
  conceptId: string;
  remainingTypingExercises: number;
}

const TYPING_EXERCISE_ID_SET = new Set<string>(TYPING_EXERCISE_IDS);

export const isTypingExercise = (exerciseType: string): boolean =>
  TYPING_EXERCISE_ID_SET.has(exerciseType);

export const getEligibleTypingExercisesForWord = (
  word: any,
  selectedExercises: string[],
  isWordEligibleForExercise: (word: any, exerciseType: string) => boolean,
): string[] =>
  selectedExercises.filter(
    (exercise) =>
      isTypingExercise(exercise) && isWordEligibleForExercise(word, exercise),
  );

interface AdvanceTypingRepeatQueueParams {
  queue: TypingRepeatEntry[];
  currentExerciseType: string;
  currentConceptId: string | null;
  shouldScheduleRepeat: boolean;
  repeatDelayTypingExercises?: number;
}

export const advanceTypingRepeatQueue = ({
  queue,
  currentExerciseType,
  currentConceptId,
  shouldScheduleRepeat,
  repeatDelayTypingExercises = 4,
}: AdvanceTypingRepeatQueueParams): {
  queue: TypingRepeatEntry[];
  dueConceptId: string | null;
} => {
  let nextQueue = queue.map((entry) =>
    isTypingExercise(currentExerciseType)
      ? {
          ...entry,
          remainingTypingExercises: entry.remainingTypingExercises - 1,
        }
      : entry,
  );

  if (
    isTypingExercise(currentExerciseType) &&
    shouldScheduleRepeat &&
    currentConceptId
  ) {
    nextQueue = nextQueue.filter((entry) => entry.conceptId !== currentConceptId);
    nextQueue.push({
      conceptId: currentConceptId,
      remainingTypingExercises: repeatDelayTypingExercises,
    });
  }

  const dueConceptId =
    nextQueue.find((entry) => entry.remainingTypingExercises <= 0)?.conceptId ??
    null;

  if (dueConceptId) {
    nextQueue = nextQueue.filter((entry) => entry.conceptId !== dueConceptId);
  }

  return { queue: nextQueue, dueConceptId };
};
