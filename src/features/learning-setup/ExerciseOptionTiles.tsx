import { motion } from "motion/react";
import { Check } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import type { ExerciseId } from "../../exercises/exerciseIds";
import {
  exerciseCardBackgrounds,
  exerciseCardBorders,
  exerciseCardIconColors,
  exerciseIcons,
  type MotionCssVars,
} from "../../exercises/exerciseTheme";
import { exerciseItems } from "./exerciseOptions";

type ExerciseCardCssVars = MotionCssVars<
  "--exercise-card-bg" | "--exercise-card-border" | "--exercise-card-icon"
>;

function ExerciseOptionIcon({ id }: { id: ExerciseId }) {
  const Icon = exerciseIcons[id];
  return <Icon className={id === "connectWords" ? "h-8 w-8" : "h-7 w-7"} strokeWidth={id === "connectWords" ? 2.2 : 2} />;
}

interface ExerciseOptionTilesProps {
  selectedExercises: string[];
  setSelectedExercises: (exercises: string[]) => void;
  onHelp?: (exerciseId: string) => void;
}

// Both setup entry points share the options, controlled state, and last-selection guard.
export function ExerciseOptionTiles({
  selectedExercises,
  setSelectedExercises,
  onHelp,
}: ExerciseOptionTilesProps) {
  const { t } = useLanguage();
  const toggleExercise = (exerciseId: string) => {
    // Prevent deselecting the last exercise
    if (
      selectedExercises.includes(exerciseId) &&
      selectedExercises.length === 1
    ) {
      return;
    }

    if (selectedExercises.includes(exerciseId)) {
      setSelectedExercises(
        selectedExercises.filter((id) => id !== exerciseId),
      );
    } else {
      setSelectedExercises([...selectedExercises, exerciseId]);
    }
  };

  return (
    <>
      {exerciseItems.map((exercise, index) => {
        const isSelected = selectedExercises.includes(
          exercise.id,
        );
        const isLastSelected =
          isSelected && selectedExercises.length === 1;

        const cardStyle: ExerciseCardCssVars = {
          "--exercise-card-bg": exerciseCardBackgrounds[exercise.id] ?? "#F2F0FF",
          "--exercise-card-border": exerciseCardBorders[exercise.id] ?? "#7A68D8",
          "--exercise-card-icon": exerciseCardIconColors[exercise.id] ?? "#6B58C8",
        };

        return (
          <motion.button
            key={exercise.id}
            onClick={() => toggleExercise(exercise.id)}
            aria-pressed={isSelected}
            style={cardStyle}
            className={`exercise-card p-5 rounded-lg border-2 transition-all ${
              isSelected
                ? "border-primary shadow-md shadow-primary/10"
                : "border-border hover:border-primary/50"
            } ${isSelected ? "is-selected" : ""} ${isLastSelected ? "cursor-not-allowed opacity-75 is-locked" : ""}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.08 * index,
            }}
            whileHover={
              !isLastSelected
                ? { scale: 1.01 }
                : undefined
            }
            whileTap={
              !isLastSelected
                ? { scale: 0.99 }
                : undefined
            }
            disabled={isLastSelected}
            >
            <span className="exercise-card-corners">
              <span className={`exercise-check ${isSelected ? "is-visible" : ""}`}>
                <Check className="w-4 h-4" />
              </span>
              <span
                className="exercise-help-button"
                role="button"
                tabIndex={0}
                aria-label={t("exerciseSelection.helpButtonAria")}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onHelp?.(exercise.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onHelp?.(exercise.id);
                }}
              >
                ?
              </span>
            </span>

            <span className="exercise-card-icon" aria-hidden="true">
              <ExerciseOptionIcon id={exercise.id} />
            </span>

            <span className="exercise-card-content text-left">
              <span className="exercise-card-label block text-base text-foreground">
                {t(
                  `exerciseSelection.exercise.${exercise.id}`,
                )}
              </span>
              <span className="exercise-card-description block text-sm text-muted-foreground">
                {t(
                  `exerciseSelection.exerciseDescription.${exercise.id}`,
                )}
              </span>
            </span>
          </motion.button>
        );
      })}
    </>
  );
}
