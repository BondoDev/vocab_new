import { useEffect, useState } from "react";
import { useLanguage } from "../../../contexts/LanguageContext";
import { getExerciseIcon } from "../../../exercises/exerciseTheme";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../app/components/ui/popover";

interface ExerciseCardHeaderProps {
  exerciseId: string;
  // Already-translated instruction copy; each caller owns its own key map.
  instruction: string;
  level?: string | null;
  categoryLabel?: string | null;
}

// Top row of an exercise card, shared by ordinary practice, review, and
// new-word study so every exercise card presents the same way: an icon-only
// exercise button whose popover names and explains the exercise, plus the
// "LEVEL · Topic" meta. The instruction is also rendered for screen readers,
// since the popover content only exists while open. Styles live in
// ../styles/exercises.scss (.practice-card-top, .practice-type-*).
export function ExerciseCardHeader({
  exerciseId,
  instruction,
  level,
  categoryLabel,
}: ExerciseCardHeaderProps) {
  const { t } = useLanguage();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const ExerciseIcon = getExerciseIcon(exerciseId);
  const exerciseName = t(`exerciseSelection.exercise.${exerciseId}`);

  // Never let an explanation linger over the next exercise when a caller
  // reuses this instance instead of remounting it.
  useEffect(() => {
    setIsInfoOpen(false);
  }, [exerciseId, instruction]);

  return (
    <>
      <div className="practice-card-top">
        <Popover open={isInfoOpen} onOpenChange={setIsInfoOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="practice-type-trigger"
              aria-label={exerciseName}
              // Hover opens only for mouse; touch relies on the trigger's own
              // tap toggle so a tap doesn't open-then-close.
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setIsInfoOpen(true);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setIsInfoOpen(false);
              }}
            >
              <ExerciseIcon className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.2} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={8}
            className="practice-type-info"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <p className="practice-type-info__title">{exerciseName}</p>
            <p className="practice-type-info__text">{instruction}</p>
          </PopoverContent>
        </Popover>
        {(level || categoryLabel) && (
          <span className="practice-card-meta">
            {level && <span className="practice-card-meta__level">{level}</span>}
            {level && categoryLabel && " · "}
            {categoryLabel}
          </span>
        )}
      </div>
      <p className="sr-only">{instruction}</p>
    </>
  );
}
