// Pure duration-formatting helper for the Dashboard's Study Activity card
// (summary total, Y-axis labels, tooltip rows). No React, no i18n — this
// module only ever produces the numeric {hours, minutes} parts; the actual
// localized string ("1h 30m" / "1 h 30 min" / etc.) is assembled by the
// component via t()/interpolateTemplate against
// userProfile.dashboardPage.supportingCards.studyActivity.duration.* — see
// StudyActivityCard.tsx. Keeping the numeric part free of i18n lets it stay
// independently unit-tested (scripts/tests/learning/test-study-duration.mjs)
// and lets every locale control its own exact spacing/order/abbreviation
// without touching this module.
//
// "Never display raw seconds" (see the Study Activity brief) is enforced
// here: computeDurationParts always rounds down to whole minutes — a
// duration under 60 seconds renders as 0 minutes, exactly like every other
// sub-minute remainder does, never as a fractional or raw-second value.

export interface StudyDurationParts {
  hours: number;
  minutes: number;
}

// Floors to whole minutes (never raw seconds, never fractional minutes),
// then splits into hours/minutes. Negative/non-finite input is treated as
// zero — this module never produces a negative or NaN part, matching the
// same "safe by construction" precedent as learningTimeStats.ts's own
// parsing.
export function computeDurationParts(totalSeconds: number): StudyDurationParts {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

// ---------------------------------------------------------------------
// Adaptive chart Y-axis scale (Study Activity redesign) — purely a
// presentation concern (how to draw gridlines), not aggregation: the
// caller still supplies the real max total across whatever buckets are
// currently displayed (computed by studyActivity.ts, unchanged). This
// module only decides where to draw the 2–4 horizontal gridlines a stacked
// bar chart needs, using the standard "nice numbers" technique (pick the
// smallest step from a 1/2/5/10 ladder, scaled by a power of ten, such that
// a fixed number of equal steps comfortably covers the real max) so the
// scale always reflects the actual data — never a hardcoded ceiling like a
// fixed "30 minutes".
// ---------------------------------------------------------------------

export interface StudyActivityChartScale {
  // Top of the scale — always stepSeconds * 3, i.e. the last tick.
  maxSeconds: number;
  stepSeconds: number;
  // Ascending, always [0, step, 2*step, 3*step] — 4 gridlines (within the
  // 2–4 line guidance), matching the baseline plus three ticks above it.
  tickSecondsList: number[];
}

const CHART_SCALE_INTERVAL_COUNT = 3;
const NICE_FRACTIONS = [1, 2, 5, 10];

function pickNiceFraction(rough: number): number {
  for (const fraction of NICE_FRACTIONS) {
    if (fraction >= rough) {
      return fraction;
    }
  }
  return 10;
}

// maxTotalSecondsInput is the real largest bucket total currently on
// screen (0 when there is genuinely no activity in view — computeDurationParts's
// same "never negative/NaN" safety applies here too). A true-zero input
// still needs *some* scale to draw a legible empty-state axis, so it falls
// back to a 10-minute basis before running the same nice-number algorithm
// — not a fixed 30-minute ceiling, and never used when real data exists.
export function computeStudyActivityChartScale(maxTotalSecondsInput: number): StudyActivityChartScale {
  const safeMaxSeconds =
    Number.isFinite(maxTotalSecondsInput) && maxTotalSecondsInput > 0 ? maxTotalSecondsInput : 0;
  const maxMinutes = safeMaxSeconds > 0 ? safeMaxSeconds / 60 : 10;

  const roughStepMinutes = maxMinutes / CHART_SCALE_INTERVAL_COUNT;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStepMinutes)));
  const stepMinutes = pickNiceFraction(roughStepMinutes / magnitude) * magnitude;
  const stepSeconds = Math.round(stepMinutes * 60);

  const tickSecondsList = Array.from({ length: CHART_SCALE_INTERVAL_COUNT + 1 }, (_, index) => index * stepSeconds);

  return {
    maxSeconds: tickSecondsList[tickSecondsList.length - 1],
    stepSeconds,
    tickSecondsList,
  };
}

// ---------------------------------------------------------------------
// X-axis label thinning (line-chart redesign) — purely a presentation
// concern: which of N evenly-spaced points get a rendered label, never
// which points get plotted (every point is always plotted; this only
// decides label text visibility to avoid overlapping/illegible axis
// text on a 30-day — or longer — range). Evenly spaced, always includes
// the first and last index so the axis's start/end stay anchored.
// ---------------------------------------------------------------------

// count <= maxLabels returns every index (e.g. the default 7-day view
// shows all 7 weekday labels, unchanged from before this existed).
export function computeVisibleLabelIndices(count: number, maxLabels: number): ReadonlySet<number> {
  if (count <= 0) {
    return new Set();
  }
  const effectiveMaxLabels = Math.max(1, Math.floor(maxLabels));
  if (count <= effectiveMaxLabels) {
    return new Set(Array.from({ length: count }, (_, index) => index));
  }
  if (effectiveMaxLabels === 1) {
    // Anchor on the most recent point rather than showing nothing.
    return new Set([count - 1]);
  }
  const indices = new Set<number>();
  const step = (count - 1) / (effectiveMaxLabels - 1);
  for (let k = 0; k < effectiveMaxLabels; k += 1) {
    indices.add(Math.round(k * step));
  }
  return indices;
}
