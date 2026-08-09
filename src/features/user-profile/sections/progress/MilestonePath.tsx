import { Check } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import type { MilestoneTrackId, MilestoneTrackResult } from "../../../../data/learning/milestones";
import { selectMilestonePathNodes } from "./milestonePathWindow";

interface MilestonePathProps {
  track: MilestoneTrackId;
  result: MilestoneTrackResult;
}

// The "journey" visualization inside an expanded accordion row: every
// configured milestone for the track connected by a horizontal line —
// completed milestones as filled checkmarked circles, the active target as
// one large highlighted circle, everything after it as empty muted circles.
// Purely presentational; every number here already comes from the unchanged
// milestone engine (MilestoneTrackResult) — this component computes no
// milestone logic of its own.
//
// Deliberately aria-hidden as a whole: a per-node "10 completed, 25
// completed, 50 current target…" announcement would need translated
// vocabulary ("completed"/"current target"/"upcoming") that does not exist
// in any of the 7 interface JSON files, and this redesign must not touch
// localization. The exact same information is already available to screen
// readers as real, translated text in MilestoneAccordionRow's visible
// "next milestone" detail line right below this path, so hiding the
// decorative graphic loses nothing.
export function MilestonePath({ track, result }: MilestonePathProps) {
  const { uiLanguage } = useLanguage();
  const nodes = selectMilestonePathNodes(track, result);

  return (
    <div className="milestone-path" aria-hidden="true">
      <div className="milestone-path__scroll">
        <div className="milestone-path__track">
          {nodes.map((node, index) => (
            <div className="milestone-path__node-wrap" key={node.milestone.id}>
              {index > 0 ? (
                <span
                  className={`milestone-path__connector ${
                    nodes[index - 1].status === "completed" ? "milestone-path__connector--filled" : ""
                  }`}
                />
              ) : null}
              <div className={`milestone-path__node milestone-path__node--${node.status}`}>
                {/* Fixed-size slot (see progress-section.scss) so the
                    larger "current" circle and the smaller
                    completed/future circles still share one common
                    vertical center — and so every label below lines up
                    in a straight row regardless of which circle size sits
                    above it. */}
                <span className="milestone-path__circle-slot">
                  <span className="milestone-path__circle">
                    {node.status === "completed" ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                </span>
                <span className="milestone-path__value">{node.milestone.target.toLocaleString(uiLanguage)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
