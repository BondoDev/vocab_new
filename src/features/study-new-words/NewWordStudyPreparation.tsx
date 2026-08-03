import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  GraduationCap,
  Languages,
  ListChecks,
  Play,
  Target,
} from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { loadNewWordStudyQueue } from "./loadNewWordStudyQueue";
import { NewWordStudySession } from "./NewWordStudySession";
import { GUIDED_EXERCISE_COUNT } from "./newWordStudySessionState";
import type { NewWordStudyQueueResult } from "../../data/learning/newWordStudyQueue";
// Visual styling for this component (and its LoadingBlock/MessageBlock/
// ResultBlock/InfoItem/SessionExplainItem helpers below) lives in
// ./styles/study-new-words.scss — this file only assigns the semantic class
// names. NewWordStudySession.tsx also imports that stylesheet, but this
// component is its own entry point (rendered before a session starts), so it
// imports it too rather than relying on import order across components.
import "./styles/study-new-words.scss";

interface NewWordStudyPreparationProps {
  authUserId: string | null;
  isProfileLoaded: boolean;
  practiceLanguage: string;
  yourLanguage: string;
  dailyGoal: number;
  onBack: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "missingProfile" }
  | { status: "error" }
  | { status: "result"; result: NewWordStudyQueueResult };

// Phase 1 only prepares and displays this queue — it never writes to
// user_word_progress or user_daily_stats, so "authenticated" here means only
// "has a usable session to read from", the same as every other read in this
// screen.
export function NewWordStudyPreparation({
  authUserId,
  isProfileLoaded,
  practiceLanguage,
  yourLanguage,
  dailyGoal,
  onBack,
}: NewWordStudyPreparationProps) {
  const { t } = useLanguage();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  // "session" replaces the whole preparation view with NewWordStudySession;
  // exiting just flips back — nothing here needs to reload, since Phase 2
  // never writes anything that would change what Phase 1 already loaded.
  const [isSessionActive, setIsSessionActive] = useState(false);

  const hasRequiredProfileContext = Boolean(authUserId && practiceLanguage && yourLanguage && dailyGoal > 0);

  useEffect(() => {
    if (!isProfileLoaded) {
      setState({ status: "loading" });
      return;
    }

    if (!hasRequiredProfileContext) {
      setState({ status: "missingProfile" });
      return;
    }

    // Read fresh from storage rather than threading a session prop: token
    // refreshes replace the stored session object, and this screen only
    // needs it once per load/retry, matching useUserProfileLoad's approach.
    const session = getStoredSupabaseSession();
    if (!session) {
      setState({ status: "missingProfile" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void loadNewWordStudyQueue({
      session,
      targetLanguage: practiceLanguage,
      nativeLanguage: yourLanguage,
      dailyGoal,
    })
      .then((result) => {
        if (cancelled) return;
        setState({ status: "result", result });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("NewWordStudyPreparation: failed to load the study queue.", error);
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProfileLoaded, hasRequiredProfileContext, authUserId, practiceLanguage, yourLanguage, dailyGoal, retryToken]);

  const handleRetry = useCallback(() => setRetryToken((token) => token + 1), []);

  const title = t("userProfile.learningSection.modeCards.modes.studyNewWords.title");

  // Begin Session replaces this whole screen with the guided session — it
  // never navigates to the ordinary Exercises page and never starts Custom
  // Practice; it only switches which component this container renders,
  // using the exact queue Phase 1 already prepared (in the same order).
  if (isSessionActive && state.status === "result") {
    return (
      <NewWordStudySession
        queue={state.result.selectedQueue}
        practiceLanguage={practiceLanguage}
        yourLanguage={yourLanguage}
        dailyGoal={state.result.dailyGoal}
        wordsCompletedToday={state.result.wordsCompletedToday}
        onExit={() => setIsSessionActive(false)}
      />
    );
  }

  return (
    <div className="study-new-words-page">
      <div className="study-new-words-page-body">
        <button onClick={onBack} className="study-new-words-back-button">
          <ChevronLeft className="study-new-words-back-icon" aria-hidden="true" />
          <span>{t("studyNewWords.backButton")}</span>
        </button>

        <div className="study-new-words-panel">
          <div className="study-new-words-header-icon" aria-hidden="true">
            <GraduationCap className="study-new-words-header-icon-svg" />
          </div>

          <h1 className="study-new-words-title">{title}</h1>

          {state.status === "loading" && <LoadingBlock message={t("studyNewWords.loading")} />}

          {state.status === "missingProfile" && (
            <MessageBlock message={t("studyNewWords.missingProfileMessage")} />
          )}

          {state.status === "error" && (
            <MessageBlock message={t("studyNewWords.errorMessage")}>
              <button type="button" onClick={handleRetry} className="study-new-words-retry-button">
                {t("studyNewWords.retryButton")}
              </button>
            </MessageBlock>
          )}

          {state.status === "result" && (
            <ResultBlock
              result={state.result}
              practiceLanguage={practiceLanguage}
              t={t}
              onBeginSession={() => setIsSessionActive(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingBlock({ message }: { message: string }) {
  return (
    <div className="study-new-words-loading-block">
      <div className="study-new-words-spinner" aria-hidden="true" />
      <p className="study-new-words-loading-message">{message}</p>
    </div>
  );
}

function MessageBlock({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="study-new-words-message-block">
      <p className="study-new-words-message-text">{message}</p>
      {children}
    </div>
  );
}

// Deliberately shows only what a learner needs to decide "am I ready to
// start": a friendly summary, the language/goal it's for, and what the
// session consists of. Internal queue details (completed/remaining counts,
// exact word count, learning-order range, which words were selected) stay
// on `result` and are still used to gate empty/exhausted states below —
// they're just never rendered, so a future phase can keep computing them
// without this page needing to change.
function ResultBlock({
  result,
  practiceLanguage,
  t,
  onBeginSession,
}: {
  result: NewWordStudyQueueResult;
  practiceLanguage: string;
  t: (key: string) => string;
  onBeginSession: () => void;
}) {
  if (result.remainingToday === 0) {
    return <MessageBlock message={t("studyNewWords.goalCompleteMessage")} />;
  }

  if (result.isArrangedVocabularyExhausted) {
    return <MessageBlock message={t("studyNewWords.exhaustedMessage")} />;
  }

  const languageName = t(`languageNames.${practiceLanguage}`);
  const isBeginDisabled = result.selectedQueueLength === 0;

  return (
    <div className="study-new-words-preview">
      {/* Only the dynamic values (word count, language) are emphasized —
          the rest of the sentence stays regular weight so it doesn't read
          as "everything purple". */}
      <p className="study-new-words-summary">
        {t("studyNewWords.aboutToLearnPrefix")}{" "}
        <span className="study-new-words-summary-value">{result.selectedQueueLength}</span>
        {t("studyNewWords.aboutToLearnSuffix")}{" "}
        <span className="study-new-words-summary-value">{languageName}</span>.
      </p>

      <div className="study-new-words-info-grid">
        <InfoItem
          icon={<Languages className="study-new-words-info-item-icon-svg" aria-hidden="true" />}
          label={t("studyNewWords.targetLanguageLabel")}
          value={languageName}
        />
        <InfoItem
          icon={<Target className="study-new-words-info-item-icon-svg" aria-hidden="true" />}
          label={t("studyNewWords.dailyGoalLabel")}
          value={`${result.dailyGoal} ${t("userProfile.learningSection.dailyGoal.wordsPerDay")}`}
        />
      </div>

      <div className="study-new-words-checklist">
        <div className="study-new-words-checklist-header">
          <ListChecks className="study-new-words-checklist-header-icon" aria-hidden="true" />
          <h2 className="study-new-words-checklist-heading">{t("studyNewWords.sessionExplainHeading")}</h2>
        </div>
        <ul className="study-new-words-checklist-list">
          <SessionExplainItem>{t("studyNewWords.sessionExplainBullet1")}</SessionExplainItem>
          <SessionExplainItem>
            {t("studyNewWords.sessionExplainExercisesPrefix")} {GUIDED_EXERCISE_COUNT}
            {t("studyNewWords.sessionExplainExercisesSuffix")}
          </SessionExplainItem>
          <SessionExplainItem>{t("studyNewWords.sessionExplainBullet3")}</SessionExplainItem>
        </ul>
      </div>

      <button
        type="button"
        onClick={onBeginSession}
        disabled={isBeginDisabled}
        aria-disabled={isBeginDisabled}
        className="study-new-words-begin-button"
      >
        <Play className="study-new-words-begin-button-icon" aria-hidden="true" />
        <span>{t("studyNewWords.beginSessionButton")}</span>
      </button>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="study-new-words-info-item">
      <span className="study-new-words-info-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="study-new-words-info-item-body">
        <span className="study-new-words-info-item-label">{label}</span>
        <span className="study-new-words-info-item-value">{value}</span>
      </span>
    </div>
  );
}

function SessionExplainItem({ children }: { children: ReactNode }) {
  return (
    <li className="study-new-words-checklist-item">
      <CheckCircle2 className="study-new-words-checklist-item-icon" aria-hidden="true" />
      <span className="study-new-words-checklist-item-text">{children}</span>
    </li>
  );
}
