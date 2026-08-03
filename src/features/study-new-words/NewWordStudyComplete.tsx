import { useLanguage } from "../../contexts/LanguageContext";
// Visual styling lives in ./styles/study-new-words.scss (imported by
// NewWordStudySession.tsx, this component's sole renderer) — this file only
// assigns the semantic class names.

interface NewWordStudyCompleteProps {
  wordsCompleted: number;
  practiceLanguage: string;
  onReturnToLearning: () => void;
}

// Deliberately restrained: no confetti/XP/coins, and no backend-progress
// claim — Phase 2 performs no writes, so this only summarizes what happened
// locally in this session. The Learning page's progress card is not updated
// here for the same reason.
export function NewWordStudyComplete({
  wordsCompleted,
  practiceLanguage,
  onReturnToLearning,
}: NewWordStudyCompleteProps) {
  const { t } = useLanguage();
  const languageName = t(`languageNames.${practiceLanguage}`);

  return (
    <div className="new-word-study-complete">
      <h1 className="new-word-study-complete-title">{t("studyNewWords.sessionCompleteTitle")}</h1>

      <div className="new-word-study-complete-stat">
        <p className="new-word-study-complete-count">{wordsCompleted}</p>
        <p className="new-word-study-complete-count-label">{t("studyNewWords.sessionCompleteWordsLabel")}</p>
        <p className="new-word-study-complete-language">{languageName}</p>
      </div>

      <button type="button" onClick={onReturnToLearning} className="new-word-study-complete-button">
        {t("studyNewWords.returnToLearningButton")}
      </button>
    </div>
  );
}
