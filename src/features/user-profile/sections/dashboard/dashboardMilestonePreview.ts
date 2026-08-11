// Pure selection/reshaping for the Dashboard's Milestone Preview card.
// Mirrors the Progress page's four visible milestone tracks and reshapes
// each into the compact fields the preview row needs. No milestone math
// happens here: every number below is read straight off the
// MilestoneTrackResult the shared engine already computed.
import type { MilestoneResults, MilestoneTrackId } from "../../../../data/learning/milestones";

// Same visible order as the Progress page's milestone row list.
export const DASHBOARD_MILESTONE_PREVIEW_TRACKS: readonly MilestoneTrackId[] = [
  "vocabulary",
  "known",
  "mastery",
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
