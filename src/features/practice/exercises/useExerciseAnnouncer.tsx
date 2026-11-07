import { useCallback, useEffect, useRef, useState } from "react";

// Screen-reader feedback for exercise answers ("Correct!", "Not correct -
// try again", ...), shared by the exercise implementations in this folder.
//
// The live region is rendered by the exercise and stays mounted for its
// lifetime; only its text changes, which is the reliable aria-live pattern
// (same reasoning as app/components/Toast.tsx). To re-announce an identical
// message (two wrong attempts in a row) the text is cleared first and set
// again on the next tick. It is a polite status region, so it never
// interrupts the user mid-typing, and callers announce only real outcomes —
// a completed answer or a pair choice, never partial input, and never the
// answer itself.
export function useExerciseAnnouncer() {
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const announce = useCallback((text: string) => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setMessage("");
    timeoutRef.current = window.setTimeout(() => {
      setMessage(text);
      timeoutRef.current = null;
    }, 50);
  }, []);

  // Empties the region (no announcement) when the feedback it described is
  // gone, e.g. a wrong-order message after the slots reset, so no stale
  // text lingers for screen-reader browsing.
  const clear = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setMessage("");
  }, []);

  const liveRegion = (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </span>
  );

  return { announce, clear, liveRegion };
}
