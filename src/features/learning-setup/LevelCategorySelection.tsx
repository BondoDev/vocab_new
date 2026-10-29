import { useEffect, useState } from "react";
import "./styles/level-category-selection.scss";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
} from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { CefrLevelTiles } from "./CefrLevelTiles";
import {
  FILTERS_PAGE_KEY,
  FILTER_CATEGORY_IDS,
  FILTER_LEVEL_CODES,
  getCategoryLabel as getCategoryLabelFor,
  getSelectionCountLabel,
  getSelectionSummary,
  getWordTypeLabel as getWordTypeLabelFor,
} from "./filterLabels";
import {
  abbreviateList,
  fillTemplate,
  getSelectionState,
  toggleSelection,
  type SelectionState,
} from "./filterSelection";
import { useFilterVocabulary } from "./useFilterVocabulary";

interface LevelCategorySelectionProps {
  selectedLevel: string;
  setSelectedLevel: (level: string) => void;
  practiceLanguage: string;
  selectedCategories: string[];
  setSelectedCategories: (categories: string[]) => void;
  selectedLevels: string[];
  setSelectedLevels: (levels: string[]) => void;
  selectedWordTypes: string[];
  setSelectedWordTypes: (types: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
  onTakeLevelTest: () => void;
  continueLabel?: string;
  backLabel?: string;
}

const allLevelCodes = FILTER_LEVEL_CODES;
const categoryIds = FILTER_CATEGORY_IDS;

// Collapsed topic list size. Collapsing only hides chips: selection counts
// and summaries always use the full topic list.
const TOPICS_COLLAPSED_MOBILE = 8;
const TOPICS_COLLAPSED_DESKTOP = 15;
// Labels listed in a group's "Selected: …" line before "+N more".
const VALUES_SHOWN_IN_GROUP = 3;
// Setup-summary rows list names up to this many, then switch to "N of total".
const VALUES_LISTED_IN_SUMMARY = 3;

const PAGE_KEY = FILTERS_PAGE_KEY;

export function LevelCategorySelection({
  practiceLanguage,
  selectedCategories,
  setSelectedCategories,
  selectedLevels,
  setSelectedLevels,
  selectedWordTypes,
  setSelectedWordTypes,
  onBack,
  onContinue,
  onTakeLevelTest,
  continueLabel,
  backLabel,
}: LevelCategorySelectionProps) {
  const [areTopicsExpanded, setAreTopicsExpanded] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const { t, uiLanguage } = useLanguage();
  const { wordTypes: prioritizedWordTypes, getFilteredWordCount } =
    useFilterVocabulary(practiceLanguage);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const narrowMedia = window.matchMedia("(max-width: 639.98px)");
    const update = () => setIsNarrowViewport(narrowMedia.matches);
    update();
    narrowMedia.addEventListener("change", update);
    return () => narrowMedia.removeEventListener("change", update);
  }, []);

  const pageText = (key: string) => t(`${PAGE_KEY}.${key}`);
  const getCategoryLabel = (categoryId: string) =>
    getCategoryLabelFor(t, categoryId);
  const getWordTypeLabel = (typeId: string) => getWordTypeLabelFor(t, typeId);

  // Every change is checked against the vocabulary metadata first: an option
  // whose toggle would leave zero matching words is disabled rather than
  // allowed to produce an empty practice session.
  const canApplyLevels = (levels: string[]) =>
    getFilteredWordCount(levels, selectedCategories, selectedWordTypes) > 0;

  const hasWordsAfterCategoryToggle = (categoryId: string) =>
    getFilteredWordCount(
      selectedLevels,
      toggleSelection(selectedCategories, categoryId),
      selectedWordTypes,
    ) > 0;

  const hasWordsAfterWordTypeToggle = (typeId: string) =>
    getFilteredWordCount(
      selectedLevels,
      selectedCategories,
      toggleSelection(selectedWordTypes, typeId),
    ) > 0;

  const toggleCategory = (categoryId: string) => {
    if (!hasWordsAfterCategoryToggle(categoryId)) {
      return;
    }
    setSelectedCategories(toggleSelection(selectedCategories, categoryId));
  };

  const toggleWordType = (typeId: string) => {
    if (!hasWordsAfterWordTypeToggle(typeId)) {
      return;
    }
    setSelectedWordTypes(toggleSelection(selectedWordTypes, typeId));
  };

  useEffect(() => {
    if (selectedLevels.length === 0) {
      setSelectedLevels(allLevelCodes);
    }
  }, [selectedLevels.length, setSelectedLevels]);

  const levelState = getSelectionState(selectedLevels, allLevelCodes, {
    emptyMeansAll: true,
  });
  const topicState = getSelectionState(selectedCategories, categoryIds, {
    emptyMeansAll: true,
  });
  const wordTypeState = getSelectionState(
    selectedWordTypes,
    prioritizedWordTypes,
    { emptyMeansAll: true },
  );

  const hasAnyFilterSelected =
    selectedCategories.length > 0 ||
    selectedWordTypes.length > 0 ||
    levelState.kind === "some";
  const hasWordsForCurrentFilters =
    getFilteredWordCount(selectedLevels, selectedCategories, selectedWordTypes) >
    0;

  const collapsedTopicLimit = isNarrowViewport
    ? TOPICS_COLLAPSED_MOBILE
    : TOPICS_COLLAPSED_DESKTOP;
  const hiddenTopicsCount = Math.max(0, categoryIds.length - collapsedTopicLimit);
  const visibleCategoryIds = areTopicsExpanded
    ? categoryIds
    : categoryIds.slice(0, collapsedTopicLimit);

  const getCountBadge = (state: SelectionState, allLabelKey: string) =>
    getSelectionCountLabel(t, uiLanguage, state, allLabelKey);

  // Group "Selected: …" line; omitted when everything is included.
  const getSelectedValuesLine = (
    state: SelectionState,
    getLabel: (value: string) => string,
  ) => {
    if (state.kind !== "some") return null;
    const { shown, rest } = abbreviateList(
      state.selected.map(getLabel),
      VALUES_SHOWN_IN_GROUP,
    );
    const values = rest
      ? `${shown.join(", ")} ${fillTemplate(pageText("moreValues"), { count: rest })}`
      : shown.join(", ");
    return fillTemplate(pageText("selectedValues"), { values });
  };

  const levelSummary = getSelectionSummary(
    t,
    levelState,
    "allLevels",
    (code) => code,
    allLevelCodes.length,
  );
  const topicSummary = getSelectionSummary(
    t,
    topicState,
    "allTopics",
    getCategoryLabel,
    VALUES_LISTED_IN_SUMMARY,
  );
  const wordTypeSummary = getSelectionSummary(
    t,
    wordTypeState,
    "allWordTypes",
    getWordTypeLabel,
    VALUES_LISTED_IN_SUMMARY,
  );

  const levelValuesLine = getSelectedValuesLine(levelState, (code) => code);
  const topicValuesLine = getSelectedValuesLine(topicState, getCategoryLabel);
  const wordTypeValuesLine = getSelectedValuesLine(
    wordTypeState,
    getWordTypeLabel,
  );
  const unavailableHint = pageText("unavailable");

  return (
    <div className="filters-page">
      {/* Outside the centered column so desktop can align it with the logo. */}
      <div className="filters-page__back-row">
        <button type="button" onClick={onBack} className="filters-page__back">
          <ChevronLeft aria-hidden="true" />
          <span>{backLabel ?? t("levelCategory.back")}</span>
        </button>
      </div>
      <div className="filters-page__inner">
        <header className="filters-page__header">
          <h1 className="filters-page__title">{pageText("title")}</h1>
          <p className="filters-page__subtitle">{pageText("subtitle")}</p>
        </header>

        {/* Vocabulary levels — explicit list, never empty */}
        <section
          className="filter-group filter-group--levels"
          aria-labelledby="filters-levels-title"
        >
          <div className="filter-group__head">
            <div className="filter-group__heading">
              <h2 id="filters-levels-title" className="filter-group__title">
                {pageText("levels.title")}
              </h2>
              <p className="filter-group__hint">{pageText("levels.hint")}</p>
            </div>
            <div className="filter-group__status">
              <span className="filter-group__count" aria-live="polite">
                {getCountBadge(levelState, "summary.allLevels")}
              </span>
              <button
                type="button"
                className="filter-group__action"
                disabled={levelState.kind !== "some"}
                onClick={() => setSelectedLevels([...allLevelCodes])}
              >
                {pageText("selectAll")}
              </button>
            </div>
          </div>
          {levelValuesLine && (
            <p className="filter-group__values">{levelValuesLine}</p>
          )}

          <CefrLevelTiles
            selectedLevels={selectedLevels}
            onChange={setSelectedLevels}
            canApply={canApplyLevels}
            labelledBy="filters-levels-title"
            unavailableHint={unavailableHint}
          />

          <p className="filter-group__test">
            <span>{pageText("levelTest.prompt")}</span>{" "}
            <button type="button" onClick={onTakeLevelTest}>
              <span>{pageText("levelTest.action")}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          </p>
        </section>

        {/* Topics — [] means every topic */}
        <section
          className="filter-group filter-group--topics"
          aria-labelledby="filters-topics-title"
        >
          <div className="filter-group__head">
            <div className="filter-group__heading">
              <h2 id="filters-topics-title" className="filter-group__title">
                {pageText("topics.title")}
              </h2>
              <p className="filter-group__hint">{pageText("topics.hint")}</p>
            </div>
            <div className="filter-group__status">
              <span className="filter-group__count" aria-live="polite">
                {getCountBadge(topicState, "summary.allTopics")}
              </span>
            </div>
          </div>
          {topicValuesLine && (
            <p className="filter-group__values">{topicValuesLine}</p>
          )}

          <div
            id="filters-topic-options"
            className="filter-group__chips"
            role="group"
            aria-labelledby="filters-topics-title"
          >
            <button
              type="button"
              aria-pressed={topicState.kind === "unrestricted"}
              className={`filter-chip filter-chip--all${
                topicState.kind === "unrestricted" ? " is-selected" : ""
              }`}
              onClick={() => setSelectedCategories([])}
            >
              <span className="filter-check" aria-hidden="true">
                <Check />
              </span>
              <span>{pageText("summary.allTopics")}</span>
            </button>
            {visibleCategoryIds.map((categoryId) => {
              const isSelected = topicState.selected.includes(categoryId);
              const isDisabled = !hasWordsAfterCategoryToggle(categoryId);
              return (
                <button
                  key={categoryId}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isDisabled}
                  title={isDisabled ? unavailableHint : undefined}
                  className={`filter-chip${isSelected ? " is-selected" : ""}`}
                  onClick={() => toggleCategory(categoryId)}
                >
                  <span className="filter-check" aria-hidden="true">
                    <Check />
                  </span>
                  <span>{getCategoryLabel(categoryId)}</span>
                </button>
              );
            })}
          </div>
          {hiddenTopicsCount > 0 && (
            <button
              type="button"
              className="filter-group__toggle"
              aria-expanded={areTopicsExpanded}
              aria-controls="filters-topic-options"
              onClick={() => setAreTopicsExpanded((expanded) => !expanded)}
            >
              <span>
                {areTopicsExpanded
                  ? t("levelCategory.topics.showFewer")
                  : fillTemplate(pageText("topics.showAll"), {
                      count: hiddenTopicsCount,
                    })}
              </span>
              {areTopicsExpanded ? (
                <ChevronUp aria-hidden="true" />
              ) : (
                <ChevronDown aria-hidden="true" />
              )}
            </button>
          )}
        </section>

        {/* Word types — [] means every word type */}
        <section
          className="filter-group filter-group--types"
          aria-labelledby="filters-types-title"
        >
          <div className="filter-group__head">
            <div className="filter-group__heading">
              <h2 id="filters-types-title" className="filter-group__title">
                {pageText("wordTypes.title")}
              </h2>
              <p className="filter-group__hint">{pageText("wordTypes.hint")}</p>
            </div>
            <div className="filter-group__status">
              <span className="filter-group__count" aria-live="polite">
                {getCountBadge(wordTypeState, "summary.allWordTypes")}
              </span>
            </div>
          </div>
          {wordTypeValuesLine && (
            <p className="filter-group__values">{wordTypeValuesLine}</p>
          )}

          <div
            className="filter-group__chips"
            role="group"
            aria-labelledby="filters-types-title"
          >
            <button
              type="button"
              aria-pressed={wordTypeState.kind === "unrestricted"}
              className={`filter-chip filter-chip--all${
                wordTypeState.kind === "unrestricted" ? " is-selected" : ""
              }`}
              onClick={() => setSelectedWordTypes([])}
            >
              <span className="filter-check" aria-hidden="true">
                <Check />
              </span>
              <span>{pageText("summary.allWordTypes")}</span>
            </button>
            {prioritizedWordTypes.map((typeId) => {
              const isSelected = wordTypeState.selected.includes(typeId);
              const isDisabled = !hasWordsAfterWordTypeToggle(typeId);
              return (
                <button
                  key={typeId}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isDisabled}
                  title={isDisabled ? unavailableHint : undefined}
                  className={`filter-chip${isSelected ? " is-selected" : ""}`}
                  onClick={() => toggleWordType(typeId)}
                >
                  <span className="filter-check" aria-hidden="true">
                    <Check />
                  </span>
                  <span>{getWordTypeLabel(typeId)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Live setup summary + primary action. The wrapper is
            `display: contents` on phones so the action bar stays a direct
            child of the page column and its sticky range spans the page. */}
        <div className="filters-review">
          <section
            className="filters-summary"
            aria-labelledby="filters-summary-title"
          >
            <h2 id="filters-summary-title" className="filters-summary__title">
              {pageText("summary.title")}
            </h2>
            <dl className="filters-summary__rows">
              {[
                ["levels", levelSummary],
                ["topics", topicSummary],
                ["wordTypes", wordTypeSummary],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{pageText(`summary.${key}`)}</dt>
                  <dd title={value}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="filters-page__action-bar">
            <button
              type="button"
              onClick={onContinue}
              disabled={!hasWordsForCurrentFilters}
              className="filters-page__continue"
            >
              {continueLabel ??
                (hasAnyFilterSelected
                  ? t("levelCategory.next")
                  : t("levelCategory.skipToNext"))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
