import { useEffect, useState } from "react";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { readMilestoneDailyStats, type MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";

// The Dashboard's single shared read for its three data-driven supporting
// cards (Study Activity, Words Learned, Milestone Preview): one unbounded,
// language-scoped user_daily_stats read (readMilestoneDailyStats — the
// same function loadMilestoneMetrics.ts already uses for the Progress
// page's Milestones section), fetched exactly once here rather than once
// per card. Each card then derives its own display from this same raw
// array via its own pure engine (studyActivity.ts / wordsLearnedSummary.ts
// / milestones.ts's evaluateAllMilestoneTracks) — no card re-fetches, and
// no card's pure math duplicates another's.
//
// Documented data-loading choice (see the Phase brief's "Date Range
// Loading" section): readMilestoneDailyStats is already a *single*,
// unbounded read (no date filter at all — see its own header in
// newWordProgress.ts) rather than a bounded 7-day query. Reusing it as-is
// means Study Activity's "View all activity" expansion (7d/30d/90d/all)
// needs no additional network request when the user switches ranges —
// the full history is already in memory, and every range is just a
// different pure aggregation over the same array. This trades a slightly
// larger initial payload for zero additional round-trips on expansion;
// revisit with a bounded-then-lazy-load split only if real account
// histories grow large enough to make the unbounded read noticeably slow
// (no evidence of that yet — the Milestones page has shipped the same
// unbounded read since Milestones Phase 1).
//
// The Dashboard's fourth supporting card (Vocabulary Overview) needs no
// read of its own at all — it derives entirely from wordProgressRows,
// already shared via UserProfileDashboardPage's useProfileSharedProgressData.
export type DashboardSupportingDataStatus = "loading" | "ready" | "blocked" | "error";

export interface DashboardSupportingData {
  status: DashboardSupportingDataStatus;
  dailyStats: MilestoneDailyStatRow[];
  retry: () => void;
}

interface UseDashboardSupportingDataParams {
  isProfileLoaded: boolean;
  practiceLanguage: UserProfile["practiceLanguage"];
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
}

interface InternalState {
  status: DashboardSupportingDataStatus;
  dailyStats: MilestoneDailyStatRow[];
}

const LOADING_STATE: InternalState = { status: "loading", dailyStats: [] };

export function useDashboardSupportingData({
  isProfileLoaded,
  practiceLanguage,
  todayISO,
  todayISOStatus,
}: UseDashboardSupportingDataParams): DashboardSupportingData {
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<InternalState>(LOADING_STATE);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!authUserId) {
      // Signed-out visitor: trivially "no activity yet" — same safe,
      // silent fallback as the hero's own data hook for the same case.
      setState({ status: "ready", dailyStats: [] });
      return;
    }

    if (!isProfileLoaded || todayISOStatus === "loading") {
      setState(LOADING_STATE);
      return;
    }

    if (todayISOStatus === "error") {
      // The shared learning-date request failed — mirrors
      // useDashboardHeroData's "blocked" handling: don't present an empty
      // read as though it were successfully loaded data.
      setState({ status: "blocked", dailyStats: [] });
      return;
    }

    if (!practiceLanguage) {
      setState({ status: "ready", dailyStats: [] });
      return;
    }

    let cancelled = false;
    setState(LOADING_STATE);

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "ready", dailyStats: [] });
          return;
        }

        const dailyStats = await readMilestoneDailyStats(session, practiceLanguage);
        if (cancelled) return;
        setState({ status: "ready", dailyStats });
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "useDashboardSupportingData: failed to load daily stats.",
          describeSupabaseError("useDashboardSupportingData", error),
        );
        setState({ status: "error", dailyStats: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
    // practiceLanguage is a dependency so switching the active target
    // language re-fetches that language's own rows — see the Phase
    // brief's "Language Isolation" requirement; readMilestoneDailyStats
    // itself is also scoped by target_language server-side.
  }, [authUserId, isProfileLoaded, practiceLanguage, todayISO, todayISOStatus, retryToken]);

  return { ...state, retry: () => setRetryToken((token) => token + 1) };
}
