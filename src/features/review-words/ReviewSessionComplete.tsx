import { Check } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
// Same word list and row actions as Study New Words' finish screen (see
// NewWordStudyComplete.tsx): the list is an app-level presentational
// component, the Add to list / favorites actions come from the user-profile
// feature's barrel.
import { SessionWordList } from "../../app/components/session-word-list/SessionWordList";
import { useSessionWordActions } from "../user-profile";
import type { ResolvedReviewQueueItem } from "./loadReviewQueue";
import { formatCount } from "./utils/formatCount";
import { speakReviewWord } from "./utils/speakReviewWord";

interface ReviewSessionCompleteProps {
  // Words whose review was saved in this session (getReviewSessionProgress),
  // in review order — never the word that was on screen when the learner
  // finished. Its length is the reviewed count.
  reviewedWords: ResolvedReviewQueueItem[];
  practiceLanguage: string;
  yourLanguage: string;
  onReturnToLearning: () => void;
}

// Shown after Finish Review. Deliberately minimal and honest: how many words
// were reviewed (not "learned" or "mastered" — reviewing a word says nothing
// about whether it's mastered), which words, and the way back. Same compact
// header style as Study New Words' finish screen.
export function ReviewSessionComplete({
  reviewedWords,
  practiceLanguage,
  yourLanguage,
  onReturnToLearning,
}: ReviewSessionCompleteProps) {
  const { t, uiLanguage } = useLanguage();
  const languageName = t(`languageNames.${practiceLanguage}`);
  const wordsReviewed = reviewedWords.length;
  const { getRowActions, overlay } = useSessionWordActions({
    targetLanguage: practiceLanguage,
    labels: {
      addToList: t("studyNewWords.complete.addToListButton"),
      addToFavorites: t("studyNewWords.complete.addToFavorites"),
      removeFromFavorites: t("studyNewWords.complete.removeFromFavorites"),
      favoriteAddedSuffix: t("studyNewWords.complete.favoriteAddedSuffix"),
      favoriteRemovedSuffix: t("studyNewWords.complete.favoriteRemovedSuffix"),
    },
  });

  return (
    <div className="review-session-complete">
      <div className="review-session-complete-header" role="status">
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
      </div>

      <SessionWordList
        words={reviewedWords}
        practiceLanguage={practiceLanguage}
        yourLanguage={yourLanguage}
        idPrefix="review-session-complete-words"
        labels={{
          heading: t("reviewWords.continuous.finishedWordsHeading"),
          typeColumn: t("studyNewWords.complete.typeColumn"),
          moreActions: t("studyNewWords.complete.moreActionsAriaLabel"),
          showFewer: t("studyNewWords.complete.showFewer"),
          showAll: (count) => formatCount(t, uiLanguage, "studyNewWords.complete.showAll", count),
        }}
        onSpeakWord={(word) => speakReviewWord(word.targetWord, practiceLanguage)}
        getRowActions={getRowActions}
      />

      <button type="button" onClick={onReturnToLearning} className="review-session-complete-button">
        {t("studyNewWords.returnToLearningButton")}
      </button>

      {overlay}
    </div>
  );
}
