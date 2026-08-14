// Owns the anonymous "account intro" popup's fourth trigger: cumulative
// active viewing time across eligible SEO pages (see accountIntroPolicy.ts's
// isAccountIntroSeoEligibleRoute for exactly which pages count). Feeds the
// same shared requestAccountIntro()/pendingContext/cooldown machinery
// useAccountIntroPopup.ts already provides for practice-complete and
// level-test-complete - this hook's only job is deciding *when* to call
// requestAccountIntro("seo-engagement"); it owns no dialog state, no
// cooldown-write, and no auth logic beyond "don't accumulate for an
// authenticated (or not-yet-resolved) visitor".
//
// Timestamp-segment architecture (not a naive setTimeout/setInterval
// accumulator - see accountIntroPolicy.ts's computeAccountIntroSeoActiveTotalMs/
// foldAccountIntroSeoActiveSegment docs): while the current route is
// eligible AND the tab is visible, an "active segment" is running -
// activeSegmentStartedAtRef holds its start timestamp. Whenever eligibility
// or visibility changes, the running segment (if any) is folded into
// accumulatedMsRef (persisted to sessionStorage) via real elapsed-time math,
// never assumed. A single continuous segment can span multiple eligible SEO
// pages (SEO A -> SEO B never resets - see the effect's [isEligibleNow, ...]
// dependency: it only re-runs, restarting the segment, on an eligible ->
// ineligible -> eligible transition, not on an eligible -> eligible one),
// exactly matching "the timer must not reset on every SEO route change".
//
// A 1-second interval only *checks* whether the running segment has already
// crossed the threshold (using the same timestamp math as everywhere else,
// per the "never assume a tick equals exact elapsed time" requirement) - it
// never accumulates time itself. This is what lets a single long visit to
// one SEO page (no route/visibility change to naturally end a segment)
// still cross the threshold without waiting for the user to leave.
//
// Cooldown interaction: every point that could start or fold a segment first
// checks isWithinAccountIntroCooldown (reading the same shared
// lastShownAtMs another trigger may have just written, e.g. from a
// different tab). If the cooldown is active, the accumulator resets to 0
// instead of accumulating/folding - engagement built up before a cooldown
// began never survives to fire the popup the instant that cooldown expires;
// a fresh 60 seconds is required afterward.
//
// hasRequestedRef prevents requesting the same threshold-crossing more than
// once; it (and the accumulator) is cleared both by a cooldown-triggered
// reset and - per the product requirement that the SEO counter only resets
// when its own popup actually opens - by the separate effect below that
// watches isOpen/context.
import { useEffect, useRef } from "react";

import {
  computeAccountIntroSeoActiveTotalMs,
  foldAccountIntroSeoActiveSegment,
  hasAccountIntroSeoActiveTimeReachedThreshold,
  isAccountIntroSeoEligibleRoute,
  isWithinAccountIntroCooldown,
  type AccountIntroContext,
  type RequestableAccountIntroContext,
} from "../utils/accountIntroPolicy";
import {
  readAccountIntroLastShownAtMs,
  readAccountIntroSeoActiveMs,
  writeAccountIntroSeoActiveMs,
} from "../utils/accountIntroStorage";
import type { PageKey } from "../utils/pageRouting";

// How often the running segment is checked for having crossed the
// threshold. Only affects how quickly a single long, uninterrupted SEO
// visit is detected - segment-end accounting (route/visibility changes) is
// always exact, independent of this interval.
const SEO_ENGAGEMENT_CHECK_INTERVAL_MS = 1000;

export interface UseAccountIntroSeoEngagementParams {
  resolvedPage: PageKey;
  isAuthResolved: boolean;
  authUserId: string | null;
  isOpen: boolean;
  context: AccountIntroContext;
  requestAccountIntro: (context: RequestableAccountIntroContext) => void;
}

export function useAccountIntroSeoEngagement({
  resolvedPage,
  isAuthResolved,
  authUserId,
  isOpen,
  context,
  requestAccountIntro,
}: UseAccountIntroSeoEngagementParams): void {
  const accumulatedMsRef = useRef<number | null>(null);
  const activeSegmentStartedAtRef = useRef<number | null>(null);
  const hasRequestedRef = useRef(false);

  // Section 10 of the product requirement: the counter resets specifically
  // when the seo-engagement trigger's own popup actually opens - distinct
  // from the cooldown-triggered resets inside the tracking effect below,
  // which happen whether or not this trigger was the one that showed it.
  useEffect(() => {
    if (isOpen && context === "seo-engagement") {
      accumulatedMsRef.current = 0;
      writeAccountIntroSeoActiveMs(0);
      hasRequestedRef.current = false;
    }
  }, [isOpen, context]);

  // Auth-unresolved handling (see this hook's header / the product
  // requirement's "defer counting or preserve elapsed segments safely,
  // whichever fits the current architecture best"): deferring is simplest
  // and safe here - auth resolves once, near-instantly, at app mount, long
  // before any meaningful engagement could accumulate, and isEligibleNow
  // going eligible -> ineligible -> eligible across that resolution just
  // means the effect below restarts cleanly, losing nothing but a
  // negligible fraction of a second.
  const isEligibleNow =
    isAccountIntroSeoEligibleRoute(resolvedPage) &&
    isAuthResolved &&
    !authUserId;

  useEffect(() => {
    if (!isEligibleNow || typeof document === "undefined") {
      return;
    }

    function getAccumulatedMs(): number {
      if (accumulatedMsRef.current === null) {
        accumulatedMsRef.current = readAccountIntroSeoActiveMs();
      }
      return accumulatedMsRef.current;
    }

    function isCurrentlyWithinCooldown(): boolean {
      return isWithinAccountIntroCooldown({
        lastShownAtMs: readAccountIntroLastShownAtMs(),
        nowMs: Date.now(),
      });
    }

    // Section 9: an active cooldown (from this trigger or any other -
    // lastShownAtMs is shared) means accumulated SEO engagement must not
    // survive to fire the popup the moment that cooldown expires.
    function resetForCooldown(): void {
      activeSegmentStartedAtRef.current = null;
      accumulatedMsRef.current = 0;
      writeAccountIntroSeoActiveMs(0);
      hasRequestedRef.current = false;
    }

    function requestIfThresholdReached(hasReachedThreshold: boolean): void {
      if (hasReachedThreshold && !hasRequestedRef.current) {
        hasRequestedRef.current = true;
        requestAccountIntro("seo-engagement");
      }
    }

    // Ends the currently-running segment (if any), folding its real elapsed
    // time into the persisted accumulator. Returns whether the threshold has
    // now been reached (always false if there was no running segment, or if
    // an active cooldown reset the accumulator instead of folding it).
    function endActiveSegment(nowMs: number): boolean {
      if (activeSegmentStartedAtRef.current === null) {
        return false;
      }
      const elapsedSegmentMs = nowMs - activeSegmentStartedAtRef.current;
      activeSegmentStartedAtRef.current = null;

      if (isCurrentlyWithinCooldown()) {
        resetForCooldown();
        return false;
      }

      const result = foldAccountIntroSeoActiveSegment({
        previousAccumulatedMs: getAccumulatedMs(),
        elapsedSegmentMs,
        isWithinCooldown: false,
      });
      accumulatedMsRef.current = result.nextAccumulatedMs;
      writeAccountIntroSeoActiveMs(result.nextAccumulatedMs);
      return result.hasReachedThreshold;
    }

    function startActiveSegmentIfPossible(): void {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (isCurrentlyWithinCooldown()) {
        resetForCooldown();
        return;
      }
      if (activeSegmentStartedAtRef.current === null) {
        activeSegmentStartedAtRef.current = Date.now();
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        startActiveSegmentIfPossible();
      } else {
        requestIfThresholdReached(endActiveSegment(Date.now()));
      }
    }

    // Periodic threshold check for a single long, uninterrupted visit (no
    // route/visibility change to otherwise end the segment) - never
    // accumulates by itself, only computes the live total from timestamps
    // and, if it's now over the threshold, ends the segment through the
    // same real accounting path as everywhere else.
    function checkTick(): void {
      const nowMs = Date.now();
      if (isCurrentlyWithinCooldown()) {
        resetForCooldown();
        return;
      }
      if (activeSegmentStartedAtRef.current === null) {
        return;
      }
      const totalMs = computeAccountIntroSeoActiveTotalMs({
        accumulatedMs: getAccumulatedMs(),
        activeSegmentStartedAtMs: activeSegmentStartedAtRef.current,
        nowMs,
      });
      if (hasAccountIntroSeoActiveTimeReachedThreshold(totalMs)) {
        requestIfThresholdReached(endActiveSegment(nowMs));
      }
    }

    startActiveSegmentIfPossible();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(
      checkTick,
      SEO_ENGAGEMENT_CHECK_INTERVAL_MS,
    );

    // Cleanup runs both on unmount and - critically - every time
    // isEligibleNow changes (React tears down the previous effect instance
    // before running the next one), which is exactly what ends a segment
    // when navigating from an eligible SEO page to an ineligible one.
    return () => {
      requestIfThresholdReached(endActiveSegment(Date.now()));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [isEligibleNow, requestAccountIntro]);
}
