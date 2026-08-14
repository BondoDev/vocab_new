import { useEffect } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import type { MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { SharedLazyResourceStatus } from "../useProfileSharedDailyStats";
import { DailyGoalSelector } from "./DailyGoalSelector";
import { TodayProgressCard } from "./TodayProgressCard";
import { DailyStreakCard } from "./DailyStreakCard";
import { LearningModeCards } from "./LearningModeCards";
import "./learning-section.scss";

// The authoritative current learning date is no longer owned by this
// component — as of Phase 1 of the profile-section data optimization,
// UserProfileDashboardPage's useProfileSharedProgressData is the single
// frontend owner of getCurrentLearningDate() for the whole /profile
// dashboard (Learning, Vocabulary, and Progress alike), fetched once and
// threaded down here as todayISO/todayISOStatus props (see
// useProfileSharedProgressData.ts's own header, and this feature's
// learning/README.md section for the full contract). This component still
// threads todayISO/todayISOStatus down to both TodayProgressCard and
// DailyStreakCard as props exactly as before — neither card calls
// getCurrentLearningDate itself, and "unavailable" (signed-out/no-session —
// expected, silent) and "error" (a genuine failed authenticated request —
// logged, surfaces the retry banner below) remain distinct statuses so
// neither card mistakes a failed request for "zero completed words" or "no
// streak history".
interface LearningSectionProps {
  // Loaded once at the top of the app (App.tsx's useUserProfileLoad) and
  // threaded down here — Daily Goal, Daily Streak, and Today's Progress
  // all read from this single object instead of each fetching their own
  // copy of the profile.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  // The shared learning date and its status, owned by
  // UserProfileDashboardPage's useProfileSharedProgressData — see this
  // file's header above.
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  // Bumps the shared hook's own retry token; this is the only way to
  // re-request the shared date after a failure — there is no local retry
  // state here anymore.
  onRetryLearningDate: () => void;
  // Fetch-audit Phase 1: the shared, lazily-loaded user_daily_stats
  // resource (see useProfileSharedDailyStats.ts) TodayProgressCard/
  // DailyStreakCard both derive from — requested exactly once here (see
  // the mount effect below), never fetched by either card itself.
  // No onRetryDailyStats here, deliberately: neither TodayProgressCard nor
  // DailyStreakCard ever exposed a distinct error/retry UI for their own
  // read (a failed fetch silently fell back to 0/empty even before this
  // phase — see each card's own comment) — only Dashboard/Progress expose
  // a Retry control for this resource, matching their own pre-existing
  // error-handling contract.
  dailyStatsStatus: SharedLazyResourceStatus;
  dailyStatsRows: MilestoneDailyStatRow[];
  onRequestDailyStats: () => void;
  onStartCustomPractice?: () => void;
  onStartNewWordStudy?: () => void;
  onStartReviewWords?: () => void;
  onDailyGoalChange?: (dailyGoal: number) => void;
}

export function LearningSection({
  userProfile,
  isProfileLoaded,
  todayISO,
  todayISOStatus,
  onRetryLearningDate,
  dailyStatsStatus,
  dailyStatsRows,
  onRequestDailyStats,
  onStartCustomPractice,
  onStartNewWordStudy,
  onStartReviewWords,
  onDailyGoalChange,
}: LearningSectionProps) {
  const { t } = useLanguage();

  // Fetch-audit Phase 1: requests the shared daily-stats resource once per
  // mount (a no-op if Dashboard or Progress already requested it for the
  // same context — see useProfileSharedDailyStats.ts). A successful
  // daily-goal save (DailyGoalSelector.tsx) fires notifyDailyStatsChanged()
  // directly, which refreshes this same shared resource in the background —
  // that replaces the previous local streakRefreshToken mechanism, which
  // existed only to force DailyStreakCard's own now-removed fetch effect to
  // re-run after a goal save. DailyStreakCard therefore no longer takes a
  // refresh-token prop at all; it re-renders from the shared rows like any
  // other invalidation.
  useEffect(() => {
    onRequestDailyStats();
  }, [onRequestDailyStats]);

  const isDateError = todayISOStatus === "error";

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
            onClick={onRetryLearningDate}
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
          onDailyGoalChange={onDailyGoalChange}
        />
        <DailyStreakCard
          practiceLanguage={userProfile.practiceLanguage}
          isProfileLoaded={isProfileLoaded}
          todayISO={todayISO}
          todayISOStatus={todayISOStatus}
          dailyStatsStatus={dailyStatsStatus}
          dailyStatsRows={dailyStatsRows}
        />
        <TodayProgressCard
          practiceLanguage={userProfile.practiceLanguage}
          dailyGoal={userProfile.dailyGoal}
          isProfileLoaded={isProfileLoaded}
          todayISO={todayISO}
          todayISOStatus={todayISOStatus}
          dailyStatsStatus={dailyStatsStatus}
          dailyStatsRows={dailyStatsRows}
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
