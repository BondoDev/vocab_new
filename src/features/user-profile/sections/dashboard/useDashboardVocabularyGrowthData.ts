import { useMemo } from "react";
import { computeVocabularyCounts } from "../../../../data/learning/vocabularyCategory";
import {
  applyCurrentDayOverride,
  computeVocabularyGrowthHistory,
  resolveWordCreatedDateISO,
  type VocabularyGrowthDayCounts,
  type VocabularyGrowthEventInput,
  type VocabularyGrowthWordInput,
} from "../../../../data/learning/vocabularyGrowth";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import type { UserWordProgressFullRow, VocabularyGrowthEventRow } from "../../../../lib/newWordProgress";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { SharedLazyResourceStatus } from "../useProfileSharedDailyStats";

export type DashboardVocabularyGrowthStatus = "loading" | "ready" | "blocked" | "error";

interface DashboardVocabularyGrowthState {
  status: DashboardVocabularyGrowthStatus;
  history: VocabularyGrowthDayCounts[];
}

interface UseDashboardVocabularyGrowthDataParams {
  isProfileLoaded: boolean;
  practiceLanguage: UserProfile["practiceLanguage"];
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  // The shared vocabulary-growth-events resource — see
  // useProfileSharedDailyStats.ts's own header.
  vocabularyGrowthStatus: SharedLazyResourceStatus;
  vocabularyGrowthEvents: VocabularyGrowthEventRow[];
}

// Fetch-audit Phase 1: prior to this phase, this hook owned its own fetch
// effect (one call to readVocabularyGrowthEvents per Dashboard mount,
// duplicating Progress's VocabularyGrowthSection reading the exact same RPC
// on its own mount — see the fetch audit's FETCH-002). It is now a pure
// combination of the shared vocabulary-growth-events resource with the
// already-shared wordProgressRows, reusing the exact same reconstruction
// engine (computeVocabularyGrowthHistory/applyCurrentDayOverride/
// resolveWordCreatedDateISO) loadVocabularyGrowthHistory.ts (Progress) also
// calls — no forked copy of the algorithm.
export function useDashboardVocabularyGrowthData({
  isProfileLoaded,
  practiceLanguage,
  todayISO,
  todayISOStatus,
  wordProgressRows,
  wordProgressStatus,
  vocabularyGrowthStatus,
  vocabularyGrowthEvents,
}: UseDashboardVocabularyGrowthDataParams): DashboardVocabularyGrowthState {
  const { authUserId } = useAuthSession();

  return useMemo<DashboardVocabularyGrowthState>(() => {
    if (!authUserId || !practiceLanguage) {
      return { status: "ready", history: [] };
    }

    if (!isProfileLoaded || todayISOStatus === "loading" || wordProgressStatus === "loading") {
      return { status: "loading", history: [] };
    }

    if (todayISOStatus === "error" || wordProgressStatus === "error" || !todayISO) {
      return { status: "blocked", history: [] };
    }

    if (vocabularyGrowthStatus === "idle" || vocabularyGrowthStatus === "loading") {
      return { status: "loading", history: [] };
    }

    if (vocabularyGrowthStatus === "error") {
      return { status: "error", history: [] };
    }

    try {
      const words: VocabularyGrowthWordInput[] = [];
      for (const row of wordProgressRows) {
        const createdDateISO = resolveWordCreatedDateISO(row.firstStudiedStatDate, row.createdAt ?? "");
        if (createdDateISO !== null) {
          words.push({ wordProgressId: row.id, createdDateISO });
        }
      }

      const events: VocabularyGrowthEventInput[] = vocabularyGrowthEvents.map((row) => ({
        wordProgressId: row.wordProgressId,
        previousState: row.previousState,
        newState: row.newState,
        eventDateISO: row.eventDateISO,
      }));

      const currentCounts = computeVocabularyCounts(wordProgressRows);
      const history = applyCurrentDayOverride(
        computeVocabularyGrowthHistory(words, events, todayISO),
        todayISO,
        {
          learning: currentCounts.learning,
          known: currentCounts.known,
          mastered: currentCounts.mastered,
        },
      );

      return { status: "ready", history };
    } catch (error) {
      console.warn("useDashboardVocabularyGrowthData: failed to compute vocabulary growth history.", error);
      return { status: "error", history: [] };
    }
  }, [
    authUserId,
    isProfileLoaded,
    practiceLanguage,
    todayISO,
    todayISOStatus,
    wordProgressRows,
    wordProgressStatus,
    vocabularyGrowthStatus,
    vocabularyGrowthEvents,
  ]);
}
