import { useEffect, useReducer, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { Toast, useAutoDismissMessage } from "../../app/components/Toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../app/components/ui/alert-dialog";
import type { ResolvedStudyQueueItem } from "../../data/learning/newWordStudyQueue";
import {
  createInitialSessionState,
  getCurrentQueueItem,
  getExerciseStepNumber,
  getSessionProgress,
  reduceSessionState,
} from "./newWordStudySessionState";
import { NewWordInfoStep } from "./steps/NewWordInfoStep";
import { GuidedExerciseAdapter } from "./steps/GuidedExerciseAdapter";
import { NewWordStudyComplete } from "./NewWordStudyComplete";
// Required by BrokenWordExercise/HalfWrittenExercise/WordTypingExercise for
// their .exercise-answer-char/.exercise-broken-chunk-button/etc. classes —
// VocabularyPractice.tsx imports this same stylesheet for the same reason.
// Not forked/duplicated, just reused from its one owning location.
import "../practice/styles/exercises.scss";

interface NewWordStudySessionProps {
  queue: ResolvedStudyQueueItem[];
  practiceLanguage: string;
  // Native/source language — threaded through only so NewWordInfoStep can
  // show explicit "German" / "English" language labels next to the word and
  // translation (not hardcoded: read from the same app-level language state
  // NewWordStudyPreparation already has).
  yourLanguage: string;
  // Used both for "Exit" (with confirmation) and "Return to Learning" on the
  // completion screen — both ultimately return to the same place.
  onExit: () => void;
}

export function NewWordStudySession({ queue, practiceLanguage, yourLanguage, onExit }: NewWordStudySessionProps) {
  const { t } = useLanguage();
  const [state, dispatch] = useReducer(reduceSessionState, queue, createInitialSessionState);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const stepContainerRef = useRef<HTMLDivElement | null>(null);
  const { message: wordLearnedToast, show: showWordLearnedToast } = useAutoDismissMessage();

  useEffect(() => {
    dispatch({ type: "BEGIN" });
    // Runs once per mount only — NewWordStudyPreparation mounts this
    // component fresh each time the user clicks Begin Session, so a single
    // BEGIN dispatch on mount is the session's entire startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Moves focus to the new step's container whenever the visible step
  // changes (including repeated word_intro visits across different words),
  // so keyboard/screen-reader users land on the new content instead of
  // wherever focus happened to be on the previous step.
  useEffect(() => {
    stepContainerRef.current?.focus();
  }, [state.currentStep, state.currentWordIndex]);

  const currentItem = getCurrentQueueItem(state);
  const progress = getSessionProgress(state);
  const exerciseStepNumber = getExerciseStepNumber(state.currentStep);
  const isSessionComplete = state.currentStep === "session_complete";
  const guidedExerciseStep =
    state.currentStep === "broken_word" || state.currentStep === "half_word" || state.currentStep === "full_typing"
      ? state.currentStep
      : null;

  const handleExitClick = () => {
    setIsExitConfirmOpen(true);
  };

  const handleConfirmExit = () => {
    setIsExitConfirmOpen(false);
    onExit();
  };

  return (
    <div className="new-word-study-session flex-1 min-h-0 flex flex-col bg-background px-4 md:px-8 py-6">
      <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col">
        {!isSessionComplete && (
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleExitClick}
                aria-label={t("studyNewWords.exitSessionAria")}
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span className="text-sm">{t("studyNewWords.exitSessionAria")}</span>
              </button>

              <p className="text-sm text-muted-foreground whitespace-nowrap">
                {t("studyNewWords.wordPositionPrefix")} {progress.currentPosition}{" "}
                {t("studyNewWords.ofConnector")} {progress.totalWords}
                {exerciseStepNumber !== null && (
                  <>
                    {" "}
                    · {t("studyNewWords.exercisePrefix")} {exerciseStepNumber} {t("studyNewWords.ofConnector")} 3
                  </>
                )}
              </p>
            </div>

            <div
              role="progressbar"
              aria-valuenow={progress.completedWords}
              aria-valuemin={0}
              aria-valuemax={progress.totalWords}
              aria-label={`${t("studyNewWords.wordPositionPrefix")} ${progress.currentPosition} ${t(
                "studyNewWords.ofConnector",
              )} ${progress.totalWords}`}
              className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-primary transition-[width]"
                style={{
                  width:
                    progress.totalWords > 0
                      ? `${(progress.completedWords / progress.totalWords) * 100}%`
                      : "0%",
                }}
              />
            </div>
          </div>
        )}

        {/* aria-live announces step changes (e.g. moving to the next word) for
            screen-reader users without needing a separate live-region element
            per step. tabIndex=-1 lets the focus-movement effect above target
            this container directly. */}
        <div ref={stepContainerRef} tabIndex={-1} aria-live="polite" className="outline-none flex-1">
          {!currentItem && !isSessionComplete && (
            <div className="flex flex-col items-center text-center gap-4 py-16">
              <p className="text-foreground max-w-md break-words">{t("studyNewWords.sessionErrorMessage")}</p>
              <button
                type="button"
                onClick={onExit}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                {t("studyNewWords.backButton")}
              </button>
            </div>
          )}

          {currentItem && state.currentStep === "word_intro" && (
            <NewWordInfoStep
              item={currentItem}
              practiceLanguage={practiceLanguage}
              yourLanguage={yourLanguage}
              onContinue={() => dispatch({ type: "START_EXERCISES" })}
            />
          )}

          {currentItem && guidedExerciseStep && (
            <GuidedExerciseAdapter
              key={`${currentItem.conceptId}-${guidedExerciseStep}`}
              step={guidedExerciseStep}
              item={currentItem}
              practiceLanguage={practiceLanguage}
              onComplete={(outcome) => {
                // Completing full_typing finishes the word and the reducer
                // advances immediately (no intermediate "word learned"
                // step/screen) — a toast is the only acknowledgment. The
                // word must be read from currentItem here, before dispatch,
                // since the reducer may already move to the next word (or
                // session_complete) within this same update.
                if (guidedExerciseStep === "full_typing") {
                  showWordLearnedToast(
                    `${t("studyNewWords.wordLearnedToastPrefix")} "${currentItem.targetWord}" ${t(
                      "studyNewWords.wordLearnedToastSuffix",
                    )}`,
                  );
                }
                dispatch({ type: "COMPLETE_EXERCISE", step: guidedExerciseStep, outcome });
              }}
            />
          )}

          {isSessionComplete && (
            <NewWordStudyComplete
              wordsCompleted={state.completedConceptIds.length}
              practiceLanguage={practiceLanguage}
              onReturnToLearning={onExit}
            />
          )}
        </div>
      </div>

      <AlertDialog open={isExitConfirmOpen} onOpenChange={setIsExitConfirmOpen}>
        <AlertDialogContent className="w-[90vw] max-w-[90vw] gap-3 px-5 py-5 sm:w-fit sm:max-w-md">
          <AlertDialogHeader className="gap-2">
            <AlertDialogTitle>{t("studyNewWords.leaveSessionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("studyNewWords.leaveSessionDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-end">
            <AlertDialogCancel className="sm:flex-none">
              {t("studyNewWords.leaveSessionStay")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExit} className="sm:flex-none">
              {t("studyNewWords.leaveSessionConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toast message={wordLearnedToast} />
    </div>
  );
}
