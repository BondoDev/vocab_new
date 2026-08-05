import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BrainCircuit, ChevronLeft, Languages, ListChecks, Play } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { loadReviewQueue } from "./loadReviewQueue";
import type { LoadReviewQueueResult } from "./loadReviewQueue";
import { describeSupabaseError } from "../../lib/supabaseError";
import { ReviewSession } from "./ReviewSession";
import "./styles/review-words.scss";

interface ReviewWordsPreparationProps {
  authUserId: string | null;
  isProfileLoaded: boolean;
  practiceLanguage: string;
  yourLanguage: string;
  onBack: () => void;
  onStartNewWordStudy?: () => void;
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
}: ReviewWordsPreparationProps) {
  const { t } = useLanguage();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  // "session" replaces the whole preparation view with ReviewSession;
  // exiting just flips back — nothing here needs to reload, since Phase 2
  // never writes anything that would change what Phase 1 already loaded.
  const [isSessionActive, setIsSessionActive] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProfileLoaded, hasRequiredProfileContext, authUserId, practiceLanguage, yourLanguage, retryToken]);

  const handleRetry = useCallback(() => setRetryToken((token) => token + 1), []);

  const title = t("reviewWords.title");

  // Begin Review replaces this whole screen with the guided session — it
  // reuses the exact queue Phase 1 already prepared (in the same order),
  // never rebuilding or re-fetching it.
  if (isSessionActive && state.status === "result" && state.result.queue.length > 0) {
    return (
      <ReviewSession
        queue={state.result.queue}
        practiceLanguage={practiceLanguage}
        yourLanguage={yourLanguage}
        onExit={onBack}
      />
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
          <div className="review-words-header-icon" aria-hidden="true">
            <BrainCircuit className="review-words-header-icon-svg" />
          </div>

          <h1 className="review-words-title">{title}</h1>
          <p className="review-words-subtitle">{t("reviewWords.subtitle")}</p>

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
              onBeginReview={() => setIsSessionActive(true)}
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
// start": a friendly summary, the language it's for, and the word count.
// Internal selection details (overdue counts, weights, priorities) stay on
// `result.metadata` and are only used here to choose which state to render,
// never surfaced in the markup — matching this phase's "read-only,
// no-internals-in-production-UI" requirement.
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
      <p className="review-words-summary">
        {t("reviewWords.aboutToReviewPrefix")}{" "}
        <span className="review-words-summary-value">{result.queue.length}</span>{" "}
        {t("reviewWords.aboutToReviewSuffix")} <span className="review-words-summary-value">{languageName}</span>.
      </p>

      <div className="review-words-info-grid">
        <InfoItem
          icon={<Languages className="review-words-info-item-icon-svg" aria-hidden="true" />}
          label={t("reviewWords.targetLanguageLabel")}
          value={languageName}
        />
        <InfoItem
          icon={<ListChecks className="review-words-info-item-icon-svg" aria-hidden="true" />}
          label={t("reviewWords.wordsPreparedLabel")}
          value={String(result.queue.length)}
        />
      </div>

      <button type="button" onClick={onBeginReview} className="review-words-begin-button">
        <Play className="review-words-begin-button-icon" aria-hidden="true" />
        <span>{t("reviewWords.beginReviewButton")}</span>
      </button>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="review-words-info-item">
      <span className="review-words-info-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="review-words-info-item-body">
        <span className="review-words-info-item-label">{label}</span>
        <span className="review-words-info-item-value">{value}</span>
      </span>
    </div>
  );
}
