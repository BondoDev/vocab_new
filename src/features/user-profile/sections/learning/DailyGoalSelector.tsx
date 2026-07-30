import { useState } from "react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";

interface DailyGoalOption {
  value: number;
  paceLabel: string;
  estimateLabel: string;
  recommended?: boolean;
}

const DAILY_GOAL_OPTIONS: DailyGoalOption[] = [
  { value: 10, paceLabel: "Light pace", estimateLabel: "8–10" },
  { value: 15, paceLabel: "Balanced pace", estimateLabel: "12–15", recommended: true },
  { value: 20, paceLabel: "Steady pace", estimateLabel: "16–20" },
  { value: 30, paceLabel: "Intensive pace", estimateLabel: "24–30" },
  { value: 50, paceLabel: "Very intensive pace", estimateLabel: "40–50" },
];

const DEFAULT_GOAL = 15;

// Preview-only local state. When the daily goal ships for real, this is the
// seam that should read/write the authenticated user's profile (Supabase)
// and feed the Study New Words session + daily completion calculations.
// Sized as one cell of the compact learning-indicators grid — see
// LearningSection.tsx — not as a standalone full-width panel.
// Styles live in ./learning-section.scss (imported by LearningSection.tsx,
// the only place this component is ever rendered) rather than a separate
// stylesheet of its own.
export function DailyGoalSelector() {
  const [goal, setGoal] = useState<number>(DEFAULT_GOAL);
  const { message: confirmationMessage, show: showConfirmation } = useAutoDismissMessage();

  const selectedOption =
    DAILY_GOAL_OPTIONS.find((option) => option.value === goal) ?? DAILY_GOAL_OPTIONS[1];

  const handleSave = () => {
    // No backend write yet — this only confirms the local preview selection.
    showConfirmation("Goal updated for this preview.");
  };

  return (
    <section
      aria-labelledby="daily-goal-heading"
      className="learning-kpi-card daily-goal-selector"
    >
      <div className="daily-goal-selector__header">
        <h2 id="daily-goal-heading" className="learning-kpi-card__title">
          Daily Goal
        </h2>
        <div className="daily-goal-selector__summary">
          <p className="daily-goal-selector__summary-value">
            <span className="daily-goal-selector__summary-number">{goal}</span>
            <span className="daily-goal-selector__summary-unit">words/day</span>
          </p>
          <p
            className={`daily-goal-selector__recommended ${
              selectedOption.recommended ? "" : "daily-goal-selector__recommended--hidden"
            }`}
          >
            Recommended
          </p>
        </div>
      </div>

      <div className="daily-goal-selector__options-row">
        <div role="group" aria-label="Daily word goal" className="daily-goal-selector__options">
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
          Save Goal
        </button>
      </div>

      <p className="daily-goal-selector__pace">
        {selectedOption.paceLabel} · Approximately {selectedOption.estimateLabel} min
      </p>

      <Toast message={confirmationMessage} />
    </section>
  );
}
