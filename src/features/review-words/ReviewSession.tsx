import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Flag, PartyPopper } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { loadReviewQueue, type ResolvedReviewQueueItem } from "./loadReviewQueue";
import { formatCount } from "./utils/formatCount";
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
import {
  SessionCountBelowCard,
  SessionCountChip,
  SessionFullscreenToggle,
  SessionHeader,
} from "../practice/components/SessionHeader";
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
  // The first batch, already prepared by ReviewWordsPreparation.
  initialQueue: ResolvedReviewQueueItem[];
  practiceLanguage: string;
  yourLanguage: string;
  // Return to Learning (summary and all-caught-up screens). Finishing never
  // loses anything: every word already reached a successful
  // complete_word_review call before the session advanced past it (see the
  // saving_review effect below), so there is no exit-confirmation dialog.
  onExit: () => void;
}

// Continuous reviewing: the next batch is requested once this many (or
// fewer) prepared words are still unplayed, so it normally arrives before
// the learner reaches the end and words keep coming without a pause.
const REPLENISH_THRESHOLD = 5;

type BatchStatus = "idle" | "loading" | "exhausted" | "error";

// Phase 2/3 orchestrator: consumes the already-prepared, already-resolved
// review queue (built by loadReviewQueue.ts, unmodified by this phase) and
// walks it through the existing exercise components via its own pure state
// machine (reviewSessionState.ts), persisting each individual word's
// outcome immediately via complete_word_review before advancing. Group
// exercises are reinforcement-only and are never persisted (see
// reviewSessionState.ts's GROUP_EXERCISE_COMPLETE case and
// ReviewGroupExerciseAdapter — neither calls completeWordReview).
//
// Continuous reviewing: there is no session length. The session starts with
// the prepared batch, fetches the next batch (same selection engine, every
// concept already in this session excluded) whenever few words remain, and
// runs until the learner presses Finish Review — or until a batch comes
// back empty under the selection rules (all_caught_up). The 20-word figure
// is only loadReviewQueue's batch size.
export function ReviewSession({ initialQueue, practiceLanguage, yourLanguage, onExit }: ReviewSessionProps) {
  const { t, uiLanguage } = useLanguage();
  const [state, dispatch] = useReducer(reduceReviewSessionState, initialQueue, (firstBatch) =>
    createInitialReviewSessionState(firstBatch),
  );
  // Every word queued in this session, in queue-index order (wordResults[i]
  // is queue[i]). The ref mirrors it for the async batch handler, which must
  // dedupe against the latest queue, not the one from its render.
  const [queue, setQueue] = useState<ResolvedReviewQueueItem[]>(initialQueue);
  const queueRef = useRef(initialQueue);
  const [batchStatus, setBatchStatus] = useState<BatchStatus>("idle");
  // Guards against overlapping batch requests (an effect re-run while one
  // is in flight) and against applying a batch after the session ended or
  // the component unmounted.
  const isBatchInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const hasEndedRef = useRef(false);
  hasEndedRef.current = state.isComplete || state.currentStep === "all_caught_up";
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
  }, []);

  // Stops accumulation and detaches the visibility listener on unmount/
  // navigation — same precedent as NewWordStudySession.tsx.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      wordTimerRef.current?.dispose();
    };
  }, []);

  // Fetches the next batch, excluding every concept already in this session
  // (reviewed or still waiting), so no word repeats within it. Read-only;
  // reviews are only ever written by the saving_review effect below.
  const fetchNextBatch = useCallback(() => {
    if (isBatchInFlightRef.current || hasEndedRef.current) return;
    const session = getStoredSupabaseSession();
    if (!session) {
      setBatchStatus("error");
      return;
    }
    isBatchInFlightRef.current = true;
    setBatchStatus("loading");
    void loadReviewQueue({
      session,
      targetLanguage: practiceLanguage,
      nativeLanguage: yourLanguage,
      excludeConceptIds: new Set(queueRef.current.map((item) => item.conceptId)),
    })
      .then((result) => {
        isBatchInFlightRef.current = false;
        if (!isMountedRef.current || hasEndedRef.current) return;
        // Defensive dedupe (the engine already excludes these): by stable
        // concept id, against the whole session and within the batch.
        const known = new Set(queueRef.current.map((item) => item.conceptId));
        const fresh = result.queue.filter((item) => {
          if (known.has(item.conceptId)) return false;
          known.add(item.conceptId);
          return true;
        });
        if (fresh.length === 0) {
          // Nothing eligible is left under the selection rules — never retry
          // or recycle words; the session ends at all_caught_up once the
          // learner reaches the end of what's prepared.
          setBatchStatus("exhausted");
          return;
        }
        queueRef.current = [...queueRef.current, ...fresh];
        setQueue(queueRef.current);
        dispatch({ type: "APPEND_QUEUE", items: fresh });
        setBatchStatus("idle");
      })
      .catch((error) => {
        isBatchInFlightRef.current = false;
        if (!isMountedRef.current) return;
        // A failed request is not exhaustion: keep reviewing what's
        // prepared; at the end, offer a retry (see awaiting_more below).
        console.warn("ReviewSession: failed to load the next review batch.", error);
        setBatchStatus("error");
      });
  }, [practiceLanguage, yourLanguage]);

  // Unplayed = prepared words with no outcome yet (includes the one on
  // screen). Requests the next batch at the threshold, once at a time.
  const unplayedCount = state.wordResults.filter((result) => result.outcome === null).length;
  useEffect(() => {
    if (state.currentStep === "loading" || hasEndedRef.current) return;
    if (batchStatus !== "idle" || unplayedCount > REPLENISH_THRESHOLD) return;
    fetchNextBatch();
  }, [state.currentStep, unplayedCount, batchStatus, fetchNextBatch]);

  // Exhaustion is only shown once the learner has actually reached the end
  // of the words already prepared.
  useEffect(() => {
    if (batchStatus === "exhausted" && state.currentStep === "awaiting_more") {
      dispatch({ type: "QUEUE_EXHAUSTED" });
    }
  }, [batchStatus, state.currentStep]);

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

  const handleFinish = () => dispatch({ type: "FINISH_REVIEW" });
  const handleRetryBatch = () => setBatchStatus("idle");
  const handleRetry = () => dispatch({ type: "RETRY" });
  const handleRetrySave = () => dispatch({ type: "RETRY_SAVE_REVIEW" });
  const handleBoundaryError = () => dispatch({ type: "EXERCISE_ERROR" });

  return (
    <div className="review-session">
      <div className="review-session-body">
        {!isSessionComplete && (
          // Shared session header (same rail as Custom Practice). No
          // "x / total" and no progress bar: the session has no fixed
          // length. Finish is always here; it's disabled only while a word's
          // save is in flight (the reducer ignores it then too), so a save
          // can't be dropped from the summary.
          <SessionHeader
            inset
            fromLanguageName={t(`languageNames.${yourLanguage}`)}
            toLanguageName={t(`languageNames.${practiceLanguage}`)}
            fromLanguageCode={yourLanguage}
            toLanguageCode={practiceLanguage}
            start={
              <button
                type="button"
                onClick={handleFinish}
                disabled={state.currentStep === "saving_review"}
                className="practice-header-button practice-header-button--finish"
              >
                <Flag className="practice-header-button__icon" aria-hidden="true" />
                <span>{t("practice.finish")}</span>
              </button>
            }
            end={<SessionFullscreenToggle />}
          />
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
                onComplete={(outcome) => {
                  // Submitting this word's review exercise is a genuine
                  // interaction — refreshes the active-time idle deadline
                  // (see activeWordTimer.ts's own header).
                  wordTimerRef.current?.recordInteraction();
                  dispatch({ type: "WORD_OUTCOME_DETERMINED", outcome });
                }}
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

          {/* End of everything prepared so far: the next batch is loading
              (normally it already arrived — this only shows on a slow
              network), or its request failed and can be retried. */}
          {state.currentStep === "awaiting_more" && batchStatus !== "error" && (
            <div className="review-words-loading-block" role="status" aria-live="polite" aria-busy="true">
              <div className="review-words-spinner" aria-hidden="true" />
              <p className="review-words-loading-message">{t("reviewWords.continuous.loadingMore")}</p>
            </div>
          )}

          {state.currentStep === "awaiting_more" && batchStatus === "error" && (
            <div className="review-session-error-block">
              <p className="review-session-error-message">{t("reviewWords.continuous.loadMoreError")}</p>
              <button type="button" onClick={handleRetryBatch} className="review-session-error-retry-button">
                {t("reviewWords.retryButton")}
              </button>
            </div>
          )}

          {state.currentStep === "all_caught_up" && (
            <div className="review-session-caught-up" role="status">
              <h2 className="review-session-caught-up-title">{t("reviewWords.continuous.caughtUpTitle")}</h2>
              <p className="review-session-caught-up-text">{t("reviewWords.continuous.caughtUpDescription")}</p>
              <div className="review-session-caught-up-actions">
                <button type="button" onClick={handleFinish} className="review-session-caught-up-primary">
                  {t("reviewWords.continuous.finishButton")}
                </button>
                <button type="button" onClick={onExit} className="review-session-caught-up-secondary">
                  {t("studyNewWords.returnToLearningButton")}
                </button>
              </div>
            </div>
          )}

          {isSessionComplete && (
            <ReviewSessionComplete
              wordsReviewed={progress.wordsReviewed}
              practiceLanguage={practiceLanguage}
              onReturnToLearning={onExit}
            />
          )}
        </div>

        {!isSessionComplete && (
          <SessionCountBelowCard>
            <SessionCountChip
              label={formatCount(t, uiLanguage, "reviewWords.continuous.reviewedCount", progress.wordsReviewed)}
              count={progress.wordsReviewed}
            />
          </SessionCountBelowCard>
        )}
      </div>
    </div>
  );
}
