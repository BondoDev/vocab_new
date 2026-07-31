import { useLanguage } from "../../../../contexts/LanguageContext";

// Hardcoded preview state for a brand-new user, matching Daily Goal's
// default of 15 words/day. Replace with the real daily-statistics/practice
// session pipeline once it exists — `completed` is the integration seam.
const TODAY_PROGRESS_PREVIEW = {
  completed: 0,
  goal: 15,
};

const RING_RADIUS = 32;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Ensures a sliver of accent color is always visible at the ring's start,
// even at 0 progress, so it never reads as fully inactive. Only the ring
// uses this floor — the horizontal bar below shows a genuinely empty
// track at 0%, matching that layout's own design.
const MIN_VISIBLE_ARC_RATIO = 0.03;

// Below ~1184px the card switches from the circular ring to a horizontal
// strip (see learning-section.scss); both variants are driven by this one
// progressRatio/srLabel pair rather than duplicating the calculation, and
// only one is ever visible — the other is `display: none`, which also
// removes it from the accessibility tree automatically.
export function TodayProgressCard() {
  const { t } = useLanguage();
  const { completed, goal } = TODAY_PROGRESS_PREVIEW;
  const progressRatio = goal > 0 ? Math.min(completed / goal, 1) : 0;
  const ringDisplayRatio = Math.max(progressRatio, MIN_VISIBLE_ARC_RATIO);
  const ringOffset = RING_CIRCUMFERENCE * (1 - ringDisplayRatio);

  const title = t("userProfile.learningSection.todayProgress.title");
  const ofWord = t("userProfile.learningSection.todayProgress.aria.of");
  const srLabel = `${title}. ${completed} ${ofWord} ${goal} ${t(
    "userProfile.learningSection.todayProgress.aria.dailyWordsCompleted",
  )}.`;

  return (
    <div className="learning-kpi-card today-progress-card">
      <div className="today-progress-card__circular">
        <p className="learning-kpi-card__title today-progress-card__title">{title}</p>

        <div
          className="today-progress-card__ring-wrap"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-label={srLabel}
        >
          <svg className="today-progress-card__ring" viewBox="0 0 80 80" aria-hidden="true">
            <circle className="today-progress-card__ring-track" cx="40" cy="40" r={RING_RADIUS} />
            <circle
              className="today-progress-card__ring-fill"
              cx="40"
              cy="40"
              r={RING_RADIUS}
              transform="rotate(-90 40 40)"
              style={{
                strokeDasharray: RING_CIRCUMFERENCE,
                strokeDashoffset: ringOffset,
              }}
            />
          </svg>
          <div className="today-progress-card__ring-value" aria-hidden="true">
            <span className="today-progress-card__ring-completed">{completed}</span>
            <span className="today-progress-card__ring-goal">
              <span className="today-progress-card__ring-goal-label">{ofWord}</span>{" "}
              <span className="today-progress-card__ring-goal-value">{goal}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="today-progress-card__horizontal">
        <div className="today-progress-card__horizontal-header">
          <p className="learning-kpi-card__title today-progress-card__horizontal-title">{title}</p>
          <p className="today-progress-card__horizontal-ratio">
            <span className="today-progress-card__horizontal-completed">{completed}</span>
            <span className="today-progress-card__horizontal-meta">
              {" "}
              {ofWord} {goal} {t("userProfile.learningSection.todayProgress.wordsUnit")}
            </span>
          </p>
        </div>

        <div
          className="today-progress-card__horizontal-track"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-label={srLabel}
        >
          <div
            className="today-progress-card__horizontal-fill"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
