import { ArrowRight, BrainCircuit, NotebookPen, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { InteractiveTourCard } from "./InteractiveTourCard";

interface LearningCycleStepConfig {
  id: "learnNewWords" | "reviewWords" | "practice";
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

// Same three icons as LearningModeCards.tsx's own studyNewWords/
// reviewWords/customPractice cards (Learning section) — this is a guide to
// the exact same three learning modes, so it deliberately reuses their
// icon language rather than inventing a second one.
const LEARNING_CYCLE_STEPS: LearningCycleStepConfig[] = [
  {
    id: "learnNewWords",
    titleKey: "userProfile.guidancePage.gettingStarted.steps.learnNewWords.title",
    descriptionKey: "userProfile.guidancePage.gettingStarted.steps.learnNewWords.description",
    icon: NotebookPen,
  },
  {
    id: "reviewWords",
    titleKey: "userProfile.guidancePage.gettingStarted.steps.reviewWords.title",
    descriptionKey: "userProfile.guidancePage.gettingStarted.steps.reviewWords.description",
    icon: BrainCircuit,
  },
  {
    id: "practice",
    titleKey: "userProfile.guidancePage.gettingStarted.steps.practice.title",
    descriptionKey: "userProfile.guidancePage.gettingStarted.steps.practice.description",
    icon: SlidersHorizontal,
  },
];

interface GettingStartedSectionProps {
  onStartInteractiveTour?: () => void;
}

// Guidance Section 1's only content block: the intro paragraph, the three
// learning-cycle steps presented as a connected sequence, and the
// Interactive Tour entry point. No later Guidance sections (Vocabulary, My
// Lists, Progress, Settings guidance) belong in this component — see
// GuidanceSection.tsx's own header.
export function GettingStartedSection({ onStartInteractiveTour }: GettingStartedSectionProps) {
  const { t } = useLanguage();

  return (
    <section className="guidance-getting-started" aria-labelledby="guidance-getting-started-heading">
      <h2 id="guidance-getting-started-heading" className="guidance-getting-started__heading">
        {t("userProfile.guidancePage.gettingStarted.heading")}
      </h2>
      <p className="guidance-getting-started__intro">{t("userProfile.guidancePage.gettingStarted.intro")}</p>

      <ol className="guidance-steps">
        {LEARNING_CYCLE_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === LEARNING_CYCLE_STEPS.length - 1;

          return (
            <li key={step.id} className="guidance-step">
              <span className="guidance-step__icon" aria-hidden="true">
                <Icon size={20} strokeWidth={2} />
              </span>
              <h3 className="guidance-step__title">{t(step.titleKey)}</h3>
              <p className="guidance-step__description">{t(step.descriptionKey)}</p>

              {/* Decorative sequence connector only — hidden on narrow
                  screens (see guidance-section.scss) where the steps stack
                  vertically and the reading order alone already conveys
                  the sequence. */}
              {!isLast ? (
                <span className="guidance-step__connector" aria-hidden="true">
                  <ArrowRight size={16} strokeWidth={2} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <InteractiveTourCard onStartInteractiveTour={onStartInteractiveTour} />
    </section>
  );
}
