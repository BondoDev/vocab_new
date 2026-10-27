import { RotateCcw } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";

// "Practice again" for the typing exercise family (WordTypingExercise,
// HalfWrittenExercise, BrokenWordExercise). Shown under the field once the
// word is solved, typed or revealed via Show me word. Each exercise owns the
// reset itself and keeps reporting its first solved status to the host while
// the user retries, so a retry never changes the recorded outcome and never
// re-disables Next.
export function ExerciseRetryButton({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={onRetry}
      className="exercise-action-button exercise-retry-button inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
    >
      <RotateCcw className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {t("practice.practiceAgain")}
    </button>
  );
}
