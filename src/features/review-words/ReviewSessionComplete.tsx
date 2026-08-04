import { CheckCircle2 } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

interface ReviewSessionCompleteProps {
  wordsReviewed: number;
  onReturnToLearning: () => void;
}

// Deliberately minimal, matching this phase's "no statistics, no XP, no
// backend updates" requirement: only the count of words reviewed this
// session and a way back — no per-word breakdown, no accuracy percentage,
// no streak/points messaging.
export function ReviewSessionComplete({ wordsReviewed, onReturnToLearning }: ReviewSessionCompleteProps) {
  const { t } = useLanguage();

  return (
    <div className="review-session-complete" role="status">
      <div className="review-session-complete-icon" aria-hidden="true">
        <CheckCircle2 className="review-session-complete-icon-svg" />
      </div>
      <h2 className="review-session-complete-title">{t("reviewWords.reviewCompleteTitle")}</h2>
      <p className="review-session-complete-count">
        <span className="review-session-complete-count-value">{wordsReviewed}</span>{" "}
        {t("reviewWords.wordsReviewedLabel")}
      </p>
      <button type="button" onClick={onReturnToLearning} className="review-session-complete-button">
        {t("studyNewWords.returnToLearningButton")}
      </button>
    </div>
  );
}
