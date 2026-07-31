import {
  ArrowRight,
  BrainCircuit,
  NotebookPen,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";

type LearningModeVariant = "purple" | "blue" | "orange";

interface LearningModeConfig {
  id: string;
  titleKey: string;
  descriptionKey: string;
  metaLineKey: string;
  icon: LucideIcon;
  variant: LearningModeVariant;
  buttonLabelKey: string;
}

// Hardcoded zero/preview state for a brand-new user. Once real workflows
// exist, each card's onClick should route into its own session.
const LEARNING_MODES: LearningModeConfig[] = [
  {
    id: "study-new-words",
    titleKey: "userProfile.learningSection.modeCards.modes.studyNewWords.title",
    descriptionKey: "userProfile.learningSection.modeCards.modes.studyNewWords.description",
    metaLineKey: "userProfile.learningSection.modeCards.modes.studyNewWords.metaLine",
    icon: NotebookPen,
    variant: "purple",
    buttonLabelKey: "userProfile.learningSection.modeCards.modes.studyNewWords.buttonLabel",
  },
  {
    id: "review-words",
    titleKey: "userProfile.learningSection.modeCards.modes.reviewWords.title",
    descriptionKey: "userProfile.learningSection.modeCards.modes.reviewWords.description",
    metaLineKey: "userProfile.learningSection.modeCards.modes.reviewWords.metaLine",
    icon: BrainCircuit,
    variant: "blue",
    buttonLabelKey: "userProfile.learningSection.modeCards.modes.reviewWords.buttonLabel",
  },
  {
    id: "custom-practice",
    titleKey: "userProfile.learningSection.modeCards.modes.customPractice.title",
    descriptionKey: "userProfile.learningSection.modeCards.modes.customPractice.description",
    metaLineKey: "userProfile.learningSection.modeCards.modes.customPractice.metaLine",
    icon: SlidersHorizontal,
    variant: "orange",
    buttonLabelKey: "userProfile.learningSection.modeCards.modes.customPractice.buttonLabel",
  },
];

// Styled by learning-section.scss (imported by LearningSection.tsx, the
// only place this component is rendered) rather than its own stylesheet.
export function LearningModeCards() {
  const { t } = useLanguage();

  return (
    <section className="learning-mode-cards" aria-labelledby="learning-mode-cards-heading">
      <header className="learning-mode-cards__header">
        <h2 id="learning-mode-cards-heading" className="learning-mode-cards__title">
          {t("userProfile.learningSection.modeCards.title")}
        </h2>
        <p className="learning-mode-cards__description">
          {t("userProfile.learningSection.modeCards.description")}
        </p>
      </header>

      <div className="learning-mode-cards__list">
        {LEARNING_MODES.map((mode) => (
          <LearningModeCard key={mode.id} mode={mode} />
        ))}
      </div>
    </section>
  );
}

function LearningModeCard({ mode }: { mode: LearningModeConfig }) {
  const { t } = useLanguage();
  const Icon = mode.icon;

  return (
    <div className={`learning-mode-card learning-mode-card--${mode.variant}`}>
      <div className="learning-mode-card__main">
        <span className="learning-mode-card__icon" aria-hidden="true">
          <Icon size={26} strokeWidth={2} />
        </span>

        <div className="learning-mode-card__content">
          <h3 className="learning-mode-card__title">{t(mode.titleKey)}</h3>
          <p className="learning-mode-card__description">{t(mode.descriptionKey)}</p>
          <p className="learning-mode-card__meta">{t(mode.metaLineKey)}</p>
        </div>
      </div>

      <button type="button" className="learning-mode-card__button">
        {t(mode.buttonLabelKey)}
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
