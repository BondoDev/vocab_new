import { ArrowRight, Award, BadgeCheck, CalendarCheck, Library, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { computeVocabularyCounts } from "../../../../data/learning/vocabularyCategory";
import { computeMilestoneStreak } from "../../../../data/learning/milestoneStreak";
import { evaluateAllMilestoneTracks, type MilestoneTrackId } from "../../../../data/learning/milestones";
import { DASHBOARD_MILESTONE_PREVIEW_TRACKS, selectDashboardMilestonePreview } from "./dashboardMilestonePreview";
import type { UserWordProgressFullRow, MilestoneDailyStatRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { DashboardSupportingDataStatus } from "./useDashboardSupportingData";
import type { UserProfileSectionId } from "../../components/UserProfileSidebar";

// Same icon/color choices as the Progress page's own milestone tracks
// (MilestoneAccordionRow.tsx's TRACK_CONFIGS) so this compact preview
// reads as the same system, not a reimplementation.
const TRACK_UI: Record<MilestoneTrackId, { icon: LucideIcon; colorVar: string; titleKey: string }> = {
  vocabulary: { icon: Library, colorVar: "var(--primary)", titleKey: "userProfile.progressSection.tracks.vocabulary" },
  mastery: { icon: Award, colorVar: "#f59e0b", titleKey: "userProfile.progressSection.tracks.mastery" },
  known: { icon: BadgeCheck, colorVar: "var(--chart-2)", titleKey: "userProfile.progressSection.tracks.known" },
  consistency: { icon: CalendarCheck, colorVar: "#22c55e", titleKey: "userProfile.progressSection.tracks.consistency" },
};

interface MilestonePreviewCardProps {
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  dailyStats: MilestoneDailyStatRow[];
  dailyStatsStatus: DashboardSupportingDataStatus;
  todayISO: string | null;
  onRetryWordProgress?: () => void;
  onRetryDailyStats?: () => void;
  onNavigateToSection?: (section: UserProfileSectionId) => void;
}

// Dashboard Phase 3 — Card D: a compact glimpse of milestone progress,
// reusing the exact same pure engine the Progress page's Milestones
// section uses (evaluateAllMilestoneTracks) — never a second milestone
// calculation. No accordion, no milestone path, no completed-milestone
// history: only the next active milestone for each Progress page track
// (see dashboardMilestonePreview.ts for order/reshaping).
export function MilestonePreviewCard({
  wordProgressRows,
  wordProgressStatus,
  dailyStats,
  dailyStatsStatus,
  todayISO,
  onRetryWordProgress,
  onRetryDailyStats,
  onNavigateToSection,
}: MilestonePreviewCardProps) {
  const { t } = useLanguage();

  const isLoading =
    wordProgressStatus === "loading" || dailyStatsStatus === "loading" || dailyStatsStatus === "blocked";
  const isErrored = wordProgressStatus === "error" || dailyStatsStatus === "error";
  const isReady = dailyStatsStatus === "ready";
  // A signed-out visitor (or no chosen target language yet) reaches
  // "ready" with empty wordProgressRows/dailyStats but a null todayISO —
  // same fallback as StudyActivityCard/WordsLearnedCard, so this still
  // renders real (all-zero-progress) milestone rows instead of an
  // indefinite skeleton.
  const effectiveTodayISO = todayISO ?? new Date().toISOString().slice(0, 10);

  const rows = isReady
    ? (() => {
        const counts = computeVocabularyCounts(wordProgressRows);
        return selectDashboardMilestonePreview(
          evaluateAllMilestoneTracks({
            learnedWords: counts.total,
            masteredWords: counts.mastered,
            knownWords: counts.known,
            currentStreakDays: computeMilestoneStreak(dailyStats, effectiveTodayISO),
          }),
        );
      })()
    : [];

  const title = t("userProfile.dashboardPage.supportingCards.milestonePreview.title");

  const handleRetry = () => {
    onRetryWordProgress?.();
    onRetryDailyStats?.();
  };

  return (
    <section className="dashboard-card milestone-preview-card" aria-label={title}>
      <header className="dashboard-card__header">
        <h2 className="dashboard-card__title">{title}</h2>
        {!isErrored ? (
          <button
            type="button"
            className="dashboard-card__action"
            onClick={() => onNavigateToSection?.("progress")}
          >
            {t("userProfile.dashboardPage.supportingCards.milestonePreview.viewProgress")}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {isErrored ? (
        <div className="dashboard-card__error" role="status">
          <p className="dashboard-card__error-text">
            {t("userProfile.dashboardPage.supportingCards.loadError")}
          </p>
          <button type="button" className="dashboard-card__error-retry" onClick={handleRetry}>
            {t("userProfile.dashboardPage.supportingCards.retryButton")}
          </button>
        </div>
      ) : (
        <>
          <div className="milestone-preview-card__list">
            {isLoading || rows.length === 0
              ? DASHBOARD_MILESTONE_PREVIEW_TRACKS.map((_, index) => (
                  <div key={index} className="milestone-preview-card__row milestone-preview-card__row--skeleton" aria-hidden="true">
                    <span className="milestone-preview-card__skeleton-icon" />
                    <div className="milestone-preview-card__body">
                      <span className="milestone-preview-card__skeleton-line" />
                      <span className="milestone-preview-card__skeleton-bar" />
                    </div>
                  </div>
                ))
              : rows.map((row) => {
                  const ui = TRACK_UI[row.track];
                  const Icon = ui.icon;
                  const trackLabel = t(ui.titleKey);
                  return (
                    <div key={row.track} className="milestone-preview-card__row">
                      <span
                        className="milestone-preview-card__icon"
                        style={{ color: ui.colorVar }}
                        aria-hidden="true"
                      >
                        <Icon size={16} strokeWidth={2} />
                      </span>
                      <div className="milestone-preview-card__body">
                        <p className="milestone-preview-card__label">{trackLabel}</p>
                        <div
                          className="milestone-preview-card__bar-track"
                          role="progressbar"
                          aria-valuenow={row.current}
                          aria-valuemin={0}
                          aria-valuemax={row.target}
                          aria-label={`${trackLabel}: ${row.current} / ${row.target}`}
                        >
                          <div
                            className="milestone-preview-card__bar-fill"
                            style={{ width: `${row.progress * 100}%`, background: ui.colorVar }}
                          />
                        </div>
                      </div>
                      <p className="milestone-preview-card__ratio" aria-hidden="true">
                        {row.current} / {row.target}
                      </p>
                    </div>
                  );
                })}
          </div>

        </>
      )}
    </section>
  );
}
