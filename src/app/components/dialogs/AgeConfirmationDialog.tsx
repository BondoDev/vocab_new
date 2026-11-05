import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "../../../contexts/LanguageContext";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  birthDayForMonth,
  birthDayValuesForMonth,
  calendarDateInTimeZone,
  getBirthMonthOptions,
  getDeclaredAgeIssue,
} from "../../utils/accountAge";
import { getOnboardingAgeIssue, isAllowedProfileAge } from "../../utils/accountOnboardingAge";

export interface AgeConfirmationValues {
  age: number;
  birthMonth: string;
  birthDay: string;
}

interface AgeConfirmationDialogProps {
  open: boolean;
  // The stored (possibly outdated) values, shown as the starting point.
  initialAge: number | null;
  initialBirthMonth: string;
  initialBirthDay: string;
  timezone: string | null;
  isSaving: boolean;
  error: string | null;
  onConfirm: (values: AgeConfirmationValues) => void;
  onLater: () => void;
}

// One-time age confirmation for accounts created before automatic age
// (useAgeConfirmation decides when it opens). Their stored age has no
// trustworthy declaration date, so the user re-states it once; the server
// then infers the birth year and keeps the age current from then on.
// Dismissing ("Later", Escape, outside click) postpones it for this browser
// session only.
export function AgeConfirmationDialog({
  open,
  initialAge,
  initialBirthMonth,
  initialBirthDay,
  timezone,
  isSaving,
  error,
  onConfirm,
  onLater,
}: AgeConfirmationDialogProps) {
  const { t, uiLanguage } = useLanguage();
  const [ageDraft, setAgeDraft] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const monthOptions = useMemo(() => getBirthMonthOptions(uiLanguage), [uiLanguage]);

  // Re-seed from the stored values each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setAgeDraft(initialAge === null ? "" : String(initialAge));
    setBirthMonth(initialBirthMonth);
    setBirthDay(birthDayForMonth(initialBirthMonth, initialBirthDay));
  }, [open, initialAge, initialBirthMonth, initialBirthDay]);

  const age = Number(ageDraft);
  const ageError = (() => {
    if (ageDraft.trim() === "") return "accountOnboarding.errors.ageRequired";
    if (isAllowedProfileAge(age, initialAge)) return null;
    return getOnboardingAgeIssue(age) === "belowMinimum"
      ? "accountOnboarding.errors.ageMinimum"
      : "accountOnboarding.errors.ageOutOfRange";
  })();
  const dateError = (() => {
    if (!birthMonth || !birthDay) return "accountOnboarding.errors.birthDateRequired";
    if (ageError) return null;
    const issue = getDeclaredAgeIssue(age, Number(birthMonth), Number(birthDay), calendarDateInTimeZone(new Date(), timezone));
    if (issue === "invalidBirthDate") return "accountOnboarding.errors.birthDateInvalid";
    if (issue === "leapDayMismatch") return "accountOnboarding.errors.birthDateLeapDay";
    return null;
  })();
  const validationError = ageError ?? dateError;
  const shownError = error ?? (ageDraft.trim() !== "" && validationError ? t(validationError) : null);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSaving) onLater();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ageConfirmation.title")}</DialogTitle>
          <DialogDescription>{t("ageConfirmation.description")}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (validationError || isSaving) return;
            onConfirm({ age, birthMonth, birthDay });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="age-confirmation-age">{t("accountOnboarding.age")}</Label>
            <Input
              id="age-confirmation-age"
              type="number"
              inputMode="numeric"
              min={10}
              max={100}
              step={1}
              value={ageDraft}
              disabled={isSaving}
              onChange={(event) => setAgeDraft(event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label id="age-confirmation-birth-date">{t("accountOnboarding.birthDate")}</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
              <Select
                value={birthMonth || undefined}
                disabled={isSaving}
                onValueChange={(value) => {
                  setBirthMonth(value);
                  setBirthDay((day) => birthDayForMonth(value, day));
                }}
              >
                <SelectTrigger aria-labelledby="age-confirmation-birth-date">
                  <SelectValue placeholder={t("accountOnboarding.month")} />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={birthDay || undefined} disabled={isSaving} onValueChange={setBirthDay}>
                <SelectTrigger aria-labelledby="age-confirmation-birth-date">
                  <SelectValue placeholder={t("accountOnboarding.day")} />
                </SelectTrigger>
                <SelectContent>
                  {birthDayValuesForMonth(birthMonth).map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {shownError ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {shownError}
            </div>
          ) : null}

          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button type="submit" disabled={isSaving || validationError !== null} className="w-full">
              {isSaving ? t("ageConfirmation.saving") : t("ageConfirmation.confirm")}
            </Button>
            <Button type="button" variant="ghost" disabled={isSaving} onClick={onLater} className="w-full">
              {t("ageConfirmation.later")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
