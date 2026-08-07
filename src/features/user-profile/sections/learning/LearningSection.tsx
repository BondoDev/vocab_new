import { useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import type { UserProfile } from "../../../../lib/userProfile";
import { DailyGoalSelector } from "./DailyGoalSelector";
import { TodayProgressCard } from "./TodayProgressCard";
import { DailyStreakCard } from "./DailyStreakCard";
import { LearningModeCards } from "./LearningModeCards";
import "./learning-section.scss";

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
  // never *what* it judges them against.
  const [streakRefreshToken, setStreakRefreshToken] = useState(0);

  const handleDailyGoalChange = (dailyGoal: number) => {
    setStreakRefreshToken((token) => token + 1);
    onDailyGoalChange?.(dailyGoal);
  };

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
      <div className="learning-section__indicators">
        <DailyGoalSelector
          userProfile={userProfile}
          isProfileLoaded={isProfileLoaded}
          onDailyGoalChange={handleDailyGoalChange}
        />
        <DailyStreakCard
          practiceLanguage={userProfile.practiceLanguage}
          isProfileLoaded={isProfileLoaded}
          streakRefreshToken={streakRefreshToken}
        />
        <TodayProgressCard
          practiceLanguage={userProfile.practiceLanguage}
          dailyGoal={userProfile.dailyGoal}
          isProfileLoaded={isProfileLoaded}
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
