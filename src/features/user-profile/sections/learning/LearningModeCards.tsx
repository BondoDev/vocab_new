import {
  ArrowRight,
  BrainCircuit,
  NotebookPen,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Toast, useAutoDismissMessage } from "./Toast";

type LearningModeVariant = "purple" | "blue" | "orange";

interface LearningModeConfig {
  id: string;
  title: string;
  description: string;
  metaLine: string;
  icon: LucideIcon;
  variant: LearningModeVariant;
  buttonLabel: string;
}

// Hardcoded zero/preview state for a brand-new user. Once real workflows
// exist, each card's onClick should route into its own session (new-word
// queue, spaced-repetition review, or the custom practice setup flow)
// instead of only recording a local selection.
const LEARNING_MODES: LearningModeConfig[] = [
  {
    id: "study-new-words",
    title: "Study New Words",
    description:
      "Continue through your structured vocabulary sequence and learn today's new words.",
    metaLine: "15 words remaining • Approximately 12–15 min",
    icon: NotebookPen,
    variant: "purple",
    buttonLabel: "Start Learning",
  },
  {
    id: "review-words",
    title: "Review Words",
    description: "Review previously studied words according to their spaced-repetition schedule.",
    metaLine: "No reviews scheduled",
    icon: BrainCircuit,
    variant: "blue",
    buttonLabel: "Start Review",
  },
  {
    id: "custom-practice",
    title: "Custom Practice",
    description: "Choose your own words, lists, filters, levels, and exercises.",
    metaLine: "Current level A2 • All categories",
    icon: SlidersHorizontal,
    variant: "orange",
    buttonLabel: "Start Practice",
  },
];

// Styled by learning-section.scss (imported by LearningSection.tsx, the
// only place this component is rendered) rather than its own stylesheet.
export function LearningModeCards() {
  const { message: selectionMessage, show: showSelection } = useAutoDismissMessage();

  const handleSelect = (title: string) => {
    // Preview-only: no real learning session starts here yet.
    showSelection(`${title} selected`);
  };

  return (
    <section className="learning-mode-cards" aria-labelledby="learning-mode-cards-heading">
      <header className="learning-mode-cards__header">
        <h2 id="learning-mode-cards-heading" className="learning-mode-cards__title">
          Start Learning
        </h2>
        <p className="learning-mode-cards__description">
          Choose how you want to continue your vocabulary learning today.
        </p>
      </header>

      <div className="learning-mode-cards__list">
        {LEARNING_MODES.map((mode) => (
          <LearningModeCard key={mode.id} mode={mode} onSelect={handleSelect} />
        ))}
      </div>

      <Toast message={selectionMessage} />
    </section>
  );
}

function LearningModeCard({
  mode,
  onSelect,
}: {
  mode: LearningModeConfig;
  onSelect: (title: string) => void;
}) {
  const Icon = mode.icon;

  return (
    <div className={`learning-mode-card learning-mode-card--${mode.variant}`}>
      <div className="learning-mode-card__main">
        <span className="learning-mode-card__icon" aria-hidden="true">
          <Icon size={26} strokeWidth={2} />
        </span>

        <div className="learning-mode-card__content">
          <h3 className="learning-mode-card__title">{mode.title}</h3>
          <p className="learning-mode-card__description">{mode.description}</p>
          <p className="learning-mode-card__meta">{mode.metaLine}</p>
        </div>
      </div>

      <button
        type="button"
        className="learning-mode-card__button"
        onClick={() => onSelect(mode.title)}
      >
        {mode.buttonLabel}
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
