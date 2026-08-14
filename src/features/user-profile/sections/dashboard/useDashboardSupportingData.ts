import { useMemo } from "react";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import type { MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { SharedLazyResourceStatus } from "../useProfileSharedDailyStats";

// The Dashboard's view over the shared daily-stats resource for its three
// data-driven supporting cards (Study Activity, Words Learned, Milestone
// Preview): one unbounded, language-scoped user_daily_stats array (see
// useProfileSharedDailyStats.ts — readMilestoneDailyStats, widened to also
// carry daily_goal), requested exactly once per (authUserId, targetLanguage)
// context by DashboardSection's own mount effect and shared with Progress's
// MilestonesSection when the user switches there — never fetched here.
// Each card then derives its own display from this same raw array via its
// own pure engine (studyActivity.ts / wordsLearnedSummary.ts /
// milestones.ts's evaluateAllMilestoneTracks) — no card re-fetches, and no
// card's pure math duplicates another's.
//
// Fetch-audit Phase 1: prior to this phase, this hook owned its own fetch
// effect (one call to readMilestoneDailyStats per Dashboard mount,
// duplicating Progress's MilestonesSection reading the exact same table/
// RPC on its own mount — see the fetch audit's FETCH-001). It is now a pure
// mapping from the shared resource's status/rows to this card group's own
// status contract; DashboardSection owns requesting/retrying the shared
// resource and passes both straight through as props.
//
// The Dashboard's fourth supporting card (Vocabulary Overview) needs no
// read of its own at all — it derives entirely from wordProgressRows,
// already shared via UserProfileDashboardPage's useProfileSharedProgressData.
export type DashboardSupportingDataStatus = "loading" | "ready" | "blocked" | "error";

export interface DashboardSupportingData {
  status: DashboardSupportingDataStatus;
  dailyStats: MilestoneDailyStatRow[];
}

interface UseDashboardSupportingDataParams {
  isProfileLoaded: boolean;
  practiceLanguage: UserProfile["practiceLanguage"];
  todayISOStatus: ProfileSharedDataStatus;
  dailyStatsStatus: SharedLazyResourceStatus;
  dailyStatsRows: MilestoneDailyStatRow[];
}

export function useDashboardSupportingData({
  isProfileLoaded,
  practiceLanguage,
  todayISOStatus,
  dailyStatsStatus,
  dailyStatsRows,
}: UseDashboardSupportingDataParams): DashboardSupportingData {
  const { authUserId } = useAuthSession();

  return useMemo<DashboardSupportingData>(() => {
    if (!authUserId) {
      // Signed-out visitor: trivially "no activity yet" — same safe,
      // silent fallback as the hero's own view for the same case.
      return { status: "ready", dailyStats: [] };
    }

    if (!isProfileLoaded || todayISOStatus === "loading") {
      return { status: "loading", dailyStats: [] };
    }

    if (todayISOStatus === "error") {
      // The shared learning-date request failed — mirrors
      // useDashboardHeroData's "blocked" handling: don't present the shared
      // rows as though todayISO-dependent context were also resolved.
      return { status: "blocked", dailyStats: [] };
    }

    if (!practiceLanguage) {
      return { status: "ready", dailyStats: [] };
    }

    if (dailyStatsStatus === "idle" || dailyStatsStatus === "loading") {
      return { status: "loading", dailyStats: [] };
    }

    if (dailyStatsStatus === "error") {
      return { status: "error", dailyStats: [] };
    }

    return { status: "ready", dailyStats: dailyStatsRows };
  }, [authUserId, isProfileLoaded, practiceLanguage, todayISOStatus, dailyStatsStatus, dailyStatsRows]);
}
