import { useEffect, useRef } from "react";

// Enter = Next for an exercise card (Custom Practice, Review Words, Study New
// Words): while `enabled` (the card's Next button is active), a plain Enter
// anywhere on the page advances, including inside the answer field once the
// word is solved. Ignored when focus is on a button/link/select/textarea, so
// Enter keeps activating that control (e.g. "Practice again", dialog
// actions) instead of also advancing. Key repeat is ignored so holding Enter
// can't skip several cards.
const SELF_ACTIVATING_TARGETS = "button, a[href], select, textarea, [role='button']";

export function useEnterToAdvance(enabled: boolean, onAdvance: () => void): void {
  // Latest callback without re-subscribing every render.
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.repeat ||
        event.isComposing ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest(SELF_ACTIVATING_TARGETS)) {
        return;
      }
      event.preventDefault();
      onAdvanceRef.current();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
