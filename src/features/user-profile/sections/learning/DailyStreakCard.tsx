import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import type { UserProfile } from "../../../../lib/userProfile";
import { readDailyStreakStats, type DailyStreakStatRow } from "../../../../lib/newWordProgress";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import { getCurrentLearningDate } from "../../../../lib/learningDate";
import {
  computeDailyStreakSummary,
  type DailyStreakDayStatus,
  type DailyStreakSummary,
} from "../../../../data/learning/dailyStreak";
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

// One accessible label per DailyStreakDayStatus (see that type's own header
// in dailyStreak.ts for what each value means) — colour alone never carries
// the distinction; every day marker also gets one of these four strings via
// its listitem's aria-label, matched 1:1 against the visual state below.
const DAY_STATUS_LABEL_KEYS: Record<DailyStreakDayStatus, string> = {
  completed: "userProfile.learningSection.dailyStreak.status.completed",
  failed: "userProfile.learningSection.dailyStreak.status.failed",
  inProgress: "userProfile.learningSection.dailyStreak.status.inProgress",
  future: "userProfile.learningSection.dailyStreak.status.future",
};

// Visual state per DailyStreakDayStatus — "completed" and "failed" each get
// their own day-marker modifier class (green/red respectively, see
// learning-section.scss); "inProgress" and "future" intentionally share the
// unmodified neutral marker — today isn't over yet and a future day hasn't
// happened yet, so neither is ever colored as good or bad.
const DAY_STATUS_MARKER_CLASSES: Record<DailyStreakDayStatus, string> = {
  completed: "daily-streak-card__day-marker--completed",
  failed: "daily-streak-card__day-marker--failed",
  inProgress: "",
  future: "",
};

type LoadState = { status: "loading" } | { status: "ready"; stats: DailyStreakStatRow[]; todayISO: string | null };

interface DailyStreakCardProps {
  practiceLanguage: UserProfile["practiceLanguage"];
  isProfileLoaded: boolean;
  // Opaque counter from LearningSection, bumped once per *successful*
  // update_daily_goal save (see LearningSection.tsx's handleDailyGoalChange
  // and DailyGoalSelector's onDailyGoalChange — never bumped on a failed
  // save). This card never reads the number's value, only that it changed
  // — it exists solely to re-trigger the fetch effect below so today's row
  // (whose stored daily_goal update_daily_goal just changed server-side)
  // gets re-read instead of staying on a stale cached copy. See the effect
  // below for why this is the only thing a goal change is allowed to
  // affect here.
  streakRefreshToken: number;
}

// practiceLanguage comes from the Learning dashboard's single shared
// profile load (see App.tsx's useUserProfileLoad, threaded down through
// LearningSection) rather than a copy fetched by this component — only the
// recent user_daily_stats history a streak is computed from
// (readDailyStreakStats) is this component's own request; the summary
// itself is a pure client computation (computeDailyStreakSummary).
//
// No dailyGoal prop, deliberately: unlike TodayProgressCard (which needs
// the live current goal to show progress *today*), this card must never
// let the current, mutable profile goal influence a past day's completion
// — see computeDailyStreakSummary's own header for why. Each row is judged
// solely against its own stored daily_goal snapshot, or a fixed legacy
// default for rows written before Streak Phase 1 had a snapshot to store.
// streakRefreshToken (below) exists precisely so a goal change can still
// prompt a *refetch* of the authoritative rows without ever handing this
// card the goal value itself to compute with.
export function DailyStreakCard({ practiceLanguage, isProfileLoaded, streakRefreshToken }: DailyStreakCardProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const isCompact = useIsCompactLearningSummary();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!authUserId) {
      setState({ status: "ready", stats: [], todayISO: null });
      return;
    }

    if (!isProfileLoaded) {
      // The shared profile load (App.tsx) is still in flight — wait for it
      // rather than fetching with a not-yet-known target language.
      setState({ status: "loading" });
      return;
    }

    if (!practiceLanguage) {
      setState({ status: "ready", stats: [], todayISO: null });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "ready", stats: [], todayISO: null });
          return;
        }

        const todayISO = await getCurrentLearningDate(session);
        const stats = await readDailyStreakStats(session, practiceLanguage, todayISO);
        if (cancelled) return;
        setState({ status: "ready", stats, todayISO });
      } catch (error) {
        if (cancelled) return;
        console.warn("DailyStreakCard: failed to load streak data.", describeSupabaseError("readDailyStreakStats", error));
        setState({ status: "ready", stats: [], todayISO: null });
      }
    })();

    return () => {
      cancelled = true;
    };
    // streakRefreshToken only ever changes after a *successful*
    // update_daily_goal save (see LearningSection.tsx) — its sole purpose
    // as a dependency is forcing this effect to re-run and re-fetch
    // today's now-updated stored goal, exactly like a practiceLanguage or
    // auth change already does. A failed save never bumps it, so a failed
    // save can never trigger a refetch here.
  }, [authUserId, isProfileLoaded, practiceLanguage, streakRefreshToken]);

  const isLoading = state.status === "loading";
  const stats = state.status === "ready" ? state.stats : [];
  const todayISO = state.status === "ready" ? state.todayISO : null;
  // Recomputed on every render (not cached in state) purely from the
  // already-fetched stats and today's date — computeDailyStreakSummary
  // takes no current-goal input at all, so there is nothing here that a
  // Daily Goal change elsewhere on the page could feed into a past day's
  // completion. A row with its own stored snapshot always uses that; a
  // legacy row with none always uses the same fixed fallback regardless of
  // what the live profile goal is today.
  //
  // Today's own square does repaint promptly after a successful goal save:
  // streakRefreshToken (see the fetch effect above) forces a refetch of
  // `stats`, which picks up the updated stored snapshot update_daily_goal
  // just wrote to today's row server-side. A failed save never bumps the
  // token, so `stats` — and this summary — stay exactly as they were; there
  // is no optimistic update anywhere in this path, only a genuine refetch
  // of authoritative data.
  const summary = isLoading || !todayISO
    ? EMPTY_SUMMARY
    : computeDailyStreakSummary(stats, todayISO);
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
          // While still loading, currentWeek is empty (EMPTY_SUMMARY) — every
          // day falls back to "future" here purely for a neutral, uncolored
          // render; aria-busy on the list container (below) is what actually
          // tells assistive tech this content isn't final yet, matching this
          // component's pre-existing precedent of a generic placeholder label
          // during the loading window.
          const dayStatus: DailyStreakDayStatus = isLoading ? "future" : currentWeek[index]?.status ?? "future";
          const statusLabel = t(DAY_STATUS_LABEL_KEYS[dayStatus]);

          return (
            <div
              key={day.fullKey}
              role="listitem"
              aria-label={`${dayName}: ${statusLabel}`}
              className="daily-streak-card__day-col"
            >
              <span className="daily-streak-card__day-label" aria-hidden="true">
                {t(`userProfile.learningSection.dailyStreak.weekdays.${day.shortKey}`)}
              </span>
              <span
                aria-hidden="true"
                className={`daily-streak-card__day-marker ${DAY_STATUS_MARKER_CLASSES[dayStatus]}`}
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
