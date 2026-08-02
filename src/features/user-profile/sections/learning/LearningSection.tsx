import { useLanguage } from "../../../../contexts/LanguageContext";
import { DailyGoalSelector } from "./DailyGoalSelector";
import { TodayProgressCard } from "./TodayProgressCard";
import { DailyStreakCard } from "./DailyStreakCard";
import { LearningModeCards } from "./LearningModeCards";
import "./learning-section.scss";

interface LearningSectionProps {
  onStartCustomPractice?: () => void;
}

export function LearningSection({ onStartCustomPractice }: LearningSectionProps) {
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
        <DailyGoalSelector />
        <DailyStreakCard />
        <TodayProgressCard />
      </div>
      <LearningModeCards onStartCustomPractice={onStartCustomPractice} />
    </>
  );
}
