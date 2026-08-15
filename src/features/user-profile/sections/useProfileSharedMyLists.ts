import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredSupabaseSession } from "../../../lib/supabaseAuth";
import { describeSupabaseError } from "../../../lib/supabaseError";
import {
  readUserVocabularyLists,
  readUserVocabularyListMemberships,
  type UserVocabularyList,
  type UserVocabularyListMembership,
} from "../../../lib/vocabularyLists";
import { subscribeVocabularyListsChanged } from "../../../lib/sharedProgressInvalidation";

// My Lists Phase 3 of the profile-section data optimization: the single,
// LAZY, shared owner — for the whole /profile dashboard — of the two
// datasets MyListsSection previously fetched on its own every time it
// mounted:
//
//   - the signed-in user's vocabulary lists for the active target language
//     (readUserVocabularyLists);
//   - every one of those lists' own word memberships, batched into one
//     request (readUserVocabularyListMemberships([...listIds])).
//
// Modeled directly on useProfileSharedDailyStats.ts's useLazyKeyedRows (same
// idle -> loading -> ready/error lifecycle, same requestedKeyRef/
// inFlightKeyRef lazy-request + in-flight-dedup mechanics, same "no
// `cancelled`-closure, re-check the ref fresh at resolution time" fix this
// codebase's fetch audit already had to make twice — see that hook's own
// header and test-daily-stats-in-flight-result-application.mjs for why).
// Not reused verbatim because My Lists' own fetch is a two-step dependent
// chain (list ids -> memberships), not a single fetchRows(session,
// targetLanguage) call, and because mutations need precise, targeted
// updates to already-cached rows (create/rename/delete a list, replace or
// remove one membership) rather than only ever a full background refetch.
//
// Deliberately LAZY, matching useProfileSharedDailyStats: Dashboard/
// Learning/Vocabulary/Progress/Settings never need this resource, so
// UserProfileDashboardPage must not fetch it just because /profile mounted.
// Only MyListsSection's own mount effect calls requestMyLists().
//
// Cache key: (authUserId, targetLanguage) — readUserVocabularyLists itself
// filters by both user_id AND target_language server-side (see that
// function's own header: "a list created under one target language can
// never surface under another"), so lists are genuinely language-scoped,
// not just user-scoped. Memberships are not independently language-scoped
// (user_vocabulary_list_words has no target_language column at all — its
// RLS policy scopes rows to lists the caller owns, via a join against
// user_vocabulary_lists), but since every membership row this hook ever
// loads comes from a batched read of THIS context's own list ids, they are
// transitively scoped to the same (authUserId, targetLanguage) context as
// the lists themselves. A language switch is therefore a genuinely
// different data set for both halves, and must hard-reset, exactly
// mirroring useProfileSharedDailyStats' own cache-key reasoning.
export type MyListsResourceStatus = "idle" | "loading" | "ready" | "error";

export interface ProfileSharedMyListsData {
  myListsStatus: MyListsResourceStatus;
  myLists: UserVocabularyList[];
  myListsMemberships: UserVocabularyListMembership[];
  // Idempotent — safe to call on every mount of MyListsSection. A no-op
  // once already loading/ready for the current (authUserId, targetLanguage)
  // context; this is the whole "lazy + cached" win for
  // My Lists -> Vocabulary -> My Lists / My Lists -> Dashboard -> My Lists.
  requestMyLists: () => void;
  // Forces a fresh fetch even from a "ready" or "error" state — wired to
  // MyListsSection's existing Retry control.
  retryMyLists: () => void;

  // ---- precise mutation appliers ----
  // Each mirrors exactly what MyListsSection's own pre-lift local setState
  // updater did for that mutation — see that file's own git history. All
  // are no-ops if this resource isn't currently "ready" for the live
  // context (defensive only: every call site only ever calls these from a
  // section that itself required the data to already be loaded to render
  // the control that triggered the mutation).
  applyListCreated: (list: UserVocabularyList) => void;
  applyListRenamed: (list: UserVocabularyList) => void;
  applyListDeleted: (listId: string) => void;
  // Replaces one list's own membership rows wholesale — used after an
  // authoritative re-read (e.g. the add-words flow's own follow-up
  // readUserVocabularyListMemberships call, needed because
  // add_words_to_vocabulary_list's response doesn't include created_at).
  applyListMembershipsReplaced: (listId: string, memberships: UserVocabularyListMembership[]) => void;
  // Removes exactly one membership row — used by the optimistic remove-word
  // flow, which already knows precisely which row is gone without needing
  // any follow-up read.
  applyMembershipRemoved: (listId: string, wordId: string) => void;
  // Re-adds exactly one membership row — used only to roll an optimistic
  // remove back if the underlying RPC call fails.
  applyMembershipAdded: (membership: UserVocabularyListMembership) => void;
}

export interface UseProfileSharedMyListsParams {
  authUserId: string | null;
  isProfileLoaded: boolean;
  // See useProfileSharedDailyStats' own targetLanguage param comment — same
  // "language-scoped" reasoning applies here (see this file's own header).
  targetLanguage: string;
}

interface MyListsState {
  // The (authUserId, targetLanguage) context these lists/memberships (if
  // any) belong to — null only before any context has ever resolved.
  // Compared against the live contextKey on every effect run to tell a
  // genuine context change (must hard-reset, never show a previous
  // account's/language's lists) apart from a same-context request/retry/
  // invalidation (must keep serving already-loaded rows while a background
  // refresh is in flight).
  key: string | null;
  status: MyListsResourceStatus;
  lists: UserVocabularyList[];
  memberships: UserVocabularyListMembership[];
}

function idleState(key: string | null): MyListsState {
  return { key, status: "idle", lists: [], memberships: [] };
}

export function useProfileSharedMyLists({
  authUserId,
  isProfileLoaded,
  targetLanguage,
}: UseProfileSharedMyListsParams): ProfileSharedMyListsData {
  const contextKey = authUserId && isProfileLoaded && targetLanguage ? `${authUserId}:${targetLanguage}` : null;

  const [state, setState] = useState<MyListsState>(() => idleState(contextKey));
  const [requestVersion, setRequestVersion] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [invalidationVersion, setInvalidationVersion] = useState(0);

  // The context key a consumer has actually asked this resource to load
  // for — null means "nothing has asked yet for the current context": the
  // resource stays genuinely idle, no fetch, until requestMyLists() is
  // called. See useProfileSharedDailyStats' identical ref for the full
  // "lazy" mechanics this mirrors.
  const requestedKeyRef = useRef<string | null>(null);
  // The context key a fetch is *currently in flight* for — makes "a fetch
  // for this exact key is already running" independently checkable at
  // result-application time, instead of a per-invocation `cancelled`
  // closure (the exact mechanism that caused the shared-daily-stats "stuck
  // on loading forever" regression — see
  // test-daily-stats-in-flight-result-application.mjs).
  const inFlightKeyRef = useRef<string | null>(null);
  // Mirrors `state` so request()/retry() (stable useCallbacks) can read the
  // latest status synchronously without needing state itself as a
  // dependency.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    return subscribeVocabularyListsChanged(() => setInvalidationVersion((version) => version + 1));
  }, []);

  useEffect(() => {
    if (!contextKey) {
      requestedKeyRef.current = null;
      inFlightKeyRef.current = null;
      setState(idleState(null));
      return;
    }

    if (requestedKeyRef.current !== contextKey) {
      // Either a genuine context change or this resource has simply never
      // been requested yet for this context — stay idle rather than
      // fetching preemptively (see requestMyLists() below, which re-arms
      // requestedKeyRef and bumps requestVersion, re-running this effect
      // into the fetch branch).
      setState((prev) => (prev.key === contextKey && prev.status !== "idle" ? prev : idleState(contextKey)));
      return;
    }

    if (inFlightKeyRef.current === contextKey) {
      // A fetch for this exact context is already running — this effect
      // run was triggered by a different dependency (contextKey resolving
      // and requestVersion's own bump can each independently re-run this
      // effect for the same already-armed requestedKeyRef). Nothing new to
      // do.
      return;
    }

    // requestedKeyRef.current === contextKey and no fetch for it is already
    // running — perform the fetch (first load, an explicit retry, or a
    // background refresh after an external-mutation invalidation signal
    // all funnel through this same branch). Deliberately no `cancelled`-
    // closure/cleanup pair — see this file's own header and
    // useProfileSharedDailyStats' identical comment for why that pattern
    // silently discards a legitimately in-flight result whenever this
    // effect re-runs for the same key (which it can, since its dependency
    // array includes requestVersion/retryToken/invalidationVersion, each
    // bumped by a separate state update not necessarily in the same commit
    // as contextKey resolving).
    inFlightKeyRef.current = contextKey;
    setState((prev) =>
      prev.key === contextKey && prev.status === "ready"
        ? prev
        : {
            key: contextKey,
            status: "loading",
            lists: prev.key === contextKey ? prev.lists : [],
            memberships: prev.key === contextKey ? prev.memberships : [],
          },
    );

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (inFlightKeyRef.current === contextKey) {
            requestedKeyRef.current = null;
            setState(idleState(contextKey));
          }
          return;
        }

        const lists = await readUserVocabularyLists(session, targetLanguage);
        if (inFlightKeyRef.current !== contextKey) return;
        // Preserves the original two-step dependency: membership loading
        // genuinely needs the list ids this same context's own lists
        // request just returned — batched into one request for every
        // loaded list, never one request per card.
        const memberships = await readUserVocabularyListMemberships(
          session,
          lists.map((list) => list.id),
        );
        if (inFlightKeyRef.current !== contextKey) return;
        setState({ key: contextKey, status: "ready", lists, memberships });
      } catch (error) {
        if (inFlightKeyRef.current !== contextKey) return;
        console.warn(
          "useProfileSharedMyLists: failed to load vocabulary lists.",
          describeSupabaseError("readUserVocabularyLists", error),
        );
        // Same preserve-on-refresh rule as useProfileSharedDailyStats: a
        // same-context background refresh failure (an external-mutation
        // invalidation) keeps the previously-loaded lists/memberships
        // instead of regressing the whole section to its error state; only
        // a genuine first-load failure for this context surfaces "error".
        setState((prev) =>
          prev.key === contextKey && prev.status === "ready" ? prev : { key: contextKey, status: "error", lists: [], memberships: [] },
        );
      } finally {
        if (inFlightKeyRef.current === contextKey) {
          inFlightKeyRef.current = null;
        }
      }
    })();
  }, [contextKey, targetLanguage, requestVersion, retryToken, invalidationVersion]);

  const requestMyLists = useCallback(() => {
    if (!contextKey) {
      return;
    }
    // A context whose last attempt ended in "error" is deliberately NOT
    // treated as already-settled — without this, a failed fetch would stay
    // wrong for the rest of the profile-dashboard session, since
    // requestMyLists() is the only thing MyListsSection calls on mount
    // (see useProfileSharedDailyStats' request() for the identical
    // reasoning).
    const alreadySettledForThisContext = requestedKeyRef.current === contextKey && stateRef.current.status !== "error";
    if (alreadySettledForThisContext) {
      return;
    }
    requestedKeyRef.current = contextKey;
    setRequestVersion((version) => version + 1);
  }, [contextKey]);

  const retryMyLists = useCallback(() => {
    if (!contextKey) {
      return;
    }
    requestedKeyRef.current = contextKey;
    setRetryToken((token) => token + 1);
  }, [contextKey]);

  const applyListCreated = useCallback(
    (list: UserVocabularyList) => {
      setState((prev) =>
        prev.key === contextKey && prev.status === "ready" ? { ...prev, lists: [list, ...prev.lists] } : prev,
      );
    },
    [contextKey],
  );

  const applyListRenamed = useCallback(
    (list: UserVocabularyList) => {
      setState((prev) =>
        prev.key === contextKey && prev.status === "ready"
          ? { ...prev, lists: prev.lists.map((existing) => (existing.id === list.id ? list : existing)) }
          : prev,
      );
    },
    [contextKey],
  );

  const applyListDeleted = useCallback(
    (listId: string) => {
      setState((prev) =>
        prev.key === contextKey && prev.status === "ready"
          ? {
              ...prev,
              lists: prev.lists.filter((list) => list.id !== listId),
              memberships: prev.memberships.filter((membership) => membership.listId !== listId),
            }
          : prev,
      );
    },
    [contextKey],
  );

  const applyListMembershipsReplaced = useCallback(
    (listId: string, memberships: UserVocabularyListMembership[]) => {
      setState((prev) =>
        prev.key === contextKey && prev.status === "ready"
          ? {
              ...prev,
              memberships: [...prev.memberships.filter((membership) => membership.listId !== listId), ...memberships],
            }
          : prev,
      );
    },
    [contextKey],
  );

  const applyMembershipRemoved = useCallback(
    (listId: string, wordId: string) => {
      setState((prev) =>
        prev.key === contextKey && prev.status === "ready"
          ? {
              ...prev,
              memberships: prev.memberships.filter(
                (membership) => !(membership.listId === listId && membership.wordId === wordId),
              ),
            }
          : prev,
      );
    },
    [contextKey],
  );

  const applyMembershipAdded = useCallback(
    (membership: UserVocabularyListMembership) => {
      setState((prev) =>
        prev.key === contextKey && prev.status === "ready"
          ? { ...prev, memberships: [...prev.memberships, membership] }
          : prev,
      );
    },
    [contextKey],
  );

  return {
    myListsStatus: state.status,
    myLists: state.lists,
    myListsMemberships: state.memberships,
    requestMyLists,
    retryMyLists,
    applyListCreated,
    applyListRenamed,
    applyListDeleted,
    applyListMembershipsReplaced,
    applyMembershipRemoved,
    applyMembershipAdded,
  };
}
