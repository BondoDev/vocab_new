import { useMemo, useState } from "react";
import { useLanguage, type UILanguage } from "../../../../contexts/LanguageContext";
import {
  computeStudyActivityBuckets,
  type StudyActivityBucket,
  type StudyActivityRange,
} from "../../../../data/learning/studyActivity";
import type { MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import type { DashboardSupportingDataStatus } from "./useDashboardSupportingData";

const EXPANDED_RANGES: readonly StudyActivityRange[] = ["7d", "30d", "90d", "all"];

const RANGE_LABEL_KEYS: Record<StudyActivityRange, string> = {
  "7d": "userProfile.dashboardPage.supportingCards.studyActivity.range.7d",
  "30d": "userProfile.dashboardPage.supportingCards.studyActivity.range.30d",
  "90d": "userProfile.dashboardPage.supportingCards.studyActivity.range.90d",
  all: "userProfile.dashboardPage.supportingCards.studyActivity.range.all",
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
    return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(
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

// Dashboard Phase 3 — Card B: overall learning/review activity, defaulting
// to a fixed 7-day view; "View all activity" expands the same card in
// place (no navigation, no modal) to a range selector (7/30/90/All,
// defaulting to 30 when first expanded) with intelligently-aggregated
// buckets (daily/daily/weekly/monthly — see studyActivity.ts). Expanding
// or switching ranges never re-fetches: every range is a different pure
// aggregation over the one dailyStats array useDashboardSupportingData
// already loaded.
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

  const buckets = useMemo(
    () => (isReady ? computeStudyActivityBuckets(dailyStats, effectiveTodayISO, effectiveRange) : []),
    [isReady, dailyStats, effectiveTodayISO, effectiveRange],
  );

  const maxValue = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.newWords, bucket.reviews)));

  const title = t("userProfile.dashboardPage.supportingCards.studyActivity.title");
  const newWordsLabel = t("userProfile.dashboardPage.supportingCards.studyActivity.newWordsLabel");
  const reviewsLabel = t("userProfile.progressSection.tracks.reviews");
  const dateLabel = t("userProfile.dashboardPage.supportingCards.studyActivity.tooltip.dateLabel");
  const periodLabel = t("userProfile.dashboardPage.supportingCards.studyActivity.tooltip.periodLabel");

  const accessibleSummary = buckets
    .map((bucket) => {
      const periodText = formatBucketPeriodLabel(bucket, locale);
      return `${periodText}: ${newWordsLabel} ${bucket.newWords}, ${reviewsLabel} ${bucket.reviews}`;
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

          <div className="study-activity-card__legend">
            <span className="study-activity-card__legend-item study-activity-card__legend-item--new">
              <span className="study-activity-card__legend-dot" aria-hidden="true" />
              {newWordsLabel}
            </span>
            <span className="study-activity-card__legend-item study-activity-card__legend-item--reviews">
              <span className="study-activity-card__legend-dot" aria-hidden="true" />
              {reviewsLabel}
            </span>
          </div>

          {isLoading || !isReady ? (
            <div className="study-activity-card__skeleton" aria-hidden="true" />
          ) : (
            <>
              <div
                className={`study-activity-card__chart ${
                  isExpanded ? "study-activity-card__chart--expanded" : ""
                }`}
                role="img"
                aria-label={accessibleSummary}
              >
                {buckets.map((bucket) => (
                  <div key={bucket.key} className="study-activity-card__bar-group" tabIndex={0}>
                    <div className="study-activity-card__bars">
                      <div className="study-activity-card__bar-track">
                        <div
                          className="study-activity-card__bar-fill study-activity-card__bar-fill--new"
                          style={{ height: `${(bucket.newWords / maxValue) * 100}%` }}
                        />
                      </div>
                      <div className="study-activity-card__bar-track">
                        <div
                          className="study-activity-card__bar-fill study-activity-card__bar-fill--reviews"
                          style={{ height: `${(bucket.reviews / maxValue) * 100}%` }}
                        />
                      </div>
                    </div>
                    {bucket.kind === "day" && !isExpanded ? (
                      <span className="study-activity-card__bar-label" aria-hidden="true">
                        {new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(parseDateOnlyUTC(bucket.startDateISO))}
                      </span>
                    ) : null}
                    <div className="study-activity-card__tooltip" role="tooltip" aria-hidden="true">
                      <p className="study-activity-card__tooltip-period">
                        {bucket.kind === "day" ? dateLabel : periodLabel}: {formatBucketPeriodLabel(bucket, locale)}
                      </p>
                      <p className="study-activity-card__tooltip-row">
                        {newWordsLabel}: {bucket.newWords}
                      </p>
                      <p className="study-activity-card__tooltip-row">
                        {reviewsLabel}: {bucket.reviews}
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
