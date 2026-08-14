import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredSupabaseSession, type StoredSupabaseSession } from "../../../lib/supabaseAuth";
import { describeSupabaseError } from "../../../lib/supabaseError";
import {
  readMilestoneDailyStats,
  readVocabularyGrowthEvents,
  type MilestoneDailyStatRow,
  type VocabularyGrowthEventRow,
} from "../../../lib/newWordProgress";
import {
  subscribeDailyStatsChanged,
  subscribeVocabularyGrowthChanged,
} from "../../../lib/sharedProgressInvalidation";

// Fetch-audit Phase 1 of the profile-section data optimization (the
// follow-up to Phase 1's useProfileSharedProgressData.ts, which gave the
// current learning date and active-language user_word_progress rows a
// single shared owner). This hook is the equivalent single shared owner,
// for the whole /profile dashboard, of the two remaining datasets that
// Dashboard/Learning/Progress previously each fetched independently on
// their own mount:
//
//   - the unbounded, language-scoped user_daily_stats rows
//     (readMilestoneDailyStats, previously also fetched separately — under
//     three different narrower shapes — by useDashboardHeroData's
//     readTodayNewWordsCompleted/readDailyStreakStats calls, Learning's
//     TodayProgressCard/DailyStreakCard, and MilestonesSection);
//   - the vocabulary-growth review_events (readVocabularyGrowthEvents,
//     previously fetched separately by useDashboardVocabularyGrowthData and
//     VocabularyGrowthSection).
//
// Unlike useProfileSharedProgressData, this hook is deliberately LAZY, not
// eager: Vocabulary/My Lists/Settings never need either dataset, so
// UserProfileDashboardPage must not fetch them just because /profile
// mounted. Each resource only starts loading the first time a consumer
// (Dashboard, Learning, or Progress) actually asks for it via
// requestDailyStats()/requestVocabularyGrowthEvents() — typically from that
// section's own top-level component, once per mount, mirroring how
// UserProfileDashboardPage calls useProfileSharedProgressData's fetches
// exactly once per section. A second ask for an already-loading/loaded
// (authUserId, targetLanguage) context is a no-op: no second network call.
//
// Cache key: (authUserId, targetLanguage) — same as
// useProfileSharedProgressData's word-progress rows, and for the same
// reason (user_daily_stats/review_events are both scoped by user_id AND
// target_language server-side; a language switch is a genuinely different
// data set). Deliberately NOT keyed by todayISO/timezone: neither
// underlying query filters by date at all (both are unbounded reads), so
// the rows a fresh fetch would return do not change when the resolved
// learning date does — only which row a consumer treats as "today" does,
// and that is a pure computation over the already-cached rows (see
// dailyStreak.ts's computeDailyStreakSummary/findTodayNewWordsCompleted,
// milestoneStreak.ts's computeMilestoneStreak, and
// vocabularyGrowth.ts's applyCurrentDayOverride — all take todayISO as a
// plain parameter already). A timezone change or a local-midnight rollover
// therefore recomputes correctly from the same cached rows, with zero
// extra requests; see this file's own header in the fetch audit report for
// the full reasoning.
export type SharedLazyResourceStatus = "idle" | "loading" | "ready" | "error";

export interface ProfileSharedDailyStatsData {
  dailyStatsStatus: SharedLazyResourceStatus;
  dailyStatsRows: MilestoneDailyStatRow[];
  // Idempotent: safe to call on every render/mount of a consumer that needs
  // this resource. A no-op once already loading/ready for the current
  // (authUserId, targetLanguage) context.
  requestDailyStats: () => void;
  // Forces a fresh fetch even from a "ready" or "error" state — wired to a
  // visible Retry control, matching useProfileSharedProgressData's own
  // retryLearningDate/retryWordProgress precedent.
  retryDailyStats: () => void;

  vocabularyGrowthStatus: SharedLazyResourceStatus;
  vocabularyGrowthEvents: VocabularyGrowthEventRow[];
  requestVocabularyGrowthEvents: () => void;
  retryVocabularyGrowthEvents: () => void;
}

export interface UseProfileSharedDailyStatsParams {
  authUserId: string | null;
  isProfileLoaded: boolean;
  // See useProfileSharedProgressData's own targetLanguage param comment —
  // same "language-scoped, not a dependency of anything date-related"
  // reasoning applies here.
  targetLanguage: string;
}

interface LazyRowsState<TRow> {
  // The (authUserId, targetLanguage) context these rows/this status belong
  // to — null only before any context has ever been resolved. Compared
  // against the live contextKey on every effect run to tell a genuine
  // context change (must hard-reset to idle, never show a previous
  // account's/language's rows) apart from a same-context request/retry/
  // invalidation (must keep serving already-loaded rows while a background
  // refresh is in flight).
  key: string | null;
  status: SharedLazyResourceStatus;
  rows: TRow[];
}

function idleState<TRow>(key: string | null): LazyRowsState<TRow> {
  return { key, status: "idle", rows: [] };
}

interface UseLazyKeyedRowsParams<TRow> {
  contextKey: string | null;
  targetLanguage: string;
  fetchRows: (session: StoredSupabaseSession, targetLanguage: string) => Promise<TRow[]>;
  subscribeInvalidation: (listener: () => void) => () => void;
  label: string;
}

interface LazyKeyedRows<TRow> {
  status: SharedLazyResourceStatus;
  rows: TRow[];
  request: () => void;
  retry: () => void;
}

// Private to this file — not a generalized query/cache library, just the
// one piece of bookkeeping (idle/loading/ready/error + key-scoped
// hard-reset-vs-preserve + lazy request gating + retry + invalidation
// subscription) that both resources below need identically, since
// readMilestoneDailyStats and readVocabularyGrowthEvents share the exact
// same (session, targetLanguage) => Promise<Row[]> shape. See this file's
// own header for why laziness (not an eager fetch-on-mount) matters here.
function useLazyKeyedRows<TRow>({
  contextKey,
  targetLanguage,
  fetchRows,
  subscribeInvalidation,
  label,
}: UseLazyKeyedRowsParams<TRow>): LazyKeyedRows<TRow> {
  const [state, setState] = useState<LazyRowsState<TRow>>(() => idleState(contextKey));
  const [requestVersion, setRequestVersion] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [invalidationVersion, setInvalidationVersion] = useState(0);

  // The context key a consumer has actually asked this resource to load
  // for — distinct from state.key (what's currently loaded/loading). null
  // means "nothing has asked yet for the current context": the resource
  // stays genuinely idle, no fetch, until request() is called. This is
  // the whole "lazy" half of "shared + lazy + cached".
  const requestedKeyRef = useRef<string | null>(null);

  // The context key a fetch is *currently in flight* for — distinct from
  // requestedKeyRef above. Fetch-audit Phase 2's own live-network
  // verification found a genuine duplicate-request race this ref exists to
  // close: contextKey resolving from null to a real value (once
  // auth/profile load) and request()'s requestVersion bump are two
  // *separate* dependency changes on this effect, and both can independently
  // satisfy "requestedKeyRef.current === contextKey" — because
  // requestedKeyRef is a plain ref, mutated synchronously inside request()
  // (itself called from a child section's own mount effect, which React
  // flushes before this hook's own effect in the same commit), the very
  // first time this effect runs for a freshly-resolved contextKey it can
  // already see requestedKeyRef armed and start a fetch; the requestVersion
  // state update request() *also* queued then lands as its own render,
  // re-running this effect a second time for the same still-matching key
  // and starting a second, fully redundant network request. This ref makes
  // "a fetch for this exact key is already running" independently
  // checkable, synchronously, regardless of which dependency triggered the
  // re-run — the second effect run sees it set and skips, instead of
  // re-deriving "should I fetch" purely from requestedKeyRef/contextKey.
  const inFlightKeyRef = useRef<string | null>(null);

  // Mirrors `state` so request() (a stable useCallback, not re-created on
  // every state change) can read the *latest* status synchronously without
  // needing state itself as a dependency — see request()'s own comment for
  // why this matters specifically for the "retry a previously-failed
  // context on a fresh mount" case.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    return subscribeInvalidation(() => setInvalidationVersion((version) => version + 1));
  }, [subscribeInvalidation]);

  useEffect(() => {
    if (!contextKey) {
      requestedKeyRef.current = null;
      inFlightKeyRef.current = null;
      setState(idleState(null));
      return;
    }

    if (requestedKeyRef.current !== contextKey) {
      // Either a genuine context change (different account/language — the
      // previous context's rows must never keep showing) or this resource
      // has simply never been requested yet for this context. Either way,
      // nothing has asked for it: stay idle rather than fetching
      // preemptively. request()/retry() re-arm requestedKeyRef and bump a
      // version counter, which re-runs this effect and falls through to
      // the fetch branch below.
      setState((prev) => (prev.key === contextKey && prev.status !== "idle" ? prev : idleState(contextKey)));
      return;
    }

    if (inFlightKeyRef.current === contextKey) {
      // A fetch for this exact context is already running — this effect
      // run was triggered by a *different* dependency (contextKey resolving
      // and requestVersion's own bump can each independently re-run this
      // effect for the same already-armed requestedKeyRef; see
      // inFlightKeyRef's own header for the full mechanics). Nothing new to
      // do: the in-flight attempt already owns getting this context to
      // "ready"/"error".
      return;
    }

    // requestedKeyRef.current === contextKey and no fetch for it is already
    // running — perform the fetch (first load, an explicit retry, or a
    // background refresh after an invalidation signal all funnel through
    // this same branch).
    let cancelled = false;
    inFlightKeyRef.current = contextKey;
    setState((prev) =>
      prev.key === contextKey && prev.status === "ready" ? prev : { key: contextKey, status: "loading", rows: prev.key === contextKey ? prev.rows : [] },
    );

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) {
            requestedKeyRef.current = null;
            setState(idleState(contextKey));
          }
          return;
        }

        const rows = await fetchRows(session, targetLanguage);
        if (cancelled) return;
        setState({ key: contextKey, status: "ready", rows });
      } catch (error) {
        if (cancelled) return;
        console.warn(
          `useProfileSharedDailyStats: failed to load ${label}.`,
          describeSupabaseError(label, error),
        );
        // Same preserve-on-refresh rule as useProfileSharedProgressData: a
        // same-context background refresh failure (invalidation/retry on
        // an already-loaded resource) keeps the previous ready value
        // instead of regressing every dependent card to its error state;
        // only a genuine first-load failure for this context surfaces
        // "error".
        setState((prev) => (prev.key === contextKey && prev.status === "ready" ? prev : { key: contextKey, status: "error", rows: [] }));
      } finally {
        // Only clear this attempt's own marker — a defensive check against
        // a later, genuinely new attempt (retry/invalidation) for the same
        // key already having replaced it by the time this one settles.
        if (inFlightKeyRef.current === contextKey) {
          inFlightKeyRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contextKey, targetLanguage, requestVersion, retryToken, invalidationVersion, fetchRows, label]);

  const request = useCallback(() => {
    if (!contextKey) {
      return;
    }
    // A no-op only when this exact context is already loading or holds a
    // successfully-loaded result — that's the actual "shared + lazy +
    // cached" win (a section remounting must not re-request data another
    // section already has in flight or already loaded). A context whose
    // last attempt ended in "error" is deliberately NOT treated as settled
    // here: without this, a failed fetch would stay wrong for the rest of
    // the profile-dashboard session, since request() is otherwise the only
    // thing sections call on mount — before this hook existed, simply
    // navigating away and back re-ran each card's own fetch effect and so
    // implicitly retried; this preserves that same "a fresh mount tries
    // again after a failure" behavior instead of requiring the user to
    // find a dedicated Retry control that never existed for these two
    // reads (see retry()'s own comment for the explicit-Retry-button path,
    // which several other callers do wire up).
    const alreadySettledForThisContext = requestedKeyRef.current === contextKey && stateRef.current.status !== "error";
    if (alreadySettledForThisContext) {
      return;
    }
    requestedKeyRef.current = contextKey;
    setRequestVersion((version) => version + 1);
  }, [contextKey]);

  const retry = useCallback(() => {
    if (!contextKey) {
      return;
    }
    requestedKeyRef.current = contextKey;
    setRetryToken((token) => token + 1);
  }, [contextKey]);

  return { status: state.status, rows: state.rows, request, retry };
}

export function useProfileSharedDailyStats({
  authUserId,
  isProfileLoaded,
  targetLanguage,
}: UseProfileSharedDailyStatsParams): ProfileSharedDailyStatsData {
  const contextKey = authUserId && isProfileLoaded && targetLanguage ? `${authUserId}:${targetLanguage}` : null;

  const dailyStats = useLazyKeyedRows<MilestoneDailyStatRow>({
    contextKey,
    targetLanguage,
    fetchRows: readMilestoneDailyStats,
    subscribeInvalidation: subscribeDailyStatsChanged,
    label: "readMilestoneDailyStats",
  });

  const vocabularyGrowth = useLazyKeyedRows<VocabularyGrowthEventRow>({
    contextKey,
    targetLanguage,
    fetchRows: readVocabularyGrowthEvents,
    subscribeInvalidation: subscribeVocabularyGrowthChanged,
    label: "readVocabularyGrowthEvents",
  });

  return {
    dailyStatsStatus: dailyStats.status,
    dailyStatsRows: dailyStats.rows,
    requestDailyStats: dailyStats.request,
    retryDailyStats: dailyStats.retry,

    vocabularyGrowthStatus: vocabularyGrowth.status,
    vocabularyGrowthEvents: vocabularyGrowth.rows,
    requestVocabularyGrowthEvents: vocabularyGrowth.request,
    retryVocabularyGrowthEvents: vocabularyGrowth.retry,
  };
}
