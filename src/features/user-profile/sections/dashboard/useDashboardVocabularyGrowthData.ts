import { useEffect, useState } from "react";
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
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { readVocabularyGrowthEvents, type UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";

export type DashboardVocabularyGrowthStatus = "loading" | "ready" | "blocked" | "error";

interface DashboardVocabularyGrowthState {
  status: DashboardVocabularyGrowthStatus;
  history: VocabularyGrowthDayCounts[];
}

interface DashboardVocabularyGrowthData extends DashboardVocabularyGrowthState {
  retry: () => void;
}

interface UseDashboardVocabularyGrowthDataParams {
  isProfileLoaded: boolean;
  practiceLanguage: UserProfile["practiceLanguage"];
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
}

const LOADING_STATE: DashboardVocabularyGrowthState = { status: "loading", history: [] };

export function useDashboardVocabularyGrowthData({
  isProfileLoaded,
  practiceLanguage,
  todayISO,
  todayISOStatus,
  wordProgressRows,
  wordProgressStatus,
}: UseDashboardVocabularyGrowthDataParams): DashboardVocabularyGrowthData {
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<DashboardVocabularyGrowthState>(LOADING_STATE);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!authUserId || !practiceLanguage) {
      setState({ status: "ready", history: [] });
      return;
    }

    if (!isProfileLoaded || todayISOStatus === "loading" || wordProgressStatus === "loading") {
      setState(LOADING_STATE);
      return;
    }

    if (todayISOStatus === "error" || wordProgressStatus === "error" || !todayISO) {
      setState({ status: "blocked", history: [] });
      return;
    }

    let cancelled = false;
    setState(LOADING_STATE);

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "ready", history: [] });
          return;
        }

        const eventRows = await readVocabularyGrowthEvents(session, practiceLanguage);
        if (cancelled) return;

        const words: VocabularyGrowthWordInput[] = [];
        for (const row of wordProgressRows) {
          const createdDateISO = resolveWordCreatedDateISO(row.firstStudiedStatDate, row.createdAt ?? "");
          if (createdDateISO !== null) {
            words.push({ wordProgressId: row.id, createdDateISO });
          }
        }

        const events: VocabularyGrowthEventInput[] = eventRows.map((row) => ({
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

        setState({ status: "ready", history });
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "useDashboardVocabularyGrowthData: failed to load vocabulary growth history.",
          describeSupabaseError("useDashboardVocabularyGrowthData", error),
        );
        setState({ status: "error", history: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authUserId,
    isProfileLoaded,
    practiceLanguage,
    todayISO,
    todayISOStatus,
    wordProgressRows,
    wordProgressStatus,
    retryToken,
  ]);

  return { ...state, retry: () => setRetryToken((token) => token + 1) };
}
