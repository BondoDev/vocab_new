// Pure selection/reshaping for the Dashboard's Milestone Preview card —
// picks up to 3 tracks out of the milestone engine's already-evaluated
// results (src/data/learning/milestones.ts's evaluateAllMilestoneTracks)
// and reshapes each into the compact fields the preview row needs. No
// milestone math happens here: every number below is read straight off
// the MilestoneTrackResult the shared engine already computed — this
// module exists only so "which 3 tracks, in which order" is one pure,
// testable decision instead of being inlined into JSX.
import type { MilestoneResults, MilestoneTrackId } from "../../../../data/learning/milestones";

// Vocabulary / Reviews / Consistency, per the Phase brief's recommended
// tracks — Mastery is deliberately omitted to keep the compact preview to
// 3 rows ("Do not show all four unless layout remains clean").
export const DASHBOARD_MILESTONE_PREVIEW_TRACKS: readonly MilestoneTrackId[] = [
  "vocabulary",
  "reviews",
  "consistency",
];

export interface DashboardMilestonePreviewRow {
  track: MilestoneTrackId;
  current: number;
  target: number;
  // Already clamped to [0, 1] by evaluateMilestoneTrack.
  progress: number;
  isTrackComplete: boolean;
}

export function selectDashboardMilestonePreview(results: MilestoneResults): DashboardMilestonePreviewRow[] {
  return DASHBOARD_MILESTONE_PREVIEW_TRACKS.map((track) => {
    const result = results[track];
    return {
      track,
      current: result.currentValue,
      target: result.target,
      progress: result.progress,
      isTrackComplete: result.isTrackComplete,
    };
  });
}
