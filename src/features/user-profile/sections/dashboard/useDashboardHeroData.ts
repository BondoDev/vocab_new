import { useMemo } from "react";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { findTodayNewWordsCompleted } from "../../../../data/learning/dailyStreak";
import type { DailyStreakStatRow, MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { SharedLazyResourceStatus } from "../useProfileSharedDailyStats";

// Dashboard hero card's own view of today's new-word count and recent daily
// stats — the same two figures the Learning page's TodayProgressCard and
// DailyStreakCard show, combined into a single unified card rather than two
// separate ones.
//
// Fetch-audit Phase 1: this is no longer a fetch effect. Both figures are
// now pure derivations over the shared, unbounded user_daily_stats rows
// UserProfileDashboardPage's useProfileSharedDailyStats owns (dailyStatsRows
// below) — completedToday is that array's own row for todayISO
// (findTodayNewWordsCompleted), and streakStats is the array itself (a
// MilestoneDailyStatRow[] satisfies DailyStreakStatRow[] structurally: it
// carries dateISO/newWordsCompleted/dailyGoal plus more). Dashboard and
// Learning are still mutually exclusive (only one is ever mounted at a
// time — see UserProfileDashboardPage.tsx), so there was never a second
// *concurrent* fetch for the same data even before this phase; now there is
// no second fetch *at all* on a Dashboard <-> Learning switch, since both
// read the one shared array requested once per (authUserId,
// targetLanguage) context.
export type DashboardHeroDataStatus = "loading" | "ready" | "blocked" | "error";

export interface DashboardHeroData {
  status: DashboardHeroDataStatus;
  completedToday: number;
  streakStats: DailyStreakStatRow[];
}

interface UseDashboardHeroDataParams {
  isProfileLoaded: boolean;
  practiceLanguage: UserProfile["practiceLanguage"];
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  // The shared daily-stats resource — see this file's own header.
  dailyStatsStatus: SharedLazyResourceStatus;
  dailyStatsRows: MilestoneDailyStatRow[];
}

const LOADING_STATE: DashboardHeroData = { status: "loading", completedToday: 0, streakStats: [] };

export function useDashboardHeroData({
  isProfileLoaded,
  practiceLanguage,
  todayISO,
  todayISOStatus,
  dailyStatsStatus,
  dailyStatsRows,
}: UseDashboardHeroDataParams): DashboardHeroData {
  const { authUserId } = useAuthSession();

  return useMemo<DashboardHeroData>(() => {
    if (!authUserId) {
      // Signed-out visitor: trivially "nothing yet" — same safe, silent
      // fallback as TodayProgressCard/DailyStreakCard for the same case.
      return { status: "ready", completedToday: 0, streakStats: [] };
    }

    if (!isProfileLoaded || todayISOStatus === "loading") {
      return LOADING_STATE;
    }

    if (todayISOStatus === "error") {
      // The shared learning-date request failed — mirrors TodayProgressCard/
      // DailyStreakCard's own "blocked" handling: this hook must not present
      // data judged against a date it doesn't have, and must not present an
      // empty result as though it were successfully loaded data.
      return { status: "blocked", completedToday: 0, streakStats: [] };
    }

    if (!practiceLanguage || !todayISO) {
      // No target language chosen yet, or todayISOStatus is "unavailable"
      // (signed out / no session) — same empty-but-safe fallback.
      return { status: "ready", completedToday: 0, streakStats: [] };
    }

    if (dailyStatsStatus === "idle" || dailyStatsStatus === "loading") {
      return LOADING_STATE;
    }

    if (dailyStatsStatus === "error") {
      // Deliberately a distinct "error" status rather than the sibling
      // cards' silent-fallback-to-zero precedent: the hero's right-side CTA
      // makes a routing decision from this data (Continue Learning vs.
      // Review Words), so a failed read must not be indistinguishable from
      // a genuine "0 completed" — see resolveDashboardHeroCta's
      // isTodayDataTrusted parameter, which this status feeds directly.
      return { status: "error", completedToday: 0, streakStats: [] };
    }

    return {
      status: "ready",
      completedToday: findTodayNewWordsCompleted(dailyStatsRows, todayISO),
      streakStats: dailyStatsRows,
    };
  }, [authUserId, isProfileLoaded, practiceLanguage, todayISO, todayISOStatus, dailyStatsStatus, dailyStatsRows]);
}
