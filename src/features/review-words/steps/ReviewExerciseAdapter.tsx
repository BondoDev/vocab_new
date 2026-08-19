import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import type { ResolvedReviewQueueItem } from "../loadReviewQueue";
import { BrokenWordExercise } from "../../practice/exercises/BrokenWordExercise";
import { HalfWrittenExercise } from "../../practice/exercises/HalfWrittenExercise";
import { WordTypingExercise } from "../../practice/exercises/WordTypingExercise";
import { exerciseCardBorders, type MotionCssVars } from "../../../exercises/exerciseTheme";
import { speakReviewWord } from "../utils/speakReviewWord";
import type { TypingExerciseId } from "../reviewSessionPlan";
import { determineReviewOutcome, type ReviewOutcome } from "../../../data/learning/reviewOutcomeTransition";
import { computeHadMistake, INITIAL_EXERCISE_STATUS, type ExerciseStatus } from "./reviewExerciseStatus";

// Reuses BrokenWordExercise/HalfWrittenExercise/WordTypingExercise exactly
// as-is — this is the only place that knows how to translate one review
// queue item into the prop shape those three components already expect
// (currentWord.word_lemma, currentPrompt, etc.), mirroring
// src/features/study-new-words/steps/GuidedExerciseAdapter.tsx's own
// approach. Kept as its own module (not a shared import from that file) so
// Review Words' session state/types stay independent of Study New Words',
// per that phase's "do not overload the Study New Words state machine"
// requirement — this is the adapter-level equivalent of the same rule.
//
// ExerciseStatus and the mistake-latching logic (computeHadMistake) live in
// ./reviewExerciseStatus.ts, not here — see that file's own header for why
// (this file has JSX, which the pure-test harness can't parse).

type PracticeCardCssVars = MotionCssVars<"--practice-card-bg" | "--practice-card-border">;

const INSTRUCTION_KEY: Record<TypingExerciseId, string> = {
  brokenWord: "practice.brokenWordInstruction",
  halfWritten: "practice.halfWrittenInstruction",
  wordTyping: "practice.wordTypingInstruction",
};

function formatWordTypeLabel(typeId: string): string {
  return typeId
    .split(/[_-]+/g)
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatCategoryLabel(categoryId: string): string {
  return categoryId
    .split(" ")
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

interface ReviewExerciseAdapterProps {
  exerciseId: TypingExerciseId;
  item: ResolvedReviewQueueItem;
  practiceLanguage: string;
  // A final review outcome (correct/incorrect/skipped), never a raw
  // success boolean — see determineReviewOutcome below for how it's
  // derived, and reviewSessionState.ts's ReviewWordResult for how it's
  // persisted.
  onComplete: (outcome: ReviewOutcome) => void;
}

export function ReviewExerciseAdapter({ exerciseId, item, practiceLanguage, onComplete }: ReviewExerciseAdapterProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<ExerciseStatus>(INITIAL_EXERCISE_STATUS);
  const [showDefinition, setShowDefinition] = useState(false);
  const [showSentence, setShowSentence] = useState(false);
  // Whether a genuine wrong attempt was ever observed for this word — one
  // completed wrong answer taints the whole encounter as "incorrect" even
  // if the learner goes on to answer correctly (per the correct-result
  // rule), so this is a ref (not state) that only ever flips false -> true
  // and never resets until the component remounts for the next word.
  //
  // WordTypingExercise and HalfWrittenExercise now report
  // hasCompletedWrongAttempt explicitly and keep it latched true once set
  // — trusted directly, no heuristic needed. BrokenWordExercise doesn't
  // report that field (out of scope for this change — its own chunk-based
  // UI already exposes an equivalent signal): it clears its placed chunks
  // back to empty (hasTypedAnswer regresses from true to false) after a
  // full-but-wrong guess, without ever reaching isCorrect, so that
  // transition is used as the fallback for that one exercise type only.
  const hadMistakeRef = useRef(false);
  const previousHasTypedAnswerRef = useRef(false);

  // Memoized so its object identity only changes when the actual word does
  // — the three wrapped components reset their internal state in a
  // useEffect keyed on this object by reference (see
  // GuidedExerciseAdapter.tsx's own comment on the same pattern).
  const currentWord = useMemo(() => ({ word_lemma: item.targetWord }), [item.targetWord]);

  const handleStatusChange = useCallback((next: ExerciseStatus) => {
    hadMistakeRef.current = computeHadMistake(hadMistakeRef.current, previousHasTypedAnswerRef.current, next);
    previousHasTypedAnswerRef.current = next.hasTypedAnswer;
    setStatus(next);
  }, []);

  const speak = useCallback(() => {
    speakReviewWord(item.targetWord, practiceLanguage);
  }, [item.targetWord, practiceLanguage]);

  const isComplete = status.isCorrect;

  const handleContinue = () => {
    onComplete(
      determineReviewOutcome({
        hadMistake: hadMistakeRef.current,
        usedShowWord: status.usedShowWord,
        usedSkip: false,
        finalCorrect: status.isCorrect,
      }),
    );
  };

  // Skip always resolves to "skipped" regardless of any prior mistake —
  // matches determineReviewOutcome's own Show-Word-or-Skip-first priority,
  // so this is equivalent to calling it with usedSkip: true.
  const handleSkip = () => {
    onComplete("skipped");
  };

  const cardStyle: PracticeCardCssVars = {
    "--practice-card-bg": "#F8FAFC",
    "--practice-card-border": exerciseCardBorders[exerciseId] ?? "#7A68D8",
  };
  const grammarTypeLabel = item.grammarType
    ? (() => {
        const translated = t(`wordTypes.${item.grammarType}`);
        return translated === `wordTypes.${item.grammarType}` ? formatWordTypeLabel(item.grammarType!) : translated;
      })()
    : "";
  const categoryLabel = item.category
    ? (() => {
        const translated = t(`levelCategory.topicNames.${item.category}`);
        return translated === `levelCategory.topicNames.${item.category}` ? formatCategoryLabel(item.category!) : translated;
      })()
    : "";

  return (
    <div className="practice-card-shell review-exercise-shell">
      <div className="practice-card review-exercise-card" style={cardStyle}>
        <p className="review-exercise-instruction">{t(INSTRUCTION_KEY[exerciseId])}</p>

        {(item.level || categoryLabel || grammarTypeLabel) && (
          <div className="review-exercise-meta w-[95%] mx-auto pt-2 md:pt-3">
            {(item.level || categoryLabel) && (
              <div className="exercise-meta-row flex items-center justify-between">
                {item.level && (
                  <div
                    className="exercise-meta-cefr min-w-[2.25rem] h-9 px-2 inline-flex items-center justify-center rounded-full text-sm font-semibold uppercase border-2 text-muted-foreground/70"
                    style={{
                      borderColor: "rgba(74, 43, 130, 0.35)",
                    }}
                  >
                    {item.level}
                  </div>
                )}
                {categoryLabel && (
                  <div className="exercise-meta-category text-sm font-semibold uppercase text-muted-foreground/70 text-right">
                    {categoryLabel}
                  </div>
                )}
              </div>
            )}
            {grammarTypeLabel && (
              <div className="exercise-meta-word-type mt-4 text-center text-lg font-semibold text-muted-foreground">
                {grammarTypeLabel}
              </div>
            )}
          </div>
        )}

        <div className="exercise-main-content review-exercise-main-content">
          <div className="exercise-word-area review-exercise-word-area">
            <div className="exercise-guess-word-container review-exercise-guess-word-container">
              <div className="review-exercise-guess-word-inner">
                <h2 className="exercise-guess-word review-exercise-guess-word">{item.translation}</h2>
              </div>
            </div>

            {exerciseId === "brokenWord" && (
              <BrokenWordExercise currentWord={currentWord} speakWord={speak} onStatusChange={handleStatusChange} />
            )}
            {exerciseId === "halfWritten" && (
              <HalfWrittenExercise
                currentWord={currentWord}
                currentPrompt={item.translation}
                practiceLanguage={practiceLanguage}
                speakWord={speak}
                onStatusChange={handleStatusChange}
              />
            )}
            {exerciseId === "wordTyping" && (
              <WordTypingExercise
                currentWord={currentWord}
                currentPrompt={item.translation}
                practiceLanguage={practiceLanguage}
                speakWord={speak}
                onStatusChange={handleStatusChange}
              />
            )}
          </div>

          <div className="exercise-help-sections review-exercise-help-sections">
            {item.definition && (
              <div className="review-exercise-collapsible">
                <button
                  type="button"
                  onClick={() => setShowDefinition(!showDefinition)}
                  className="exercise-see-definition-button review-exercise-toggle-button"
                >
                  <span className="review-exercise-toggle-label">{t("practice.seeDefinition")}</span>
                  {showDefinition ? (
                    <ChevronUp className="review-exercise-toggle-icon" />
                  ) : (
                    <ChevronDown className="review-exercise-toggle-icon" />
                  )}
                </button>
                <div
                  className="review-exercise-collapsible-panel"
                  style={{ maxHeight: showDefinition ? "150px" : "0px", opacity: showDefinition ? 1 : 0 }}
                >
                  <div className="exercise-definition-content review-exercise-content-block">{item.definition}</div>
                </div>
              </div>
            )}

            {item.exampleSentence && (status.isCorrect || status.usedShowWord) && (
              <div className="review-exercise-collapsible">
                <button
                  type="button"
                  onClick={() => setShowSentence(!showSentence)}
                  className="exercise-see-sentence-button review-exercise-toggle-button"
                >
                  <span className="review-exercise-toggle-label">{t("practice.seeInSentence")}</span>
                  {showSentence ? (
                    <ChevronUp className="review-exercise-toggle-icon" />
                  ) : (
                    <ChevronDown className="review-exercise-toggle-icon" />
                  )}
                </button>
                <div
                  className="review-exercise-collapsible-panel"
                  style={{ maxHeight: showSentence ? "180px" : "0px", opacity: showSentence ? 1 : 0 }}
                >
                  <div className="exercise-sentence-content review-exercise-content-block review-exercise-content-block--italic">
                    <div className="review-exercise-sentence-row">
                      <span className="review-exercise-sentence-text">
                        {'"'}
                        {item.exampleSentence}
                        {'"'}
                      </span>
                      <button
                        type="button"
                        onClick={() => speakReviewWord(item.exampleSentence!, practiceLanguage)}
                        className="review-exercise-sentence-speak-button"
                        aria-label={t("practice.listenToSentence")}
                      >
                        <Volume2 className="review-exercise-sentence-speak-icon" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="review-exercise-footer">
          {!isComplete && (
            <button type="button" onClick={handleSkip} className="review-exercise-skip-button">
              {t("practice.skipAction")}
            </button>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!isComplete}
            className={`practice-next-button review-exercise-next-button ${isComplete ? "is-complete" : ""}`}
          >
            {t("reviewWords.nextWordButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
