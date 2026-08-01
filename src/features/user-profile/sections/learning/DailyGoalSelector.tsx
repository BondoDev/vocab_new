import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useIsCompactLearningSummary } from "./useIsCompactLearningSummary";

interface DailyGoalOption {
  value: number;
  paceLabelKey: string;
  estimateLabel: string;
  recommended?: boolean;
}

const DAILY_GOAL_OPTIONS: DailyGoalOption[] = [
  { value: 10, paceLabelKey: "userProfile.learningSection.dailyGoal.paces.light", estimateLabel: "8-10" },
  {
    value: 15,
    paceLabelKey: "userProfile.learningSection.dailyGoal.paces.balanced",
    estimateLabel: "12-15",
    recommended: true,
  },
  { value: 20, paceLabelKey: "userProfile.learningSection.dailyGoal.paces.steady", estimateLabel: "16-20" },
  {
    value: 30,
    paceLabelKey: "userProfile.learningSection.dailyGoal.paces.intensive",
    estimateLabel: "24-30",
  },
  {
    value: 50,
    paceLabelKey: "userProfile.learningSection.dailyGoal.paces.veryIntensive",
    estimateLabel: "40-50",
  },
];

const DEFAULT_GOAL = 15;

// Preview-only local state. When the daily goal ships for real, this is the
// integration point for the authenticated user's saved profile goal.
export function DailyGoalSelector() {
  const { t } = useLanguage();
  const [goal, setGoal] = useState<number>(DEFAULT_GOAL);
  const { message: confirmationMessage, show: showConfirmation } = useAutoDismissMessage();
  const isCompact = useIsCompactLearningSummary();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();

  const selectedOption =
    DAILY_GOAL_OPTIONS.find((option) => option.value === goal) ?? DAILY_GOAL_OPTIONS[1];

  const handleSave = () => {
    // No backend write yet - this only confirms the local preview selection.
    showConfirmation(t("userProfile.learningSection.dailyGoal.savedToast"));
  };

  const detailContent = (
    <>
      <div className="daily-goal-selector__options-row">
        <div
          role="group"
          aria-label={t("userProfile.learningSection.dailyGoal.ariaLabel")}
          className="daily-goal-selector__options"
        >
          {DAILY_GOAL_OPTIONS.map((option) => {
            const isSelected = option.value === goal;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setGoal(option.value)}
                className={`daily-goal-selector__option ${
                  isSelected ? "daily-goal-selector__option--selected" : ""
                }`}
              >
                {option.value}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={handleSave} className="daily-goal-selector__save">
          {t("userProfile.learningSection.dailyGoal.saveButton")}
        </button>
      </div>

      <p className="daily-goal-selector__pace">
        {t(selectedOption.paceLabelKey)} {" - "}
        {t("userProfile.learningSection.dailyGoal.approximately")} {selectedOption.estimateLabel}{" "}
        {t("userProfile.learningSection.dailyGoal.minutesUnit")}
      </p>
    </>
  );

  // Below ~644px this collapses into an accordion row (see
  // learning-section.scss) so Daily Goal + Daily Streak stop pushing the
  // Start Learning section down the page. Desktop/tablet keep the original
  // always-expanded markup untouched below.
  if (isCompact) {
    return (
      <section className="learning-kpi-card daily-goal-selector">
        <button
          type="button"
          className="learning-kpi-card__accordion-trigger"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <span className="learning-kpi-card__title">
            {t("userProfile.learningSection.dailyGoal.title")}
          </span>
          <span className="learning-kpi-card__accordion-right">
            <span className="learning-kpi-card__accordion-value">
              {goal} {t("userProfile.learningSection.dailyGoal.wordsPerDay")}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`learning-kpi-card__chevron ${
                isExpanded ? "learning-kpi-card__chevron--open" : ""
              }`}
            />
          </span>
        </button>

        <div
          id={panelId}
          className={`learning-kpi-card__accordion-panel ${
            isExpanded ? "learning-kpi-card__accordion-panel--open" : ""
          }`}
        >
          <div className="learning-kpi-card__accordion-panel-inner">{detailContent}</div>
        </div>

        <Toast message={confirmationMessage} />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="daily-goal-heading"
      className="learning-kpi-card daily-goal-selector"
    >
      <div className="daily-goal-selector__header">
        <h2 id="daily-goal-heading" className="learning-kpi-card__title">
          {t("userProfile.learningSection.dailyGoal.title")}
        </h2>
        <div className="daily-goal-selector__summary">
          <p className="daily-goal-selector__summary-value">
            <span className="daily-goal-selector__summary-number">{goal}</span>
            <span className="daily-goal-selector__summary-unit">
              {t("userProfile.learningSection.dailyGoal.wordsPerDay")}
            </span>
          </p>
          <p
            className={`daily-goal-selector__recommended ${
              selectedOption.recommended ? "" : "daily-goal-selector__recommended--hidden"
            }`}
          >
            {t("userProfile.learningSection.dailyGoal.recommended")}
          </p>
        </div>
      </div>

      {detailContent}

      <Toast message={confirmationMessage} />
    </section>
  );
}
