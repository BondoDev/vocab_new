// Focused guard for the pure monotone-cubic SVG path generator in
// src/data/learning/svgLineChart.ts. Import-free beyond its own module, so
// it loads directly via `node --experimental-strip-types`, matching every
// other pure module's test script in this repository.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-svg-line-chart.mjs
import assert from "node:assert/strict";
import { buildMonotoneAreaPath, buildMonotoneLinePath } from "../../../src/data/learning/svgLineChart.ts";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// Minimal cubic Bezier evaluator (test-only) — samples a "C c1x,c1y
// c2x,c2y ex,ey" segment at parameter t in [0, 1], given the segment's
// start point.
function evaluateCubicBezier(p0, c1, c2, p1, t) {
  const mt = 1 - t;
  const x = mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x;
  const y = mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y;
  return { x, y };
}

// Parses a path built by buildMonotoneLinePath back into its M start point
// plus a list of {c1, c2, end} Bezier segments — test-only, mirrors
// exactly the "M x y C c1x c1y, c2x c2y, ex ey ..." format the module
// emits.
function parsePath(d) {
  const tokens = d.split(/\s+M\s+|\s+C\s+/).filter(Boolean);
  // First token is actually "M x y" with the leading "M " already split
  // off by the regex above only for subsequent occurrences; handle the
  // very first manually instead.
  const parts = d.trim().split(/(?=[MC])/).map((s) => s.trim());
  let start = null;
  const segments = [];
  for (const part of parts) {
    if (part.startsWith("M")) {
      const [x, y] = part.slice(1).trim().split(/\s+/).map(Number);
      start = { x, y };
    } else if (part.startsWith("C")) {
      const nums = part
        .slice(1)
        .trim()
        .split(",")
        .map((chunk) => chunk.trim().split(/\s+/).map(Number));
      const [c1x, c1y] = nums[0];
      const [c2x, c2y] = nums[1];
      const [ex, ey] = nums[2];
      segments.push({ c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, end: { x: ex, y: ey } });
    }
  }
  return { start, segments };
}

console.log("\n=== buildMonotoneLinePath: basic shape ===\n");

test("1. Empty points array returns an empty string", () => {
  assert.equal(buildMonotoneLinePath([]), "");
});

test("2. A single point returns just an M command, no curve", () => {
  const d = buildMonotoneLinePath([{ x: 5, y: 10 }]);
  assert.equal(d, "M 5 10");
});

test("3. The path always starts with M at the first point", () => {
  const d = buildMonotoneLinePath([{ x: 0, y: 50 }, { x: 10, y: 20 }, { x: 20, y: 80 }]);
  assert.match(d, /^M 0 50/);
});

test("4. Two points produce exactly one C segment ending exactly at the second point", () => {
  const points = [{ x: 0, y: 40 }, { x: 10, y: 90 }];
  const { start, segments } = parsePath(buildMonotoneLinePath(points));
  assert.deepEqual(start, points[0]);
  assert.equal(segments.length, 1);
  assert.deepEqual(segments[0].end, points[1]);
});

test("5. N points produce exactly N-1 segments, each ending at its corresponding real data point", () => {
  const points = [
    { x: 0, y: 10 },
    { x: 10, y: 40 },
    { x: 20, y: 15 },
    { x: 30, y: 60 },
    { x: 40, y: 0 },
  ];
  const { segments } = parsePath(buildMonotoneLinePath(points));
  assert.equal(segments.length, points.length - 1);
  for (let i = 0; i < segments.length; i += 1) {
    assert.deepEqual(segments[i].end, points[i + 1]);
  }
});

console.log("\n=== buildMonotoneLinePath: no fabricated values (Bezier endpoint property) ===\n");

test("6. Sampling each segment at t=0 and t=1 reproduces the two real endpoints exactly", () => {
  const points = [{ x: 0, y: 5 }, { x: 10, y: 25 }, { x: 20, y: 5 }, { x: 30, y: 35 }];
  const { start, segments } = parsePath(buildMonotoneLinePath(points));
  let p0 = start;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const at0 = evaluateCubicBezier(p0, seg.c1, seg.c2, seg.end, 0);
    const at1 = evaluateCubicBezier(p0, seg.c1, seg.c2, seg.end, 1);
    assert.ok(Math.abs(at0.x - p0.x) < 1e-9 && Math.abs(at0.y - p0.y) < 1e-9);
    assert.ok(Math.abs(at1.x - seg.end.x) < 1e-9 && Math.abs(at1.y - seg.end.y) < 1e-9);
    p0 = seg.end;
  }
});

console.log("\n=== buildMonotoneLinePath: monotonicity / no overshoot ===\n");

test("7. A sharp zigzag (peak/valley) never overshoots — every sampled y stays within its own segment's [min, max]", () => {
  // Deliberately sharp local extremes, the classic overshoot trap for a
  // naive (non-monotone) spline.
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 90 },
    { x: 20, y: 5 },
    { x: 30, y: 95 },
    { x: 40, y: 0 },
  ];
  const { start, segments } = parsePath(buildMonotoneLinePath(points));
  let p0 = start;
  for (const seg of segments) {
    const lo = Math.min(p0.y, seg.end.y);
    const hi = Math.max(p0.y, seg.end.y);
    for (let t = 0; t <= 1; t += 0.02) {
      const { y } = evaluateCubicBezier(p0, seg.c1, seg.c2, seg.end, t);
      assert.ok(y >= lo - 1e-6 && y <= hi + 1e-6, `segment overshoot at t=${t}: y=${y} not within [${lo}, ${hi}]`);
    }
    p0 = seg.end;
  }
});

test("8. A perfectly flat series (all-zero values) stays exactly flat — no wiggle introduced by the spline", () => {
  const points = [{ x: 0, y: 100 }, { x: 10, y: 100 }, { x: 20, y: 100 }, { x: 30, y: 100 }];
  const { start, segments } = parsePath(buildMonotoneLinePath(points));
  let p0 = start;
  for (const seg of segments) {
    for (let t = 0; t <= 1; t += 0.1) {
      const { y } = evaluateCubicBezier(p0, seg.c1, seg.c2, seg.end, t);
      assert.ok(Math.abs(y - 100) < 1e-9, `flat series must never deviate from y=100, got ${y}`);
    }
    p0 = seg.end;
  }
});

test("9. A monotonically increasing series stays monotonically non-decreasing along the whole curve", () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 50 }, { x: 30, y: 55 }, { x: 40, y: 90 }];
  const { start, segments } = parsePath(buildMonotoneLinePath(points));
  let p0 = start;
  let lastY = -Infinity;
  for (const seg of segments) {
    for (let t = 0; t <= 1; t += 0.05) {
      const { y } = evaluateCubicBezier(p0, seg.c1, seg.c2, seg.end, t);
      assert.ok(y >= lastY - 1e-6, `must never decrease along a monotonically increasing series (y=${y} after ${lastY})`);
      lastY = y;
    }
    p0 = seg.end;
  }
});

console.log("\n=== buildMonotoneAreaPath ===\n");

test("10. Empty points array returns an empty string", () => {
  assert.equal(buildMonotoneAreaPath([], 100), "");
});

test("11. The area path closes down to the baseline at the last point's x, then back to the first point's x, then Z", () => {
  const points = [{ x: 0, y: 20 }, { x: 10, y: 60 }, { x: 20, y: 40 }];
  const d = buildMonotoneAreaPath(points, 100);
  assert.match(d, /L 20 100 L 0 100 Z$/);
});

test("12. The area path's curved portion is identical to buildMonotoneLinePath's own output for the same points", () => {
  const points = [{ x: 0, y: 20 }, { x: 10, y: 60 }, { x: 20, y: 40 }];
  const linePath = buildMonotoneLinePath(points);
  const areaPath = buildMonotoneAreaPath(points, 100);
  assert.ok(areaPath.startsWith(linePath));
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("svg-line-chart guard passed");
}
