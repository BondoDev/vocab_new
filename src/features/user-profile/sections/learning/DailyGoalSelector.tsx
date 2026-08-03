import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import {
  DEFAULT_DAILY_GOAL,
  EMPTY_USER_PROFILE,
  readStoredUserProfile,
  readSupabaseUserProfile,
  writeStoredUserProfile,
  writeSupabaseUserProfile,
  type UserProfile,
} from "../../../../lib/userProfile";
import { useIsCompactLearningSummary } from "./useIsCompactLearningSummary";

interface DailyGoalOption {
  value: number;
  paceLabelKey: string;
  estimateLabel: string;
  recommended?: boolean;
}

const DAILY_GOAL_OPTIONS: DailyGoalOption[] = [
  { value: 10, paceLabelKey: "userProfile.learningSection.dailyGoal.paces.light", estimateLabel: "8-10" },
  {
    value: 15,
    paceLabelKey: "userProfile.learningSection.dailyGoal.paces.balanced",
    estimateLabel: "12-15",
    recommended: true,
  },
  { value: 20, paceLabelKey: "userProfile.learningSection.dailyGoal.paces.steady", estimateLabel: "16-20" },
  {
    value: 30,
    paceLabelKey: "userProfile.learningSection.dailyGoal.paces.intensive",
    estimateLabel: "24-30",
  },
  {
    value: 50,
    paceLabelKey: "userProfile.learningSection.dailyGoal.paces.veryIntensive",
    estimateLabel: "40-50",
  },
];

interface DailyGoalSelectorProps {
  // Called with the newly saved goal once the Supabase write succeeds, so
  // the App-level userProfile state (which this component does not share —
  // it loads/saves its own copy) can be kept in sync. Without this, other
  // screens reading userProfile.dailyGoal (e.g. NewWordStudyPreparation)
  // keep showing the pre-change value until the page is reloaded.
  onDailyGoalChange?: (dailyGoal: number) => void;
}

export function DailyGoalSelector({ onDailyGoalChange }: DailyGoalSelectorProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const [goal, setGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [savedProfile, setSavedProfile] = useState<UserProfile>(EMPTY_USER_PROFILE);
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { message: confirmationMessage, show: showConfirmation } = useAutoDismissMessage();
  const isCompact = useIsCompactLearningSummary();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!authUserId) {
      setSavedProfile(EMPTY_USER_PROFILE);
      setGoal(DEFAULT_DAILY_GOAL);
      setIsProfileLoaded(true);
      return;
    }

    let cancelled = false;
    setIsProfileLoaded(false);
    const storedProfile = readStoredUserProfile(authUserId);
    if (storedProfile) {
      setSavedProfile(storedProfile);
      setGoal(storedProfile.dailyGoal);
    }

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        const supabaseProfile = session ? await readSupabaseUserProfile(session) : null;
        if (cancelled) {
          return;
        }

        if (supabaseProfile) {
          const nextProfile: UserProfile = {
            ...(storedProfile ?? EMPTY_USER_PROFILE),
            ...supabaseProfile,
          };
          setSavedProfile(nextProfile);
          setGoal(nextProfile.dailyGoal);
        }

        setIsProfileLoaded(true);
      } catch {
        if (!cancelled) {
          setIsProfileLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  const selectedOption =
    DAILY_GOAL_OPTIONS.find((option) => option.value === goal) ?? DAILY_GOAL_OPTIONS[1];

  // True whenever the selected goal already matches what's saved — right
  // after load (nothing to save yet) and again immediately after a
  // successful save (savedProfile.dailyGoal is updated to match `goal` in
  // the .then() below). Picking a different option changes `goal`, which
  // makes this false again and re-enables Save.
  const isUnchanged = goal === savedProfile.dailyGoal;

  const handleSave = () => {
    if (isSaving || !isProfileLoaded || isUnchanged) {
      return;
    }

    if (!authUserId) {
      showConfirmation(t("userProfile.learningSection.dailyGoal.savedToast"));
      return;
    }

    const session = getStoredSupabaseSession();
    if (!session) {
      return;
    }

    setIsSaving(true);
    const patchedProfile: UserProfile = { ...savedProfile, dailyGoal: goal };

    void writeSupabaseUserProfile(session, patchedProfile)
      .then((supabaseProfile) => {
        const nextProfile = writeStoredUserProfile(authUserId, {
          ...patchedProfile,
          ...supabaseProfile,
        });
        setSavedProfile(nextProfile);
        onDailyGoalChange?.(nextProfile.dailyGoal);
        showConfirmation(t("userProfile.learningSection.dailyGoal.savedToast"));
      })
      .catch(() => {
        showConfirmation(t("userProfile.learningSection.dailyGoal.saveError"));
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const detailContent = (
    <>
      <div className="daily-goal-selector__options-row">
        <div
          role="group"
          aria-label={t("userProfile.learningSection.dailyGoal.ariaLabel")}
          className="daily-goal-selector__options"
        >
          {DAILY_GOAL_OPTIONS.map((option) => {
            const isSelected = option.value === goal;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setGoal(option.value)}
                className={`daily-goal-selector__option ${
                  isSelected ? "daily-goal-selector__option--selected" : ""
                }`}
              >
                {option.value}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isProfileLoaded || isUnchanged}
          className="daily-goal-selector__save"
        >
          {t("userProfile.learningSection.dailyGoal.saveButton")}
        </button>
      </div>

      <p className="daily-goal-selector__pace">
        {t(selectedOption.paceLabelKey)} {" - "}
        {t("userProfile.learningSection.dailyGoal.approximately")} {selectedOption.estimateLabel}{" "}
        {t("userProfile.learningSection.dailyGoal.minutesUnit")}
      </p>
    </>
  );

  // Below ~644px this collapses into an accordion row (see
  // learning-section.scss) so Daily Goal + Daily Streak stop pushing the
  // Start Learning section down the page. Desktop/tablet keep the original
  // always-expanded markup untouched below.
  if (isCompact) {
    return (
      <section className="learning-kpi-card daily-goal-selector">
        <button
          type="button"
          className="learning-kpi-card__accordion-trigger"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <span className="learning-kpi-card__title">
            {t("userProfile.learningSection.dailyGoal.title")}
          </span>
          <span className="learning-kpi-card__accordion-right">
            <span className="learning-kpi-card__accordion-value">
              {goal} {t("userProfile.learningSection.dailyGoal.wordsPerDay")}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`learning-kpi-card__chevron ${
                isExpanded ? "learning-kpi-card__chevron--open" : ""
              }`}
            />
          </span>
        </button>

        <div
          id={panelId}
          className={`learning-kpi-card__accordion-panel ${
            isExpanded ? "learning-kpi-card__accordion-panel--open" : ""
          }`}
        >
          <div className="learning-kpi-card__accordion-panel-inner">{detailContent}</div>
        </div>

        <Toast message={confirmationMessage} />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="daily-goal-heading"
      className="learning-kpi-card daily-goal-selector"
    >
      <div className="daily-goal-selector__header">
        <h2 id="daily-goal-heading" className="learning-kpi-card__title">
          {t("userProfile.learningSection.dailyGoal.title")}
        </h2>
        <div className="daily-goal-selector__summary">
          <p className="daily-goal-selector__summary-value">
            <span className="daily-goal-selector__summary-number">{goal}</span>
            <span className="daily-goal-selector__summary-unit">
              {t("userProfile.learningSection.dailyGoal.wordsPerDay")}
            </span>
          </p>
          <p
            className={`daily-goal-selector__recommended ${
              selectedOption.recommended ? "" : "daily-goal-selector__recommended--hidden"
            }`}
          >
            {t("userProfile.learningSection.dailyGoal.recommended")}
          </p>
        </div>
      </div>

      {detailContent}

      <Toast message={confirmationMessage} />
    </section>
  );
}
