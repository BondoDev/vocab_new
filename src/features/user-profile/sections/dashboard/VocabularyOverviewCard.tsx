import { ArrowRight, BookOpen, CircleCheck, Star, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { computeVocabularyCounts, type VocabularyCounts } from "../../../../data/learning/vocabularyCategory";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { UserProfileSectionId } from "../../components/UserProfileSidebar";

// Same three user-facing categories, same icons/colors, and the same
// pure computeVocabularyCounts (src/data/learning/vocabularyCategory.ts)
// the Vocabulary page's own summary cards use — see
// VocabularySummaryCards.tsx. Favorites is deliberately excluded (out of
// scope for this compact preview, per the Phase brief).
interface CategoryConfig {
  id: "learning" | "known" | "mastered";
  titleKey: string;
  icon: LucideIcon;
  variant: "purple" | "green" | "amber";
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: "learning",
    titleKey: "userProfile.vocabularySection.summaryCards.learning.title",
    icon: BookOpen,
    variant: "purple",
  },
  {
    id: "known",
    titleKey: "userProfile.vocabularySection.summaryCards.known.title",
    icon: CircleCheck,
    variant: "green",
  },
  {
    id: "mastered",
    titleKey: "userProfile.vocabularySection.summaryCards.mastered.title",
    icon: Star,
    variant: "amber",
  },
];

interface VocabularyOverviewCardProps {
  // Shared, already-loaded active-language rows (UserProfileDashboardPage's
  // useProfileSharedProgressData) — this card performs no fetch of its
  // own at all.
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onRetryWordProgress?: () => void;
  onNavigateToSection?: (section: UserProfileSectionId) => void;
}

// Dashboard Phase 3 — Card A: a compact current snapshot of the user's
// vocabulary composition, not a duplicate of the Vocabulary page (no
// favorites, no CEFR breakdown, no per-word table).
export function VocabularyOverviewCard({
  wordProgressRows,
  wordProgressStatus,
  onRetryWordProgress,
  onNavigateToSection,
}: VocabularyOverviewCardProps) {
  const { t } = useLanguage();

  const isLoading = wordProgressStatus === "loading";
  const isErrored = wordProgressStatus === "error";
  // "unavailable" (signed out / no target language) already carries an
  // empty rows array from the shared hook — computeVocabularyCounts([])
  // correctly yields real zeros, not a fabricated placeholder.
  const counts: VocabularyCounts = computeVocabularyCounts(wordProgressRows);

  const title = t("userProfile.dashboardPage.supportingCards.vocabularyOverview.title");

  return (
    <section className="dashboard-card vocabulary-overview-card" aria-label={title}>
      <header className="dashboard-card__header">
        <h2 className="dashboard-card__title">{title}</h2>
      </header>

      {isErrored ? (
        <div className="dashboard-card__error" role="status">
          <p className="dashboard-card__error-text">
            {t("userProfile.dashboardPage.supportingCards.loadError")}
          </p>
          <button type="button" className="dashboard-card__error-retry" onClick={onRetryWordProgress}>
            {t("userProfile.dashboardPage.supportingCards.retryButton")}
          </button>
        </div>
      ) : (
        <>
          <div className="vocabulary-overview-card__columns">
            {CATEGORY_CONFIGS.map((category) => {
              const Icon = category.icon;
              return (
                <div
                  key={category.id}
                  className={`vocabulary-overview-card__column vocabulary-overview-card__column--${category.variant}`}
                >
                  <span className="vocabulary-overview-card__icon" aria-hidden="true">
                    <Icon size={15} strokeWidth={2} />
                  </span>
                  <p className="vocabulary-overview-card__label">{t(category.titleKey)}</p>
                  {isLoading ? (
                    <span
                      className="vocabulary-overview-card__skeleton"
                      aria-hidden="true"
                    />
                  ) : (
                    <p className="vocabulary-overview-card__value">{counts[category.id]}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Text summary for accessibility — the three columns above are
              already plain readable text/numbers, but this makes the
              relationship (category -> count) explicit for anyone
              skimming via a screen reader's heading/landmark list rather
              than reading the columns in visual order. */}
          <p className="sr-only">
            {CATEGORY_CONFIGS.map((category) => `${t(category.titleKey)}: ${counts[category.id]}`).join(", ")}
          </p>

          <button
            type="button"
            className="dashboard-card__action"
            onClick={() => onNavigateToSection?.("vocabulary")}
          >
            {t("userProfile.dashboardPage.supportingCards.vocabularyOverview.viewVocabulary")}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </>
      )}
    </section>
  );
}
