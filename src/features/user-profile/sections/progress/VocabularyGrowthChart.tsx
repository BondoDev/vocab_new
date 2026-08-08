import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import type { VocabularyGrowthDayCounts } from "../../../../data/learning/vocabularyGrowth";

// Focused, hand-written responsive SVG line chart — no charting library
// exists in this project's dependencies (checked package.json), and three
// series over at most ~365 points is well within what a small hand-built
// chart can do cleanly, matching the task brief's explicit "do not add a
// heavy chart dependency for this simple three-series chart" instruction.
// Three independent lines (never a stacked/area chart — the brief is
// explicit that this must show each category's own count, not a running
// total split into bands).

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 260;
const PADDING_LEFT = 44;
const PADDING_RIGHT = 12;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 28;
const PLOT_WIDTH = VIEW_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const GRID_DIVISIONS = 4;

// Rounds a raw maximum data value up to a "nice" round number for the Y
// axis (1/2/5 x a power of ten) — e.g. 84 -> 100, 7 -> 10, 340 -> 500.
function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normalized = rawMax / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function xForIndex(index: number, count: number): number {
  if (count <= 1) return PADDING_LEFT + PLOT_WIDTH / 2;
  return PADDING_LEFT + (index / (count - 1)) * PLOT_WIDTH;
}

function yForValue(value: number, maxValue: number): number {
  const ratio = maxValue > 0 ? value / maxValue : 0;
  return PADDING_TOP + PLOT_HEIGHT - ratio * PLOT_HEIGHT;
}

function buildLinePath(values: readonly number[], maxValue: number): string {
  return values.map((value, index) => `${index === 0 ? "M" : "L"}${xForIndex(index, values.length)},${yForValue(value, maxValue)}`).join(" ");
}

// Evenly spaced x-axis tick indices (always including the first and last
// point), capped at 6 so 90-day/all-time ranges never crowd the axis with
// unreadable overlapping labels.
function pickTickIndices(count: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const tickCount = Math.min(6, count);
  if (tickCount <= 1) return [0];
  const indices = new Set<number>();
  for (let i = 0; i < tickCount; i++) {
    indices.add(Math.round((i * (count - 1)) / (tickCount - 1)));
  }
  return [...indices].sort((a, b) => a - b);
}

function parseDateOnlyUTC(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

interface VocabularyGrowthChartProps {
  data: readonly VocabularyGrowthDayCounts[];
}

// Category colors reused exactly from the Vocabulary page's own summary
// cards (VocabularySummaryCards.tsx / vocabulary-section.scss): Learning =
// the shared --primary token (its "purple" variant there), Known/Mastered
// = the same locally-scoped --vocab-green/--vocab-amber tokens that file
// already defines for the identical reason ("no green/amber exists in the
// shared theme tokens yet") — redefined here under the same names/values
// rather than importing CSS, since there is no cross-file CSS import
// mechanism in this codebase's SCSS setup (each feature owns its own
// stylesheet, e.g. learning-section.scss/vocabulary-section.scss already
// each do this independently).
const SERIES = [
  { key: "learning" as const, cssVar: "--growth-learning", labelKey: "userProfile.vocabularySection.summaryCards.learning.title" },
  { key: "known" as const, cssVar: "--growth-known", labelKey: "userProfile.vocabularySection.summaryCards.known.title" },
  { key: "mastered" as const, cssVar: "--growth-mastered", labelKey: "userProfile.vocabularySection.summaryCards.mastered.title" },
];

export function VocabularyGrowthChart({ data }: VocabularyGrowthChartProps) {
  const { t, uiLanguage } = useLanguage();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxValue = niceMax(Math.max(1, ...data.map((day) => Math.max(day.learning, day.known, day.mastered))));
  const tickIndices = pickTickIndices(data.length);
  const isSinglePoint = data.length === 1;

  const shortDateFormatter = new Intl.DateTimeFormat(uiLanguage, { month: "short", day: "numeric", timeZone: "UTC" });
  const longDateFormatter = new Intl.DateTimeFormat(uiLanguage, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const handlePointerMove = (evt: ReactPointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((evt.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const ratio = (svgX - PADDING_LEFT) / PLOT_WIDTH;
    const index = Math.round(ratio * (data.length - 1));
    setHoveredIndex(Math.min(data.length - 1, Math.max(0, index)));
  };

  const hoveredDay = hoveredIndex !== null ? data[hoveredIndex] : null;
  const latest = data[data.length - 1] ?? null;

  // Accessible text summary — a real text node (not just an aria-label)
  // covering the "at minimum" bar the task brief sets: latest
  // Learning/Known/Mastered counts. The selected date-range label itself
  // is rendered as visible text by the range selector next to this chart
  // (VocabularyGrowthSection.tsx), so it isn't repeated a second time
  // here. Composed entirely from already-translated strings (category
  // names reused from vocabularySection.summaryCards, "of"/unit words are
  // not needed here) — no new translation keys.
  const summaryText = latest
    ? `${t("userProfile.vocabularySection.summaryCards.learning.title")}: ${latest.learning.toLocaleString(uiLanguage)}. ` +
      `${t("userProfile.vocabularySection.summaryCards.known.title")}: ${latest.known.toLocaleString(uiLanguage)}. ` +
      `${t("userProfile.vocabularySection.summaryCards.mastered.title")}: ${latest.mastered.toLocaleString(uiLanguage)}.`
    : "";

  return (
    <div className="vocabulary-growth-chart">
      <p className="sr-only">{summaryText}</p>

      <div className="vocabulary-growth-chart__legend" role="list">
        {SERIES.map((series) => (
          <span key={series.key} className="vocabulary-growth-chart__legend-item" role="listitem">
            <span
              className="vocabulary-growth-chart__legend-swatch"
              style={{ background: `var(${series.cssVar})` }}
              aria-hidden="true"
            />
            <span className="vocabulary-growth-chart__legend-label">{t(series.labelKey)}</span>
          </span>
        ))}
      </div>

      <div className="vocabulary-growth-chart__plot-wrap">
        <svg
          ref={svgRef}
          className="vocabulary-growth-chart__svg"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {/* Y-axis gridlines + labels */}
          {Array.from({ length: GRID_DIVISIONS + 1 }, (_, i) => {
            const value = (maxValue / GRID_DIVISIONS) * i;
            const y = yForValue(value, maxValue);
            return (
              <g key={i}>
                <line
                  className="vocabulary-growth-chart__gridline"
                  x1={PADDING_LEFT}
                  x2={VIEW_WIDTH - PADDING_RIGHT}
                  y1={y}
                  y2={y}
                />
                <text className="vocabulary-growth-chart__axis-label" x={PADDING_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle">
                  {Math.round(value).toLocaleString(uiLanguage)}
                </text>
              </g>
            );
          })}

          {/* X-axis date labels */}
          {tickIndices.map((index) => (
            <text
              key={index}
              className="vocabulary-growth-chart__axis-label"
              x={xForIndex(index, data.length)}
              y={VIEW_HEIGHT - PADDING_BOTTOM + 18}
              textAnchor="middle"
            >
              {shortDateFormatter.format(parseDateOnlyUTC(data[index].dateISO))}
            </text>
          ))}

          {/* Three independent lines — never stacked. A single-point
              history has nothing to draw a line between, so each series
              renders one filled circle instead (still a valid, non-
              fabricated visualization of the one real day that exists). */}
          {SERIES.map((series) =>
            isSinglePoint ? (
              <circle
                key={series.key}
                className="vocabulary-growth-chart__point"
                style={{ fill: `var(${series.cssVar})` }}
                cx={xForIndex(0, 1)}
                cy={yForValue(data[0][series.key], maxValue)}
                r={4}
              />
            ) : (
              <path
                key={series.key}
                className="vocabulary-growth-chart__line"
                style={{ stroke: `var(${series.cssVar})` }}
                d={buildLinePath(
                  data.map((day) => day[series.key]),
                  maxValue,
                )}
                fill="none"
              />
            ),
          )}

          {/* Hover/tap indicator: a vertical guide line + one dot per
              series at the hovered index. */}
          {hoveredDay
            ? [
                <line
                  key="guide"
                  className="vocabulary-growth-chart__hover-line"
                  x1={xForIndex(hoveredIndex!, data.length)}
                  x2={xForIndex(hoveredIndex!, data.length)}
                  y1={PADDING_TOP}
                  y2={VIEW_HEIGHT - PADDING_BOTTOM}
                />,
                ...SERIES.map((series) => (
                  <circle
                    key={series.key}
                    className="vocabulary-growth-chart__hover-point"
                    style={{ fill: `var(${series.cssVar})` }}
                    cx={xForIndex(hoveredIndex!, data.length)}
                    cy={yForValue(hoveredDay[series.key], maxValue)}
                    r={4}
                  />
                )),
              ]
            : null}

          {/* Transparent full-plot overlay — captures both mouse hover and
              touch tap/drag via the Pointer Events API (one model for
              both input types). */}
          <rect
            x={PADDING_LEFT}
            y={PADDING_TOP}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerMove}
            onPointerLeave={() => setHoveredIndex(null)}
          />
        </svg>

        {hoveredDay ? (
          <div
            className="vocabulary-growth-chart__tooltip"
            role="status"
            style={{
              left: `${(xForIndex(hoveredIndex!, data.length) / VIEW_WIDTH) * 100}%`,
              top: `${(PADDING_TOP / VIEW_HEIGHT) * 100}%`,
            }}
          >
            <p className="vocabulary-growth-chart__tooltip-date">{longDateFormatter.format(parseDateOnlyUTC(hoveredDay.dateISO))}</p>
            {SERIES.map((series) => (
              <p key={series.key} className="vocabulary-growth-chart__tooltip-row">
                <span
                  className="vocabulary-growth-chart__legend-swatch vocabulary-growth-chart__legend-swatch--inline"
                  style={{ background: `var(${series.cssVar})` }}
                  aria-hidden="true"
                />
                <span className="vocabulary-growth-chart__tooltip-label">{t(series.labelKey)}</span>
                <span className="vocabulary-growth-chart__tooltip-value">{hoveredDay[series.key].toLocaleString(uiLanguage)}</span>
              </p>
            ))}
            <p className="vocabulary-growth-chart__tooltip-row vocabulary-growth-chart__tooltip-row--total">
              <span className="vocabulary-growth-chart__tooltip-label">{t("userProfile.vocabularyGrowthSection.totalLabel")}</span>
              <span className="vocabulary-growth-chart__tooltip-value">{hoveredDay.total.toLocaleString(uiLanguage)}</span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
