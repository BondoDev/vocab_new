export interface TypingRepeatEntry {
  conceptId: string;
  remainingTypingExercises: number;
}

export const isTypingExercise = (exerciseType: string): boolean =>
  exerciseType === "wordTyping" ||
  exerciseType === "halfWritten" ||
  exerciseType === "brokenWord";

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
  usedShowWord: boolean;
  currentConceptId: string | null;
  repeatDelayTypingExercises?: number;
}

export const advanceTypingRepeatQueue = ({
  queue,
  currentExerciseType,
  usedShowWord,
  currentConceptId,
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

  if (isTypingExercise(currentExerciseType) && usedShowWord && currentConceptId) {
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
