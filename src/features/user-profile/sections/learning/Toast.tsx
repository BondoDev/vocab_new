import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DEFAULT_DURATION_MS = 3000;

// Shared by DailyGoalSelector and LearningModeCards for their local-only
// "saved" / "selected" confirmations, replacing what used to be two
// separately hand-rolled timeout+state implementations of the same thing.
export function useAutoDismissMessage(durationMs: number = DEFAULT_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const show = (text: string) => {
    setMessage(text);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setMessage(null);
    }, durationMs);
  };

  return { message, show };
}

// Portalled to document.body so fixed positioning is always relative to the
// viewport, regardless of any transformed ancestor in the page/nav chrome.
// The node stays mounted at all times (text toggles between the message and
// empty) rather than mounting/unmounting, which is the more reliable
// aria-live pattern for repeated identical announcements.
export function Toast({ message }: { message: string | null }) {
  return createPortal(
    <div
      className={`learning-toast ${message ? "learning-toast--visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      {message ?? ""}
    </div>,
    document.body
  );
}
