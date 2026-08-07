import { useEffect, useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { getCurrentLearningDate } from "../../../../lib/learningDate";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import type { UserProfile } from "../../../../lib/userProfile";
import { DailyGoalSelector } from "./DailyGoalSelector";
import { TodayProgressCard } from "./TodayProgressCard";
import { DailyStreakCard } from "./DailyStreakCard";
import { LearningModeCards } from "./LearningModeCards";
import "./learning-section.scss";

// LearningSection is the single frontend owner of the current authoritative
// learning date for the whole mounted Learning dashboard — it calls
// getCurrentLearningDate() exactly once per normal mount and threads the
// resulting todayISO/todayISOStatus down to both TodayProgressCard and
// DailyStreakCard as props. Neither card calls getCurrentLearningDate
// itself anymore (see their own file headers). Unlike an earlier version of
// this contract, "unavailable" (signed-out/no-session — expected, silent)
// and "error" (an actual failed authenticated request — logged, surfaces
// the retry banner below) are passed down as distinct statuses, not
// collapsed into the same todayISO: null signal: a failed request is not
// equivalent to "zero completed words" or "no streak history", so each card
// must be able to tell the two apart and suppress its own display for a
// genuine error instead of quietly presenting an empty/zero result as if it
// were successfully loaded. dateState.status is passed straight through as
// todayISOStatus — see each card's own header for exactly how it changes
// that card's fetch-gating and rendering.
type LearningDateState =
  | { status: "loading" }
  | { status: "ready"; todayISO: string }
  | { status: "unavailable" }
  | { status: "error" };

interface LearningSectionProps {
  // Loaded once at the top of the app (App.tsx's useUserProfileLoad) and
  // threaded down here — Daily Goal, Daily Streak, and Today's Progress
  // all read from this single object instead of each fetching their own
  // copy of the profile.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  onStartCustomPractice?: () => void;
  onStartNewWordStudy?: () => void;
  onStartReviewWords?: () => void;
  onDailyGoalChange?: (dailyGoal: number) => void;
}

export function LearningSection({
  userProfile,
  isProfileLoaded,
  onStartCustomPractice,
  onStartNewWordStudy,
  onStartReviewWords,
  onDailyGoalChange,
}: LearningSectionProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();

  // Opaque refresh trigger for DailyStreakCard's own user_daily_stats
  // fetch — carries no goal value itself, just a reason to refetch.
  // DailyGoalSelector's onDailyGoalChange only ever fires from its .then()
  // success branch (never .catch()), so a failed save leaves this
  // untouched and DailyStreakCard's cached stats/summary are left exactly
  // as they were: no optimistic or false refresh. DailyStreakCard still
  // never receives the goal value itself — only this token — so historical
  // completion stays exactly as impervious to the live profile goal as
  // computeDailyStreakSummary's own signature already guarantees; this
  // only widens *when* DailyStreakCard re-reads the authoritative rows,
  // never *what* it judges them against. Deliberately NOT a dependency of
  // the date-loading effect below — a goal save never changes the
  // authoritative current date, so it must never trigger a second
  // getCurrentLearningDate() call.
  const [streakRefreshToken, setStreakRefreshToken] = useState(0);

  const handleDailyGoalChange = (dailyGoal: number) => {
    setStreakRefreshToken((token) => token + 1);
    onDailyGoalChange?.(dailyGoal);
  };

  const [dateState, setDateState] = useState<LearningDateState>({ status: "loading" });
  // Bumping this is the only way to re-run the date-loading effect once
  // authUserId/isProfileLoaded are stable — a dedicated retry action for
  // the shared date, independent of streakRefreshToken above.
  const [dateRetryToken, setDateRetryToken] = useState(0);

  useEffect(() => {
    if (!authUserId) {
      // Signed-out visitor: no session to call the RPC with. Both cards
      // already fall back to their own signed-out-safe zero/empty state
      // regardless of todayISO, so this never performs a fetch.
      setDateState({ status: "unavailable" });
      return;
    }

    if (!isProfileLoaded) {
      // The shared profile load (App.tsx) is still in flight — wait for it,
      // same contract every card here already follows.
      setDateState({ status: "loading" });
      return;
    }

    let cancelled = false;
    setDateState({ status: "loading" });

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setDateState({ status: "unavailable" });
          return;
        }

        const todayISO = await getCurrentLearningDate(session);
        if (cancelled) return;
        setDateState({ status: "ready", todayISO });
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "LearningSection: failed to load the current learning date.",
          describeSupabaseError("getCurrentLearningDate", error),
        );
        setDateState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
    // practiceLanguage is deliberately not a dependency — the authoritative
    // date does not depend on the target language, and refetching it on a
    // language change would just be a duplicate RPC call. Each card's own
    // data effect still depends on practiceLanguage for its own read.
  }, [authUserId, isProfileLoaded, dateRetryToken]);

  const todayISO = dateState.status === "ready" ? dateState.todayISO : null;
  // The one discriminant both cards receive — see LearningDateState above
  // and each card's own header for what "loading"/"ready"/"unavailable"/
  // "error" changes about its fetch-gating and rendering.
  const todayISOStatus = dateState.status;
  const isDateError = dateState.status === "error";

  const handleRetryDateLoad = () => setDateRetryToken((token) => token + 1);

  return (
    <>
      <header className="learning-section__header">
        <h1 className="learning-section__title">
          {t("userProfile.learningSection.title")}
        </h1>
        <p className="learning-section__description">
          {t("userProfile.learningSection.description")}
        </p>
      </header>
      {isDateError ? (
        <div className="learning-section__date-error" role="status">
          <p className="learning-section__date-error-text">
            {t("userProfile.learningSection.dateLoadError")}
          </p>
          <button
            type="button"
            onClick={handleRetryDateLoad}
            className="learning-section__date-error-retry"
          >
            {t("userProfile.learningSection.dateRetryButton")}
          </button>
        </div>
      ) : null}
      <div className="learning-section__indicators">
        <DailyGoalSelector
          userProfile={userProfile}
          isProfileLoaded={isProfileLoaded}
          onDailyGoalChange={handleDailyGoalChange}
        />
        <DailyStreakCard
          practiceLanguage={userProfile.practiceLanguage}
          isProfileLoaded={isProfileLoaded}
          todayISO={todayISO}
          todayISOStatus={todayISOStatus}
          streakRefreshToken={streakRefreshToken}
        />
        <TodayProgressCard
          practiceLanguage={userProfile.practiceLanguage}
          dailyGoal={userProfile.dailyGoal}
          isProfileLoaded={isProfileLoaded}
          todayISO={todayISO}
          todayISOStatus={todayISOStatus}
        />
      </div>
      <LearningModeCards
        onStartCustomPractice={onStartCustomPractice}
        onStartNewWordStudy={onStartNewWordStudy}
        onStartReviewWords={onStartReviewWords}
      />
    </>
  );
}
