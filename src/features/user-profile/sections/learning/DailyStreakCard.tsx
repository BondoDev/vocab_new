import { useLanguage } from "../../../../contexts/LanguageContext";

// Hardcoded zero-state preview for a brand-new user. Replace with real
// streak data from daily statistics once that pipeline exists.
const DAILY_STREAK_PREVIEW = {
  currentStreakDays: 0,
  bestStreakDays: 0,
};

const WEEK_DAYS = [
  { shortKey: "monShort", fullKey: "monday", active: false },
  { shortKey: "tueShort", fullKey: "tuesday", active: false },
  { shortKey: "wedShort", fullKey: "wednesday", active: false },
  { shortKey: "thuShort", fullKey: "thursday", active: false },
  { shortKey: "friShort", fullKey: "friday", active: false },
  { shortKey: "satShort", fullKey: "saturday", active: false },
  { shortKey: "sunShort", fullKey: "sunday", active: false },
];

export function DailyStreakCard() {
  const { t } = useLanguage();
  const { currentStreakDays, bestStreakDays } = DAILY_STREAK_PREVIEW;

  return (
    <div className="learning-kpi-card daily-streak-card">
      <div className="daily-streak-card__header">
        <p className="learning-kpi-card__title">
          {t("userProfile.learningSection.dailyStreak.title")}
        </p>
        <span className="learning-kpi-card__chip daily-streak-card__chip">
          {t("userProfile.learningSection.dailyStreak.chip")}
        </span>
      </div>

      <div className="daily-streak-card__metric">
        <div className="daily-streak-card__primary">
          <span className="daily-streak-card__value">{currentStreakDays}</span>
          <span className="daily-streak-card__unit">
            {t("userProfile.learningSection.dailyStreak.daysUnit")}
          </span>
        </div>
        <span className="daily-streak-card__best">
          {t("userProfile.learningSection.dailyStreak.bestPrefix")} {bestStreakDays}{" "}
          {t("userProfile.learningSection.dailyStreak.daysUnit")}
        </span>
      </div>

      <div
        className="daily-streak-card__week"
        role="list"
        aria-label={t("userProfile.learningSection.dailyStreak.weekAriaLabel")}
      >
        {WEEK_DAYS.map((day, index) => {
          const dayName = t(`userProfile.learningSection.dailyStreak.weekdays.${day.fullKey}`);
          const status = day.active
            ? t("userProfile.learningSection.dailyStreak.status.activityCompleted")
            : t("userProfile.learningSection.dailyStreak.status.noActivity");

          return (
            <div
              key={`${day.fullKey}-${index}`}
              role="listitem"
              aria-label={`${dayName}: ${status}`}
              className="daily-streak-card__day-col"
            >
              <span className="daily-streak-card__day-label" aria-hidden="true">
                {t(`userProfile.learningSection.dailyStreak.weekdays.${day.shortKey}`)}
              </span>
              <span
                aria-hidden="true"
                className={`daily-streak-card__day-marker ${
                  day.active ? "daily-streak-card__day-marker--active" : ""
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
