import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, Check } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { loadNewWordStudyQueue } from "./loadNewWordStudyQueue";
import { NewWordStudySession } from "./NewWordStudySession";
import { GUIDED_EXERCISE_COUNT } from "./newWordStudySessionState";
import type { NewWordStudyQueueResult } from "../../data/learning/newWordStudyQueue";

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

  const hasRequiredProfileContext = Boolean(
    authUserId && practiceLanguage && yourLanguage && dailyGoal > 0,
  );

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
        onExit={() => setIsSessionActive(false)}
      />
    );
  }

  return (
    <div className="study-new-words-page flex-1 min-h-0 flex flex-col bg-background px-4 md:px-8 py-6">
      <div className="max-w-2xl w-full mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>{t("studyNewWords.backButton")}</span>
        </button>

        <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-3 break-words">{title}</h1>

        {state.status === "loading" && <LoadingBlock message={t("studyNewWords.loading")} />}

        {state.status === "missingProfile" && (
          <MessageBlock message={t("studyNewWords.missingProfileMessage")} />
        )}

        {state.status === "error" && (
          <MessageBlock message={t("studyNewWords.errorMessage")}>
            <button
              type="button"
              onClick={handleRetry}
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
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
  );
}

function LoadingBlock({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div
        className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full mb-4 animate-spin"
        aria-hidden="true"
      />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function MessageBlock({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
      <p className="text-foreground max-w-md break-words">{message}</p>
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

  return (
    <div>
      <p className="text-base md:text-lg text-muted-foreground mb-5 max-w-prose break-words">
        {t("studyNewWords.aboutToLearnPrefix")} {result.selectedQueueLength}
        {t("studyNewWords.aboutToLearnSuffix")}
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        <InfoChip label={t("studyNewWords.targetLanguageLabel")} value={languageName} />
        <InfoChip
          label={t("studyNewWords.dailyGoalLabel")}
          value={`${result.dailyGoal} ${t("userProfile.learningSection.dailyGoal.wordsPerDay")}`}
        />
      </div>

      <div className="mb-7">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          {t("studyNewWords.sessionExplainHeading")}
        </h2>
        <ul className="space-y-2.5">
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
        disabled={result.selectedQueueLength === 0}
        aria-disabled={result.selectedQueueLength === 0}
        className="w-full sm:w-auto px-10 py-3.5 rounded-lg bg-primary text-primary-foreground text-base font-semibold shadow-sm hover:bg-primary/90 active:bg-primary/95 transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
      >
        {t("studyNewWords.beginSessionButton")}
      </button>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );
}

function SessionExplainItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-foreground/90">
      <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="break-words">{children}</span>
    </li>
  );
}
