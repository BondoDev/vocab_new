import { BookOpen, CircleCheck, Heart, Star, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import type { VocabularyCounts } from "../../../../data/learning/vocabularyCategory";

type SummaryCardVariant = "purple" | "green" | "amber" | "rose";

interface SummaryCardConfig {
  id: keyof VocabularyCounts;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  variant: SummaryCardVariant;
}

const SUMMARY_CARD_CONFIGS: SummaryCardConfig[] = [
  {
    id: "learning",
    titleKey: "userProfile.vocabularySection.summaryCards.learning.title",
    descriptionKey: "userProfile.vocabularySection.summaryCards.learning.description",
    icon: BookOpen,
    variant: "purple",
  },
  {
    id: "known",
    titleKey: "userProfile.vocabularySection.summaryCards.known.title",
    descriptionKey: "userProfile.vocabularySection.summaryCards.known.description",
    icon: CircleCheck,
    variant: "green",
  },
  {
    id: "mastered",
    titleKey: "userProfile.vocabularySection.summaryCards.mastered.title",
    descriptionKey: "userProfile.vocabularySection.summaryCards.mastered.description",
    icon: Star,
    variant: "amber",
  },
  {
    id: "favorites",
    titleKey: "userProfile.vocabularySection.summaryCards.favorites.title",
    descriptionKey: "userProfile.vocabularySection.summaryCards.favorites.description",
    icon: Heart,
    variant: "rose",
  },
];

interface VocabularySummaryCardsProps {
  counts: VocabularyCounts;
  isLoading: boolean;
}

// Real counts replace the old hardcoded zero-state preview — see
// loadVocabularyProgress.ts for how `counts` is computed (from every
// persisted user_word_progress row, independent of which ones resolve to
// visible vocabulary data).
export function VocabularySummaryCards({ counts, isLoading }: VocabularySummaryCardsProps) {
  const { t } = useLanguage();

  return (
    <div className="vocabulary-summary-cards">
      {SUMMARY_CARD_CONFIGS.map((card) => {
        const Icon = card.icon;

        return (
          <div
            key={card.id}
            className={`vocabulary-summary-card vocabulary-summary-card--${card.variant}`}
          >
            <div className="vocabulary-summary-card__header">
              <span className="vocabulary-summary-card__icon" aria-hidden="true">
                <Icon size={20} strokeWidth={2} />
              </span>
              <h3 className="vocabulary-summary-card__title">{t(card.titleKey)}</h3>
            </div>
            {isLoading ? (
              <span
                className="vocabulary-summary-card__value-skeleton"
                aria-hidden="true"
              />
            ) : (
              <p className="vocabulary-summary-card__value">{counts[card.id]}</p>
            )}
            <p className="vocabulary-summary-card__description">{t(card.descriptionKey)}</p>
            <span className="vocabulary-summary-card__status-line" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}
