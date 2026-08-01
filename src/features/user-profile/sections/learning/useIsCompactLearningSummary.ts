import { useEffect, useState } from "react";

const COMPACT_SUMMARY_QUERY = "(max-width: 643.98px)";

// Below this width the three summary cards stacked at full height push the
// Start Learning section too far down, so Daily Goal / Daily Streak switch
// to collapsed accordion rows (see learning-section.scss). Matches the
// matchMedia + addEventListener pattern already used in
// LevelCategorySelection.tsx rather than a resize listener.
export function useIsCompactLearningSummary(): boolean {
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia(COMPACT_SUMMARY_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(COMPACT_SUMMARY_QUERY);
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isCompact;
}
