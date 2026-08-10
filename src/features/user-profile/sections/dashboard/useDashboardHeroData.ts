import { useEffect, useState } from "react";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import {
  readTodayNewWordsCompleted,
  readDailyStreakStats,
  type DailyStreakStatRow,
} from "../../../../lib/newWordProgress";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";

// Dashboard hero card's own read of today's new-word count and recent daily
// stats — the same two reads the Learning page's TodayProgressCard and
// DailyStreakCard already make (readTodayNewWordsCompleted/
// readDailyStreakStats, both from src/lib/newWordProgress.ts), combined
// into a single effect since the hero shows both in one unified card
// rather than two separate ones. This is *not* a duplicate loader: the
// Dashboard and Learning sections are mutually exclusive (only one is ever
// mounted at a time — see UserProfileDashboardPage.tsx), so there is never
// a second concurrent fetch for the same data, only the same read function
// invoked from whichever section is actually visible. todayISO/
// todayISOStatus/practiceLanguage still come from the shared
// useProfileSharedProgressData/App.tsx profile load, exactly as they do for
// the Learning page's cards — this hook never calls getCurrentLearningDate
// itself.
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
}

const LOADING_STATE: DashboardHeroData = { status: "loading", completedToday: 0, streakStats: [] };

export function useDashboardHeroData({
  isProfileLoaded,
  practiceLanguage,
  todayISO,
  todayISOStatus,
}: UseDashboardHeroDataParams): DashboardHeroData {
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<DashboardHeroData>(LOADING_STATE);

  useEffect(() => {
    if (!authUserId) {
      // Signed-out visitor: trivially "nothing yet" — same safe, silent
      // fallback as TodayProgressCard/DailyStreakCard for the same case.
      setState({ status: "ready", completedToday: 0, streakStats: [] });
      return;
    }

    if (!isProfileLoaded || todayISOStatus === "loading") {
      setState(LOADING_STATE);
      return;
    }

    if (todayISOStatus === "error") {
      // The shared learning-date request failed — mirrors TodayProgressCard/
      // DailyStreakCard's own "blocked" handling: this hook must not read
      // with a date it doesn't have, and must not present an empty result
      // as though it were successfully loaded data.
      setState({ status: "blocked", completedToday: 0, streakStats: [] });
      return;
    }

    if (!practiceLanguage || !todayISO) {
      // No target language chosen yet, or todayISOStatus is "unavailable"
      // (signed out / no session) — same empty-but-safe fallback.
      setState({ status: "ready", completedToday: 0, streakStats: [] });
      return;
    }

    let cancelled = false;
    setState(LOADING_STATE);

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "ready", completedToday: 0, streakStats: [] });
          return;
        }

        const [completedToday, streakStats] = await Promise.all([
          readTodayNewWordsCompleted(session, practiceLanguage, todayISO),
          readDailyStreakStats(session, practiceLanguage, todayISO),
        ]);
        if (cancelled) return;
        setState({ status: "ready", completedToday, streakStats });
      } catch (error) {
        if (cancelled) return;
        // Deliberately a distinct "error" status rather than the sibling
        // cards' silent-fallback-to-zero precedent: the hero's right-side
        // CTA makes a routing decision from this data (Continue Learning vs
        // Review Words), so a failed read must not be indistinguishable
        // from a genuine "0 completed" — see resolveDashboardHeroCta's
        // isTodayDataTrusted parameter, which this status feeds directly.
        console.warn(
          "useDashboardHeroData: failed to load today's progress/streak stats.",
          describeSupabaseError("useDashboardHeroData", error),
        );
        setState({ status: "error", completedToday: 0, streakStats: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, isProfileLoaded, practiceLanguage, todayISO, todayISOStatus]);

  return state;
}
