import { useLanguage } from "../../../../contexts/LanguageContext";
import { computeWordsLearnedSummary } from "../../../../data/learning/wordsLearnedSummary";
import type { VocabularyGrowthDayCounts } from "../../../../data/learning/vocabularyGrowth";
import type { DashboardSupportingDataStatus } from "./useDashboardSupportingData";
import type { DashboardVocabularyGrowthStatus } from "./useDashboardVocabularyGrowthData";
import type { MilestoneDailyStatRow } from "../../../../lib/newWordProgress";

const WEEKDAY_SHORT_KEYS = [
  "monShort",
  "tueShort",
  "wedShort",
  "thuShort",
  "friShort",
  "satShort",
  "sunShort",
] as const;

// Maps a YYYY-MM-DD date's UTC day-of-week (0=Sunday..6=Saturday) to the
// existing Monday-first weekday label keys already localized for the
// Learning page's Daily Streak card
// (userProfile.learningSection.dailyStreak.weekdays.*) — reused as-is
// rather than adding a second copy of the same 7 short-day strings.
function weekdayShortKeyFor(dateISO: string): (typeof WEEKDAY_SHORT_KEYS)[number] {
  const [year, month, day] = dateISO.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  const mondayFirstIndex = jsDay === 0 ? 6 : jsDay - 1;
  return WEEKDAY_SHORT_KEYS[mondayFirstIndex];
}

interface WordsLearnedCardProps {
  status: DashboardSupportingDataStatus;
  dailyStats: MilestoneDailyStatRow[];
  vocabularyGrowthStatus: DashboardVocabularyGrowthStatus;
  vocabularyGrowthHistory: VocabularyGrowthDayCounts[];
  todayISO: string | null;
  onRetry?: () => void;
}

// Dashboard Phase 3 — Card C: vocabulary progress over the last seven
// days. The learned-words series comes from dailyStats; Known/Mastered
// reuse the same vocabulary-growth reconstruction model as the Progress
// page, so the three grouped bars do not invent a second state model.
export function WordsLearnedCard({
  status,
  dailyStats,
  vocabularyGrowthStatus,
  vocabularyGrowthHistory,
  todayISO,
  onRetry,
}: WordsLearnedCardProps) {
  const { t } = useLanguage();

  const isLoading =
    status === "loading" ||
    status === "blocked" ||
    vocabularyGrowthStatus === "loading" ||
    vocabularyGrowthStatus === "blocked";
  const isErrored = status === "error" || vocabularyGrowthStatus === "error";
  const isReady = status === "ready" && vocabularyGrowthStatus === "ready";
  // See StudyActivityCard's identical fallback: a signed-out visitor (or
  // no chosen target language yet) reaches "ready" with an always-empty
  // dailyStats array but a null todayISO — falling back to the device's
  // current date still renders a real, honest all-zero card instead of an
  // indefinite skeleton.
  const effectiveTodayISO = todayISO ?? new Date().toISOString().slice(0, 10);

  const summary = isReady
    ? computeWordsLearnedSummary(
        dailyStats.map((stat) => ({ dateISO: stat.dateISO, newWordsCompleted: stat.newWordsCompleted })),
        effectiveTodayISO,
      )
    : null;
  const growthByDate = new Map(vocabularyGrowthHistory.map((day) => [day.dateISO, day]));
  const chartDays =
    summary?.days.map((day) => {
      const growthDay = growthByDate.get(day.dateISO);
      return {
        ...day,
        known: growthDay?.known ?? 0,
        mastered: growthDay?.mastered ?? 0,
      };
    }) ?? [];

  const title = t("userProfile.dashboardPage.supportingCards.wordsLearned.title");
  const wordsUnit = t("userProfile.learningSection.todayProgress.wordsUnit");
  const maxCount = Math.max(1, ...chartDays.flatMap((day) => [day.count, day.known, day.mastered]));

  const isEmpty = summary !== null && summary.total === 0 && chartDays.every((day) => day.known === 0 && day.mastered === 0);

  return (
    <section className="dashboard-card words-learned-card" aria-label={title}>
      <header className="dashboard-card__header">
        <h2 className="dashboard-card__title">{title}</h2>
        <span className="dashboard-card__eyebrow">
          {t("userProfile.dashboardPage.supportingCards.wordsLearned.last7Days")}
        </span>
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
      ) : isLoading || summary === null ? (
        <div className="words-learned-card__skeleton-block" aria-hidden="true">
          <span className="words-learned-card__skeleton words-learned-card__skeleton--legend" />
          <span className="words-learned-card__skeleton words-learned-card__skeleton--bars" />
        </div>
      ) : (
        <>
          <div className="words-learned-card__legend" aria-hidden="true">
            <span className="words-learned-card__legend-item words-learned-card__legend-item--learned">
              {t("userProfile.dashboardPage.supportingCards.wordsLearned.series.wordsLearned")}
            </span>
            <span className="words-learned-card__legend-item words-learned-card__legend-item--known">
              {t("userProfile.vocabularySection.summaryCards.known.title")}
            </span>
            <span className="words-learned-card__legend-item words-learned-card__legend-item--mastered">
              {t("userProfile.vocabularySection.summaryCards.mastered.title")}
            </span>
          </div>

          {isEmpty ? (
            <p className="words-learned-card__empty-message">
              {t("userProfile.dashboardPage.supportingCards.wordsLearned.emptyStateMessage")}
            </p>
          ) : null}

          <div
            className="words-learned-card__bars"
            role="img"
            aria-label={summary.days
              .map((day) => {
                const chartDay = chartDays.find((candidate) => candidate.dateISO === day.dateISO);
                return [
                  t(`userProfile.learningSection.dailyStreak.weekdays.${weekdayShortKeyFor(day.dateISO)}`),
                  `${t("userProfile.dashboardPage.supportingCards.wordsLearned.series.wordsLearned")}: ${day.count}`,
                  `${t("userProfile.vocabularySection.summaryCards.known.title")}: ${chartDay?.known ?? 0}`,
                  `${t("userProfile.vocabularySection.summaryCards.mastered.title")}: ${chartDay?.mastered ?? 0}`,
                ].join(" ");
              })
              .join(", ")}
          >
            {chartDays.map((day) => (
              <div key={day.dateISO} className="words-learned-card__bar-col">
                <div className="words-learned-card__bar-group" tabIndex={0}>
                  <div className="words-learned-card__bar-track" title={`${day.count} ${wordsUnit}`}>
                    <div
                      className="words-learned-card__bar-fill words-learned-card__bar-fill--learned"
                      style={{ height: `${(day.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <div className="words-learned-card__bar-track" title={`${day.known} ${t("userProfile.vocabularySection.summaryCards.known.title")}`}>
                    <div
                      className="words-learned-card__bar-fill words-learned-card__bar-fill--known"
                      style={{ height: `${(day.known / maxCount) * 100}%` }}
                    />
                  </div>
                  <div className="words-learned-card__bar-track" title={`${day.mastered} ${t("userProfile.vocabularySection.summaryCards.mastered.title")}`}>
                    <div
                      className="words-learned-card__bar-fill words-learned-card__bar-fill--mastered"
                      style={{ height: `${(day.mastered / maxCount) * 100}%` }}
                    />
                  </div>
                  <div className="words-learned-card__tooltip" role="tooltip">
                    <p className="words-learned-card__tooltip-period">
                      {t(`userProfile.learningSection.dailyStreak.weekdays.${weekdayShortKeyFor(day.dateISO)}`)}
                    </p>
                    <p className="words-learned-card__tooltip-row">
                      {t("userProfile.dashboardPage.supportingCards.wordsLearned.series.wordsLearned")}: {day.count}
                    </p>
                    <p className="words-learned-card__tooltip-row">
                      {t("userProfile.vocabularySection.summaryCards.known.title")}: {day.known}
                    </p>
                    <p className="words-learned-card__tooltip-row">
                      {t("userProfile.vocabularySection.summaryCards.mastered.title")}: {day.mastered}
                    </p>
                  </div>
                </div>
                <span className="words-learned-card__bar-label" aria-hidden="true">
                  {t(`userProfile.learningSection.dailyStreak.weekdays.${weekdayShortKeyFor(day.dateISO)}`)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
