// UI-only node builder for the milestone path visualization
// (MilestonePath.tsx). This is presentation logic — which configured
// milestones are completed/current/future for the current result — not part
// of the milestone engine itself: it only *reads* the already-computed
// MILESTONES_BY_TRACK/MilestoneTrackResult exported by
// src/data/learning/milestones.ts and never touches milestone calculations,
// targets, or evaluation. Deliberately kept in this feature folder (not
// src/data/learning) so that engine module stays exactly as it was in Phase 1.
import { MILESTONES_BY_TRACK, type MilestoneDefinition, type MilestoneTrackId, type MilestoneTrackResult } from "../../../../data/learning/milestones";

export interface MilestonePathNode {
  milestone: MilestoneDefinition;
  status: "completed" | "current" | "future";
}

// Returns every configured milestone for this track. The path container is
// horizontally scrollable, so long tracks stay readable without hiding
// earlier or later milestones.
export function selectMilestonePathNodes(track: MilestoneTrackId, result: MilestoneTrackResult): MilestonePathNode[] {
  const milestones = MILESTONES_BY_TRACK[track];

  return milestones.map((milestone) => ({
    milestone,
    status:
      result.currentValue >= milestone.target
        ? "completed"
        : result.nextMilestone?.id === milestone.id
          ? "current"
          : "future",
  }));
}
