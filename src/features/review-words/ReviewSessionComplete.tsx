import { Check } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { formatCount } from "./utils/formatCount";

interface ReviewSessionCompleteProps {
  // Words whose review was saved in this session (getReviewSessionProgress)
  // — never the word that was on screen when the learner finished.
  wordsReviewed: number;
  practiceLanguage: string;
  onReturnToLearning: () => void;
}

// Shown after Finish Review. Deliberately minimal and honest: how many words
// were reviewed (not "learned" or "mastered" — reviewing a word says nothing
// about whether it's mastered), and the way back. Same compact header style
// as Study New Words' finish screen.
export function ReviewSessionComplete({ wordsReviewed, practiceLanguage, onReturnToLearning }: ReviewSessionCompleteProps) {
  const { t, uiLanguage } = useLanguage();
  const languageName = t(`languageNames.${practiceLanguage}`);

  return (
    <div className="review-session-complete" role="status">
      <h2 className="review-session-complete-title">
        <span className="review-session-complete-mark" aria-hidden="true">
          <Check className="review-session-complete-mark-icon" />
        </span>
        <span>{t("reviewWords.continuous.finishedTitle")}</span>
      </h2>
      <p className="review-session-complete-text">
        {wordsReviewed === 0
          ? t("reviewWords.continuous.finishedNone")
          : formatCount(t, uiLanguage, "reviewWords.continuous.finishedSubtitle", wordsReviewed, {
              language: languageName,
              // Lowercase mid-sentence in es/fr/it/pt ("en allemand").
              languageLower: languageName.toLocaleLowerCase(uiLanguage),
            })}
      </p>
      <button type="button" onClick={onReturnToLearning} className="review-session-complete-button">
        {t("studyNewWords.returnToLearningButton")}
      </button>
    </div>
  );
}
