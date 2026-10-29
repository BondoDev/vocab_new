import type { ComponentProps, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, ArrowRight, Languages, ListChecks, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { Header } from "../components/layout/Header";
import { LanguageSelector } from "../components/LanguageSelector";
import { ExerciseSelection } from "../../features/learning-setup/ExerciseSelection";
import { CefrLevelTiles } from "../../features/learning-setup/CefrLevelTiles";
import {
  FILTERS_PAGE_KEY,
  FILTER_CATEGORY_IDS,
  FILTER_LEVEL_CODES,
  getCategoryLabel,
  getSelectionCountLabel,
  getSelectionSummary,
  getWordTypeLabel,
} from "../../features/learning-setup/filterLabels";
import { getSelectionState } from "../../features/learning-setup/filterSelection";
import { useFilterVocabulary } from "../../features/learning-setup/useFilterVocabulary";
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
  setSelectedLevels: (levels: string[]) => void;
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
  setSelectedLevels,
  selectedCategories,
  selectedWordTypes,
  onCustomizeFilters,
  isCustomizeFiltersDisabled,
  selectedExercises,
  setSelectedExercises,
  onStartPracticing,
  isStartPracticingDisabled,
}: CustomPracticePreviewPageProps) {
  const { t, uiLanguage } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  // Same metadata guard as the detailed filters page: a level change that
  // would leave no words for the current topic/word-type filters is blocked.
  const { wordTypes, getFilteredWordCount } = useFilterVocabulary(practiceLanguage);
  // An empty persisted level list means every level (as the tiles show it),
  // so count it as "All 6 selected" like the detailed filters page does.
  const levelState = getSelectionState(
    selectedLevels.length > 0 ? selectedLevels : FILTER_LEVEL_CODES,
    FILTER_LEVEL_CODES,
    { emptyMeansAll: true },
  );
  const topicState = getSelectionState(selectedCategories, FILTER_CATEGORY_IDS, { emptyMeansAll: true });
  const wordTypeState = getSelectionState(selectedWordTypes, wordTypes, { emptyMeansAll: true });
  const otherFilters = [
    {
      key: "topics",
      label: t(`${FILTERS_PAGE_KEY}.summary.topics`),
      value: getSelectionSummary(t, topicState, "allTopics", (id) => getCategoryLabel(t, id), 3),
    },
    {
      key: "wordTypes",
      label: t(`${FILTERS_PAGE_KEY}.summary.wordTypes`),
      value: getSelectionSummary(t, wordTypeState, "allWordTypes", (id) => getWordTypeLabel(t, id), 3),
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
          {/* Levels are edited here directly; topics and word types stay on
              the detailed filters page. Both pages write the same App-owned
              filter state, so neither keeps its own copy to drift. */}
          <section className="custom-practice-setup__section custom-practice-setup__filters" aria-labelledby="custom-practice-filters-heading">
            <PracticeSectionHeading id="custom-practice-filters-heading" icon={SlidersHorizontal}>
              {t("home.customPractice.filters.title")}
            </PracticeSectionHeading>
            <div className="custom-practice-setup__levels-head">
              <h3 id="custom-practice-levels-heading">
                {t("home.customPractice.filters.levelsHeading")}
              </h3>
              <div className="custom-practice-setup__levels-status">
                <span className="custom-practice-setup__levels-count" aria-live="polite">
                  {getSelectionCountLabel(t, uiLanguage, levelState, "summary.allLevels")}
                </span>
                {/* No "Deselect all": an empty level list is not a valid
                    selection (it reverts to all levels), same as on the
                    detailed filters page. Selecting every level can never
                    remove matching words, so it needs no metadata check. */}
                <button
                  type="button"
                  className="custom-practice-setup__select-all"
                  disabled={levelState.kind !== "some"}
                  onClick={() => setSelectedLevels([...FILTER_LEVEL_CODES])}
                >
                  {t(`${FILTERS_PAGE_KEY}.selectAll`)}
                </button>
              </div>
            </div>
            <CefrLevelTiles
              selectedLevels={selectedLevels}
              onChange={setSelectedLevels}
              canApply={(levels) => getFilteredWordCount(levels, selectedCategories, selectedWordTypes) > 0}
              labelledBy="custom-practice-levels-heading"
              unavailableHint={t(`${FILTERS_PAGE_KEY}.unavailable`)}
            />
            <div className="custom-practice-setup__filter-footer">
              <dl className="custom-practice-setup__other-filters">
                {otherFilters.map(({ key, label, value }) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                onClick={onCustomizeFilters}
                disabled={isCustomizeFiltersDisabled}
                className="custom-practice-setup__filter-button"
              >
                {t("home.customPractice.filters.moreFilters")}
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
