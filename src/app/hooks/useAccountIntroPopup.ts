// Owns the anonymous "account intro" popup's shared, cross-page state:
// consuming the one-time showAccountIntro router-state signal (the
// language-setup trigger - see App.tsx's useAccountLanguageConfirm
// `proceed` callback for where it's set) and exposing requestAccountIntro()
// for the two same-page triggers (practice-complete, level-test-complete -
// see VocabularyPractice's onSessionComplete and VocabularyLevelExam's
// onExamComplete), then deciding - centrally, via accountIntroPolicy.ts's
// shouldShowAccountIntro - whether to actually open the dialog for whichever
// context arrives. The frequency policy is a single global rolling 24-hour
// cooldown shared across all three contexts (see accountIntroPolicy.ts's
// header) - not a permanent per-trigger flag, and not a once-per-session cap.
//
// One pendingContext slot covers all three triggers: at most one trigger is
// ever in flight at a time in real usage (the user is always on exactly one
// page performing one action), so a single latest-wins slot is sufficient -
// no queue.
//
// Two-step evaluation, mirroring the original single-trigger design:
//   1. A trigger arrives (router-state signal, or a direct
//      requestAccountIntro() call) and is recorded in pendingContext. The
//      router-state signal is also consumed immediately (cleared via a
//      `replace` navigation with `state: null`) regardless of auth status,
//      so a refresh/back-forward can never re-arm it.
//   2. Once auth status is resolved, shouldShowAccountIntro decides whether
//      to actually open - only then is the shared lastShownAt cooldown
//      timestamp written (never for a trigger that was merely eligible but
//      suppressed by an active cooldown). An eligible trigger arriving
//      before auth resolves is preserved (not discarded) until resolution;
//      a signed-in resolution silently discards it.
//
// pendingContext is real React state (not a ref) specifically so that step
// 2's effect - keyed on [pendingContext, isAuthResolved, authUserId] - is
// guaranteed to re-run the moment step 1 (or requestAccountIntro) records a
// trigger, even when auth was already resolved earlier and neither
// isAuthResolved nor authUserId changes value at that point (the common
// case: this hook's owner mounted long before this particular trigger).
import { useCallback, useEffect, useState } from "react";
import type { Location, NavigateFunction } from "react-router";

import {
  shouldShowAccountIntro,
  type AccountIntroContext,
  type RequestableAccountIntroContext,
} from "../utils/accountIntroPolicy";
import {
  markAccountIntroShown,
  readAccountIntroLastShownAtMs,
} from "../utils/accountIntroStorage";
import type { PageKey } from "../utils/pageRouting";

export interface UseAccountIntroPopupParams {
  resolvedPage: PageKey;
  location: Location;
  navigate: NavigateFunction;
  authUserId: string | null;
  isAuthResolved: boolean;
}

export interface UseAccountIntroPopupResult {
  isOpen: boolean;
  // Which trigger the currently-open (or most-recently-opened) popup is
  // for - only meaningful while isOpen is true, but always a valid context
  // so callers never need to null-check it just to read AccountIntroDialog's
  // required `context` prop.
  context: AccountIntroContext;
  close: () => void;
  // Requests the practice-complete / level-test-complete triggers from
  // wherever their canonical completion event fires. The language-setup
  // trigger deliberately has no equivalent entry point here - it only ever
  // arrives via the router-state signal consumed below.
  requestAccountIntro: (context: RequestableAccountIntroContext) => void;
}

export function useAccountIntroPopup({
  resolvedPage,
  location,
  navigate,
  authUserId,
  isAuthResolved,
}: UseAccountIntroPopupParams): UseAccountIntroPopupResult {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<AccountIntroContext>(
    "language-setup",
  );
  const [pendingContext, setPendingContext] =
    useState<AccountIntroContext | null>(null);

  useEffect(() => {
    if (resolvedPage !== "levelCategory") {
      return;
    }

    const state = location.state as { showAccountIntro?: boolean } | null;
    if (!state?.showAccountIntro) {
      return;
    }

    setPendingContext("language-setup");
    // Consume the signal immediately - a stale history entry (refresh,
    // back/forward) must never see it again, regardless of what auth status
    // turns out to be.
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [resolvedPage, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!pendingContext || !isAuthResolved) {
      return;
    }
    const contextToEvaluate = pendingContext;
    setPendingContext(null);

    const nowMs = Date.now();
    const shouldShow = shouldShowAccountIntro({
      context: contextToEvaluate,
      isAuthResolved,
      isAuthenticated: Boolean(authUserId),
      lastShownAtMs: readAccountIntroLastShownAtMs(),
      nowMs,
    });

    if (!shouldShow) {
      return;
    }

    // Only ever written here - the moment the popup is actually about to
    // open - never for a trigger that merely became eligible.
    markAccountIntroShown(nowMs);
    setContext(contextToEvaluate);
    setIsOpen(true);
  }, [pendingContext, isAuthResolved, authUserId]);

  const close = useCallback(() => setIsOpen(false), []);

  const requestAccountIntro = useCallback(
    (requestedContext: RequestableAccountIntroContext) => {
      setPendingContext(requestedContext);
    },
    [],
  );

  return { isOpen, context, close, requestAccountIntro };
}
