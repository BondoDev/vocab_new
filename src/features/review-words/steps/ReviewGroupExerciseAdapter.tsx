import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "../../../contexts/LanguageContext";
import type { ResolvedReviewQueueItem } from "../loadReviewQueue";
import { ConnectWordsExercise } from "../../practice/exercises/ConnectWordsExercise";
import { ListeningExercise } from "../../practice/exercises/ListeningExercise";
import { exerciseCardBorders, type MotionCssVars } from "../../../exercises/exerciseTheme";
import { speakReviewWord } from "../utils/speakReviewWord";
import type { GroupExerciseId } from "../reviewSessionPlan";

// Reuses ConnectWordsExercise/ListeningExercise exactly as-is. Both
// components already support taking their four words from an explicit
// `exerciseWords` prop instead of slicing `words` by `currentIndex` (see
// each component's own effect: `exerciseWords ?? words.slice(currentIndex,
// currentIndex + 4)`) — passing all four review-queue items directly here
// means `words`/`currentIndex` are never actually read, so harmless
// placeholder values are enough. This is the only place that knows that
// mapping, matching ReviewExerciseAdapter.tsx's role for the typing pool.

type GroupCardCssVars = MotionCssVars<"--practice-card-bg" | "--practice-card-border">;

interface ExerciseStatus {
  isCorrect: boolean;
  hasTypedAnswer: boolean;
  usedShowWord: boolean;
  usedHintForBrokenWord: boolean;
}

const INITIAL_STATUS: ExerciseStatus = {
  isCorrect: false,
  hasTypedAnswer: false,
  usedShowWord: false,
  usedHintForBrokenWord: false,
};

// Reuses the existing short exercise-type descriptions (practice.exerciseDescription.*)
// as this adapter's instruction line — no new translation keys needed.
const INSTRUCTION_KEY: Record<GroupExerciseId, string> = {
  connectWords: "practice.exerciseDescription.connectWords",
  listening: "practice.exerciseDescription.listening",
};

// ConnectWordsExercise/ListeningExercise rebuild their whole board (and
// discard any pairs already matched) whenever `exerciseWords`/`words`/
// `translations` change *identity* in their own effect's dependency array —
// not just when the content actually changes. A stable, module-level empty
// array means `words` (never actually read once `exerciseWords` is set)
// keeps the same reference across every render.
const EMPTY_WORDS: never[] = [];

interface ReviewGroupExerciseAdapterProps {
  groupExerciseId: GroupExerciseId;
  // Exactly the four items this block's typing exercises already covered,
  // in the same order — never substituted or re-selected here.
  items: ResolvedReviewQueueItem[];
  practiceLanguage: string;
  yourLanguage: string;
  onComplete: (success: boolean) => void;
}

export function ReviewGroupExerciseAdapter({
  groupExerciseId,
  items,
  practiceLanguage,
  yourLanguage,
  onComplete,
}: ReviewGroupExerciseAdapterProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<ExerciseStatus>(INITIAL_STATUS);

  const handleStatusChange = useCallback((next: ExerciseStatus) => setStatus(next), []);

  const speak = useCallback(
    (word: string) => {
      speakReviewWord(word, practiceLanguage);
    },
    [practiceLanguage],
  );

  // Memoized on the four words' actual content (not `items`' own array
  // identity, which the parent may recreate every render) — without this,
  // `onStatusChange` firing on every successful pair match re-renders this
  // component, which would otherwise hand ConnectWordsExercise/ListeningExercise
  // a brand-new `exerciseWords`/`translations` reference each time and reset
  // the whole board (wiping out pairs the learner already matched).
  const itemsKey = items.map((item) => `${item.conceptId}:${item.targetWord}:${item.translation}`).join("|");
  const exerciseWords = useMemo(
    () => items.map((item) => ({ concept_id: item.conceptId, word_lemma: item.targetWord })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsKey],
  );
  const translations = useMemo(
    () => Object.fromEntries(items.map((item) => [item.conceptId, item.translation])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsKey],
  );

  const isComplete = status.isCorrect;

  const cardStyle: GroupCardCssVars = {
    "--practice-card-bg": "#F8FAFC",
    "--practice-card-border": exerciseCardBorders[groupExerciseId] ?? "#7A68D8",
  };

  return (
    <div className="practice-card-shell review-exercise-shell">
      <div className="practice-card review-exercise-card" style={cardStyle}>
        <p className="review-exercise-instruction">{t(INSTRUCTION_KEY[groupExerciseId])}</p>

        <div className="exercise-main-content review-exercise-main-content review-group-exercise-main-content">
          {groupExerciseId === "connectWords" ? (
            <ConnectWordsExercise
              words={EMPTY_WORDS}
              currentIndex={0}
              exerciseWords={exerciseWords}
              translations={translations}
              sourceLabel={t(`languageNames.${practiceLanguage}`)}
              targetLabel={t(`languageNames.${yourLanguage}`)}
              onSpeakWord={speak}
              onStatusChange={handleStatusChange}
            />
          ) : (
            <ListeningExercise
              words={EMPTY_WORDS}
              currentIndex={0}
              exerciseWords={exerciseWords}
              translations={translations}
              sourceLabel={t(`languageNames.${practiceLanguage}`)}
              targetLabel={t(`languageNames.${yourLanguage}`)}
              onSpeakWord={speak}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>

        <div className="review-exercise-footer">
          <button
            type="button"
            onClick={() => onComplete(true)}
            disabled={!isComplete}
            className={`practice-next-button review-exercise-next-button ${isComplete ? "is-complete" : ""}`}
          >
            {t("reviewWords.continueButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
