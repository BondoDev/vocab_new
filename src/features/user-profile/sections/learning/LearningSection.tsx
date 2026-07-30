import { useLanguage } from "../../../../contexts/LanguageContext";
import { DailyGoalSelector } from "./DailyGoalSelector";
import "./learning-section.scss";

// Placeholder cells for the compact learning-indicators grid below the header.
// Remove once real Daily Streak / Reviews Due data sources exist; they only
// exist here to verify the grid holds three matching-height cards in a row.
function LearningIndicatorPlaceholder({ label }: { label: string }) {
  return (
    <div className="learning-indicator-placeholder">
      <p className="learning-indicator-placeholder__label">{label}</p>
      <p className="learning-indicator-placeholder__status">Coming soon</p>
    </div>
  );
}

export function LearningSection() {
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
        <LearningIndicatorPlaceholder label="Daily Streak" />
        <LearningIndicatorPlaceholder label="Reviews Due" />
      </div>
    </>
  );
}
