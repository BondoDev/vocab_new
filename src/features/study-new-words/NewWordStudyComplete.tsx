import { useLanguage } from "../../contexts/LanguageContext";

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
    <div className="flex flex-col items-center text-center gap-4 py-16">
      <h1 className="text-2xl md:text-3xl font-semibold text-foreground break-words">
        {t("studyNewWords.sessionCompleteTitle")}
      </h1>

      <div className="rounded-lg border border-border px-6 py-4 min-w-[12rem]">
        <p className="text-3xl font-bold text-foreground">{wordsCompleted}</p>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">
          {t("studyNewWords.sessionCompleteWordsLabel")}
        </p>
        <p className="text-sm text-muted-foreground mt-2 break-words">{languageName}</p>
      </div>

      <button
        type="button"
        onClick={onReturnToLearning}
        className="mt-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
      >
        {t("studyNewWords.returnToLearningButton")}
      </button>
    </div>
  );
}
