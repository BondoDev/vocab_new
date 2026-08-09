import { useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
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
  onStartCustomPractice,
  onStartNewWordStudy,
  onStartReviewWords,
  onDailyGoalChange,
}: LearningSectionProps) {
  const { t } = useLanguage();

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
  // never *what* it judges them against. A goal save never touches the
  // shared learning date, so it never calls onRetryLearningDate.
  const [streakRefreshToken, setStreakRefreshToken] = useState(0);

  const handleDailyGoalChange = (dailyGoal: number) => {
    setStreakRefreshToken((token) => token + 1);
    onDailyGoalChange?.(dailyGoal);
  };

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
