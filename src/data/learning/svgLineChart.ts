// Pure SVG path-string math for the Dashboard's Study Activity line chart —
// a monotone cubic Hermite spline (Fritsch–Carlson, the same technique
// behind D3's curveMonotoneX and most analytics-chart libraries), converted
// to cubic Bezier segments for an SVG <path> `d` attribute. No React, no
// DOM — a plain data-shaping module, loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-svg-line-chart.mjs, matching every other pure
// module in this directory.
//
// WHY MONOTONE, NOT A GENERIC CATMULL-ROM/NATURAL SPLINE — a naive smooth
// spline through real data points can overshoot: it may dip below or rise
// above the two points it's connecting, visually implying a measured value
// that never happened between two real dates. Monotone cubic interpolation
// constrains each segment's tangents (see computeMonotoneTangents' own
// header) so the curve never exceeds the range of its two endpoints — every
// segment stays between min(y0, y1) and max(y0, y1), verified in this
// module's test file. The curve still passes through every real data point
// exactly; only the shape *between* two points is smoothed, never the
// values themselves.
//
// Curve-only concern: StudyActivityCard.tsx supplies plain {x, y} pairs
// already computed by its own (untouched) aggregation/scale logic
// (studyActivity.ts, computeStudyActivityChartScale) — this module knows
// nothing about seconds, buckets, or time at all.

export interface ChartPoint {
  x: number;
  y: number;
}

// One tangent (slope) per point, constrained so the resulting curve never
// overshoots. n < 2 returns all-zero tangents (nothing to interpolate
// between).
function computeMonotoneTangents(points: readonly ChartPoint[]): number[] {
  const n = points.length;
  const tangents = new Array<number>(n).fill(0);
  if (n < 2) {
    return tangents;
  }

  // Secant slope of each segment i -> i+1. Guards dx === 0 (should not
  // occur for this chart's evenly-spaced x values, but stays safe if ever
  // fed duplicate x's) by treating a zero-width segment as flat rather
  // than dividing by zero.
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    slopes.push(dx !== 0 ? dy / dx : 0);
  }

  // Endpoints take their single neighboring segment's slope outright.
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];

  // Interior points: zero tangent at a local min/max (where the two
  // neighboring slopes disagree in sign, or either is flat) — this is
  // what keeps the curve from swinging past a peak/valley; otherwise the
  // average of the two neighboring slopes.
  for (let i = 1; i < n - 1; i += 1) {
    const before = slopes[i - 1];
    const after = slopes[i];
    if (before === 0 || after === 0 || before > 0 !== after > 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (before + after) / 2;
    }
  }

  // Fritsch–Carlson overshoot limiter: for each segment, scale down its
  // two tangents together if they'd otherwise push the curve past the
  // segment's own [min(y), max(y)] range.
  for (let i = 0; i < n - 1; i += 1) {
    const slope = slopes[i];
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i] / slope;
    const beta = tangents[i + 1] / slope;
    const magnitudeSquared = alpha * alpha + beta * beta;
    if (magnitudeSquared > 9) {
      const scale = 3 / Math.sqrt(magnitudeSquared);
      tangents[i] = scale * alpha * slope;
      tangents[i + 1] = scale * beta * slope;
    }
  }

  return tangents;
}

// Builds an SVG path `d` string: a smooth monotone curve through every
// point in order, using cubic Bezier ("C") segments. Never invents a point
// — the curve is defined entirely by (and passes exactly through) the
// supplied points; only the shape connecting them is smoothed.
export function buildMonotoneLinePath(points: readonly ChartPoint[]): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const tangents = computeMonotoneTangents(points);
  const segments = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    // Standard Hermite-to-Bezier conversion: control points sit a third of
    // the way along each point's own tangent line.
    const dxThird = (p1.x - p0.x) / 3;
    const c1x = p0.x + dxThird;
    const c1y = p0.y + tangents[i] * dxThird;
    const c2x = p1.x - dxThird;
    const c2y = p1.y - tangents[i + 1] * dxThird;
    segments.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1.x} ${p1.y}`);
  }

  return segments.join(" ");
}

// The same smooth line, closed into a filled shape against a fixed
// baseline (e.g. the chart's 0-value Y position) — used for the subtle
// gradient area fill beneath each series. Never used for the stroke path
// itself, only the fill.
export function buildMonotoneAreaPath(points: readonly ChartPoint[], baselineY: number): string {
  if (points.length === 0) {
    return "";
  }
  const linePath = buildMonotoneLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}
