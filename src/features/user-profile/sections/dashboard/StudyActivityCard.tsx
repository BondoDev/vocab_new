import { useMemo, useState } from "react";
import { useLanguage, type UILanguage } from "../../../../contexts/LanguageContext";
import { interpolateTemplate } from "../../../../lib/interpolateTemplate";
import {
  computeStudyActivityBuckets,
  type StudyActivityBucket,
  type StudyActivityDailyStat,
  type StudyActivityRange,
} from "../../../../data/learning/studyActivity";
import { computeDurationParts } from "../../../../data/learning/studyDuration";
import type { MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import type { DashboardSupportingDataStatus } from "./useDashboardSupportingData";

const EXPANDED_RANGES: readonly StudyActivityRange[] = ["7d", "30d", "90d", "all"];

const RANGE_LABEL_KEYS: Record<StudyActivityRange, string> = {
  "7d": "userProfile.dashboardPage.supportingCards.studyActivity.range.7d",
  "30d": "userProfile.dashboardPage.supportingCards.studyActivity.range.30d",
  "90d": "userProfile.dashboardPage.supportingCards.studyActivity.range.90d",
  all: "userProfile.dashboardPage.supportingCards.studyActivity.range.all",
};

// The header's total-time summary ("3h 42m" / period label) uses its own
// explicit per-range phrasing ("Last 7 days" / ... / "All time") rather than
// composing "Last" + range.* — some locales don't put a "last N" qualifier
// in the same word order, so each range gets its own fully-translator-owned
// string, same precedent as range.* itself.
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
// useDashboardSupportingData already loaded (now carrying the three
// per-mode second counts alongside the pre-existing quantity fields other
// cards still use).
//
// HISTORICAL DATA — every row already has full per-mode fidelity (see
// supabase/migrations/20260811120000_add_new_word_study_time_and_repurpose_total.sql's
// header): mode-tracking has been the only write path since active-time
// tracking shipped, so this component never renders an "Uncategorized"
// bucket — a zero bucket genuinely had zero tracked activity.
export function StudyActivityCard({ status, dailyStats, todayISO, onRetry }: StudyActivityCardProps) {
  const { t, uiLanguage } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const [range, setRange] = useState<StudyActivityRange>("30d");

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

  const effectiveRange: StudyActivityRange = isExpanded ? range : "7d";
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
    () => (isReady ? computeStudyActivityBuckets(activityStats, effectiveTodayISO, effectiveRange) : []),
    [isReady, activityStats, effectiveTodayISO, effectiveRange],
  );

  const maxTotalSeconds = Math.max(1, ...buckets.map((bucket) => bucket.totalSeconds));
  const periodTotalSeconds = buckets.reduce((sum, bucket) => sum + bucket.totalSeconds, 0);
  const isEmpty = isReady && periodTotalSeconds === 0;

  const title = t("userProfile.dashboardPage.supportingCards.studyActivity.title");
  const studyNewWordsLabel = t("userProfile.learningSection.modeCards.modes.studyNewWords.title");
  const reviewWordsLabel = t("userProfile.learningSection.modeCards.modes.reviewWords.title");
  const customPracticeLabel = t("userProfile.learningSection.modeCards.modes.customPractice.title");
  const totalLabel = t("userProfile.dashboardPage.supportingCards.studyActivity.total");
  const summaryPeriodLabel = t(SUMMARY_PERIOD_LABEL_KEYS[effectiveRange]);

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

  const accessibleSummary = buckets
    .map((bucket) => {
      const periodText = formatBucketPeriodLabel(bucket, locale);
      return [
        periodText,
        `${studyNewWordsLabel} ${formatDuration(bucket.newWordStudyTimeSeconds)}`,
        `${reviewWordsLabel} ${formatDuration(bucket.reviewTimeSeconds)}`,
        `${customPracticeLabel} ${formatDuration(bucket.customPracticeTimeSeconds)}`,
        `${totalLabel} ${formatDuration(bucket.totalSeconds)}`,
      ].join(", ");
    })
    .join("; ");

  return (
    <section className="dashboard-card study-activity-card" aria-label={title}>
      <header className="dashboard-card__header">
        <h2 className="dashboard-card__title">{title}</h2>
        <button
          type="button"
          className="dashboard-card__link-button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {t("userProfile.dashboardPage.supportingCards.studyActivity.viewAllActivity")}
        </button>
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
          {isExpanded ? (
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
          ) : null}

          {isLoading || !isReady ? (
            <div className="study-activity-card__skeleton-block" aria-hidden="true">
              <span className="study-activity-card__skeleton study-activity-card__skeleton--summary" />
              <span className="study-activity-card__skeleton study-activity-card__skeleton--legend" />
              <span className="study-activity-card__skeleton study-activity-card__skeleton--chart" />
            </div>
          ) : (
            <>
              <div className="study-activity-card__summary">
                <p className="study-activity-card__summary-value">{formatDuration(periodTotalSeconds)}</p>
                <p className="study-activity-card__summary-label">{summaryPeriodLabel}</p>
              </div>

              <div className="study-activity-card__legend">
                <span className="study-activity-card__legend-item study-activity-card__legend-item--new">
                  <span className="study-activity-card__legend-dot" aria-hidden="true" />
                  {studyNewWordsLabel}
                </span>
                <span className="study-activity-card__legend-item study-activity-card__legend-item--review">
                  <span className="study-activity-card__legend-dot" aria-hidden="true" />
                  {reviewWordsLabel}
                </span>
                <span className="study-activity-card__legend-item study-activity-card__legend-item--practice">
                  <span className="study-activity-card__legend-dot" aria-hidden="true" />
                  {customPracticeLabel}
                </span>
              </div>

              {isEmpty ? (
                <div className="study-activity-card__empty">
                  <p className="study-activity-card__empty-title">
                    {t("userProfile.dashboardPage.supportingCards.studyActivity.emptyState.title")}
                  </p>
                  <p className="study-activity-card__empty-message">
                    {t("userProfile.dashboardPage.supportingCards.studyActivity.emptyState.message")}
                  </p>
                </div>
              ) : null}

              <div
                className={`study-activity-card__chart ${
                  isExpanded ? "study-activity-card__chart--expanded" : ""
                }`}
                role="img"
                aria-label={accessibleSummary}
              >
                {buckets.map((bucket) => (
                  <div key={bucket.key} className="study-activity-card__bar-group" tabIndex={0}>
                    <div className="study-activity-card__bar-track">
                      {/* Stacked bottom-to-top: Custom Practice, Study New
                          Words, Review — matches the Study Activity brief's
                          own stacking order. Each segment's height is a
                          share of the *chart's* max total (not the
                          bucket's own total), so the segments visually sum
                          to the bucket's true proportion of the tallest bar
                          — no fixed/fake maximum. max(...,2px) keeps a
                          genuinely nonzero-but-tiny segment visible without
                          drawing anything at all for an exact zero, so a
                          zero-activity day still occupies its slot (see the
                          brief's "zero days must remain represented") but
                          never shows a fake sliver of activity. */}
                      <span
                        className="study-activity-card__bar-fill study-activity-card__bar-fill--practice"
                        style={{
                          height:
                            bucket.customPracticeTimeSeconds > 0
                              ? `max(${(bucket.customPracticeTimeSeconds / maxTotalSeconds) * 100}%, 2px)`
                              : "0px",
                        }}
                      />
                      <span
                        className="study-activity-card__bar-fill study-activity-card__bar-fill--new"
                        style={{
                          height:
                            bucket.newWordStudyTimeSeconds > 0
                              ? `max(${(bucket.newWordStudyTimeSeconds / maxTotalSeconds) * 100}%, 2px)`
                              : "0px",
                        }}
                      />
                      <span
                        className="study-activity-card__bar-fill study-activity-card__bar-fill--review"
                        style={{
                          height:
                            bucket.reviewTimeSeconds > 0
                              ? `max(${(bucket.reviewTimeSeconds / maxTotalSeconds) * 100}%, 2px)`
                              : "0px",
                        }}
                      />
                    </div>
                    {bucket.kind === "day" && !isExpanded ? (
                      <span className="study-activity-card__bar-label" aria-hidden="true">
                        {new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(parseDateOnlyUTC(bucket.startDateISO))}
                      </span>
                    ) : null}
                    <div className="study-activity-card__tooltip" role="tooltip" aria-hidden="true">
                      <p className="study-activity-card__tooltip-period">{formatBucketPeriodLabel(bucket, locale)}</p>
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
                  </div>
                ))}
              </div>
              <p className="sr-only">{accessibleSummary}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
