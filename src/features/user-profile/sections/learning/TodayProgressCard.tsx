import { BookPlus, Repeat } from "lucide-react";

// Hardcoded zero-state preview for a brand-new user. Replace with real
// daily-statistics/practice-session data once that pipeline exists — the
// shape (completed, totalPlanned, newWordsCompleted, reviewsCompleted) is
// the intended integration seam.
const TODAY_PROGRESS_PREVIEW = {
  completed: 0,
  totalPlanned: 0,
  newWordsCompleted: 0,
  reviewsCompleted: 0,
};

export function TodayProgressCard() {
  const { completed, totalPlanned, newWordsCompleted, reviewsCompleted } = TODAY_PROGRESS_PREVIEW;
  const progressPercent = totalPlanned > 0 ? Math.round((completed / totalPlanned) * 100) : 0;

  return (
    <div className="learning-kpi-card today-progress-card">
      <div className="today-progress-card__header">
        <p className="learning-kpi-card__title">Today's Progress</p>
        <span className="learning-kpi-card__chip today-progress-card__chip">Today</span>
      </div>

      <div className="today-progress-card__metric">
        <span className="today-progress-card__value">{completed}</span>
        <span className="today-progress-card__unit">completed</span>
      </div>

      <div className="today-progress-card__progress-row">
        <div
          className="today-progress-card__bar"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${completed} completed today, ${progressPercent}% of planned items. ${newWordsCompleted} new words, ${reviewsCompleted} reviews.`}
        >
          <div className="today-progress-card__bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="today-progress-card__percent" aria-hidden="true">
          {progressPercent}%
        </span>
      </div>

      <div className="today-progress-card__breakdown">
        <div className="today-progress-card__metric-group">
          <span className="today-progress-card__metric-icon" aria-hidden="true">
            <BookPlus size={13} strokeWidth={2.25} />
          </span>
          <div className="today-progress-card__metric-text">
            <span className="today-progress-card__metric-label">New words</span>
            <span className="today-progress-card__metric-value">{newWordsCompleted}</span>
          </div>
        </div>
        <div className="today-progress-card__metric-group">
          <span className="today-progress-card__metric-icon" aria-hidden="true">
            <Repeat size={13} strokeWidth={2.25} />
          </span>
          <div className="today-progress-card__metric-text">
            <span className="today-progress-card__metric-label">Reviews</span>
            <span className="today-progress-card__metric-value">{reviewsCompleted}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
