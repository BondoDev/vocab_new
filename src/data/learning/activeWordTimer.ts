// Shared, testable active-time timer used by all three learning modes
// (Study New Words, Review Words, Custom Practice) to measure how long a
// learner actively spends on one word — see docs/architecture.md's Learning
// Statistics section and src/lib/learningTimeStats.ts for the read side.
// No React, no Supabase, no timers of any kind — only a monotonic clock
// (performance.now() by default, injectable for tests) — so this stays
// loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-active-word-timer.mjs, matching every other
// pure module in this directory.
//
// Deliberately does NOT:
//   * use setInterval/setTimeout to "tick" — time is computed on demand
//     (start/pause/resume/freeze/recordInteraction only touch a handful of
//     numbers: an accumulated millisecond total, an optional "accumulating
//     since" timestamp, and the last-known-interaction timestamp used for
//     idle detection below);
//   * update any React state — callers own if/when they re-render;
//   * write to localStorage or anywhere else — a caller decides what (if
//     anything) to do with a frozen duration;
//   * listen for mouse/keyboard events itself — a caller reports activity
//     explicitly via recordInteraction() from its own existing click/
//     dispatch handlers (answer select, submit, skip, next). The only
//     signal this timer listens for directly is document.visibilityState,
//     via an injectable document-like target so this stays usable outside a
//     browser (tests, SSR).
//
// One instance is meant to cover exactly one word's full exercise sequence:
// start() when the word becomes visible, freeze() when the learner submits
// its last exercise, reset() only after that duration is confirmed
// persisted (see each mode's session component for where these calls live).
//
// IDLE PROTECTION — a session left open with the tab visible but with no
// genuine interaction for idleThresholdMs (default 60s) must stop counting
// from that point forward, resuming only once recordInteraction() is called
// again. This is computed lazily, the same "on demand" way as everything
// else here: every flush (pause/hidden/freeze/dispose, or the internal
// close-and-reopen a recordInteraction() call performs) caps the window it
// closes at min(now, lastActivityAtMs + idleThresholdMs) instead of raw
// now(). recordInteraction() closing-and-reopening the window on every call
// (rather than only capping lazily at the next unrelated flush) is what
// correctly excludes *every* idle gap in a long session, not just the last
// one before whatever eventually calls pause/freeze/dispose.

// Single named constant both the frontend and the database independently
// enforce (see supabase/migrations/20260805190000_add_learning_mode_time_
// tracking.sql's p_study_time_seconds/p_review_time_seconds/
// p_custom_practice_time_seconds validation, which mirrors this exact
// value). Changing this number changes both sides — keep them in sync.
export const MAX_WORD_TIME_SECONDS = 300;

// Default idle threshold — no established convention already exists
// elsewhere in this repository, so this uses the task's own suggested
// "modest" default. Injectable per-instance (ActiveWordTimerDeps.
// idleThresholdMs) so tests can use a much shorter window instead of
// waiting on (or simulating) a full 60 real seconds.
export const DEFAULT_IDLE_THRESHOLD_MS = 60_000;

// Shared duration-validation guard every mode's persistence call (Study New
// Words, Review Words, Custom Practice) runs before ever putting a duration
// in a request body — integer, not negative, not above
// MAX_WORD_TIME_SECONDS, never null/undefined/NaN. Mirrors exactly what
// complete_new_word_study/complete_word_review/complete_custom_practice_word
// each independently re-check server-side (supabase/migrations/
// 20260805190000_add_learning_mode_time_tracking.sql) — this is
// defense-in-depth on the client, never a substitute for that server-side
// check, and every call site must still let the RPC's own validation be
// authoritative.
export function isValidWordTimeSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_WORD_TIME_SECONDS
  );
}

// Minimal shape this module needs from `document` — real DocumentVisibilityState
// in a browser, or a fake with the same two members in tests. Injected rather
// than read from the global `document` directly inside every method so a
// test can simulate hidden/visible transitions deterministically without a
// real DOM.
export interface ActiveWordTimerDocumentLike {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface ActiveWordTimerDeps {
  // Monotonic clock — defaults to performance.now(). Tests inject a
  // deterministic stepped function instead.
  now?: () => number;
  // Explicit document-like target for visibility pause/resume. Pass `null`
  // to disable visibility tracking entirely (e.g. a non-browser context).
  // Omitted (undefined) falls back to the global `document` when one exists,
  // or `null` when it doesn't (Node/SSR) — never throws either way.
  documentRef?: ActiveWordTimerDocumentLike | null;
  // How long a session may go without a recordInteraction() call before
  // further accumulation stops. Defaults to DEFAULT_IDLE_THRESHOLD_MS.
  idleThresholdMs?: number;
}

export interface ActiveWordTimer {
  // Begins (or resumes, if already frozen — no-op) accumulating active time.
  // Idempotent: calling start() again while already accumulating does not
  // reset or double-count the elapsed window already in progress.
  start(): void;
  // Explicit external pause — flushes whatever's been accumulating into the
  // running total and stops the clock until resume()/start() is called
  // again. No-op once frozen or disposed.
  pause(): void;
  // Resumes accumulating after pause() (or after a visibility-driven
  // auto-pause). Idempotent, same guard as start().
  resume(): void;
  // Reports a genuine user interaction (typing, clicking an exercise
  // control, selecting an answer, moving to the next exercise). Refreshes
  // the idle deadline; if a gap longer than idleThresholdMs had opened up
  // since the previous interaction, the idle portion of that gap is
  // excluded from the accumulated total — see this module's own header for
  // the "close and reopen the window" mechanism. No-op once frozen/
  // disposed, matching every other method's guard.
  recordInteraction(): void;
  // Flushes any in-progress accumulation, floors the total to whole
  // seconds, clamps to [0, MAX_WORD_TIME_SECONDS], and locks that value —
  // every subsequent call (start/pause/resume/freeze) becomes inert except
  // getFrozenSeconds()/reset()/dispose(). Calling freeze() again before
  // reset() returns the exact same cached value (this is what makes a save
  // retry reuse the frozen duration instead of drifting).
  freeze(): number;
  // null until freeze() has been called for the current word.
  getFrozenSeconds(): number | null;
  // Clears all state (including any frozen value) back to a fresh
  // not-yet-started timer, ready for the next word. Does not itself call
  // start() — callers start explicitly once the next word is visible.
  reset(): void;
  // Stops accumulating and detaches the visibility listener permanently.
  // Safe to call multiple times. Intended for component unmount/navigation.
  dispose(): void;
}

function resolveDefaultDocument(): ActiveWordTimerDocumentLike | null {
  return typeof document !== "undefined" ? (document as unknown as ActiveWordTimerDocumentLike) : null;
}

export function createActiveWordTimer(deps: ActiveWordTimerDeps = {}): ActiveWordTimer {
  const now = deps.now ?? (() => performance.now());
  const documentRef = deps.documentRef !== undefined ? deps.documentRef : resolveDefaultDocument();
  const idleThresholdMs = deps.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;

  // accumulatedMs: total active milliseconds banked so far (flushed windows
  // only). accumulatingSinceMs: the timestamp the *current* window started,
  // or null when nothing is actively accumulating right now (paused, hidden,
  // not started, or frozen). intentRunning: whether the caller has asked
  // this timer to be running (via start()/resume()) — distinct from actually
  // accumulating, since a running-but-hidden timer has intentRunning = true
  // and accumulatingSinceMs = null at the same time. lastActivityAtMs: the
  // timestamp of the most recent start()/resume()/recordInteraction() call
  // — null until the first one — used only to compute the idle cap below.
  let accumulatedMs = 0;
  let accumulatingSinceMs: number | null = null;
  let intentRunning = false;
  let lastActivityAtMs: number | null = null;
  let frozenSeconds: number | null = null;
  let disposed = false;

  function isVisible(): boolean {
    return documentRef ? documentRef.visibilityState === "visible" : true;
  }

  function beginAccumulatingIfNeeded(): void {
    if (accumulatingSinceMs === null) {
      accumulatingSinceMs = now();
    }
  }

  // Closes the current window (if any), crediting it only up to
  // min(now(), lastActivityAtMs + idleThresholdMs) — so a window that went
  // idle and was never interacted with again before this flush stops
  // counting the instant the idle threshold was crossed, not at whatever
  // later moment actually triggered this flush (visibility change, pause,
  // freeze, dispose, or a fresh recordInteraction() reopening the window).
  function flushAccumulating(): void {
    if (accumulatingSinceMs !== null) {
      const nowMs = now();
      const idleCapMs = lastActivityAtMs === null ? nowMs : lastActivityAtMs + idleThresholdMs;
      const effectiveEndMs = Math.min(nowMs, idleCapMs);
      accumulatedMs += Math.max(0, effectiveEndMs - accumulatingSinceMs);
      accumulatingSinceMs = null;
    }
  }

  function handleVisibilityChange(): void {
    if (disposed || frozenSeconds !== null) {
      return;
    }
    if (!isVisible()) {
      flushAccumulating();
    } else if (intentRunning) {
      beginAccumulatingIfNeeded();
    }
  }

  documentRef?.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    start() {
      if (disposed || frozenSeconds !== null) return;
      intentRunning = true;
      lastActivityAtMs = now();
      if (isVisible()) {
        beginAccumulatingIfNeeded();
      }
    },

    pause() {
      if (disposed || frozenSeconds !== null) return;
      intentRunning = false;
      flushAccumulating();
    },

    resume() {
      if (disposed || frozenSeconds !== null) return;
      intentRunning = true;
      lastActivityAtMs = now();
      if (isVisible()) {
        beginAccumulatingIfNeeded();
      }
    },

    recordInteraction() {
      if (disposed || frozenSeconds !== null) return;
      // Close the current window (capped at the *previous* activity's idle
      // deadline, excluding any idle gap that just ended), then reopen a
      // fresh one starting now — so a session with several separate idle
      // gaps has each one excluded independently, not just the last one.
      flushAccumulating();
      lastActivityAtMs = now();
      if (intentRunning && isVisible()) {
        beginAccumulatingIfNeeded();
      }
    },

    freeze() {
      if (frozenSeconds !== null) {
        return frozenSeconds;
      }
      // dispose() already flushed any in-progress window into accumulatedMs
      // and stopped further accumulation — freeze() after dispose() still
      // reports whatever was legitimately accumulated before disposal
      // (e.g. a word finished right as the component unmounted), it just
      // can never accumulate anything new.
      flushAccumulating();
      intentRunning = false;
      const rawSeconds = Math.floor(accumulatedMs / 1000);
      frozenSeconds = Math.min(Math.max(rawSeconds, 0), MAX_WORD_TIME_SECONDS);
      return frozenSeconds;
    },

    getFrozenSeconds() {
      return frozenSeconds;
    },

    reset() {
      accumulatedMs = 0;
      accumulatingSinceMs = null;
      intentRunning = false;
      lastActivityAtMs = null;
      frozenSeconds = null;
    },

    dispose() {
      if (disposed) return;
      flushAccumulating();
      intentRunning = false;
      documentRef?.removeEventListener("visibilitychange", handleVisibilityChange);
      disposed = true;
    },
  };
}
