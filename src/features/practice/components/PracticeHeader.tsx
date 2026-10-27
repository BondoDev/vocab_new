import { Flag, Home } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import { SessionFullscreenToggle, SessionHeader } from "./SessionHeader";

interface PracticeHeaderProps {
  onBack: () => void;
  onStartAgain?: () => void;
  sessionComplete: boolean;
  onFinishTest: () => void;
  getLanguageName: (code: string) => string;
  yourLanguage: string;
  practiceLanguage: string;
}

// Custom Practice's use of the shared SessionHeader rail: Finish and the
// desktop fullscreen toggle while the session runs, Start Again and Home on
// the results. The practiced counter
// sits below the exercise card (VocabularyPractice), not in the rail.
export function PracticeHeader({
  onBack,
  onStartAgain,
  sessionComplete,
  onFinishTest,
  getLanguageName,
  yourLanguage,
  practiceLanguage,
}: PracticeHeaderProps) {
  const { t } = useLanguage();

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
          <button
            onClick={onFinishTest}
            type="button"
            className="practice-header-button practice-header-button--finish"
          >
            <Flag className="practice-header-button__icon" aria-hidden="true" />
            <span>{t("practice.finish")}</span>
          </button>
        )
      }
      end={
        sessionComplete ? (
          <button
            onClick={onBack}
            type="button"
            className="practice-header-button"
          >
            <Home className="practice-header-button__icon" aria-hidden="true" />
            <span>{t("practice.home")}</span>
          </button>
        ) : (
          <SessionFullscreenToggle />
        )
      }
    />
  );
}
