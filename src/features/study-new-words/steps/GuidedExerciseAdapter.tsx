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
// separate ad hoc design.
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
    <div className="practice-card-shell w-full max-w-2xl mx-auto">
      <div
        className="practice-card bg-card border border-border rounded-2xl p-3 md:p-5 shadow-sm transition-all duration-300 ease-in-out flex flex-col relative"
        style={practiceCardStyle}
      >
        <p className="mx-auto max-w-[34rem] text-center text-sm text-gray-500 leading-relaxed font-medium mb-0">
          {t(INSTRUCTION_KEY[step])}
        </p>

        <div className="exercise-main-content flex-1 pt-0">
          {/* Native-language prompt, shown above the exercise input for all
              three steps — matches VocabularyPractice.tsx's own layout (the
              user sees their native word, types/assembles the target word). */}
          <div className="exercise-word-area space-y-6 mb-0">
            <div className="exercise-guess-word-container min-h-[60px] flex items-center justify-center">
              <div className="text-center">
                <h2 className="exercise-guess-word text-4xl md:text-5xl font-bold text-foreground">
                  {item.translation}
                </h2>
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
          <div className="exercise-help-sections space-y-2 mb-0 mt-4 sm:mt-6">
            {item.definition && (
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDefinition(!showDefinition)}
                  className="exercise-see-definition-button w-full flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm hover:bg-muted active:bg-muted/80 transition-colors text-left"
                >
                  <span className="font-medium">{t("practice.seeDefinition")}</span>
                  {showDefinition ? (
                    <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  )}
                </button>
                <div
                  className="transition-all duration-300 ease-in-out overflow-hidden"
                  style={{ maxHeight: showDefinition ? "150px" : "0px", opacity: showDefinition ? 1 : 0 }}
                >
                  <div className="exercise-definition-content px-3 py-2.5 sm:px-4 sm:py-3 bg-muted/40 sm:bg-muted/50 text-xs sm:text-sm border-t">
                    {item.definition}
                  </div>
                </div>
              </div>
            )}

            {item.exampleSentence && (status.isCorrect || status.usedShowWord) && (
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSentence(!showSentence)}
                  className="exercise-see-sentence-button w-full flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm hover:bg-muted active:bg-muted/80 transition-colors text-left"
                >
                  <span className="font-medium">{t("practice.seeInSentence")}</span>
                  {showSentence ? (
                    <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  )}
                </button>
                <div
                  className="transition-all duration-300 ease-in-out overflow-hidden"
                  style={{ maxHeight: showSentence ? "180px" : "0px", opacity: showSentence ? 1 : 0 }}
                >
                  <div className="exercise-sentence-content px-3 py-2.5 sm:px-4 sm:py-3 bg-muted/40 sm:bg-muted/50 text-xs sm:text-sm border-t italic">
                    <div className="relative">
                      <span className="block leading-relaxed pr-10">
                        {'"'}
                        {item.exampleSentence}
                        {'"'}
                      </span>
                      <button
                        type="button"
                        onClick={() => speakGuidedWord(item.exampleSentence!, practiceLanguage)}
                        className="absolute top-1/2 -translate-y-1/2 right-0 p-1.5 sm:p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
                        aria-label={t("practice.listenToSentence")}
                      >
                        <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end pt-4 border-t border-border">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!isStepComplete}
            className={`practice-next-button px-6 py-2.5 rounded-lg font-medium transition-all ${
              isStepComplete
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
            }`}
          >
            {t("practice.nextAction")}
          </button>
        </div>
      </div>
    </div>
  );
}
