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
          onDailyGoalChange={onDailyGoalChange}
        />
        <DailyStreakCard
          practiceLanguage={userProfile.practiceLanguage}
          dailyGoal={userProfile.dailyGoal}
          isProfileLoaded={isProfileLoaded}
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
