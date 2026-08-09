// UI-only windowing helper for the milestone path visualization
// (MilestonePath.tsx). This is presentation logic — "which few milestones
// should the journey path show around the user's current position" — not
// part of the milestone engine itself: it only *reads* the already-computed
// MILESTONES_BY_TRACK/MilestoneTrackResult exported by
// src/data/learning/milestones.ts and never touches milestone
// calculations, targets, or evaluation. Deliberately kept in this feature
// folder (not src/data/learning) so that engine module stays exactly as it
// was in Phase 1.
import { MILESTONES_BY_TRACK, type MilestoneDefinition, type MilestoneTrackId, type MilestoneTrackResult } from "../../../../data/learning/milestones";

// 2 before the active target + the target itself + 2 after, e.g. for a
// Vocabulary user at 26 words (next target 50): 10 — 25 — 50 — 100 — 250.
// Matches the redesign brief's own worked examples exactly.
const WINDOW_SIZE = 5;
const WINDOW_BEFORE = 2;

export interface MilestonePathNode {
  milestone: MilestoneDefinition;
  status: "completed" | "current" | "future";
}

// Centers the window on the active next milestone; once a track is fully
// complete (nextMilestone === null) there is no "current" target to center
// on, so this centers on the highest configured milestone instead, showing
// the tail end of the journey. Clamps at either edge of the track's own
// milestone list rather than padding with anything that doesn't exist.
export function selectMilestonePathWindow(track: MilestoneTrackId, result: MilestoneTrackResult): MilestonePathNode[] {
  const milestones = MILESTONES_BY_TRACK[track];
  const centerIndex = result.nextMilestone
    ? milestones.findIndex((milestone) => milestone.id === result.nextMilestone!.id)
    : milestones.length - 1;

  let start = centerIndex - WINDOW_BEFORE;
  let end = start + WINDOW_SIZE - 1;

  if (start < 0) {
    start = 0;
    end = Math.min(milestones.length - 1, WINDOW_SIZE - 1);
  }
  if (end > milestones.length - 1) {
    end = milestones.length - 1;
    start = Math.max(0, end - WINDOW_SIZE + 1);
  }

  return milestones.slice(start, end + 1).map((milestone) => ({
    milestone,
    status:
      result.currentValue >= milestone.target
        ? "completed"
        : result.nextMilestone?.id === milestone.id
          ? "current"
          : "future",
  }));
}
