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
import { getLocalCalendarDateISO } from "../../data/learning/localStudyDate";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { completeNewWordStudy, NewWordStudyPersistenceError } from "../../lib/newWordProgress";
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
// Owns the semantic classes NewWordInfoStep.tsx and GuidedExerciseAdapter.tsx
// render into (see that file's own header comment for the ownership split
// against exercises.scss above).
import "./styles/study-new-words.scss";

interface NewWordStudySessionProps {
  queue: ResolvedStudyQueueItem[];
  practiceLanguage: string;
  // Native/source language — threaded through only so NewWordInfoStep can
  // show explicit "German" / "English" language labels next to the word and
  // translation (not hardcoded: read from the same app-level language state
  // NewWordStudyPreparation already has).
  yourLanguage: string;
  // Phase 1's queue-prep result already knows both of these — threaded
  // through so the progress bar/label can count against the whole day's
  // goal instead of resetting to "of <this session's remaining queue
  // length>" whenever a learner leaves mid-goal and starts a new session
  // later the same day. See newWordStudySessionState.ts's getSessionProgress.
  dailyGoal: number;
  wordsCompletedToday: number;
  // Used both for "Exit" (with confirmation) and "Return to Learning" on the
  // completion screen — both ultimately return to the same place.
  onExit: () => void;
}

export function NewWordStudySession({
  queue,
  practiceLanguage,
  yourLanguage,
  dailyGoal,
  wordsCompletedToday,
  onExit,
}: NewWordStudySessionProps) {
  const { t } = useLanguage();
  const [state, dispatch] = useReducer(
    reduceSessionState,
    { queue, dailyGoal, wordsCompletedBeforeSession: wordsCompletedToday },
    createInitialSessionState,
  );
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  // Only meaningful while currentStep === "save_error": picks between the
  // generic retryable-failure copy and the session-expired copy, without
  // ever rendering the underlying Supabase/PostgreSQL error text itself.
  const [isSaveErrorSessionExpired, setIsSaveErrorSessionExpired] = useState(false);
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

  // Phase 3 persistence boundary: fires exactly once per entry into
  // "saving_word" (on first arrival straight from full_typing, and again
  // each time RETRY_SAVE re-enters it from save_error). Deliberately keyed
  // only on currentStep/currentWordIndex, not the full state object — see
  // the BEGIN effect above for the same pattern in this file.
  useEffect(() => {
    if (state.currentStep !== "saving_word") {
      return;
    }

    const item = getCurrentQueueItem(state);
    if (!item) {
      dispatch({ type: "SAVE_FAILED" });
      return;
    }

    const session = getStoredSupabaseSession();
    if (!session) {
      setIsSaveErrorSessionExpired(true);
      dispatch({ type: "SAVE_FAILED" });
      return;
    }

    let cancelled = false;

    void completeNewWordStudy({
      session,
      conceptId: item.conceptId,
      targetLanguage: practiceLanguage,
      // Recomputed fresh at the moment this word is persisted (not captured
      // once at queue-load time) — same helper Phase 1 uses, so a session
      // that happens to cross local midnight counts each word toward the
      // day it actually finished on, matching what a fresh queue load would
      // also decide. No completion timestamp is sent here — the database
      // generates it (now()) inside complete_new_word_study so the browser
      // clock never controls last_practiced_at/next_review_at.
      statDateISO: getLocalCalendarDateISO(),
    })
      .then(() => {
        if (cancelled) return;
        setIsSaveErrorSessionExpired(false);
        // item is the word that just finished — captured before dispatch,
        // since SAVE_SUCCEEDED may move state.currentWordIndex on (or to
        // session_complete) within this same update.
        showWordLearnedToast(
          `${t("studyNewWords.wordLearnedToastPrefix")} "${item.targetWord}" ${t(
            "studyNewWords.wordLearnedToastSuffix",
          )}`,
        );
        dispatch({ type: "SAVE_SUCCEEDED" });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("NewWordStudySession: failed to save the completed word.", error);
        setIsSaveErrorSessionExpired(error instanceof NewWordStudyPersistenceError && !error.retryable);
        dispatch({ type: "SAVE_FAILED" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleRetrySave = () => {
    dispatch({ type: "RETRY_SAVE" });
  };

  return (
    <div className="new-word-study-session">
      <div className="new-word-study-session-body">
        {!isSessionComplete && (
          <div className="new-word-study-session-header">
            <div className="new-word-study-session-header-row">
              <button
                type="button"
                onClick={handleExitClick}
                aria-label={t("studyNewWords.exitSessionAria")}
                className="new-word-study-exit-button"
              >
                <LogOut className="new-word-study-exit-icon" aria-hidden="true" />
                <span className="new-word-study-exit-label">{t("studyNewWords.exitSessionAria")}</span>
              </button>

              <p className="new-word-study-progress-text">
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
              className="new-word-study-progress-track"
            >
              <div
                className="new-word-study-progress-fill"
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
        <div ref={stepContainerRef} tabIndex={-1} aria-live="polite" className="new-word-study-step-container">
          {!currentItem && !isSessionComplete && (
            <div className="new-word-study-error-block">
              <p className="new-word-study-error-message">{t("studyNewWords.sessionErrorMessage")}</p>
              <button type="button" onClick={onExit} className="new-word-study-error-back-button">
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
                // Completing full_typing doesn't finish the word here — it
                // hands off to the saving_word persistence boundary (see the
                // effect above). The "word learned" toast fires from that
                // effect only once the save actually succeeds, not
                // immediately on exercise completion.
                dispatch({ type: "COMPLETE_EXERCISE", step: guidedExerciseStep, outcome });
              }}
            />
          )}

          {currentItem && state.currentStep === "saving_word" && (
            <div className="new-word-study-saving-block" role="status" aria-live="polite">
              <div className="study-new-words-spinner" aria-hidden="true" />
              <p className="new-word-study-saving-message">{t("studyNewWords.savingProgress")}</p>
            </div>
          )}

          {currentItem && state.currentStep === "save_error" && (
            <div className="new-word-study-error-block">
              <p className="new-word-study-error-message">
                {t(
                  isSaveErrorSessionExpired
                    ? "studyNewWords.sessionExpiredMessage"
                    : "studyNewWords.saveErrorMessage",
                )}
              </p>
              <button type="button" onClick={handleRetrySave} className="new-word-study-error-back-button">
                {t("studyNewWords.retryButton")}
              </button>
            </div>
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
        <AlertDialogContent className="new-word-study-exit-dialog-content">
          <AlertDialogHeader className="new-word-study-exit-dialog-header">
            <AlertDialogTitle>{t("studyNewWords.leaveSessionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("studyNewWords.leaveSessionDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="new-word-study-exit-dialog-footer">
            <AlertDialogCancel className="new-word-study-exit-dialog-button">
              {t("studyNewWords.leaveSessionStay")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExit} className="new-word-study-exit-dialog-button">
              {t("studyNewWords.leaveSessionConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toast message={wordLearnedToast} />
    </div>
  );
}
