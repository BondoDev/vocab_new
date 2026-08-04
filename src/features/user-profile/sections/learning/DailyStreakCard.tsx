import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import type { UserProfile } from "../../../../lib/userProfile";
import { readDailyStreakStats, type DailyStreakStatRow } from "../../../../lib/newWordProgress";
import { getLocalCalendarDateISO } from "../../../../data/learning/localStudyDate";
import { computeDailyStreakSummary, type DailyStreakSummary } from "../../../../data/learning/dailyStreak";
import { useIsCompactLearningSummary } from "./useIsCompactLearningSummary";

const WEEK_DAYS = [
  { shortKey: "monShort", fullKey: "monday" },
  { shortKey: "tueShort", fullKey: "tuesday" },
  { shortKey: "wedShort", fullKey: "wednesday" },
  { shortKey: "thuShort", fullKey: "thursday" },
  { shortKey: "friShort", fullKey: "friday" },
  { shortKey: "satShort", fullKey: "saturday" },
  { shortKey: "sunShort", fullKey: "sunday" },
] as const;

const EMPTY_SUMMARY: DailyStreakSummary = {
  currentStreakDays: 0,
  bestStreakDays: 0,
  currentWeek: [],
};

type LoadState = { status: "loading" } | { status: "ready"; stats: DailyStreakStatRow[] };

interface DailyStreakCardProps {
  practiceLanguage: UserProfile["practiceLanguage"];
  dailyGoal: UserProfile["dailyGoal"];
  isProfileLoaded: boolean;
}

// practiceLanguage/dailyGoal come from the Learning dashboard's single
// shared profile load (see App.tsx's useUserProfileLoad, threaded down
// through LearningSection) rather than a copy fetched by this component —
// only the recent user_daily_stats history a streak is computed from
// (readDailyStreakStats) is this component's own request; the summary
// itself is a pure client computation (computeDailyStreakSummary).
export function DailyStreakCard({ practiceLanguage, dailyGoal, isProfileLoaded }: DailyStreakCardProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const isCompact = useIsCompactLearningSummary();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!authUserId) {
      setState({ status: "ready", stats: [] });
      return;
    }

    if (!isProfileLoaded) {
      // The shared profile load (App.tsx) is still in flight — wait for it
      // rather than fetching with a not-yet-known target language.
      setState({ status: "loading" });
      return;
    }

    if (!practiceLanguage) {
      setState({ status: "ready", stats: [] });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "ready", stats: [] });
          return;
        }

        const stats = await readDailyStreakStats(session, practiceLanguage, getLocalCalendarDateISO());
        if (cancelled) return;
        setState({ status: "ready", stats });
      } catch (error) {
        if (cancelled) return;
        console.warn("DailyStreakCard: failed to load streak data.", error);
        setState({ status: "ready", stats: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, isProfileLoaded, practiceLanguage]);

  const isLoading = state.status === "loading";
  const stats = state.status === "ready" ? state.stats : [];
  // Recomputed from the dailyGoal prop on every render (not cached in
  // state) so a daily-goal change made elsewhere on the page (Daily Goal
  // card) updates the streak immediately, without refetching stats that
  // don't depend on the goal.
  const summary = isLoading
    ? EMPTY_SUMMARY
    : computeDailyStreakSummary(stats, dailyGoal, getLocalCalendarDateISO());
  const { currentStreakDays, bestStreakDays, currentWeek } = summary;

  const detailContent = (
    <>
      <div className="daily-streak-card__metric">
        <div className="daily-streak-card__primary">
          {isLoading ? (
            <span className="daily-streak-card__skeleton daily-streak-card__skeleton--value" aria-hidden="true" />
          ) : (
            <>
              <span className="daily-streak-card__value">{currentStreakDays}</span>
              <span className="daily-streak-card__unit">
                {t("userProfile.learningSection.dailyStreak.daysUnit")}
              </span>
            </>
          )}
        </div>
        {!isLoading && (
          <span className="daily-streak-card__best">
            {t("userProfile.learningSection.dailyStreak.bestPrefix")} {bestStreakDays}{" "}
            {t("userProfile.learningSection.dailyStreak.daysUnit")}
          </span>
        )}
      </div>

      <div
        className="daily-streak-card__week"
        role="list"
        aria-label={t("userProfile.learningSection.dailyStreak.weekAriaLabel")}
        aria-busy={isLoading}
      >
        {WEEK_DAYS.map((day, index) => {
          const dayName = t(`userProfile.learningSection.dailyStreak.weekdays.${day.fullKey}`);
          const isActive = !isLoading && currentWeek[index]?.isComplete === true;
          const status = isActive
            ? t("userProfile.learningSection.dailyStreak.status.activityCompleted")
            : t("userProfile.learningSection.dailyStreak.status.noActivity");

          return (
            <div
              key={day.fullKey}
              role="listitem"
              aria-label={`${dayName}: ${status}`}
              className="daily-streak-card__day-col"
            >
              <span className="daily-streak-card__day-label" aria-hidden="true">
                {t(`userProfile.learningSection.dailyStreak.weekdays.${day.shortKey}`)}
              </span>
              <span
                aria-hidden="true"
                className={`daily-streak-card__day-marker ${
                  isActive ? "daily-streak-card__day-marker--active" : ""
                }`}
              />
            </div>
          );
        })}
      </div>
    </>
  );

  // Below ~644px this collapses into an accordion row (see
  // learning-section.scss) so Daily Goal + Daily Streak stop pushing the
  // Start Learning section down the page. Desktop/tablet keep the original
  // always-expanded markup untouched below.
  if (isCompact) {
    return (
      <div className="learning-kpi-card daily-streak-card">
        <button
          type="button"
          className="learning-kpi-card__accordion-trigger"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <span className="learning-kpi-card__title">
            {t("userProfile.learningSection.dailyStreak.title")}
          </span>
          <span className="learning-kpi-card__accordion-right">
            <span className="learning-kpi-card__accordion-value">
              {isLoading ? (
                <span className="daily-streak-card__skeleton daily-streak-card__skeleton--inline" aria-hidden="true" />
              ) : (
                <>
                  {currentStreakDays} {t("userProfile.learningSection.dailyStreak.daysUnit")}
                </>
              )}
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
      </div>
    );
  }

  return (
    <div className="learning-kpi-card daily-streak-card">
      <div className="daily-streak-card__header">
        <p className="learning-kpi-card__title">
          {t("userProfile.learningSection.dailyStreak.title")}
        </p>
        <span className="learning-kpi-card__chip daily-streak-card__chip">
          {t("userProfile.learningSection.dailyStreak.chip")}
        </span>
      </div>

      {detailContent}
    </div>
  );
}
