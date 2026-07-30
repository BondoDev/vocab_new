// Hardcoded zero-state preview for a brand-new user. Replace with real
// streak data from daily statistics once that pipeline exists — `active`
// on each weekday is the intended per-day integration seam.
const DAILY_STREAK_PREVIEW = {
  currentStreakDays: 0,
  bestStreakDays: 0,
};

const WEEK_DAYS = [
  { short: "M", full: "Monday", active: false },
  { short: "T", full: "Tuesday", active: false },
  { short: "W", full: "Wednesday", active: false },
  { short: "T", full: "Thursday", active: false },
  { short: "F", full: "Friday", active: false },
  { short: "S", full: "Saturday", active: false },
  { short: "S", full: "Sunday", active: false },
];

export function DailyStreakCard() {
  const { currentStreakDays, bestStreakDays } = DAILY_STREAK_PREVIEW;

  return (
    <div className="learning-kpi-card daily-streak-card">
      <div className="daily-streak-card__header">
        <p className="learning-kpi-card__title">Daily Streak</p>
        <span className="learning-kpi-card__chip daily-streak-card__chip">This week</span>
      </div>

      <div className="daily-streak-card__metric">
        <div className="daily-streak-card__primary">
          <span className="daily-streak-card__value">{currentStreakDays}</span>
          <span className="daily-streak-card__unit">days</span>
        </div>
        <span className="daily-streak-card__best">Best: {bestStreakDays} days</span>
      </div>

      <div className="daily-streak-card__week" role="list" aria-label="This week's activity">
        {WEEK_DAYS.map((day, index) => (
          <div
            key={`${day.full}-${index}`}
            role="listitem"
            aria-label={`${day.full}: ${day.active ? "activity completed" : "no activity"}`}
            className="daily-streak-card__day-col"
          >
            <span className="daily-streak-card__day-label" aria-hidden="true">
              {day.short}
            </span>
            <span
              aria-hidden="true"
              className={`daily-streak-card__day-marker ${
                day.active ? "daily-streak-card__day-marker--active" : ""
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
