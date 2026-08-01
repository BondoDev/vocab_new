import { BookOpen, CircleCheck, Heart, Star, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";

type SummaryCardVariant = "purple" | "green" | "amber" | "rose";

interface SummaryCardConfig {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  variant: SummaryCardVariant;
  value: number;
}

// Hardcoded zero-state preview for a brand-new user, mirroring the
// LearningModeCards precedent. Replace with real vocabulary counts once
// that data pipeline exists.
const SUMMARY_CARDS: SummaryCardConfig[] = [
  {
    id: "learning",
    titleKey: "userProfile.vocabularySection.summaryCards.learning.title",
    descriptionKey: "userProfile.vocabularySection.summaryCards.learning.description",
    icon: BookOpen,
    variant: "purple",
    value: 0,
  },
  {
    id: "known",
    titleKey: "userProfile.vocabularySection.summaryCards.known.title",
    descriptionKey: "userProfile.vocabularySection.summaryCards.known.description",
    icon: CircleCheck,
    variant: "green",
    value: 0,
  },
  {
    id: "mastered",
    titleKey: "userProfile.vocabularySection.summaryCards.mastered.title",
    descriptionKey: "userProfile.vocabularySection.summaryCards.mastered.description",
    icon: Star,
    variant: "amber",
    value: 0,
  },
  {
    id: "favorites",
    titleKey: "userProfile.vocabularySection.summaryCards.favorites.title",
    descriptionKey: "userProfile.vocabularySection.summaryCards.favorites.description",
    icon: Heart,
    variant: "rose",
    value: 0,
  },
];

export function VocabularySummaryCards() {
  const { t } = useLanguage();

  return (
    <div className="vocabulary-summary-cards">
      {SUMMARY_CARDS.map((card) => {
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
            <p className="vocabulary-summary-card__value">{card.value}</p>
            <p className="vocabulary-summary-card__description">{t(card.descriptionKey)}</p>
            <span className="vocabulary-summary-card__status-line" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}
