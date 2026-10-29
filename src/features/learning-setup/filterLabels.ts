// Option lists and localized labels for the vocabulary filters, shared by the
// Custom Practice setup page and the detailed filters page.
//
// categories.json is feature-owned (see docs/generated-data.md — unlike
// vocabularyMetadata/*.json, which stays shared under src/data/).
import categoriesData from "./data/categories.json";
import {
  fillTemplate,
  formatCountLabel,
  formatSelectionSummary,
  type SelectionState,
} from "./filterSelection";

type Translate = (key: string) => string;

export const FILTER_LEVEL_CODES = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const FILTER_CATEGORY_IDS: string[] = (
  Array.isArray(categoriesData) ? categoriesData : []
).map((cat: { category: string }) => cat.category);

/** Translation namespace of the filters page copy, reused by the setup page. */
export const FILTERS_PAGE_KEY = "levelCategory.filtersPage";

const capitalizeWords = (value: string, separator: RegExp) =>
  value
    .split(separator)
    .map((part) =>
      part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join(" ");

// t() returns the key itself on a miss; fall back to a readable id.
export function getCategoryLabel(t: Translate, categoryId: string): string {
  const key = `levelCategory.topicNames.${categoryId}`;
  const translated = t(key);
  return translated && translated !== key
    ? translated
    : capitalizeWords(categoryId, / /g);
}

export function getWordTypeLabel(t: Translate, typeId: string): string {
  const key = `wordTypes.${typeId}`;
  const translated = t(key);
  return translated && translated !== key
    ? translated
    : capitalizeWords(typeId, /[_-]+/g);
}

/** Group count label: "All topics", "All 6 selected", or "{n} selected". */
export function getSelectionCountLabel(
  t: Translate,
  uiLanguage: string,
  state: SelectionState,
  unrestrictedLabelKey: string,
): string {
  if (state.kind === "unrestricted") {
    return t(`${FILTERS_PAGE_KEY}.${unrestrictedLabelKey}`);
  }
  if (state.kind === "all") {
    return fillTemplate(t(`${FILTERS_PAGE_KEY}.allCount`), {
      count: state.total,
    });
  }
  return formatCountLabel(
    t,
    uiLanguage,
    `${FILTERS_PAGE_KEY}.selectedCount`,
    state.count,
  );
}

/** Compact summary value: "All topics", "Noun, Verb", or "8 of 33". */
export function getSelectionSummary(
  t: Translate,
  state: SelectionState,
  allLabelKey: "allLevels" | "allTopics" | "allWordTypes",
  getLabel: (value: string) => string,
  maxListed: number,
): string {
  return formatSelectionSummary(state, {
    allLabel: t(`${FILTERS_PAGE_KEY}.summary.${allLabelKey}`),
    ofTotalTemplate: t(`${FILTERS_PAGE_KEY}.summary.ofTotal`),
    getLabel,
    maxListed,
  });
}
