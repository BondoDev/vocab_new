import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { Button } from "../../../../app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../app/components/ui/dialog";
import { EXERCISE_IDS, type ExerciseId } from "../../../../exercises/exerciseIds";
import type { UserVocabularyList, UserVocabularyListMembership } from "../../../../lib/vocabularyLists";
import {
  buildPracticeListSetupSummary,
  buildQuantityOptions,
  getDefaultQuantityOption,
  selectListPracticeWords,
  type PracticeQuantityOption,
  type PracticeWordOrder,
} from "./practiceListSelection";

const ORDER_OPTIONS: PracticeWordOrder[] = ["random", "listOrder"];

interface PracticeListSetupDialogProps {
  open: boolean;
  list: UserVocabularyList | null;
  // Current membership snapshot — read fresh on every render (never a
  // dialog-open-time snapshot frozen in local state), so "Start Practice"
  // naturally picks up any Add/Remove that happened while this dialog was
  // open without any extra synchronization plumbing (see this feature's
  // own "list changes during setup" requirement).
  memberships: UserVocabularyListMembership[];
  onOpenChange: (open: boolean) => void;
  onStart: (config: { conceptIds: string[]; exercises: ExerciseId[] }) => void;
}

// Practice List's own compact setup: quantity, word order, and exercise
// selection, then a one-line summary and Start Practice — deliberately NOT
// the full-page ExerciseSelection.tsx (this dialog must stay small, and
// Not-studied/Learning/Known/Mastered/CEFR/grammar/daily-goal controls are
// explicitly out of scope here). Exercise ids/labels/last-one-locked
// validation are still reused verbatim from the same canonical contract
// ExerciseSelection.tsx itself uses (src/exercises/exerciseIds.ts,
// `exerciseSelection.exercise.*` translations) — no second exercise-name
// list is introduced.
export function PracticeListSetupDialog({
  open,
  list,
  memberships,
  onOpenChange,
  onStart,
}: PracticeListSetupDialogProps) {
  const { t } = useLanguage();
  const quantityOptions = useMemo(
    () => buildQuantityOptions(memberships.length),
    [memberships.length],
  );
  const [selectedQuantity, setSelectedQuantity] = useState<PracticeQuantityOption | null>(null);
  const [order, setOrder] = useState<PracticeWordOrder>("random");
  const [selectedExercises, setSelectedExercises] = useState<ExerciseId[]>([...EXERCISE_IDS]);

  // Re-derives every control's default whenever the dialog (re)opens — so
  // reopening it (for this list or a different one) never shows a stale
  // selection from the previous time it was open.
  useEffect(() => {
    if (!open) return;
    setSelectedQuantity(getDefaultQuantityOption(buildQuantityOptions(memberships.length)));
    setOrder("random");
    setSelectedExercises([...EXERCISE_IDS]);
    // Deliberately not re-run when `memberships` changes while already
    // open (only on the open transition) — matching this feature's own
    // "do not over-engineer live synchronization" requirement; the
    // resolved word set itself is still always read fresh at Start (see
    // handleStart below), only the control defaults are open-time-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleExercise = (exerciseId: ExerciseId) => {
    setSelectedExercises((previous) => {
      if (previous.includes(exerciseId)) {
        // Prevent deselecting the last exercise — same rule
        // ExerciseSelection.tsx enforces for the ordinary Custom Practice
        // flow.
        if (previous.length === 1) return previous;
        return previous.filter((id) => id !== exerciseId);
      }
      return [...previous, exerciseId];
    });
  };

  const summary = buildPracticeListSetupSummary(selectedQuantity, order, selectedExercises.length);
  const canStart = Boolean(selectedQuantity) && selectedExercises.length > 0 && memberships.length > 0;

  const handleStart = () => {
    if (!canStart || !selectedQuantity) return;
    const conceptIds = selectListPracticeWords(memberships, selectedQuantity.value, order);
    if (conceptIds.length === 0) return;
    onStart({ conceptIds, exercises: selectedExercises });
  };

  const orderLabel = (value: PracticeWordOrder) =>
    value === "random"
      ? t("userProfile.myListsSection.practiceSetup.random")
      : t("userProfile.myListsSection.practiceSetup.listOrder");

  const exerciseCountLabel = (count: number) =>
    count === 1
      ? t("userProfile.myListsSection.practiceSetup.exerciseType").replace("{count}", "1")
      : t("userProfile.myListsSection.practiceSetup.exerciseTypes").replace("{count}", String(count));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
    >
      <DialogContent className="my-lists-practice-setup-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("userProfile.myListsSection.practiceSetup.title").replace("{name}", list?.name ?? "")}
          </DialogTitle>
          <DialogDescription>
            {t("userProfile.myListsSection.practiceSetup.description")}
          </DialogDescription>
        </DialogHeader>

        {memberships.length === 0 ? (
          <p className="my-lists-message-block__text">
            {t("userProfile.myListsSection.practiceSetup.noWords")}
          </p>
        ) : (
          <div className="practice-setup">
            <fieldset className="practice-setup__group">
              <legend className="practice-setup__label">
                {t("userProfile.myListsSection.practiceSetup.numberOfWords")}
              </legend>
              <div
                className="practice-setup__options"
                role="group"
                aria-label={t("userProfile.myListsSection.practiceSetup.numberOfWords")}
              >
                {quantityOptions.map((option) => {
                  const isSelected =
                    selectedQuantity?.kind === option.kind && selectedQuantity.value === option.value;
                  const label =
                    option.kind === "all"
                      ? t("userProfile.myListsSection.practiceSetup.allCount").replace(
                          "{count}",
                          String(option.value),
                        )
                      : String(option.value);
                  return (
                    <button
                      key={`${option.kind}-${option.value}`}
                      type="button"
                      className={`practice-setup__option ${isSelected ? "is-active" : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedQuantity(option)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="practice-setup__group">
              <legend className="practice-setup__label">
                {t("userProfile.myListsSection.practiceSetup.wordOrder")}
              </legend>
              <div
                className="practice-setup__options"
                role="group"
                aria-label={t("userProfile.myListsSection.practiceSetup.wordOrder")}
              >
                {ORDER_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`practice-setup__option ${order === value ? "is-active" : ""}`}
                    aria-pressed={order === value}
                    onClick={() => setOrder(value)}
                  >
                    {orderLabel(value)}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="practice-setup__group">
              <legend className="practice-setup__label">
                {t("userProfile.myListsSection.practiceSetup.exercises")}
              </legend>
              <div
                className="practice-setup__exercise-list"
                role="group"
                aria-label={t("userProfile.myListsSection.practiceSetup.exercises")}
              >
                {EXERCISE_IDS.map((exerciseId) => {
                  const isSelected = selectedExercises.includes(exerciseId);
                  const isLastSelected = isSelected && selectedExercises.length === 1;
                  return (
                    <label
                      key={exerciseId}
                      className={`practice-setup__exercise ${isSelected ? "is-selected" : ""} ${
                        isLastSelected ? "is-locked" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isLastSelected}
                        onChange={() => toggleExercise(exerciseId)}
                        className="practice-setup__exercise-checkbox"
                      />
                      {t(`exerciseSelection.exercise.${exerciseId}`)}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <p className="practice-setup__summary">
              {summary.wordCount} {t("userProfile.myListsSection.wordsUnit")} · {orderLabel(summary.order)} ·{" "}
              {exerciseCountLabel(summary.exerciseCount)}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("userProfile.myListsSection.modal.cancel")}
          </Button>
          <Button type="button" onClick={handleStart} disabled={!canStart}>
            {t("userProfile.myListsSection.practiceSetup.startPractice")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
