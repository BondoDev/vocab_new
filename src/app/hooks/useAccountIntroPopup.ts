// Owns the anonymous "account intro" popup's Filters-page half: consuming
// the one-time showAccountIntro router-state signal (see App.tsx's
// useAccountLanguageConfirm `proceed` callback for where it's set) and
// deciding whether to actually open the popup.
//
// Two-step by design, matching accountIntroPolicy.ts's shouldOpenAccountIntro:
//   1. As soon as the signal is seen on the Filters page, it is consumed
//      immediately (cleared via a `replace` navigation with `state: null`)
//      so a refresh, or browser back/forward, can never see it again -
//      independent of whether auth status is known yet.
//   2. The popup only actually opens once auth status has resolved and the
//      visitor is confirmed anonymous - never for a signed-in user, and
//      never for a single unresolved frame either.
//
// hasPendingSignal is real React state (not a ref) specifically so that step
// 2's effect - keyed on [hasPendingSignal, isAuthResolved, authUserId] - is
// guaranteed to re-run the moment step 1 detects the signal, even when auth
// was already resolved earlier and neither isAuthResolved nor authUserId
// changes value at that point (the common case: this hook's owner mounted
// back on the Languages page, well before this client-side navigation).
import { useCallback, useEffect, useState } from "react";
import type { Location, NavigateFunction } from "react-router";

import { shouldOpenAccountIntro } from "../utils/accountIntroPolicy";
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
  close: () => void;
}

export function useAccountIntroPopup({
  resolvedPage,
  location,
  navigate,
  authUserId,
  isAuthResolved,
}: UseAccountIntroPopupParams): UseAccountIntroPopupResult {
  const [isOpen, setIsOpen] = useState(false);
  const [hasPendingSignal, setHasPendingSignal] = useState(false);

  useEffect(() => {
    if (resolvedPage !== "levelCategory") {
      return;
    }

    const state = location.state as { showAccountIntro?: boolean } | null;
    if (!state?.showAccountIntro) {
      return;
    }

    setHasPendingSignal(true);
    // Consume the signal immediately - a stale history entry (refresh,
    // back/forward) must never see it again, regardless of what auth status
    // turns out to be.
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [resolvedPage, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!hasPendingSignal || !isAuthResolved) {
      return;
    }
    setHasPendingSignal(false);
    if (
      shouldOpenAccountIntro({
        hasPendingIntroSignal: true,
        isAuthResolved,
        isAuthenticated: Boolean(authUserId),
      })
    ) {
      setIsOpen(true);
    }
  }, [hasPendingSignal, isAuthResolved, authUserId]);

  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, close };
}
