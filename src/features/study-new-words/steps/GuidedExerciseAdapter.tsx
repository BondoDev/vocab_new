import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import type { ResolvedStudyQueueItem } from "../../../data/learning/newWordStudyQueue";
import { BrokenWordExercise } from "../../practice/exercises/BrokenWordExercise";
import { HalfWrittenExercise } from "../../practice/exercises/HalfWrittenExercise";
import { WordTypingExercise } from "../../practice/exercises/WordTypingExercise";
import { exerciseCardBorders, type MotionCssVars } from "../../../exercises/exerciseTheme";
import { speakGuidedWord } from "../utils/speakGuidedWord";
import type { GuidedExerciseStep as GuidedExerciseStepKey, ExerciseOutcome } from "../newWordStudySessionState";

type PracticeCardCssVars = MotionCssVars<"--practice-card-bg" | "--practice-card-border">;

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

// Maps this module's step names onto the ordinary practice flow's exercise
// ids — needed only to reuse that flow's per-exercise card theming
// (exerciseCardBorders) and instruction copy, both keyed by that id.
const STEP_TO_EXERCISE_ID: Record<GuidedExerciseStepKey, "brokenWord" | "halfWritten" | "wordTyping"> = {
  broken_word: "brokenWord",
  half_word: "halfWritten",
  full_typing: "wordTyping",
};

const INSTRUCTION_KEY: Record<GuidedExerciseStepKey, string> = {
  broken_word: "practice.brokenWordInstruction",
  half_word: "practice.halfWrittenInstruction",
  full_typing: "practice.wordTypingInstruction",
};

interface GuidedExerciseAdapterProps {
  step: GuidedExerciseStepKey;
  item: ResolvedStudyQueueItem;
  practiceLanguage: string;
  onComplete: (outcome: ExerciseOutcome) => void;
}

// Translates one guided-session queue item into the exact prop shape the
// three existing ordinary-practice exercise components already expect
// (currentWord.word_lemma, currentPrompt, etc.) — this is the only place
// that knows about that mapping, so BrokenWordExercise/HalfWrittenExercise/
// WordTypingExercise themselves stay completely untouched and still work
// identically for ordinary practice.
//
// Renders inside the same .practice-card / .practice-card-shell container
// (and the same per-exercise border theming + instruction copy) that
// VocabularyPractice.tsx uses, via exercises.scss (imported once by
// NewWordStudySession.tsx) — so a guided exercise looks like the same
// exercise card the user already knows from ordinary practice, not a
// separate ad hoc design. This component's own layout styling (everything
// beyond those shared hook classes) lives in ../styles/study-new-words.scss,
// also imported by NewWordStudySession.tsx.
export function GuidedExerciseAdapter({ step, item, practiceLanguage, onComplete }: GuidedExerciseAdapterProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<ExerciseStatus>(INITIAL_STATUS);
  const [showDefinition, setShowDefinition] = useState(false);
  const [showSentence, setShowSentence] = useState(false);
  const attemptsRef = useRef(0);
  const wasEngagedRef = useRef(false);

  // Memoized so its object identity only changes when the actual word does.
  // BrokenWordExercise/HalfWrittenExercise/WordTypingExercise each reset
  // their internal state (typed input, placed chunks, etc.) in a
  // useEffect keyed on this object by reference — a fresh literal on every
  // render (this component re-renders on every keystroke, via
  // handleStatusChange -> setStatus) would make those effects fire on every
  // interaction and immediately wipe out whatever the user just did.
  const currentWord = useMemo(() => ({ word_lemma: item.targetWord }), [item.targetWord]);

  const handleStatusChange = useCallback((next: ExerciseStatus) => {
    setStatus(next);
    // Attempts is an approximate signal, not an exact retry count: these
    // exercises validate live as the user types rather than through a
    // discrete "submit", so the closest honest measurement is "how many
    // times did the user go from empty/untouched to engaged" — for
    // BrokenWordExercise this lines up with each full chunk-assembly guess
    // (a wrong guess resets placedChunks to empty), for the typing exercises
    // it settles at 1 once the user starts typing.
    const engaged = next.hasTypedAnswer || next.usedShowWord || next.usedHintForBrokenWord;
    if (engaged && !wasEngagedRef.current) {
      attemptsRef.current += 1;
      wasEngagedRef.current = true;
    } else if (!engaged) {
      wasEngagedRef.current = false;
    }
  }, []);

  const speak = useCallback(() => {
    speakGuidedWord(item.targetWord, practiceLanguage);
  }, [item.targetWord, practiceLanguage]);

  const isStepComplete = status.isCorrect;

  const handleContinue = () => {
    onComplete({
      completed: true,
      revealed: status.usedShowWord || status.usedHintForBrokenWord,
      attempts: attemptsRef.current,
    });
  };

  const exerciseId = STEP_TO_EXERCISE_ID[step];
  const practiceCardStyle: PracticeCardCssVars = {
    "--practice-card-bg": "#F8FAFC",
    "--practice-card-border": exerciseCardBorders[exerciseId] ?? "#7A68D8",
  };

  return (
    <div className="practice-card-shell guided-exercise-shell">
      <div className="practice-card guided-exercise-card" style={practiceCardStyle}>
        <p className="guided-exercise-instruction">{t(INSTRUCTION_KEY[step])}</p>

        <div className="exercise-main-content guided-exercise-main-content">
          {/* Native-language prompt, shown above the exercise input for all
              three steps — matches VocabularyPractice.tsx's own layout (the
              user sees their native word, types/assembles the target word). */}
          <div className="exercise-word-area guided-exercise-word-area">
            <div className="exercise-guess-word-container guided-exercise-guess-word-container">
              <div className="guided-exercise-guess-word-inner">
                <h2 className="exercise-guess-word guided-exercise-guess-word">{item.translation}</h2>
              </div>
            </div>

            {step === "broken_word" && (
              <BrokenWordExercise currentWord={currentWord} speakWord={speak} onStatusChange={handleStatusChange} />
            )}
            {step === "half_word" && (
              <HalfWrittenExercise
                currentWord={currentWord}
                currentPrompt={item.translation}
                practiceLanguage={practiceLanguage}
                speakWord={speak}
                onStatusChange={handleStatusChange}
              />
            )}
            {step === "full_typing" && (
              <WordTypingExercise
                currentWord={currentWord}
                currentPrompt={item.translation}
                practiceLanguage={practiceLanguage}
                speakWord={speak}
                onStatusChange={handleStatusChange}
              />
            )}
          </div>

          {/* Expandable help sections — same "See Definition" / "See in
              sentence" pattern as VocabularyPractice.tsx (same translation
              keys, same collapse behavior), sourced from the queue item's
              already-resolved definition/example (see resolveVocabularyWordData.ts)
              rather than any new data. The inflected-word highlighting the
              ordinary flow applies to the sentence needs inflected.json,
              which Phase 1's resolver deliberately doesn't fetch, so the
              sentence renders plain here. */}
          <div className="exercise-help-sections guided-exercise-help-sections">
            {item.definition && (
              <div className="guided-exercise-collapsible">
                <button
                  type="button"
                  onClick={() => setShowDefinition(!showDefinition)}
                  className="exercise-see-definition-button guided-exercise-toggle-button"
                >
                  <span className="guided-exercise-toggle-label">{t("practice.seeDefinition")}</span>
                  {showDefinition ? (
                    <ChevronUp className="guided-exercise-toggle-icon" />
                  ) : (
                    <ChevronDown className="guided-exercise-toggle-icon" />
                  )}
                </button>
                <div
                  className="guided-exercise-collapsible-panel"
                  style={{ maxHeight: showDefinition ? "150px" : "0px", opacity: showDefinition ? 1 : 0 }}
                >
                  <div className="exercise-definition-content guided-exercise-content-block">
                    {item.definition}
                  </div>
                </div>
              </div>
            )}

            {item.exampleSentence && (status.isCorrect || status.usedShowWord) && (
              <div className="guided-exercise-collapsible">
                <button
                  type="button"
                  onClick={() => setShowSentence(!showSentence)}
                  className="exercise-see-sentence-button guided-exercise-toggle-button"
                >
                  <span className="guided-exercise-toggle-label">{t("practice.seeInSentence")}</span>
                  {showSentence ? (
                    <ChevronUp className="guided-exercise-toggle-icon" />
                  ) : (
                    <ChevronDown className="guided-exercise-toggle-icon" />
                  )}
                </button>
                <div
                  className="guided-exercise-collapsible-panel"
                  style={{ maxHeight: showSentence ? "180px" : "0px", opacity: showSentence ? 1 : 0 }}
                >
                  <div className="exercise-sentence-content guided-exercise-content-block guided-exercise-content-block--italic">
                    <div className="guided-exercise-sentence-row">
                      <span className="guided-exercise-sentence-text">
                        {'"'}
                        {item.exampleSentence}
                        {'"'}
                      </span>
                      <button
                        type="button"
                        onClick={() => speakGuidedWord(item.exampleSentence!, practiceLanguage)}
                        className="guided-exercise-sentence-speak-button"
                        aria-label={t("practice.listenToSentence")}
                      >
                        <Volume2 className="guided-exercise-sentence-speak-icon" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="guided-exercise-footer">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!isStepComplete}
            className={`practice-next-button guided-exercise-next-button ${isStepComplete ? "is-complete" : ""}`}
          >
            {t("practice.nextAction")}
          </button>
        </div>
      </div>
    </div>
  );
}
