import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronLeft, X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

interface ExerciseSelectionProps {
  selectedExercises: string[];
  setSelectedExercises: (exercises: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

const exerciseGroups = [
  {
    id: "recall",
    title: "Recall exercises",
    items: [
      {
        id: "wordTyping",
        description: "Type the full word from memory.",
      },
      {
        id: "halfWritten",
        description: "Fill in missing letters.",
      },
    ],
  },
  {
    id: "construction",
    title: "Construction exercises",
    items: [
      {
        id: "brokenWord",
        description: "Build the word from pieces.",
      },
    ],
  },
  {
    id: "association",
    title: "Association exercises",
    items: [
      {
        id: "connectWords",
        description: "Match words with translations.",
      },
    ],
  },
  {
    id: "listening",
    title: "Listening",
    items: [
      {
        id: "listening",
        description: "Select what you hear.",
      },
    ],
  },
];
const exerciseItems = exerciseGroups.flatMap((group) => group.items);

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function createDistributedStarFieldImage(
  starCount: number,
): string {
  const cols = Math.ceil(Math.sqrt(starCount));
  const rows = Math.ceil(starCount / cols);
  const sizeOptions = [1.2, 1.4, 1.8, 2.2];
  const colorOptions = [
    "#fff",
    "#fff",
    "#fff",
    "#f3f3f3",
    "rgba(255,255,255,0.9)",
  ];
  const layers: string[] = [];

  for (let i = 0; i < starCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellWidth = 100 / cols;
    const cellHeight = 100 / rows;
    const xMin = col * cellWidth + 10;
    const xMax = (col + 1) * cellWidth - 10;
    const yMin = row * cellHeight + 14;
    const yMax = (row + 1) * cellHeight - 14;
    const x = randomBetween(
      Math.max(5, xMin),
      Math.min(95, xMax),
    ).toFixed(1);
    const y = randomBetween(
      Math.max(8, yMin),
      Math.min(92, yMax),
    ).toFixed(1);
    const size =
      sizeOptions[
        Math.floor(Math.random() * sizeOptions.length)
      ];
    const color =
      colorOptions[
        Math.floor(Math.random() * colorOptions.length)
      ];

    layers.push(
      `radial-gradient(${size}px ${size}px at ${x}% ${y}%, ${color}, rgba(0,0,0,0))`,
    );
  }

  return layers.join(",\n    ");
}

export function ExerciseSelection({
  selectedExercises,
  setSelectedExercises,
  onBack,
  onContinue,
}: ExerciseSelectionProps) {
  const { t } = useLanguage();
  const [helpExerciseId, setHelpExerciseId] = useState<string | null>(null);
  const nextButtonStarFieldStyle = useMemo(
    () => ({
      backgroundColor: "#4a2b82",
      backgroundImage: createDistributedStarFieldImage(3),
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [],
  );

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

  const isButtonDisabled = selectedExercises.length === 0;
  const totalExerciseCount = exerciseGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
  const selectedCount = selectedExercises.length;
  const startButtonLabel = isButtonDisabled
    ? t("exerciseSelection.startButton.selectAtLeastOne")
    : selectedCount === totalExerciseCount
      ? t("exerciseSelection.startButton.startFullSession")
      : `${t("exerciseSelection.startButton.startCountPrefix")} ${selectedCount} ${t("exerciseSelection.startButton.startCountSuffix")}`;

  const getHelpTypeKey = (exerciseId: string) => {
    const map: Record<string, string> = {
      wordTyping: "fullWord",
      halfWritten: "halfWritten",
      brokenWord: "brokenWord",
      connectWords: "connectWords",
      listening: "listening",
    };
    return map[exerciseId] ?? "fullWord";
  };

  const hasTranslation = (key: string) => t(key) !== key;

  const getHelpItems = (exerciseId: string) => {
    const key = getHelpTypeKey(exerciseId);
    const items: string[] = [];
    if (hasTranslation("helpPage.common.seeMeaning")) {
      items.push(t("helpPage.common.seeMeaning"));
    }
    if (hasTranslation("helpPage.common.seeMeta")) {
      items.push(t("helpPage.common.seeMeta"));
    }
    const specificKeys: Record<string, string[]> = {
      fullWord: ["seeInput"],
      halfWritten: ["seePartial", "seeInput"],
      brokenWord: ["seeSlots", "seeChunks"],
      connectWords: ["seeTypeTop", "seeLeft", "seeRight"],
      listening: ["seeTypeTop", "seeLeft", "seeRight"],
    };
    (specificKeys[key] || []).forEach((suffix) => {
      const itemKey = `helpPage.types.${key}.${suffix}`;
      if (hasTranslation(itemKey)) items.push(t(itemKey));
    });
    return items;
  };

  return (
    <div className="exercise-page flex-1 min-h-0 flex flex-col bg-background">
      {/* Header with back button */}
      <div className="exercise-header px-4 md:px-8">
        <button
          onClick={onBack}
          className="exercise-back-button flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>{t("exerciseSelection.back")}</span>
        </button>
      </div>

      <main className="exercise-main flex-1 flex items-center justify-center px-4 pb-16 relative">
        {/* Decorative background elements */}
        <div className="exercise-bg absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-20 left-10 w-64 h-64 rounded-full blur-3xl"
            style={{
              backgroundColor: "rgba(192, 132, 252, 0.1)",
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          ></motion.div>
          <motion.div
            className="absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl"
            style={{
              backgroundColor: "rgba(96, 165, 250, 0.1)",
            }}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          ></motion.div>
        </div>

        <motion.div
          className="exercise-container w-full space-y-10 relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Headline */}
          <motion.div
            className="exercise-headline text-center space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h2 className="text-2xl md:text-3xl lg:text-4xl text-foreground leading-tight">
              {t("exerciseSelection.title")}
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto">
              {t("exerciseSelection.subtitle")}
            </p>
          </motion.div>

          {/* Exercise List */}
          <motion.div
            className="exercise-list mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {exerciseItems.map((exercise, index) => {
              const isSelected = selectedExercises.includes(
                exercise.id,
              );
              const isLastSelected =
                isSelected && selectedExercises.length === 1;

              return (
                <motion.button
                    key={exercise.id}
                    onClick={() => toggleExercise(exercise.id)}
                    aria-pressed={isSelected}
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
                        setHelpExerciseId(exercise.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        setHelpExerciseId(exercise.id);
                      }}
                    >
                      ?
                    </span>
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
          </motion.div>

          {/* Helper Text */}
          <motion.p
            className="exercise-helper-text text-sm text-center text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {t("exerciseSelection.helperText")}
          </motion.p>

          {/* Start Practicing Button */}
          <motion.div
            className="exercise-continue-wrap flex justify-center pt-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <motion.button
              onClick={onContinue}
              disabled={isButtonDisabled}
              style={
                !isButtonDisabled
                  ? nextButtonStarFieldStyle
                  : undefined
              }
              className={`exercise-continue-button px-12 py-4 text-lg rounded-lg shadow-lg transition-all ${
                isButtonDisabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "text-white shadow-primary/20"
              }`}
              whileHover={
                !isButtonDisabled
                  ? {
                      scale: 1.05,
                      boxShadow:
                        "0 20px 40px rgba(99, 102, 241, 0.3)",
                    }
                  : undefined
              }
              whileTap={
                !isButtonDisabled ? { scale: 0.95 } : undefined
              }
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17,
              }}
            >
              {startButtonLabel}
            </motion.button>
          </motion.div>
        </motion.div>
      </main>
      {helpExerciseId && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("exerciseSelection.helpTitle")}
          onClick={() => setHelpExerciseId(null)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">
                {t(`exerciseSelection.exercise.${helpExerciseId}`)}
              </h3>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition"
                onClick={() => setHelpExerciseId(null)}
                aria-label={t("exerciseSelection.helpCloseAria")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              {t(
                `helpPage.types.${getHelpTypeKey(helpExerciseId)}.goal`,
              )}
            </p>

            <h4 className="mb-2 text-sm font-semibold text-foreground">
              {t(
                `helpPage.types.${getHelpTypeKey(helpExerciseId)}.seeTitle`,
              )}
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {getHelpItems(helpExerciseId).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            {(helpExerciseId === "connectWords" ||
              helpExerciseId === "listening") && (
              <>
                <h4 className="mb-2 mt-4 text-sm font-semibold text-foreground">
                  {t(
                    `helpPage.types.${getHelpTypeKey(helpExerciseId)}.howTitle`,
                  )}
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>
                    {t(
                      `helpPage.types.${getHelpTypeKey(helpExerciseId)}.how1`,
                    )}
                  </li>
                  <li>
                    {t(
                      `helpPage.types.${getHelpTypeKey(helpExerciseId)}.how2`,
                    )}
                  </li>
                  <li>
                    {t(
                      `helpPage.types.${getHelpTypeKey(helpExerciseId)}.how3`,
                    )}
                  </li>
                  {hasTranslation(
                    `helpPage.types.${getHelpTypeKey(helpExerciseId)}.how4`,
                  ) && (
                    <li>
                      {t(
                        `helpPage.types.${getHelpTypeKey(helpExerciseId)}.how4`,
                      )}
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
