import { useCallback, useEffect, useRef, useState } from "react";

export interface HorizontalScrollState {
  canScroll: boolean;
  atStart: boolean;
  atEnd: boolean;
}

const INITIAL_SCROLL_STATE: HorizontalScrollState = { canScroll: false, atStart: true, atEnd: true };

// Tracks whether a horizontally-scrollable region actually overflows its
// container, and which edge it's currently at, so a "swipe" hint and
// prev/next controls can show/enable themselves without a hardcoded
// breakpoint. Table width here is data-driven (dynamic column counts,
// filtered row sets), so this has to be measured, not assumed.
// `dependencies` should list whatever can change the table's rendered
// width/rows (e.g. column count, filtered row count) to force remeasuring.
export function useHorizontalTableScroll(dependencies: readonly unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<HorizontalScrollState>(INITIAL_SCROLL_STATE);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const updateScrollState = () => {
      setScrollState({
        canScroll: node.scrollWidth > node.clientWidth + 1,
        atStart: node.scrollLeft <= 0,
        atEnd: node.scrollLeft >= node.scrollWidth - node.clientWidth - 1,
      });
    };

    updateScrollState();

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(node);
    node.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      resizeObserver.disconnect();
      node.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  const scrollByPage = useCallback((direction: 1 | -1) => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({
      left: direction * Math.round(node.clientWidth * 0.75),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, []);

  return { scrollRef, scrollState, scrollByPage };
}
