import { ChevronDown, ChevronUp, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { LanguageSelector } from "../LanguageSelector";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { UserProfile } from "../../../lib/userProfile";

const LANGUAGE_LEVEL_OPTIONS = [
  { value: "A1", label: "Beginner", detail: "A1" },
  { value: "A2", label: "Elementary", detail: "A2" },
  { value: "B1", label: "Intermediate", detail: "B1" },
  { value: "B2", label: "Upper-intermediate", detail: "B2" },
  { value: "C1", label: "Advanced", detail: "C1" },
  { value: "C2", label: "Proficient", detail: "C2" },
] as const;

const BIRTH_MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

const BIRTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  return { value, label: value };
});

function getPracticeLanguageLabel(
  languages: AccountOnboardingDialogProps["languages"],
  code: UserProfile["practiceLanguage"],
) {
  return (
    languages.find((language) => language.code === code)?.name ??
    "practice language"
  );
}

type AccountOnboardingDialogProps = {
  open: boolean;
  profile: UserProfile;
  languages: {
    code: string;
    name: string;
    flagCode?: string;
  }[];
  isSubmitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onProfileChange: (patch: Partial<UserProfile>) => void;
  onSubmit: () => void | Promise<void>;
};

function clampAge(value: number) {
  return Math.min(100, Math.max(10, Math.round(value)));
}

export function AccountOnboardingDialog({
  open,
  profile,
  languages,
  isSubmitting,
  error,
  onOpenChange,
  onProfileChange,
  onSubmit,
}: AccountOnboardingDialogProps) {
  const selectedPracticeLanguageLabel = getPracticeLanguageLabel(
    languages,
    profile.practiceLanguage,
  );
  const isLanguageLevelDisabled = !profile.practiceLanguage;
  const [ageInputValue, setAgeInputValue] = useState(() =>
    String(profile.age ?? 18),
  );
  const displayedAgeValue = Number(ageInputValue) || profile.age || 18;
  const handleAgeChange = (nextValue: number | null) => {
    onProfileChange({
      age: nextValue === null ? null : clampAge(nextValue),
    });
  };

  useEffect(() => {
    setAgeInputValue(String(profile.age ?? 18));
  }, [profile.age]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,38rem)] max-w-none rounded-[2rem] border-white/15 bg-[#fffdfd] p-0 shadow-[0_28px_90px_rgba(21,14,44,0.38)] [&_[data-slot=dialog-close]]:hidden">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close onboarding"
          className="absolute right-2 top-2 z-20 inline-flex h-[2.45rem] w-[2.45rem] items-center justify-center rounded-[0.8rem] text-[#7c6ca6]"
        >
          <span className="text-[1.7rem] leading-none">&times;</span>
        </button>

        <div className="overflow-hidden rounded-[2rem]">
          <div className="bg-[radial-gradient(circle_at_top,rgba(120,90,255,0.22),rgba(255,255,255,0)_55%),linear-gradient(135deg,#ffffff_0%,#f7f2ff_58%,#fff8f2_100%)] px-6 pb-6 pt-7 sm:px-8 sm:pb-8">
            <DialogHeader className="gap-4 text-left">
              <div className="space-y-2 pr-16 sm:pr-20">
                <DialogTitle className="text-[1.9rem] font-semibold leading-tight tracking-tight text-[#261943]">
                  Finish your profile
                </DialogTitle>
                <p className="max-w-[24rem] text-sm leading-6 text-[#6f6290]">
                  You can update these details anytime.
                </p>
              </div>
            </DialogHeader>

            <div className="mt-8 space-y-5">
              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-5 md:grid-cols-2 [&_.language-selector-trigger]:h-12 [&_.language-selector-trigger]:px-4 [&_.language-selector-trigger]:py-3 [&_.language-selector-trigger]:md:px-4 [&_.language-selector-trigger]:md:py-3 [&_.language-selector-trigger]:md:text-base">
                <LanguageSelector
                  label="Native language"
                  value={profile.nativeLanguage}
                  onChange={(value) =>
                    onProfileChange({
                      nativeLanguage: value as UserProfile["nativeLanguage"],
                    })
                  }
                  placeholder="Select your native language"
                  languages={languages}
                  disabledLanguages={
                    profile.practiceLanguage ? [profile.practiceLanguage] : []
                  }
                />
                <LanguageSelector
                  label="Practice language"
                  value={profile.practiceLanguage}
                  onChange={(value) =>
                    onProfileChange({
                      practiceLanguage:
                        value as UserProfile["practiceLanguage"],
                    })
                  }
                  placeholder="Select the language you want to practice"
                  languages={languages}
                  disabledLanguages={
                    profile.nativeLanguage ? [profile.nativeLanguage] : []
                  }
                />
              </div>

              <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
                <div className="space-y-2">
                  <Label
                    htmlFor="account-onboarding-nickname"
                    className="text-sm font-semibold text-[#37275b]"
                  >
                    Nickname
                  </Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d7cb6]" />
                    <Input
                      id="account-onboarding-nickname"
                      value={profile.nickname}
                      onChange={(event) =>
                        onProfileChange({
                          nickname: event.target.value.slice(0, 40),
                        })
                      }
                      placeholder="Your nickname"
                      className="h-12 rounded-2xl border-[#dcd1ff] bg-white pl-11 text-base text-[#261943] placeholder:text-[#8d7cb6] [&::placeholder]:text-[0.8rem] shadow-[0_12px_30px_-24px_rgba(74,43,130,0.9)] focus-visible:ring-[#8f7dff]/35"
                    />
                  </div>
                  <div className="space-y-2 pt-1">
                    <Label className="text-sm font-semibold text-[#37275b]">
                      {`Your ${selectedPracticeLanguageLabel} Level`}
                    </Label>
                    <Select
                      value={profile.languageLevel}
                      disabled={isLanguageLevelDisabled}
                      onValueChange={(value) =>
                        onProfileChange({
                          languageLevel: value as UserProfile["languageLevel"],
                        })
                      }
                    >
                      <SelectTrigger className="h-12 min-h-12 max-h-12 py-0 rounded-2xl border-[#dcd1ff] bg-white px-4 text-base text-[#261943] shadow-[0_12px_30px_-24px_rgba(74,43,130,0.9)] focus-visible:ring-[#8f7dff]/35 disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:size-5 [&_svg]:text-[#6f6290] [&_svg]:opacity-100">
                        <SelectValue
                          placeholder={
                            isLanguageLevelDisabled
                              ? "Select a practice language first"
                              : "Choose your level"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-[#dcd1ff] bg-white">
                        {LANGUAGE_LEVEL_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="rounded-xl px-3 py-3 text-sm text-[#261943]"
                          >
                            <span className="flex w-full items-center justify-between gap-3">
                              <span className="text-xs font-semibold text-[#8d7cb6]">
                                {option.detail}
                              </span>
                              <span className="flex-1">{option.label}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 rounded-[1.5rem] border border-[#dfd5ff] bg-white/85 p-4 shadow-[0_16px_36px_-26px_rgba(74,43,130,0.9)]">
                  <Label
                    htmlFor="account-onboarding-age"
                    className="justify-center text-sm font-semibold text-[#37275b]"
                  >
                    Your Age
                  </Label>
                  <div className="relative">
                    <Input
                      id="account-onboarding-age"
                      type="number"
                      min={10}
                      max={100}
                      inputMode="numeric"
                      value={ageInputValue}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setAgeInputValue(nextValue);
                        if (!nextValue) {
                          handleAgeChange(null);
                          return;
                        }

                        const parsedValue = Number(nextValue);
                        if (
                          Number.isFinite(parsedValue) &&
                          parsedValue >= 10 &&
                          parsedValue <= 100
                        ) {
                          handleAgeChange(parsedValue);
                        }
                      }}
                      onBlur={() => {
                        if (!ageInputValue) {
                          setAgeInputValue("18");
                          return;
                        }

                        const parsedValue = Number(ageInputValue);
                        if (!Number.isFinite(parsedValue)) {
                          setAgeInputValue(String(profile.age ?? 18));
                          return;
                        }

                        const clampedValue = clampAge(parsedValue);
                        setAgeInputValue(String(clampedValue));
                        handleAgeChange(clampedValue);
                      }}
                      className="h-12 rounded-2xl border-[#dcd1ff] bg-[#fcfbff] pl-4 pr-9 text-center text-base font-semibold text-[#261943] [appearance:textfield] focus-visible:ring-[#8f7dff]/35 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col gap-[2px]">
                      <button
                        type="button"
                        onClick={() => {
                          const nextValue = displayedAgeValue + 1;
                          setAgeInputValue(String(clampAge(nextValue)));
                          handleAgeChange(nextValue);
                        }}
                        className="inline-flex h-4 w-4 items-center justify-center rounded text-[#6f6290]"
                        aria-label="Increase age"
                      >
                        <ChevronUp className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextValue = displayedAgeValue - 1;
                          setAgeInputValue(String(clampAge(nextValue)));
                          handleAgeChange(nextValue);
                        }}
                        className="inline-flex h-4 w-4 items-center justify-center rounded text-[#6f6290]"
                        aria-label="Decrease age"
                      >
                        <ChevronDown className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                  <Label className="justify-center text-sm font-semibold text-[#37275b]">
                    Birth Date
                  </Label>
                  <div className="grid grid-cols-[1.3fr_0.7fr] gap-3">
                    <Select
                      value={profile.birthMonth}
                      onValueChange={(value) =>
                        onProfileChange({ birthMonth: value })
                      }
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-[#dcd1ff] bg-[#fcfbff] pl-3 pr-[22px] text-sm text-[#261943] shadow-[0_12px_30px_-24px_rgba(74,43,130,0.9)] focus-visible:ring-[#8f7dff]/35 [&_svg]:size-4 [&_svg]:text-[#6f6290] [&_svg]:opacity-100">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        align="start"
                        sideOffset={6}
                        className="w-[var(--radix-select-trigger-width)] rounded-2xl border-[#dcd1ff] bg-white p-1 shadow-[0_16px_36px_-24px_rgba(74,43,130,0.9)]"
                      >
                        {BIRTH_MONTH_OPTIONS.map((month) => (
                          <SelectItem
                            key={month.value}
                            value={month.value}
                            className="rounded-xl px-3 py-2.5 text-sm text-[#261943]"
                          >
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={profile.birthDay}
                      onValueChange={(value) =>
                        onProfileChange({ birthDay: value })
                      }
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-[#dcd1ff] bg-[#fcfbff] pl-3 pr-[22px] text-center text-sm text-[#261943] shadow-[0_12px_30px_-24px_rgba(74,43,130,0.9)] focus-visible:ring-[#8f7dff]/35 [&_svg]:size-4 [&_svg]:text-[#6f6290] [&_svg]:opacity-100">
                        <SelectValue placeholder="day" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        align="start"
                        sideOffset={6}
                        className="w-[var(--radix-select-trigger-width)] rounded-2xl border-[#dcd1ff] bg-white p-1 shadow-[0_16px_36px_-24px_rgba(74,43,130,0.9)]"
                      >
                        {BIRTH_DAY_OPTIONS.map((day) => (
                          <SelectItem
                            key={day.value}
                            value={day.value}
                            className="rounded-xl px-3 py-2.5 text-center text-sm text-[#261943]"
                          >
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                disabled={isSubmitting}
                onClick={() => void onSubmit()}
                className="h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#6f58ff,#5c49f2)] text-base font-semibold text-white shadow-[0_18px_38px_-18px_rgba(92,73,242,0.9)] transition-transform hover:translate-y-[-1px] hover:opacity-95"
              >
                {isSubmitting ? "Saving..." : "Save and continue"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
