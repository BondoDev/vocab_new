import type { ComponentProps, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, ArrowRight, Languages, ListChecks, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { Header } from "../components/layout/Header";
import { LanguageSelector } from "../components/LanguageSelector";
import { VALID_LEVEL_CODES } from "../utils/pageRouting";
import { ExerciseSelection } from "../../features/learning-setup/ExerciseSelection";
import "./custom-practice-preview.scss";

function PracticeSectionHeading({ id, icon: Icon, children }: {
  id: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className="custom-practice-setup__section-heading">
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </h2>
  );
}

interface CustomPracticePreviewPageProps {
  headerProps: ComponentProps<typeof Header>;
  languages: ComponentProps<typeof LanguageSelector>["languages"];
  yourLanguage: string;
  practiceLanguage: string;
  onYourLanguageChange: (value: string) => void;
  onPracticeLanguageChange: (value: string) => void;
  onReverseLanguages: () => void;
  swapRotation: number;
  selectedLevels: string[];
  selectedCategories: string[];
  selectedWordTypes: string[];
  onCustomizeFilters: () => void;
  isCustomizeFiltersDisabled: boolean;
  selectedExercises: string[];
  setSelectedExercises: (exercises: string[]) => void;
  onStartPracticing: () => void;
  isStartPracticingDisabled: boolean;
}

export function CustomPracticePreviewPage({
  headerProps,
  languages,
  yourLanguage,
  practiceLanguage,
  onYourLanguageChange,
  onPracticeLanguageChange,
  onReverseLanguages,
  swapRotation,
  selectedLevels,
  selectedCategories,
  selectedWordTypes,
  onCustomizeFilters,
  isCustomizeFiltersDisabled,
  selectedExercises,
  setSelectedExercises,
  onStartPracticing,
  isStartPracticingDisabled,
}: CustomPracticePreviewPageProps) {
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const allLevels = selectedLevels.length === 0 ||
    [...VALID_LEVEL_CODES].every((level) => selectedLevels.includes(level));
  const allVocabulary = allLevels && selectedCategories.length === 0 && selectedWordTypes.length === 0;
  const translatedLabel = (key: string, fallback: string) => {
    const label = t(key);
    return label && label !== key ? label : fallback;
  };
  const filterSummary = [
    {
      label: t("levelCategory.levels"),
      values: allLevels
        ? [t("levelCategory.selection.allLevelsSelected")]
        : [...VALID_LEVEL_CODES].filter((level) => selectedLevels.includes(level)),
    },
    {
      label: t("levelCategory.categories"),
      values: selectedCategories.length
        ? selectedCategories.map((category) => translatedLabel(`levelCategory.topicNames.${category}`, category))
        : [t("levelCategory.allTopicsSelected")],
    },
    {
      label: t("levelCategory.wordTypes"),
      values: selectedWordTypes.length
        ? selectedWordTypes.map((type) => translatedLabel(`wordTypes.${type}`, type))
        : [t("levelCategory.allGrammarTypesSelected")],
    },
  ];

  return (
    <div className="custom-practice-setup">
      <Header {...headerProps} activePage="exerciseSelection" />
      <main className="custom-practice-setup__main">
        <div className="custom-practice-setup__intro">
          <h1>
            Customize Your Practice
          </h1>
          <p>
            Choose your languages, vocabulary, and exercises.
          </p>
        </div>
        <div className="custom-practice-setup__configuration">
          <section
            className="custom-practice-setup__section custom-practice-setup__languages"
            aria-labelledby="custom-practice-languages-heading"
          >
            <PracticeSectionHeading id="custom-practice-languages-heading" icon={Languages}>
              {t("home.customPractice.chooseLanguages")}
            </PracticeSectionHeading>
            <div className="custom-practice-setup__language-grid">
              <div className="custom-practice-setup__field">
                <LanguageSelector
                  label={t("home.yourLanguage")}
                  value={yourLanguage}
                  onChange={onYourLanguageChange}
                  placeholder={t("home.selectYourLanguage")}
                  languages={languages}
                  disabledLanguages={[practiceLanguage]}
                />
              </div>
              <div className="custom-practice-setup__swap-wrap">
                <motion.button
                  type="button"
                  onClick={onReverseLanguages}
                  className="custom-practice-setup__swap"
                  aria-label="Reverse languages"
                  title="Reverse languages"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.span
                    animate={shouldReduceMotion ? undefined : { rotate: swapRotation }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: "easeInOut" }}
                    className="inline-flex"
                  >
                    <ArrowLeftRight aria-hidden="true" />
                  </motion.span>
                </motion.button>
              </div>
              <div className="custom-practice-setup__field">
                <LanguageSelector
                  label={t("home.practiceLanguage")}
                  value={practiceLanguage}
                  onChange={onPracticeLanguageChange}
                  placeholder={t("home.selectPracticeLanguage")}
                  languages={languages}
                  disabledLanguages={[yourLanguage]}
                />
              </div>
            </div>
          </section>
          <section className="custom-practice-setup__section custom-practice-setup__filters" aria-labelledby="custom-practice-filters-heading">
            <div className="custom-practice-setup__filter-row">
              <div className="custom-practice-setup__filter-copy">
                <PracticeSectionHeading id="custom-practice-filters-heading" icon={SlidersHorizontal}>
                  {t("home.customPractice.filters.title")}
                </PracticeSectionHeading>
                {allVocabulary ? (
                  <p className="custom-practice-setup__summary">
                    {t("home.customPractice.filters.unrestrictedSummary")}
                  </p>
                ) : (
                  <p className="custom-practice-setup__summary">
                    {filterSummary.map(({ label, values }, index) => (
                      <span key={label} title={values.join(", ")}>
                        {index > 0 && <span aria-hidden="true"> &middot; </span>}
                        {label}: {values.slice(0, 3).join(", ")}{values.length > 3 ? ` +${values.length - 3}` : ""}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onCustomizeFilters}
                disabled={isCustomizeFiltersDisabled}
                className="custom-practice-setup__filter-button"
              >
                {t("home.customPractice.filters.customize")}
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </section>
          <section className="custom-practice-setup__section custom-practice-setup__exercises" aria-labelledby="custom-practice-exercises-heading">
            <PracticeSectionHeading id="custom-practice-exercises-heading" icon={ListChecks}>
              {t("home.customPractice.chooseExercises")}
            </PracticeSectionHeading>
            <ExerciseSelection
              selectedExercises={selectedExercises}
              setSelectedExercises={setSelectedExercises}
              onBack={onCustomizeFilters}
              onContinue={onStartPracticing}
              embedded
            />
          </section>
          <div className="custom-practice-setup__start-wrap">
            <button
              type="button"
              className="custom-practice-setup__start-button"
              disabled={isStartPracticingDisabled}
              onClick={onStartPracticing}
            >
              {t("home.customPractice.button")}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
