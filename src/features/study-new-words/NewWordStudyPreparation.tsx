import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, Languages, PencilLine, Play, Repeat, Sparkles, StepForward } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { loadNewWordStudyQueue } from "./loadNewWordStudyQueue";
import { describeSupabaseError } from "../../lib/supabaseError";
import { NewWordStudySession } from "./NewWordStudySession";
import { GUIDED_EXERCISE_COUNT } from "./newWordStudySessionState";
import type { NewWordStudyQueueResult } from "../../data/learning/newWordStudyQueue";
import type { LanguageLevelCode } from "../../lib/userProfile";
// Visual styling for this component (and its LoadingBlock/MessageBlock/
// ResultBlock/SessionSteps helpers below) lives in
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
  // The learner's user_profiles.current_level — determines the minimum CEFR
  // level this default new-word queue selects from (see
  // loadNewWordStudyQueue.ts/newWordStudyQueue.ts). Not required for
  // hasRequiredProfileContext below: onboarding sets current_level together
  // with practiceLanguage/yourLanguage/dailyGoal in one atomic RPC (see
  // complete_user_profile_onboarding), so those three being present already
  // implies a valid current_level exists for this profile.
  currentLevel: LanguageLevelCode | "";
  onBack: () => void;
  // Forwarded to the session-complete screen's Start Reviewing action.
  onStartReviewWords?: () => void;
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
  currentLevel,
  onBack,
  onStartReviewWords,
}: NewWordStudyPreparationProps) {
  const { t, uiLanguage } = useLanguage();
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
      currentLevel,
    })
      .then((result) => {
        if (cancelled) return;
        setState({ status: "result", result });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(
          "NewWordStudyPreparation: failed to load the study queue.",
          describeSupabaseError("loadNewWordStudyQueue", error),
        );
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [
    isProfileLoaded,
    hasRequiredProfileContext,
    authUserId,
    practiceLanguage,
    yourLanguage,
    dailyGoal,
    currentLevel,
    retryToken,
  ]);

  const handleRetry = useCallback(() => setRetryToken((token) => token + 1), []);

  // Own key rather than the Learning page's mode-card title
  // (userProfile.learningSection.modeCards.modes.studyNewWords.title), so this
  // screen's heading wording can differ from the card/dashboard label.
  const title = t("studyNewWords.title");

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
        // Both the mid-session Exit confirmation and the session-complete
        // screen's "Return to Learning" button use this — it must navigate
        // to the real Learning page (same as the Back button above), not
        // just flip back to this component's own queue-preview screen.
        // Flipping back would also show a stale queue result: Phase 3 now
        // writes real persistence during the session, so the previously
        // loaded `result` (remainingToday, selectedQueueLength, etc.) is no
        // longer accurate by the time the user exits or finishes.
        onExit={onBack}
        onStartReviewWords={onStartReviewWords}
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
          <header className="study-new-words-header">
            <h1 className="study-new-words-title">{title}</h1>
            <p className="study-new-words-subtitle">{t("studyNewWords.subtitle")}</p>
          </header>

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
              uiLanguage={uiLanguage}
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

// Picks `${baseKey}_${category}` (CLDR plural category for the UI language:
// one/few/many/other) and substitutes {count}. Each locale defines only the
// categories its grammar needs — Russian adds `_few`/`_many` ("3 упражнения",
// "5 упражнений"), most others just `_one`/`_other` — and any undefined
// category (e.g. French/Portuguese "many" for millions) falls back to
// `_other`. t() returns the key itself on a miss, which is how a gap is
// detected.
function formatCount(
  t: (key: string) => string,
  uiLanguage: string,
  baseKey: string,
  count: number,
): string {
  const categoryKey = `${baseKey}_${new Intl.PluralRules(uiLanguage).select(count)}`;
  const template = t(categoryKey);
  return (template === categoryKey ? t(`${baseKey}_other`) : template).replace("{count}", String(count));
}

// Deliberately shows only what a learner needs to decide "am I ready to
// start": the language, how many words, how much work per word, and how the
// session runs (SessionSteps). No vocabulary from the queue is shown — the first word is introduced by
// NewWordInfoStep once the session starts. Internal queue details (completed/remaining
// counts, learning-order range) stay on `result` and only gate the
// empty/exhausted states below — they're never rendered, so a future phase
// can keep computing them without this page needing to change.
function ResultBlock({
  result,
  practiceLanguage,
  uiLanguage,
  t,
  onBeginSession,
}: {
  result: NewWordStudyQueueResult;
  practiceLanguage: string;
  uiLanguage: string;
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
      <ul className="study-new-words-facts">
        <li className="study-new-words-fact">
          <Languages className="study-new-words-fact-icon" aria-hidden="true" />
          <span>{languageName}</span>
        </li>
        <li className="study-new-words-fact">
          <BookOpen className="study-new-words-fact-icon" aria-hidden="true" />
          <span>{formatCount(t, uiLanguage, "studyNewWords.newWordsCount", result.selectedQueueLength)}</span>
        </li>
        <li className="study-new-words-fact">
          <Repeat className="study-new-words-fact-icon" aria-hidden="true" />
          <span>{formatCount(t, uiLanguage, "studyNewWords.exercisesPerWordCount", GUIDED_EXERCISE_COUNT)}</span>
        </li>
      </ul>

      <SessionSteps uiLanguage={uiLanguage} t={t} />

      <button
        type="button"
        onClick={onBeginSession}
        disabled={isBeginDisabled}
        aria-disabled={isBeginDisabled}
        className="study-new-words-begin-button"
      >
        <Play className="study-new-words-begin-button-icon" aria-hidden="true" />
        <span>{t("studyNewWords.startLearningButton")}</span>
      </button>
    </div>
  );
}

// Explains what happens after Start Learning, mirroring
// newWordStudySessionState's real order: NewWordInfoStep, then the
// GUIDED_EXERCISE_COUNT guided exercises (broken → half → full typing) on that
// same word, then the next word until the queue is done. Keep this copy in
// sync if that progression ever changes. Static and non-interactive: an <ol>
// because the steps are a genuine sequence.
function SessionSteps({ uiLanguage, t }: { uiLanguage: string; t: (key: string) => string }) {
  const steps = [
    {
      icon: Sparkles,
      title: t("studyNewWords.howItWorks.meetTitle"),
      description: t("studyNewWords.howItWorks.meetDescription"),
    },
    {
      icon: PencilLine,
      title: formatCount(t, uiLanguage, "studyNewWords.howItWorks.practiceTitle", GUIDED_EXERCISE_COUNT),
      description: formatCount(t, uiLanguage, "studyNewWords.howItWorks.practiceDescription", GUIDED_EXERCISE_COUNT),
    },
    {
      icon: StepForward,
      title: t("studyNewWords.howItWorks.nextTitle"),
      description: t("studyNewWords.howItWorks.nextDescription"),
    },
  ];

  return (
    <section className="study-new-words-steps" aria-labelledby="study-new-words-steps-heading">
      <h2 id="study-new-words-steps-heading" className="study-new-words-steps-heading">
        {t("studyNewWords.howItWorks.heading")}
      </h2>
      <ol className="study-new-words-steps-list">
        {steps.map(({ icon: Icon, title, description }) => (
          <li key={title} className="study-new-words-step">
            <span className="study-new-words-step-icon" aria-hidden="true">
              <Icon className="study-new-words-step-icon-svg" />
            </span>
            <span className="study-new-words-step-body">
              <span className="study-new-words-step-title">{title}</span>
              <span className="study-new-words-step-description">{description}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
