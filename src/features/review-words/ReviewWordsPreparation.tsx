import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, ChevronLeft, Clock, Languages } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { loadReviewQueue } from "./loadReviewQueue";
import type { LoadReviewQueueResult } from "./loadReviewQueue";
import { describeSupabaseError } from "../../lib/supabaseError";
import { ReviewSession } from "./ReviewSession";
import { ImmersiveSessionFrame } from "../../app/components/layout/ImmersiveSessionFrame";
import { requestSessionFullscreen } from "../../app/utils/immersiveSession";
import "./styles/review-words.scss";

interface ReviewWordsPreparationProps {
  authUserId: string | null;
  isProfileLoaded: boolean;
  practiceLanguage: string;
  yourLanguage: string;
  onBack: () => void;
  onStartNewWordStudy?: () => void;
  // Lets the route hide the site navbar while the session itself runs (the
  // preparation view keeps it). Must be a stable callback.
  onSessionActiveChange?: (active: boolean) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "missingProfile" }
  | { status: "error" }
  | { status: "result"; result: LoadReviewQueueResult };

// Phase 1 only prepares and displays this queue — it never writes to
// user_word_progress, user_daily_stats, or any other table, so
// "authenticated" here means only "has a usable session to read from",
// matching NewWordStudyPreparation.tsx's own precedent.
export function ReviewWordsPreparation({
  authUserId,
  isProfileLoaded,
  practiceLanguage,
  yourLanguage,
  onBack,
  onStartNewWordStudy,
  onSessionActiveChange,
}: ReviewWordsPreparationProps) {
  const { t } = useLanguage();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  // "session" replaces the whole preparation view with ReviewSession;
  // exiting just flips back — nothing here needs to reload, since Phase 2
  // never writes anything that would change what Phase 1 already loaded.
  const [isSessionActive, setIsSessionActive] = useState(false);

  // The Begin click also reports `true` synchronously (same render as the
  // session, so the navbar never flashes); this keeps the route in sync
  // otherwise and always reports `false` on unmount.
  useEffect(() => {
    onSessionActiveChange?.(isSessionActive);
  }, [isSessionActive, onSessionActiveChange]);
  useEffect(() => () => onSessionActiveChange?.(false), [onSessionActiveChange]);

  const hasRequiredProfileContext = Boolean(authUserId && practiceLanguage && yourLanguage);

  useEffect(() => {
    if (!isProfileLoaded) {
      setState({ status: "loading" });
      return;
    }

    if (!hasRequiredProfileContext) {
      setState({ status: "missingProfile" });
      return;
    }

    const session = getStoredSupabaseSession();
    if (!session) {
      setState({ status: "missingProfile" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void loadReviewQueue({
      session,
      targetLanguage: practiceLanguage,
      nativeLanguage: yourLanguage,
    })
      .then((result) => {
        if (cancelled) return;
        setState({ status: "result", result });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(
          "ReviewWordsPreparation: failed to load the review queue.",
          describeSupabaseError("loadReviewQueue", error),
        );
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [isProfileLoaded, hasRequiredProfileContext, authUserId, practiceLanguage, yourLanguage, retryToken]);

  const handleRetry = useCallback(() => setRetryToken((token) => token + 1), []);

  const title = t("reviewWords.title");

  // Begin Review replaces this whole screen with the guided session — it
  // reuses the exact queue Phase 1 already prepared (in the same order),
  // never rebuilding or re-fetching it.
  if (isSessionActive && state.status === "result" && state.result.queue.length > 0) {
    return (
      <ImmersiveSessionFrame>
        <ReviewSession
          initialQueue={state.result.queue}
          practiceLanguage={practiceLanguage}
          yourLanguage={yourLanguage}
          onExit={onBack}
        />
      </ImmersiveSessionFrame>
    );
  }

  return (
    <div className="review-words-page">
      <div className="review-words-page-body">
        <button onClick={onBack} className="review-words-back-button">
          <ChevronLeft className="review-words-back-icon" aria-hidden="true" />
          <span>{t("reviewWords.backButton")}</span>
        </button>

        <div className="review-words-panel">
          <header className="review-words-header">
            <h1 className="review-words-title">{title}</h1>
            <p className="review-words-subtitle">{t("reviewWords.subtitle")}</p>
          </header>

          {state.status === "loading" && <LoadingBlock message={t("reviewWords.loading")} />}

          {state.status === "missingProfile" && <MessageBlock message={t("reviewWords.missingProfileMessage")} />}

          {state.status === "error" && (
            <MessageBlock message={t("reviewWords.errorMessage")}>
              <button type="button" onClick={handleRetry} className="review-words-retry-button">
                {t("reviewWords.retryButton")}
              </button>
            </MessageBlock>
          )}

          {state.status === "result" && (
            <ResultBlock
              result={state.result}
              practiceLanguage={practiceLanguage}
              t={t}
              onStartNewWordStudy={onStartNewWordStudy}
              onBeginReview={() => {
                // Inside the click: fullscreen needs this user activation.
                void requestSessionFullscreen();
                setIsSessionActive(true);
                onSessionActiveChange?.(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingBlock({ message }: { message: string }) {
  return (
    <div className="review-words-loading-block" role="status" aria-live="polite" aria-busy="true">
      <div className="review-words-spinner" aria-hidden="true" />
      <p className="review-words-loading-message">{message}</p>
    </div>
  );
}

function MessageBlock({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="review-words-message-block" role="status">
      <p className="review-words-message-text">{message}</p>
      {children}
    </div>
  );
}

// Deliberately shows only what a learner needs to decide "am I ready to
// start": the language, and that reviewing is open-ended. No word count —
// the prepared queue is only the first batch (see ReviewSession), so its
// size would wrongly read as a fixed session length. Unlike the new-word
// screen there is no word preview — showing a due word (or its translation)
// right before recalling it would give the answer away. Internal selection
// details (overdue counts, weights, priorities) stay on `result.metadata` and
// are only used here to choose which state to render, never surfaced in the
// markup — matching this phase's "read-only, no-internals-in-production-UI"
// requirement.
function ResultBlock({
  result,
  practiceLanguage,
  t,
  onStartNewWordStudy,
  onBeginReview,
}: {
  result: LoadReviewQueueResult;
  practiceLanguage: string;
  t: (key: string) => string;
  onStartNewWordStudy?: () => void;
  onBeginReview: () => void;
}) {
  if (result.metadata.hasNoReviewableVocabulary) {
    return (
      <MessageBlock message={t("reviewWords.noWordsYetMessage")}>
        {onStartNewWordStudy ? (
          <button type="button" onClick={onStartNewWordStudy} className="review-words-retry-button">
            {t("reviewWords.studyNewWordsAction")}
          </button>
        ) : null}
      </MessageBlock>
    );
  }

  if (result.queue.length === 0) {
    return <MessageBlock message={t("reviewWords.notReadyMessage")} />;
  }

  const languageName = t(`languageNames.${practiceLanguage}`);

  return (
    <div className="review-words-preview">
      <ul className="review-words-facts">
        <li className="review-words-fact">
          <Languages className="review-words-fact-icon" aria-hidden="true" />
          <span>{languageName}</span>
        </li>
        <li className="review-words-fact">
          <Clock className="review-words-fact-icon" aria-hidden="true" />
          <span>{t("reviewWords.continuous.ownPace")}</span>
        </li>
      </ul>

      <p className="review-words-intro-hint">{t("reviewWords.continuous.introHint")}</p>

      <button type="button" onClick={onBeginReview} className="review-words-begin-button">
        <span>{t("reviewWords.startReviewButton")}</span>
        <ArrowRight className="review-words-begin-button-icon" aria-hidden="true" />
      </button>
    </div>
  );
}
