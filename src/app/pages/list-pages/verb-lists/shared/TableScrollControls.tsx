import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HorizontalScrollState } from "./useHorizontalTableScroll";

interface TableScrollControlsProps {
  scrollState: HorizontalScrollState;
  hint: string;
  hintId: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
  onScrollLeft: () => void;
  onScrollRight: () => void;
}

const ARROW_BUTTON_CLASS =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:opacity-60";

// Persistent horizontal-scroll affordance for a data-driven table: a
// secondary text hint plus prev/next buttons. Renders nothing once the
// table no longer overflows its wrapper (buttons should never imply there's
// more to see when there isn't), so callers can render it unconditionally.
export function TableScrollControls({
  scrollState,
  hint,
  hintId,
  scrollLeftLabel,
  scrollRightLabel,
  onScrollLeft,
  onScrollRight,
}: TableScrollControlsProps) {
  if (!scrollState.canScroll) {
    return null;
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : (
        <span />
      )}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onScrollLeft}
          disabled={scrollState.atStart}
          aria-label={scrollLeftLabel || undefined}
          className={ARROW_BUTTON_CLASS}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onScrollRight}
          disabled={scrollState.atEnd}
          aria-label={scrollRightLabel || undefined}
          className={ARROW_BUTTON_CLASS}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
