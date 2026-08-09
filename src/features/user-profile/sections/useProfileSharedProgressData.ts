import { useEffect, useRef, useState } from "react";
import { getStoredSupabaseSession } from "../../../lib/supabaseAuth";
import { getCurrentLearningDate } from "../../../lib/learningDate";
import { describeSupabaseError } from "../../../lib/supabaseError";
import { readUserWordProgress, type UserWordProgressFullRow } from "../../../lib/newWordProgress";
import { subscribeWordProgressChanged } from "../../../lib/sharedProgressInvalidation";

// Phase 1 of the authenticated profile-section data optimization: the
// single frontend owner, for the whole /profile dashboard, of the two
// data sources every one of Learning/Vocabulary/Progress independently
// re-fetched before this hook existed:
//
//   - the authoritative current learning date (getCurrentLearningDate,
//     previously owned by LearningSection alone — see that file's git
//     history and src/features/user-profile/sections/learning/README.md);
//   - the signed-in user's active-target-language user_word_progress rows
//     (readUserWordProgress, previously fetched separately by
//     VocabularySection/loadVocabularyProgress.ts,
//     MilestonesSection/loadMilestoneMetrics.ts, and
//     VocabularyGrowthSection/loadVocabularyGrowthHistory.ts).
//
// Called exactly once, from UserProfileDashboardPage (the common parent of
// all three sections) — every section below it receives both values (plus
// their status/retry) as props instead of fetching either itself. Because
// UserProfileDashboardPage only unmounts the *inactive* section, not
// itself, this means Learning -> Vocabulary -> Progress -> Learning now
// causes at most one call to each RPC for an unchanged (authUserId,
// targetLanguage/timezone) context, instead of refetching on every section
// switch.
//
// user_daily_stats (daily streak rows, milestone review/streak stats,
// vocabulary-growth events) stays exactly as it was: each section still
// owns its own fetch of whatever it still needs beyond these two shared
// sources. This hook deliberately does not grow to cover that in Phase 1.
export type ProfileSharedDataStatus = "loading" | "ready" | "unavailable" | "error";

interface LearningDateState {
  status: ProfileSharedDataStatus;
  todayISO: string | null;
}

interface WordProgressState {
  status: ProfileSharedDataStatus;
  rows: UserWordProgressFullRow[];
}

export interface ProfileSharedProgressData {
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  retryLearningDate: () => void;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  retryWordProgress: () => void;
}

export interface UseProfileSharedProgressDataParams {
  authUserId: string | null;
  isProfileLoaded: boolean;
  // The active practice/target language — user_word_progress rows are
  // language-specific (see loadMilestoneMetrics.ts's own precedent);
  // switching it must show that language's own rows, never a stale
  // cross-language set. Deliberately not a dependency of the date effect
  // below — the authoritative date does not depend on the target language.
  targetLanguage: string;
  // user_profiles.timezone (null until the profile loads or a session has
  // no stored timezone yet). A dependency of the date effect only: the
  // authoritative date is resolved server-side from this column (see
  // supabase/migrations/20260806150000_add_server_derived_learning_dates.sql),
  // so if it changes mid-session (most commonly useUserProfileLoad's own
  // initializeUserTimezone call resolving shortly after the first render)
  // the already-fetched date must be refreshed instead of silently staying
  // pinned to whatever was resolved before the timezone was known.
  timezone: string | null;
}

const LOADING_DATE_STATE: LearningDateState = { status: "loading", todayISO: null };
const LOADING_PROGRESS_STATE: WordProgressState = { status: "loading", rows: [] };

export function useProfileSharedProgressData({
  authUserId,
  isProfileLoaded,
  targetLanguage,
  timezone,
}: UseProfileSharedProgressDataParams): ProfileSharedProgressData {
  const [dateState, setDateState] = useState<LearningDateState>(LOADING_DATE_STATE);
  const [dateRetryToken, setDateRetryToken] = useState(0);
  // The authUserId the currently-held dateState.todayISO (if any) was
  // resolved for — used only to tell a genuine account change (must hard
  // reset) apart from a same-account refresh (timezone change / retry;
  // must preserve the already-loaded date so dependent counters never
  // flash back to a loading skeleton for data that hasn't actually
  // changed).
  const loadedDateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authUserId) {
      loadedDateKeyRef.current = null;
      setDateState({ status: "unavailable", todayISO: null });
      return;
    }

    if (!isProfileLoaded) {
      // useUserProfileLoad flips isProfileLoaded to false for the whole
      // duration of a new user's profile load (including across an
      // account switch), so this branch is also what correctly hard-resets
      // a previous account's cached date instead of ever showing it for a
      // different signed-in user.
      loadedDateKeyRef.current = null;
      setDateState(LOADING_DATE_STATE);
      return;
    }

    const requestKey = authUserId;
    const isSameContext = loadedDateKeyRef.current === requestKey;
    let cancelled = false;

    setDateState((prev) => (isSameContext && prev.status === "ready" ? prev : LOADING_DATE_STATE));

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) {
            loadedDateKeyRef.current = null;
            setDateState({ status: "unavailable", todayISO: null });
          }
          return;
        }

        const todayISO = await getCurrentLearningDate(session);
        if (cancelled) return;
        loadedDateKeyRef.current = requestKey;
        setDateState({ status: "ready", todayISO });
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "useProfileSharedProgressData: failed to load the current learning date.",
          describeSupabaseError("getCurrentLearningDate", error),
        );
        // A same-context background refresh failure (timezone change/retry
        // on an already-loaded date) keeps the previous ready value instead
        // of regressing every dependent section to its error state; only a
        // genuine first-load failure for this account surfaces "error".
        setDateState((prev) => (isSameContext && prev.status === "ready" ? prev : { status: "error", todayISO: null }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, isProfileLoaded, timezone, dateRetryToken]);

  const [progressState, setProgressState] = useState<WordProgressState>(LOADING_PROGRESS_STATE);
  const [progressRetryToken, setProgressRetryToken] = useState(0);
  const [invalidationVersion, setInvalidationVersion] = useState(0);
  // `${authUserId}:${targetLanguage}` the currently-held progressState.rows
  // (if any) belong to — same hard-reset-vs-preserve role as
  // loadedDateKeyRef above, keyed on both account and active language since
  // these rows are language-scoped.
  const loadedProgressKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // completeNewWordStudy/completeWordReview (src/lib/newWordProgress.ts)
    // call notifyWordProgressChanged() after a successful write — this is
    // the narrow invalidation/refetch mechanism for the shared rows, not
    // dependent on UserProfileDashboardPage happening to unmount/remount
    // across a route change.
    return subscribeWordProgressChanged(() => {
      setInvalidationVersion((version) => version + 1);
    });
  }, []);

  useEffect(() => {
    if (!authUserId) {
      loadedProgressKeyRef.current = null;
      setProgressState({ status: "unavailable", rows: [] });
      return;
    }

    if (!isProfileLoaded) {
      loadedProgressKeyRef.current = null;
      setProgressState(LOADING_PROGRESS_STATE);
      return;
    }

    if (!targetLanguage) {
      loadedProgressKeyRef.current = null;
      setProgressState({ status: "unavailable", rows: [] });
      return;
    }

    const requestKey = `${authUserId}:${targetLanguage}`;
    const isSameContext = loadedProgressKeyRef.current === requestKey;
    let cancelled = false;

    setProgressState((prev) =>
      isSameContext && prev.status === "ready" ? prev : { status: "loading", rows: isSameContext ? prev.rows : [] },
    );

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) {
            loadedProgressKeyRef.current = null;
            setProgressState({ status: "unavailable", rows: [] });
          }
          return;
        }

        const rows = await readUserWordProgress(session, targetLanguage);
        if (cancelled) return;
        loadedProgressKeyRef.current = requestKey;
        setProgressState({ status: "ready", rows });
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "useProfileSharedProgressData: failed to load active-language word progress.",
          describeSupabaseError("readUserWordProgress", error),
        );
        // Same preserve-on-refresh rule as the date effect above: a
        // same-context background refresh failure (retry/invalidation)
        // keeps the previously-loaded rows so counters never visually
        // reset to zero; only a genuine first load for this account+
        // language surfaces "error".
        setProgressState((prev) => (isSameContext && prev.status === "ready" ? prev : { status: "error", rows: [] }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, isProfileLoaded, targetLanguage, progressRetryToken, invalidationVersion]);

  return {
    todayISO: dateState.todayISO,
    todayISOStatus: dateState.status,
    retryLearningDate: () => setDateRetryToken((token) => token + 1),
    wordProgressRows: progressState.rows,
    wordProgressStatus: progressState.status,
    retryWordProgress: () => setProgressRetryToken((token) => token + 1),
  };
}
