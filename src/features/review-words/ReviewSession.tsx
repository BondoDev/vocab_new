import { useEffect, useReducer, useRef, useState } from "react";
import { LogOut, PartyPopper } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import type { ResolvedReviewQueueItem } from "./loadReviewQueue";
import {
  createInitialReviewSessionState,
  getCurrentBlock,
  getCurrentWordAssignment,
  getReviewSessionProgress,
  reduceReviewSessionState,
} from "./reviewSessionState";
import { ReviewExerciseAdapter } from "./steps/ReviewExerciseAdapter";
import { ReviewGroupExerciseAdapter } from "./steps/ReviewGroupExerciseAdapter";
import { ReviewExerciseErrorBoundary } from "./ReviewExerciseErrorBoundary";
import { ReviewSessionComplete } from "./ReviewSessionComplete";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { completeWordReview, ReviewPersistenceError } from "../../lib/newWordProgress";
import { resolveSupabaseErrorMessageKey, type SupabaseErrorCategory } from "../../lib/supabaseError";
import { createActiveWordTimer, type ActiveWordTimer } from "../../data/learning/activeWordTimer";
// Shared .practice-card-shell/.practice-card/.exercise-* hook classes that
// ReviewExerciseAdapter/ReviewGroupExerciseAdapter render into — the same
// stylesheet NewWordStudySession.tsx imports for the same reason (see that
// file's own header comment). Not forked/duplicated, only reused.
import "../practice/styles/exercises.scss";
import "./styles/review-words.scss";

interface ReviewSessionProps {
  queue: ResolvedReviewQueueItem[];
  practiceLanguage: string;
  yourLanguage: string;
  // Used both for the header's Back action and the completion screen's
  // Return to Learning action — both return to the same place. Leaving
  // mid-session never loses anything: every word already reached a
  // successful complete_word_review call before the session advanced past
  // it (see the saving_review effect below), and nothing else in this
  // session is persisted, so there is no exit-confirmation dialog.
  onExit: () => void;
}

// Phase 2/3 orchestrator: consumes the already-prepared, already-resolved
// review queue (built by loadReviewQueue.ts, unmodified by this phase) and
// walks it through the existing exercise components via its own pure state
// machine (reviewSessionState.ts), persisting each individual word's
// outcome immediately via complete_word_review before advancing. Group
// exercises are reinforcement-only and are never persisted (see
// reviewSessionState.ts's GROUP_EXERCISE_COMPLETE case and
// ReviewGroupExerciseAdapter — neither calls completeWordReview).
export function ReviewSession({ queue, practiceLanguage, yourLanguage, onExit }: ReviewSessionProps) {
  const { t } = useLanguage();
  const [state, dispatch] = useReducer(reduceReviewSessionState, queue, (initialQueue) =>
    createInitialReviewSessionState(initialQueue),
  );
  const stepContainerRef = useRef<HTMLDivElement | null>(null);
  // Only meaningful while currentStep === "review_save_error": the
  // classified category (src/lib/supabaseError.ts) picks which safe
  // message to show, without ever rendering the underlying Supabase/
  // PostgreSQL error text itself — same precedent as
  // NewWordStudySession.tsx's saveErrorCategory.
  const [saveErrorCategory, setSaveErrorCategory] = useState<SupabaseErrorCategory | null>(null);

  // Same lazy-once-per-instance pattern as NewWordStudySession.tsx — see
  // that file's own comment for why the `if (current === null)` guard (not
  // the useRef initial-value expression) is what matters under StrictMode.
  const wordTimerRef = useRef<ActiveWordTimer | null>(null);
  if (wordTimerRef.current === null) {
    wordTimerRef.current = createActiveWordTimer();
  }

  useEffect(() => {
    dispatch({ type: "BEGIN" });
    // Runs once per mount only — ReviewWordsPreparation mounts this
    // component fresh each time Begin Review is pressed, reusing the
    // already-prepared queue rather than rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stops accumulation and detaches the visibility listener on unmount/
  // navigation — same precedent as NewWordStudySession.tsx.
  useEffect(() => {
    return () => {
      wordTimerRef.current?.dispose();
    };
  }, []);

  // Starts a fresh per-word timer exactly once per word_exercise entry —
  // never during group_exercise (four-word group exercises are
  // reinforcement-only and their time is not attributed to any single
  // word — see reviewSessionState.ts's own precedent of never persisting
  // them). reset() before start() guarantees each word's review begins
  // timing from zero.
  useEffect(() => {
    if (state.currentStep !== "word_exercise") {
      return;
    }
    wordTimerRef.current?.reset();
    wordTimerRef.current?.start();
  }, [state.currentBlockIndex, state.currentWordIndexInBlock, state.currentStep]);

  useEffect(() => {
    stepContainerRef.current?.focus();
  }, [state.currentStep, state.currentBlockIndex, state.currentWordIndexInBlock]);

  // Persistence boundary: fires exactly once per entry into
  // "saving_review" (on first arrival straight from word_exercise, and
  // again each time RETRY_SAVE_REVIEW re-enters it from
  // review_save_error). The word's outcome and eventId were already
  // recorded into wordResults by WORD_OUTCOME_DETERMINED before this step
  // was entered, so a retry reuses both verbatim — never repeats the
  // exercise, never mints a new event id.
  useEffect(() => {
    if (state.currentStep !== "saving_review") {
      return;
    }

    const assignment = getCurrentWordAssignment(state);
    const wordResult = assignment ? state.wordResults[assignment.queueIndex] : null;
    if (!assignment || !wordResult || wordResult.outcome === null) {
      dispatch({ type: "EXERCISE_ERROR" });
      return;
    }

    const session = getStoredSupabaseSession();
    if (!session) {
      setSaveErrorCategory("unauthenticated");
      dispatch({ type: "SAVE_REVIEW_FAILED" });
      return;
    }

    // freeze() locks this word's active review duration the instant its
    // exercise reached a final outcome (word_exercise -> saving_review).
    // A RETRY_SAVE_REVIEW re-entry into this same effect calls freeze()
    // again and gets back the identical cached value — never recomputed,
    // never increased, timer never restarted across a retry.
    const reviewTimeSeconds = wordTimerRef.current?.freeze() ?? 0;

    let cancelled = false;

    void completeWordReview({
      session,
      eventId: wordResult.eventId,
      wordProgressId: wordResult.progressRowId,
      result: wordResult.outcome,
      // Recomputed fresh at the moment this word is persisted, matching
      // completeNewWordStudy's own precedent — the database still
      // generates the actual timestamp (now()) inside complete_word_review;
      // this is only which calendar day the review counts toward.
      reviewTimeSeconds,
    })
      .then((result) => {
        if (cancelled) return;
        setSaveErrorCategory(null);
        dispatch({
          type: "SAVE_REVIEW_SUCCEEDED",
          result: { newState: result.newState, newCorrectStreak: result.newCorrectStreak },
        });
      })
      .catch((error) => {
        if (cancelled) return;
        // Full structured diagnostics were already logged inside
        // completeWordReview's own catch (src/lib/newWordProgress.ts),
        // where the raw Supabase/PostgREST error is still available — this
        // only logs the already-sanitized domain error for screen-level
        // context.
        console.warn("ReviewSession: failed to save the review outcome.", error);
        setSaveErrorCategory(error instanceof ReviewPersistenceError ? error.category : "unknown");
        dispatch({ type: "SAVE_REVIEW_FAILED" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStep, state.currentBlockIndex, state.currentWordIndexInBlock]);

  const progress = getReviewSessionProgress(state);
  const isSessionComplete = state.currentStep === "session_complete";
  const currentBlock = getCurrentBlock(state);
  const currentAssignment = getCurrentWordAssignment(state);
  const currentWordItem = currentAssignment ? queue[currentAssignment.queueIndex] ?? null : null;
  const currentGroupItems =
    state.currentStep === "group_exercise" && currentBlock
      ? currentBlock.words.map((assignment) => queue[assignment.queueIndex]).filter((item): item is ResolvedReviewQueueItem => Boolean(item))
      : [];

  // Defensive fallback — mirrors NewWordStudySession.tsx's own
  // `!currentItem && !isSessionComplete` guard: the prepared queue and the
  // session plan should always agree in length, but a session must never
  // crash the page over a data mismatch instead of showing a safe message.
  const hasUnresolvableWordExercise =
    (state.currentStep === "word_exercise" ||
      state.currentStep === "saving_review" ||
      state.currentStep === "review_save_error") &&
    !currentWordItem;
  const hasUnresolvableGroupExercise =
    state.currentStep === "group_exercise" && (currentGroupItems.length !== 4 || !currentBlock?.groupExerciseId);

  const handleBack = () => onExit();
  const handleRetry = () => dispatch({ type: "RETRY" });
  const handleRetrySave = () => dispatch({ type: "RETRY_SAVE_REVIEW" });
  const handleBoundaryError = () => dispatch({ type: "EXERCISE_ERROR" });

  return (
    <div className="review-session">
      <div className="review-session-body">
        {!isSessionComplete && (
          <div className="review-session-header">
            <div className="review-session-header-row">
              <button
                type="button"
                onClick={handleBack}
                aria-label={t("reviewWords.backButton")}
                className="review-session-back-button"
              >
                <LogOut className="review-session-back-icon" aria-hidden="true" />
                <span>{t("reviewWords.backButton")}</span>
              </button>

              <p className="review-session-progress-text">
                {progress.wordsReviewed} / {progress.totalWords}
              </p>
            </div>

            <div
              role="progressbar"
              aria-valuenow={progress.wordsReviewed}
              aria-valuemin={0}
              aria-valuemax={progress.totalWords}
              aria-label={`${progress.wordsReviewed} / ${progress.totalWords}`}
              className="review-session-progress-track"
            >
              <div
                className="review-session-progress-fill"
                style={{
                  width: progress.totalWords > 0 ? `${(progress.wordsReviewed / progress.totalWords) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
        )}

        <div ref={stepContainerRef} tabIndex={-1} aria-live="polite" className="review-session-step-container">
          {state.currentStep === "loading" && (
            <div className="review-words-loading-block" role="status" aria-live="polite" aria-busy="true">
              <div className="review-words-spinner" aria-hidden="true" />
              <p className="review-words-loading-message">{t("reviewWords.loading")}</p>
            </div>
          )}

          {(state.currentStep === "error" || hasUnresolvableWordExercise || hasUnresolvableGroupExercise) && (
            <div className="review-session-error-block">
              <p className="review-session-error-message">{t("reviewWords.exerciseErrorMessage")}</p>
              <button type="button" onClick={handleRetry} className="review-session-error-retry-button">
                {t("reviewWords.retryButton")}
              </button>
            </div>
          )}

          {state.currentStep === "word_exercise" && currentWordItem && currentAssignment && (
            <ReviewExerciseErrorBoundary
              resetKey={`${currentAssignment.queueIndex}-${currentAssignment.typingExerciseId}`}
              onError={handleBoundaryError}
            >
              <ReviewExerciseAdapter
                key={`${currentAssignment.queueIndex}-${currentAssignment.typingExerciseId}`}
                exerciseId={currentAssignment.typingExerciseId}
                item={currentWordItem}
                practiceLanguage={practiceLanguage}
                onComplete={(outcome) => dispatch({ type: "WORD_OUTCOME_DETERMINED", outcome })}
              />
            </ReviewExerciseErrorBoundary>
          )}

          {/* saving_review keeps the just-completed word contextually
              represented (target word + translation) without re-rendering
              the interactive exercise component itself — nothing here is
              clickable, so navigation is inherently disabled while saving. */}
          {state.currentStep === "saving_review" && currentWordItem && (
            <div className="review-session-saving-block" role="status" aria-live="polite" aria-busy="true">
              <div className="review-words-spinner" aria-hidden="true" />
              <p className="review-session-saving-word">{currentWordItem.targetWord}</p>
              <p className="review-session-saving-message">{t("reviewWords.savingReview")}</p>
            </div>
          )}

          {state.currentStep === "review_save_error" && currentWordItem && (
            <div className="review-session-error-block">
              <p className="review-session-saving-word">{currentWordItem.targetWord}</p>
              <p className="review-session-error-message">
                {t(
                  // Same precedent as NewWordStudySession.tsx: unauthenticated
                  // keeps this screen's own pre-existing session-expired copy;
                  // forbidden/missing_rpc/network use the new shared
                  // messages; everything else keeps the existing generic
                  // retry copy.
                  saveErrorCategory === "unauthenticated"
                    ? "reviewWords.sessionExpiredMessage"
                    : resolveSupabaseErrorMessageKey(saveErrorCategory ?? "unknown", "reviewWords.saveErrorMessage"),
                )}
              </p>
              <button type="button" onClick={handleRetrySave} className="review-session-error-retry-button">
                {t("reviewWords.retryButton")}
              </button>
            </div>
          )}

          {state.currentStep === "group_exercise" &&
            currentBlock?.groupExerciseId &&
            currentGroupItems.length === 4 && (
              <ReviewExerciseErrorBoundary
                resetKey={`${state.currentBlockIndex}-group`}
                onError={handleBoundaryError}
              >
                <ReviewGroupExerciseAdapter
                  key={`${state.currentBlockIndex}-group`}
                  groupExerciseId={currentBlock.groupExerciseId}
                  items={currentGroupItems}
                  practiceLanguage={practiceLanguage}
                  yourLanguage={yourLanguage}
                  onComplete={(success) => dispatch({ type: "GROUP_EXERCISE_COMPLETE", success })}
                />
              </ReviewExerciseErrorBoundary>
            )}

          {state.currentStep === "block_complete" && (
            <div className="review-session-block-complete">
              <PartyPopper className="review-session-block-complete-icon" aria-hidden="true" />
              <h2 className="review-session-block-complete-heading">{t("reviewWords.blockCompleteHeading")}</h2>
              <button
                type="button"
                onClick={() => dispatch({ type: "CONTINUE_AFTER_BLOCK" })}
                className="review-session-block-complete-button"
              >
                {t("reviewWords.nextGroupButton")}
              </button>
            </div>
          )}

          {isSessionComplete && (
            <ReviewSessionComplete wordsReviewed={progress.wordsReviewed} onReturnToLearning={onExit} />
          )}
        </div>
      </div>
    </div>
  );
}
