import { Flag, Home } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import { SessionCountChip, SessionHeader } from "./SessionHeader";

interface PracticeHeaderProps {
  onBack: () => void;
  onStartAgain?: () => void;
  sessionComplete: boolean;
  onFinishTest: () => void;
  getLanguageName: (code: string) => string;
  yourLanguage: string;
  practiceLanguage: string;
  // Unique words completed correctly this session; see countPracticedWords.
  practicedCount: number;
}

// Custom Practice's use of the shared SessionHeader rail: practiced counter
// and Finish while the session runs, Start Again and Home on the results.
export function PracticeHeader({
  onBack,
  onStartAgain,
  sessionComplete,
  onFinishTest,
  getLanguageName,
  yourLanguage,
  practiceLanguage,
  practicedCount,
}: PracticeHeaderProps) {
  const { t } = useLanguage();
  const practicedLabel = t("practice.practicedCount").replace(
    "{count}",
    String(practicedCount),
  );

  return (
    <SessionHeader
      fromLanguageName={getLanguageName(yourLanguage)}
      toLanguageName={getLanguageName(practiceLanguage)}
      fromLanguageCode={yourLanguage}
      toLanguageCode={practiceLanguage}
      start={
        sessionComplete ? (
          <button
            onClick={onStartAgain}
            type="button"
            className="practice-header-button"
          >
            {t("practice.startAgain")}
          </button>
        ) : (
          <SessionCountChip label={practicedLabel} count={practicedCount} />
        )
      }
      end={
        !sessionComplete ? (
          <button
            onClick={onFinishTest}
            type="button"
            className="practice-header-button practice-header-button--finish"
          >
            <Flag className="practice-header-button__icon" aria-hidden="true" />
            <span>{t("practice.finish")}</span>
          </button>
        ) : (
          <button
            onClick={onBack}
            type="button"
            className="practice-header-button"
          >
            <Home className="practice-header-button__icon" aria-hidden="true" />
            <span>{t("practice.home")}</span>
          </button>
        )
      }
    />
  );
}
