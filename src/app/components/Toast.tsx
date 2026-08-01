import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DEFAULT_DURATION_MS = 3000;

// Shared across app/feature owners for local-only "saved" / "selected"
// style confirmations. Each caller owns its own message state — this is a
// small hook + component pair, not a global singleton/queue — so unrelated
// callers rendering at the same time get independent, independently
// positioned toasts rather than one shared node.
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
// aria-live pattern for repeated identical announcements. Styled with
// Tailwind utility classes directly (this project's styling system) rather
// than a colocated stylesheet, since as an app-wide primitive it has no
// single feature folder to own an SCSS file.
export function Toast({ message }: { message: string | null }) {
  // document.body doesn't exist during SSR/prerendering (entry-server.tsx
  // has no DOM), and /profile — which always mounts a Toast via
  // DailyGoalSelector's LearningSection — is a prerendered route. Skip the
  // portal there; the client hydrates and mounts it normally afterward.
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-3 right-3 top-[3.75rem] z-[80] rounded-md border border-border bg-card px-3.5 py-2.5 text-[0.8rem] font-medium text-foreground shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition-all duration-200 ease-out sm:left-auto sm:top-[5.5rem] sm:right-5 sm:max-w-xs ${
        message
          ? "translate-y-0 opacity-100 visible"
          : "-translate-y-2 opacity-0 invisible pointer-events-none"
      }`}
    >
      {message ?? ""}
    </div>,
    document.body
  );
}
