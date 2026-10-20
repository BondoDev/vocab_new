// Shared sizing/styling for the two sticky "identifying" columns (row
// number, primary word) used by every dynamic-width verb table. Kept as
// constants (not per-page copies) so the mobile layout stays identical
// across the past-forms and common-100-verbs table families.

// Just wide enough for a 3-digit row number (values only ever run 1-100).
export const NUMBER_COLUMN_WIDTH = "2.25rem";

// Both sticky columns need an opaque background matching the row/header
// background so scrolling column content doesn't show through underneath,
// plus a z-index above the non-sticky columns so later-DOM (scrolling)
// cells don't paint over them.
export const STICKY_HEADER_CELL = "sticky z-20 bg-card";
export const STICKY_BODY_CELL = "sticky z-10 bg-card";

// Separation from the scrolling columns comes from spacing, not a hard
// border (a full-height border reads as a heavy rule cutting into the first
// scrolling column). Only while there's actually more to scroll to, an
// intentionally faint shadow reinforces the edge.
export const STICKY_EDGE_SHADOW = "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]";
