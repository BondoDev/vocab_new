import { useEffect, useId, useMemo, useState } from "react";
import { useLanguage, type UILanguage } from "../../../../contexts/LanguageContext";
import { interpolateTemplate } from "../../../../lib/interpolateTemplate";
import {
  computeStudyActivityBuckets,
  type StudyActivityBucket,
  type StudyActivityDailyStat,
  type StudyActivityRange,
} from "../../../../data/learning/studyActivity";
import {
  computeDurationParts,
  computeStudyActivityChartScale,
  computeVisibleLabelIndices,
} from "../../../../data/learning/studyDuration";
import { buildMonotoneAreaPath, buildMonotoneLinePath, type ChartPoint } from "../../../../data/learning/svgLineChart";
import type { MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import type { DashboardSupportingDataStatus } from "./useDashboardSupportingData";

const EXPANDED_RANGES: readonly StudyActivityRange[] = ["7d", "30d", "90d", "all"];

const RANGE_LABEL_KEYS: Record<StudyActivityRange, string> = {
  "7d": "userProfile.dashboardPage.supportingCards.studyActivity.range.7d",
  "30d": "userProfile.dashboardPage.supportingCards.studyActivity.range.30d",
  "90d": "userProfile.dashboardPage.supportingCards.studyActivity.range.90d",
  all: "userProfile.dashboardPage.supportingCards.studyActivity.range.all",
};

// The header's compact "{total} · {period}" summary line reuses the same
// pre-existing per-range phrasing ("Last 7 days" / ... / "All time") the
// expanded range selector already uses elsewhere — no new localized string
// is introduced by this visual redesign.
const SUMMARY_PERIOD_LABEL_KEYS: Record<StudyActivityRange, string> = {
  "7d": "userProfile.dashboardPage.supportingCards.studyActivity.summaryPeriod.7d",
  "30d": "userProfile.dashboardPage.supportingCards.studyActivity.summaryPeriod.30d",
  "90d": "userProfile.dashboardPage.supportingCards.studyActivity.summaryPeriod.90d",
  all: "userProfile.dashboardPage.supportingCards.studyActivity.summaryPeriod.all",
};

// Minimal UILanguage -> BCP 47 locale mapping for Intl.DateTimeFormat —
// this project has no such mapping already exported (the UI language code
// itself is not a valid BCP 47 tag for pt/en), so it stays local to this
// one chart's tooltip/period-label formatting rather than becoming a new
// shared module for a single caller.
const INTL_LOCALES: Record<UILanguage, string> = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  pt: "pt-PT",
  ru: "ru-RU",
};

// Compact axis labels never show more than 7 at once (the default 7-day
// view shows all 7; longer ranges thin down to a sensible subset — see
// computeVisibleLabelIndices, studyDuration.ts).
const MAX_X_AXIS_LABELS = 7;

function parseDateOnlyUTC(dateISO: string): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatShortDate(dateISO: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(parseDateOnlyUTC(dateISO));
}

function formatBucketPeriodLabel(bucket: StudyActivityBucket, locale: string): string {
  if (bucket.kind === "day") {
    return new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric" }).format(
      parseDateOnlyUTC(bucket.startDateISO),
    );
  }
  if (bucket.kind === "week") {
    return `${formatShortDate(bucket.startDateISO, locale)} – ${formatShortDate(bucket.endDateISO, locale)}`;
  }
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(parseDateOnlyUTC(bucket.startDateISO));
}

// Compact X-axis tick text — deliberately shorter than formatBucketPeriodLabel
// (which is the full, unambiguous tooltip/period heading): a narrow single
// weekday letter for the default unexpanded 7-day view (each label must sit
// directly under its own point without crowding its neighbors), a short
// "Mon D" date once 30 days of individual points are on screen (a bare
// weekday letter would be ambiguous once it repeats 4+ times), a short
// start-date for weekly buckets (90d), and a short month name for monthly
// buckets (All time).
function formatAxisLabel(bucket: StudyActivityBucket, locale: string, useDateLabel: boolean): string {
  if (bucket.kind === "day") {
    return useDateLabel
      ? formatShortDate(bucket.startDateISO, locale)
      : new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(parseDateOnlyUTC(bucket.startDateISO));
  }
  if (bucket.kind === "week") {
    return formatShortDate(bucket.startDateISO, locale);
  }
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(parseDateOnlyUTC(bucket.startDateISO));
}

interface StudyActivityCardProps {
  status: DashboardSupportingDataStatus;
  dailyStats: MilestoneDailyStatRow[];
  todayISO: string | null;
  onRetry?: () => void;
}

// Dashboard Phase 3 — Card B, reworked for Study Activity Phase 1: ACTIVE
// STUDY TIME per learning mode (Study New Words / Review Words / Custom
// Practice), not quantities — new words/reviews quantities moved entirely
// to the "Words Learned" card (WordsLearnedCard.tsx), which already owned
// them on its own. Defaults to a fixed 7-day view; "View all activity"
// expands the same card in place (no navigation, no modal) to a range
// selector (7/30/90/All, defaulting to 30 when first expanded) with
// intelligently-aggregated buckets (daily/daily/weekly/monthly — see
// studyActivity.ts). Expanding or switching ranges never re-fetches: every
// range is a different pure aggregation over the one dailyStats array
// useDashboardSupportingData already loaded.
//
// VISUAL REDESIGN (chart-only, third pass) — a three-series LINE chart
// replaced the earlier stacked-bar redesign: one smooth monotone-cubic
// curve (buildMonotoneLinePath, svgLineChart.ts — passes through every
// real point exactly, never overshoots past/between them) + a very subtle
// gradient area fill + one small dot per day per mode, plotted against the
// same real adaptive time axis (computeStudyActivityChartScale,
// studyDuration.ts) the bar version used. The curved paths + their
// gradient fills are the only SVG involved — gridlines, axis labels, dots,
// the active-day guide, hit-areas, and the tooltip are all plain HTML
// positioned by percentage, which is what keeps a ~2.5px stroke crisp
// under a non-uniformly-stretched viewBox (vector-effect:
// non-scaling-stroke) without also needing to fight SVG's
// circle-becomes-an-ellipse distortion for the dots. None of the
// underlying data/aggregation/tracking changed; only how it's drawn.
//
// HISTORICAL DATA — every row already has full per-mode fidelity (see
// supabase/migrations/20260811120000_add_new_word_study_time_and_repurpose_total.sql's
// header): mode-tracking has been the only write path since active-time
// tracking shipped, so this component never renders an "Uncategorized"
// series — a zero value genuinely had zero tracked activity.
export function StudyActivityCard({ status, dailyStats, todayISO, onRetry }: StudyActivityCardProps) {
  const { t, uiLanguage } = useLanguage();
  const [range, setRange] = useState<StudyActivityRange>("7d");
  // The one shared tooltip's currently-active day/bucket index — null when
  // nothing is hovered/focused/tapped. Driven by React state (not CSS
  // :hover/:focus) so desktop hover, keyboard focus, and mobile tap all go
  // through the exact same code path.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Instance-unique gradient ids for the three area fills — useId() rather
  // than a static string so two instances of this card (e.g. React
  // StrictMode's dev double-render) never collide on the same <defs> id.
  const gradientIdBase = useId();

  const isLoading = status === "loading" || status === "blocked";
  const isErrored = status === "error";
  const isReady = status === "ready";
  // Signed-out visitors (or anyone with no chosen target language yet)
  // reach "ready" with an empty dailyStats array but a null todayISO — the
  // shared date hook never resolves one without a session (see
  // useProfileSharedProgressData.ts). Falling back to the device's own
  // current date here (matching DashboardHeroCard's identical fallback
  // spirit) means that case still renders a real, honest all-zero chart
  // instead of an indefinite skeleton — dailyStats is guaranteed empty in
  // that case regardless of which date buckets are built around.
  const effectiveTodayISO = todayISO ?? new Date().toISOString().slice(0, 10);

  const locale = INTL_LOCALES[uiLanguage] ?? "en-US";

  const activityStats: StudyActivityDailyStat[] = useMemo(
    () =>
      dailyStats.map((stat) => ({
        dateISO: stat.dateISO,
        newWordStudyTimeSeconds: stat.newWordStudyTimeSeconds,
        reviewTimeSeconds: stat.reviewTimeSeconds,
        customPracticeTimeSeconds: stat.customPracticeTimeSeconds,
      })),
    [dailyStats],
  );

  const buckets = useMemo(
    () => (isReady ? computeStudyActivityBuckets(activityStats, effectiveTodayISO, range) : []),
    [isReady, activityStats, effectiveTodayISO, range],
  );

  // A tooltip left open from a previous range/day selection would otherwise
  // keep pointing at a now-different bucket once the range changes (e.g.
  // hovering day 3 of the 7-day view, then switching to 30 days) — purely a
  // UI-state correctness fix, not a data/business-logic change.
  useEffect(() => {
    setActiveIndex(null);
  }, [range]);

  // Per-mode totals for the *currently displayed* period — feeds both the
  // compact legend values and (summed) the header's total-time summary.
  // Purely a reshape of buckets already computed by the untouched
  // aggregation engine (studyActivity.ts) — no new aggregation logic.
  const periodTotals = useMemo(
    () =>
      buckets.reduce(
        (totals, bucket) => ({
          newWordStudyTimeSeconds: totals.newWordStudyTimeSeconds + bucket.newWordStudyTimeSeconds,
          reviewTimeSeconds: totals.reviewTimeSeconds + bucket.reviewTimeSeconds,
          customPracticeTimeSeconds: totals.customPracticeTimeSeconds + bucket.customPracticeTimeSeconds,
          totalSeconds: totals.totalSeconds + bucket.totalSeconds,
        }),
        { newWordStudyTimeSeconds: 0, reviewTimeSeconds: 0, customPracticeTimeSeconds: 0, totalSeconds: 0 },
      ),
    [buckets],
  );

  const maxBucketTotalSeconds = Math.max(0, ...buckets.map((bucket) => bucket.totalSeconds));
  // Real adaptive Y-axis scale (0/step/2*step/3*step) — never a fixed
  // ceiling; see computeStudyActivityChartScale's own header.
  const chartScale = useMemo(() => computeStudyActivityChartScale(maxBucketTotalSeconds), [maxBucketTotalSeconds]);

  const visibleLabelIndices = useMemo(
    () => computeVisibleLabelIndices(buckets.length, MAX_X_AXIS_LABELS),
    [buckets.length],
  );

  // Genuinely no activity anywhere in the selected range — the existing
  // empty state replaces the chart entirely rather than plotting three
  // flat lines sitting on the baseline with nothing to show.
  const isEmpty = isReady && periodTotals.totalSeconds === 0;

  const title = t("userProfile.dashboardPage.supportingCards.studyActivity.title");
  const studyNewWordsLabel = t("userProfile.learningSection.modeCards.modes.studyNewWords.title");
  const reviewWordsLabel = t("userProfile.learningSection.modeCards.modes.reviewWords.title");
  const customPracticeLabel = t("userProfile.learningSection.modeCards.modes.customPractice.title");
  const totalLabel = t("userProfile.dashboardPage.supportingCards.studyActivity.total");
  const summaryPeriodLabel = t(SUMMARY_PERIOD_LABEL_KEYS[range]);

  // Duration formatting: computeDurationParts (pure, unit-tested on its
  // own) supplies {hours, minutes}; the actual string comes from one of
  // three localized templates so every locale controls its own exact
  // spacing/order/unit abbreviation — never a hardcoded "h"/"m" here.
  const formatDuration = (totalSeconds: number): string => {
    const { hours, minutes } = computeDurationParts(totalSeconds);
    if (hours === 0) {
      return interpolateTemplate(t("userProfile.dashboardPage.supportingCards.studyActivity.duration.minutesOnly"), {
        minutes: String(minutes),
      });
    }
    if (minutes === 0) {
      return interpolateTemplate(t("userProfile.dashboardPage.supportingCards.studyActivity.duration.hoursOnly"), {
        hours: String(hours),
      });
    }
    return interpolateTemplate(t("userProfile.dashboardPage.supportingCards.studyActivity.duration.hoursMinutes"), {
      hours: String(hours),
      minutes: String(minutes),
    });
  };

  const summaryLine = `${formatDuration(periodTotals.totalSeconds)} · ${summaryPeriodLabel}`;

  // Accessible textual summary of the selected range/total/per-mode totals
  // — always present (sr-only paragraph below), independent of whether any
  // individual point is focused. The chart itself is not the only way to
  // reach this information.
  const accessibleRangeSummary = `${title}: ${summaryLine}. ${studyNewWordsLabel} ${formatDuration(
    periodTotals.newWordStudyTimeSeconds,
  )}, ${reviewWordsLabel} ${formatDuration(periodTotals.reviewTimeSeconds)}, ${customPracticeLabel} ${formatDuration(
    periodTotals.customPracticeTimeSeconds,
  )}.`;

  const pointCount = buckets.length;
  // Same x-position formula drives the SVG polyline points, the HTML dots,
  // and the hit-area/label columns below — one evenly-spaced column per
  // bucket, centered at (index + 0.5) / count, so a point and its own
  // hover/focus/tap target and its own axis label always align exactly.
  const xPercent = (index: number) => (pointCount > 0 ? ((index + 0.5) / pointCount) * 100 : 0);
  // CSS "distance from the bottom" convention — matches the gridlines'
  // own `bottom: (tick / maxSeconds) * 100%` positioning exactly, so a
  // point and the gridline for its value line up precisely.
  const bottomPercent = (seconds: number) => (seconds / chartScale.maxSeconds) * 100;
  // SVG uses the opposite (y-down) convention: 0 is the top of the
  // viewBox, 100 is the bottom.
  const svgYPercent = (seconds: number) => 100 - bottomPercent(seconds);

  const seriesConfigs = [
    {
      key: "practice" as const,
      seconds: (bucket: StudyActivityBucket) => bucket.customPracticeTimeSeconds,
      label: customPracticeLabel,
      gradientId: `${gradientIdBase}-practice`,
    },
    {
      key: "new" as const,
      seconds: (bucket: StudyActivityBucket) => bucket.newWordStudyTimeSeconds,
      label: studyNewWordsLabel,
      gradientId: `${gradientIdBase}-new`,
    },
    {
      key: "review" as const,
      seconds: (bucket: StudyActivityBucket) => bucket.reviewTimeSeconds,
      label: reviewWordsLabel,
      gradientId: `${gradientIdBase}-review`,
    },
  ];

  // One {x, y} point per bucket for a series, in the SVG's own 0-100
  // (y-down) coordinate space — the only input buildMonotoneLinePath/
  // buildMonotoneAreaPath need. Never fabricates a point: exactly one per
  // real bucket, in the same order studyActivity.ts already produced them.
  const seriesPoints = (secondsFor: (bucket: StudyActivityBucket) => number): ChartPoint[] =>
    buckets.map((bucket, index) => ({ x: xPercent(index), y: svgYPercent(secondsFor(bucket)) }));

  return (
    <section className="dashboard-card study-activity-card" aria-label={title}>
      <header className="dashboard-card__header">
        <h2 className="dashboard-card__title">{title}</h2>
        {!isLoading && isReady && !isErrored ? (
          <p className="study-activity-card__summary-line">{summaryLine}</p>
        ) : null}
      </header>

      {isErrored ? (
        <div className="dashboard-card__error" role="status">
          <p className="dashboard-card__error-text">
            {t("userProfile.dashboardPage.supportingCards.loadError")}
          </p>
          <button type="button" className="dashboard-card__error-retry" onClick={onRetry}>
            {t("userProfile.dashboardPage.supportingCards.retryButton")}
          </button>
        </div>
      ) : (
        <>
          <div className="study-activity-card__ranges" role="group" aria-label={title}>
            {EXPANDED_RANGES.map((rangeOption) => (
              <button
                key={rangeOption}
                type="button"
                className={`study-activity-card__range-button ${
                  range === rangeOption ? "study-activity-card__range-button--active" : ""
                }`}
                aria-pressed={range === rangeOption}
                onClick={() => setRange(rangeOption)}
              >
                {t(RANGE_LABEL_KEYS[rangeOption])}
              </button>
            ))}
          </div>

          {isLoading || !isReady ? (
            <div className="study-activity-card__skeleton-block" aria-hidden="true">
              <span className="study-activity-card__skeleton study-activity-card__skeleton--legend" />
              <span className="study-activity-card__skeleton study-activity-card__skeleton--chart" />
            </div>
          ) : (
            <>
              {isEmpty ? (
                <div className="study-activity-card__empty">
                  <p className="study-activity-card__empty-title">
                    {t("userProfile.dashboardPage.supportingCards.studyActivity.emptyState.title")}
                  </p>
                  <p className="study-activity-card__empty-message">
                    {t("userProfile.dashboardPage.supportingCards.studyActivity.emptyState.message")}
                  </p>
                </div>
              ) : (
                <div className="study-activity-card__chart-area">
                  {/* Decorative gridlines + axis labels — a real adaptive
                      time scale (4 subtle lines), never exposed to
                      assistive tech: the sr-only paragraph below already
                      carries the same range/total/per-mode information in
                      prose. */}
                  <div className="study-activity-card__grid" aria-hidden="true">
                    {chartScale.tickSecondsList.map((tickSeconds) => (
                      <div
                        key={tickSeconds}
                        className="study-activity-card__grid-line"
                        style={{ bottom: `${(tickSeconds / chartScale.maxSeconds) * 100}%` }}
                      >
                        <span className="study-activity-card__grid-label">{formatDuration(tickSeconds)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="study-activity-card__plot">
                    {/* The three curved lines + their subtle gradient area
                        fills are the only SVG in this chart. Each is a
                        monotone cubic curve (buildMonotoneLinePath/
                        buildMonotoneAreaPath, svgLineChart.ts) — it passes
                        through every real data point exactly and never
                        overshoots past them (see that module's own tests),
                        so the smoothing never visually implies a measured
                        value that never happened. Deliberately no entrance
                        animation (no draw-in, no fade-in) — a CSS mount
                        animation can be interrupted mid-transition (a
                        backgrounded tab, a re-render, a dev-mode
                        double-mount) and freeze a line or fill permanently
                        partway through, i.e. visibly incomplete/faded
                        exactly where it must always read as solid.
                        vector-effect: non-scaling-stroke (set in CSS) keeps
                        the stroke a crisp, constant width even though the
                        viewBox stretches non-uniformly to fill the plot
                        box. */}
                    <svg
                      className="study-activity-card__lines"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <defs>
                        {seriesConfigs.map((series) => (
                          <linearGradient
                            key={series.gradientId}
                            id={series.gradientId}
                            gradientUnits="userSpaceOnUse"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="100"
                          >
                            <stop
                              offset="0%"
                              className={`study-activity-card__gradient-stop study-activity-card__gradient-stop--${series.key}`}
                              stopOpacity="0.16"
                            />
                            <stop
                              offset="100%"
                              className={`study-activity-card__gradient-stop study-activity-card__gradient-stop--${series.key}`}
                              stopOpacity="0"
                            />
                          </linearGradient>
                        ))}
                      </defs>
                      {seriesConfigs.map((series) => (
                        <path
                          key={`${series.key}-area`}
                          className="study-activity-card__area"
                          fill={`url(#${series.gradientId})`}
                          stroke="none"
                          d={buildMonotoneAreaPath(seriesPoints(series.seconds), 100)}
                        />
                      ))}
                      {seriesConfigs.map((series) => (
                        <path
                          key={`${series.key}-line`}
                          className={`study-activity-card__line study-activity-card__line--${series.key}`}
                          fill="none"
                          d={buildMonotoneLinePath(seriesPoints(series.seconds))}
                        />
                      ))}
                    </svg>

                    {/* A single subtle dashed guide through the active
                        day's X position — never one line per day, only the
                        currently hovered/focused/tapped one. */}
                    {activeIndex !== null ? (
                      <span
                        className="study-activity-card__active-guide"
                        aria-hidden="true"
                        style={{ left: `${xPercent(activeIndex)}%` }}
                      />
                    ) : null}

                    {/* Data points — plain HTML circles (not SVG) so they
                        never distort into ellipses under the lines layer's
                        non-uniform viewBox stretch; a fixed-size
                        border-radius: 50% box always stays a perfect
                        circle regardless of its percentage-based position. */}
                    <div className="study-activity-card__points" aria-hidden="true">
                      {buckets.map((bucket, index) =>
                        seriesConfigs.map((series) => (
                          <span
                            key={`${bucket.key}-${series.key}`}
                            className={`study-activity-card__point study-activity-card__point--${series.key} ${
                              activeIndex === index ? "study-activity-card__point--active" : ""
                            }`}
                            style={{ left: `${xPercent(index)}%`, bottom: `${bottomPercent(series.seconds(bucket))}%` }}
                          />
                        )),
                      )}
                    </div>

                    {/* One shared hover/focus/tap target per day — never
                        one per series/point, so hovering near overlapping
                        zero-value points still reaches a single tooltip
                        that lists all three modes (see the tooltip below).
                        Each button carries its own accessible name (the
                        sr-only span inside it); no img-role wrapper is
                        needed since every child here is already properly
                        exposed as a real interactive control. */}
                    <div className="study-activity-card__columns">
                      {buckets.map((bucket, index) => (
                        <div key={bucket.key} className="study-activity-card__column">
                          <button
                            type="button"
                            className="study-activity-card__hit-area"
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex((current) => (current === index ? null : current))}
                            onFocus={() => setActiveIndex(index)}
                            onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
                            onClick={() => setActiveIndex((current) => (current === index ? null : index))}
                          >
                            <span className="sr-only">
                              {formatBucketPeriodLabel(bucket, locale)}: {studyNewWordsLabel}{" "}
                              {formatDuration(bucket.newWordStudyTimeSeconds)}, {reviewWordsLabel}{" "}
                              {formatDuration(bucket.reviewTimeSeconds)}, {customPracticeLabel}{" "}
                              {formatDuration(bucket.customPracticeTimeSeconds)}, {totalLabel}{" "}
                              {formatDuration(bucket.totalSeconds)}
                            </span>
                          </button>
                          {activeIndex === index ? (
                            <div className="study-activity-card__tooltip" role="tooltip">
                              <p className="study-activity-card__tooltip-period">
                                {formatBucketPeriodLabel(bucket, locale)}
                              </p>
                              <p className="study-activity-card__tooltip-row">
                                <span>{studyNewWordsLabel}</span>
                                <span>{formatDuration(bucket.newWordStudyTimeSeconds)}</span>
                              </p>
                              <p className="study-activity-card__tooltip-row">
                                <span>{reviewWordsLabel}</span>
                                <span>{formatDuration(bucket.reviewTimeSeconds)}</span>
                              </p>
                              <p className="study-activity-card__tooltip-row">
                                <span>{customPracticeLabel}</span>
                                <span>{formatDuration(bucket.customPracticeTimeSeconds)}</span>
                              </p>
                              <p className="study-activity-card__tooltip-row study-activity-card__tooltip-row--total">
                                <span>{totalLabel}</span>
                                <span>{formatDuration(bucket.totalSeconds)}</span>
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* X-axis label row — a separate row below the plot (not
                      nested per-column) so the plot's own height never has
                      to share space with label text. Thinned via
                      computeVisibleLabelIndices once there are more than
                      MAX_X_AXIS_LABELS points (30d/90d/all), never thinned
                      for the default 7-day view. Each visible label is
                      positioned absolutely at its own point's exact x%
                      (the same formula the points/lines use) rather than
                      occupying an equal-width flex cell per bucket — a
                      30-day view still has 30 narrow data columns, and a
                      real date string ("Jul 15") would be clipped to
                      nothing if confined to just one of those columns. */}
                  <div className="study-activity-card__x-labels" aria-hidden="true">
                    {buckets.map((bucket, index) =>
                      visibleLabelIndices.has(index) ? (
                        <span
                          key={bucket.key}
                          className="study-activity-card__x-label"
                          style={{ left: `${xPercent(index)}%` }}
                        >
                          {formatAxisLabel(bucket, locale, range !== "7d")}
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>
              )}
              <div className="study-activity-card__legend">
                <span className="study-activity-card__legend-item study-activity-card__legend-item--new">
                  <span className="study-activity-card__legend-dot" aria-hidden="true" />
                  <span className="study-activity-card__legend-label">{studyNewWordsLabel}</span>
                  <span className="study-activity-card__legend-value">
                    {formatDuration(periodTotals.newWordStudyTimeSeconds)}
                  </span>
                </span>
                <span className="study-activity-card__legend-item study-activity-card__legend-item--review">
                  <span className="study-activity-card__legend-dot" aria-hidden="true" />
                  <span className="study-activity-card__legend-label">{reviewWordsLabel}</span>
                  <span className="study-activity-card__legend-value">
                    {formatDuration(periodTotals.reviewTimeSeconds)}
                  </span>
                </span>
                <span className="study-activity-card__legend-item study-activity-card__legend-item--practice">
                  <span className="study-activity-card__legend-dot" aria-hidden="true" />
                  <span className="study-activity-card__legend-label">{customPracticeLabel}</span>
                  <span className="study-activity-card__legend-value">
                    {formatDuration(periodTotals.customPracticeTimeSeconds)}
                  </span>
                </span>
              </div>
              <p className="sr-only">{accessibleRangeSummary}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
