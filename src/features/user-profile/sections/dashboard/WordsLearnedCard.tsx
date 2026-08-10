import { useLanguage } from "../../../../contexts/LanguageContext";
import { computeWordsLearnedSummary } from "../../../../data/learning/wordsLearnedSummary";
import type { DashboardSupportingDataStatus } from "./useDashboardSupportingData";
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
  todayISO: string | null;
  onRetry?: () => void;
  onStartNewWordStudy?: () => void;
}

// Dashboard Phase 3 — Card C: vocabulary acquisition only (never reviews),
// derived from the same dailyStats useDashboardSupportingData already
// loaded for Study Activity — no second fetch. Deliberately a different
// visual shape from Study Activity (big total + small comparison + 7
// vertical bars) to avoid the two cards reading as duplicates of each
// other.
export function WordsLearnedCard({ status, dailyStats, todayISO, onRetry, onStartNewWordStudy }: WordsLearnedCardProps) {
  const { t } = useLanguage();

  const isLoading = status === "loading" || status === "blocked";
  const isErrored = status === "error";
  const isReady = status === "ready";
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

  const title = t("userProfile.dashboardPage.supportingCards.wordsLearned.title");
  const wordsUnit = t("userProfile.learningSection.todayProgress.wordsUnit");
  const maxCount = summary ? Math.max(1, ...summary.days.map((day) => day.count)) : 1;

  const isEmpty = summary !== null && summary.total === 0;

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
          <span className="words-learned-card__skeleton words-learned-card__skeleton--total" />
          <span className="words-learned-card__skeleton words-learned-card__skeleton--bars" />
        </div>
      ) : (
        <>
          <div className="words-learned-card__totals">
            <p className="words-learned-card__total">
              {summary.total} <span className="words-learned-card__total-unit">{wordsUnit}</span>
            </p>
            {/* Absolute difference only (never a percentage) — see the
                Phase brief's "do not show percentage comparison unless the
                zero-baseline case is handled correctly." Always shown: the
                previous-7-day sum comes from the same already-loaded
                dailyStats array, so it's real data even when it's zero,
                never an omitted/faked value. */}
            <p
              className={`words-learned-card__comparison ${
                summary.difference > 0
                  ? "words-learned-card__comparison--up"
                  : summary.difference < 0
                    ? "words-learned-card__comparison--down"
                    : ""
              }`}
            >
              {summary.difference > 0 ? "+" : ""}
              {summary.difference} {t("userProfile.dashboardPage.supportingCards.wordsLearned.comparisonSuffix")}
            </p>
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
              .map((day) => `${t(`userProfile.learningSection.dailyStreak.weekdays.${weekdayShortKeyFor(day.dateISO)}`)}: ${day.count}`)
              .join(", ")}
          >
            {summary.days.map((day) => (
              <div key={day.dateISO} className="words-learned-card__bar-col">
                <div className="words-learned-card__bar-track">
                  <div
                    className="words-learned-card__bar-fill"
                    style={{ height: `${(day.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="words-learned-card__bar-label" aria-hidden="true">
                  {t(`userProfile.learningSection.dailyStreak.weekdays.${weekdayShortKeyFor(day.dateISO)}`)}
                </span>
              </div>
            ))}
          </div>

          {isEmpty ? (
            <button type="button" className="dashboard-card__action" onClick={onStartNewWordStudy}>
              {t("userProfile.learningSection.modeCards.modes.studyNewWords.buttonLabel")}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
