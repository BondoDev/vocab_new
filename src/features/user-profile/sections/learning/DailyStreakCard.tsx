import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import type { UserProfile } from "../../../../lib/userProfile";
import type { MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import {
  computeDailyStreakSummary,
  type DailyStreakDayStatus,
  type DailyStreakSummary,
} from "../../../../data/learning/dailyStreak";
import type { SharedLazyResourceStatus } from "../useProfileSharedDailyStats";
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

// "blocked" (distinct from "loading") is what this card enters when
// todayISOStatus is "error": LearningSection's shared date request failed
// and already shows the one parent-level error/retry banner, so this card
// must neither present data judged against a date it doesn't have, nor
// present a successful "empty stats" summary as though it were real data —
// a failed date fetch is not equivalent to "no streak history". Rendering-
// wise "blocked" is treated the same as "loading" (see isLoading below): a
// neutral skeleton placeholder, never the numeric streak/week display.
type LoadState =
  | { status: "loading" }
  | { status: "ready"; stats: MilestoneDailyStatRow[] }
  | { status: "blocked" };

interface DailyStreakCardProps {
  practiceLanguage: UserProfile["practiceLanguage"];
  isProfileLoaded: boolean;
  // The authoritative current learning date, owned and fetched exactly
  // once by LearningSection (see that file's header) — this card no
  // longer calls getCurrentLearningDate itself. null whenever
  // todayISOStatus isn't "ready".
  todayISO: string | null;
  // LearningSection's own LearningDateState.status, passed straight
  // through:
  //   "loading"     — the shared date request (or the profile load it
  //                    waits on) is still in flight; this card mirrors it.
  //   "ready"       — todayISO is populated; this card derives its own
  //                    stats once practiceLanguage is also known.
  //   "unavailable" — legitimately no session (signed out, or auth/profile
  //                    not ready) — the existing safe "empty stats"
  //                    fallback applies, same as before this contract
  //                    changed.
  //   "error"       — the shared date request genuinely failed. This card
  //                    must not present an "empty stats" summary as if it
  //                    were successfully loaded data — see "blocked" above.
  todayISOStatus: "loading" | "ready" | "unavailable" | "error";
  // Fetch-audit Phase 1: the shared daily-stats resource (see
  // useProfileSharedDailyStats.ts) — requested once by LearningSection,
  // read here rather than fetched by this card itself. Replaces the
  // previous streakRefreshToken prop entirely: a successful daily-goal
  // save now fires notifyDailyStatsChanged() (DailyGoalSelector.tsx),
  // which refreshes this same shared resource in the background, so this
  // card picks up today's newly-stored goal snapshot without any
  // card-local refresh mechanism of its own.
  dailyStatsStatus: SharedLazyResourceStatus;
  dailyStatsRows: MilestoneDailyStatRow[];
}

// practiceLanguage comes from the Learning dashboard's single shared
// profile load (see App.tsx's useUserProfileLoad, threaded down through
// LearningSection) rather than a copy fetched by this component; the
// recent user_daily_stats history a streak is computed from is now the
// shared dailyStatsRows (see useProfileSharedDailyStats.ts) — this
// component fetches nothing itself. The summary is still a pure client
// computation (computeDailyStreakSummary).
//
// No dailyGoal prop, deliberately: unlike TodayProgressCard (which needs
// the live current goal to show progress *today*), this card must never
// let the current, mutable profile goal influence a past day's completion
// — see computeDailyStreakSummary's own header for why. Each row is judged
// solely against its own stored daily_goal snapshot, or a fixed legacy
// default for rows written before Streak Phase 1 had a snapshot to store.
// A successful goal change reaches this card only via the shared resource
// refreshing (notifyDailyStatsChanged, fired by DailyGoalSelector.tsx) —
// never by handing this card the goal value itself to compute with.
export function DailyStreakCard({
  practiceLanguage,
  isProfileLoaded,
  todayISO,
  todayISOStatus,
  dailyStatsStatus,
  dailyStatsRows,
}: DailyStreakCardProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const isCompact = useIsCompactLearningSummary();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();

  const state = useMemo<LoadState>(() => {
    if (!authUserId) {
      return { status: "ready", stats: [] };
    }

    if (!isProfileLoaded || todayISOStatus === "loading") {
      // The shared profile load (App.tsx) or LearningSection's shared date
      // load is still in flight — wait for both rather than deriving with
      // a not-yet-known target language or date.
      return { status: "loading" };
    }

    if (todayISOStatus === "error") {
      // LearningSection's shared date request genuinely failed — it
      // already shows the one parent-level error/retry banner. This card
      // must not present data judged against a date it doesn't have, and
      // must not present an "empty stats" summary as though it were
      // successfully loaded data: a failed date fetch is not the same as
      // "no streak history". See "blocked" in LoadState above.
      return { status: "blocked" };
    }

    if (!practiceLanguage || !todayISO) {
      // No target language yet, or todayISOStatus is "unavailable" (signed
      // out / no session — a legitimate, expected state, not a failure) —
      // same empty fallback either way.
      return { status: "ready", stats: [] };
    }

    if (dailyStatsStatus === "idle" || dailyStatsStatus === "loading") {
      return { status: "loading" };
    }

    // A same-context dailyStatsStatus "error" falls through to "ready,
    // empty stats" below, matching this card's own pre-Phase-1
    // fetch-failure behavior (its old catch block never surfaced a
    // distinct error state for its own read — only a shared todayISO
    // failure gets "blocked").
    return { status: "ready", stats: dailyStatsRows };
  }, [authUserId, isProfileLoaded, practiceLanguage, todayISO, todayISOStatus, dailyStatsStatus, dailyStatsRows]);

  // Covers both a genuine in-flight fetch ("loading") and a parent-level
  // date error this card can't act on ("blocked") — both render the same
  // neutral skeleton placeholder below, never the numeric streak/week
  // display computed from EMPTY_SUMMARY.
  const isLoading = state.status !== "ready";
  const stats = state.status === "ready" ? state.stats : [];
  // Recomputed on every render (not cached in state) purely from the
  // already-fetched stats and today's date — computeDailyStreakSummary
  // takes no current-goal input at all, so there is nothing here that a
  // Daily Goal change elsewhere on the page could feed into a past day's
  // completion. A row with its own stored snapshot always uses that; a
  // legacy row with none always uses the same fixed fallback regardless of
  // what the live profile goal is today.
  //
  // Today's own square does repaint promptly after a successful goal save:
  // DailyGoalSelector.tsx fires notifyDailyStatsChanged() on success, which
  // refreshes the shared dailyStatsRows in the background and picks up the
  // updated stored snapshot update_daily_goal just wrote to today's row
  // server-side. A failed save never fires that signal, so `stats` — and
  // this summary — stay exactly as they were; there is no optimistic
  // update anywhere in this path, only a genuine refresh of authoritative
  // data.
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
