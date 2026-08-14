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

  // Fetch-audit Phase 2A: the authUserId a getCurrentLearningDate() request
  // is *currently in flight* for — distinct from loadedDateKeyRef above.
  // Live-network verification found a genuine duplicate-request race: this
  // effect has no lazy "already requested" gate at all (unlike
  // useProfileSharedDailyStats.ts's request()-gated design) — it fires the
  // fetch unconditionally every time it runs. On a fresh authenticated load
  // it was observed (live network capture) to run for the same authUserId
  // three times in quick succession — useUserProfileLoad's own effect
  // briefly reports isProfileLoaded as true (its "signed-out visitor,
  // trivially known" branch, from the render where authUserId is still
  // null) one render before authUserId resolves, then flips isProfileLoaded
  // back to false once it starts genuinely loading that user's profile,
  // then true again once the load finishes — so this effect legitimately
  // re-runs multiple times for the *same* authUserId before settling,
  // twice reaching the fetch branch and firing two real
  // get_current_learning_date requests. This ref makes "a request for this
  // authUserId is already running" independently checkable, synchronously,
  // regardless of which dependency triggered the re-run, and — critically
  // — is also what a
  // settling attempt checks before applying its own result, *instead of*
  // the usual per-effect-invocation `cancelled` closure: the intermediate
  // isProfileLoaded-false render in the sequence above still runs this
  // effect's cleanup for the in-flight attempt (React calls the previous
  // invocation's cleanup on every re-run, not only on unmount), which would
  // incorrectly mark a perfectly-valid in-flight request as stale and
  // discard its result — even though get_current_learning_date takes no
  // client-supplied timezone parameter at all (see
  // src/lib/learningDate.ts), so that request was never actually invalid.
  // Gating on this ref instead of a `cancelled` closure means the one
  // request that does start always gets to apply its result once it
  // resolves, and is only superseded by a genuine authUserId change.
  const inFlightDateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authUserId) {
      loadedDateKeyRef.current = null;
      inFlightDateKeyRef.current = null;
      setDateState({ status: "unavailable", todayISO: null });
      return;
    }

    if (!isProfileLoaded) {
      // useUserProfileLoad flips isProfileLoaded to false for the whole
      // duration of a new user's profile load (including across an
      // account switch), so this branch is also what correctly hard-resets
      // a previous account's cached date instead of ever showing it for a
      // different signed-in user. Deliberately does NOT touch
      // inFlightDateKeyRef: a request already in flight for this same
      // authUserId (started on an earlier render — see that ref's own
      // header) remains the one and only attempt whose result should be
      // applied once isProfileLoaded genuinely settles back to true; only
      // a real authUserId change (above) invalidates it.
      loadedDateKeyRef.current = null;
      setDateState(LOADING_DATE_STATE);
      return;
    }

    const requestKey = authUserId;
    const isSameContext = loadedDateKeyRef.current === requestKey;

    if (inFlightDateKeyRef.current === requestKey) {
      // Already fetching this exact user — join the existing attempt
      // rather than starting a second one. That attempt's own resolution
      // (below) applies its result as long as inFlightDateKeyRef still
      // names it as current, regardless of which particular effect
      // invocation originally started it.
      return;
    }

    inFlightDateKeyRef.current = requestKey;
    setDateState((prev) => (isSameContext && prev.status === "ready" ? prev : LOADING_DATE_STATE));

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (inFlightDateKeyRef.current === requestKey) {
            inFlightDateKeyRef.current = null;
            loadedDateKeyRef.current = null;
            setDateState({ status: "unavailable", todayISO: null });
          }
          return;
        }

        const todayISO = await getCurrentLearningDate(session);
        // Applied only if this attempt still owns requestKey's in-flight
        // slot — false only once a genuine authUserId change has since
        // claimed it (the guard above already prevents a second concurrent
        // attempt for the same key, so this can never be "superseded by a
        // newer attempt for the same user").
        if (inFlightDateKeyRef.current !== requestKey) return;
        inFlightDateKeyRef.current = null;
        loadedDateKeyRef.current = requestKey;
        setDateState({ status: "ready", todayISO });
      } catch (error) {
        if (inFlightDateKeyRef.current !== requestKey) return;
        inFlightDateKeyRef.current = null;
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
