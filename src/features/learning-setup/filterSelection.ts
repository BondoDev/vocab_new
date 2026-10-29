// Pure selection helpers for the Custom Practice filters page. Import-free so
// scripts/tests/practice/test-filter-selection-summary.mjs can load it through
// Node's TypeScript stripping.
//
// The persisted filter state (useStoredAppPreferences) has two shapes, and
// they are not interchangeable:
// - Levels always hold an explicit list. An empty list is never kept: the
//   page refills it with every level, and removing the last selected level
//   selects all of them again (see toggleLevelSelection).
// - Topics and word types use `[]` for "unrestricted". Every consumer
//   (word counts here, the setup preview, the practice word filter) reads an
//   empty list as "no filter", so `[]` is how the page selects all of them.
//   An explicit list naming every option filters by those ids and is shown
//   as "all N selected", but it is not rewritten to `[]`.

export type SelectionKind = "unrestricted" | "all" | "some";

export type SelectionState = {
  kind: SelectionKind;
  /** Selected values that exist in `options`, in option order. */
  selected: string[];
  /** Number of options that are effectively active (total when unrestricted). */
  count: number;
  total: number;
};

/**
 * Summarizes a selection against the complete option list, never only the
 * options currently visible on screen. Unknown ids (e.g. a topic removed
 * from categories.json but still persisted) are ignored for display.
 */
export function getSelectionState(
  selectedValues: readonly string[],
  options: readonly string[],
  { emptyMeansAll }: { emptyMeansAll: boolean },
): SelectionState {
  const total = options.length;
  const selectedSet = new Set(selectedValues);
  const selected = options.filter((option) => selectedSet.has(option));

  if (selected.length === 0 && emptyMeansAll) {
    return { kind: "unrestricted", selected: [], count: total, total };
  }
  if (total > 0 && selected.length === total) {
    return { kind: "all", selected, count: total, total };
  }
  return { kind: "some", selected, count: selected.length, total };
}

/** Splits a label list into what fits in a summary line and the overflow. */
export function abbreviateList(
  labels: readonly string[],
  maxShown: number,
): { shown: string[]; rest: number } {
  if (labels.length <= maxShown) {
    return { shown: [...labels], rest: 0 };
  }
  return { shown: labels.slice(0, maxShown), rest: labels.length - maxShown };
}

/** Multi-select toggle for topics and word types; never touches other values. */
export function toggleSelection(
  selected: readonly string[],
  value: string,
): string[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

/**
 * Level toggle. From the all-levels state a click narrows to just that level
 * (all tiles start checked, so a plain toggle would mean "all but this one").
 * Removing the last selected level selects every level again.
 */
export function toggleLevelSelection(
  selected: readonly string[],
  code: string,
  allCodes: readonly string[],
): string[] {
  if (allCodes.every((level) => selected.includes(level))) {
    return [code];
  }
  const next = toggleSelection(selected, code);
  return next.length === 0 ? [...allCodes] : next;
}

/**
 * Plural-aware "{count}" copy: picks `${baseKey}_${CLDR category}` for the UI
 * language (Russian defines _few/_many) and falls back to `${baseKey}_other`.
 * t() returns the key itself on a miss, which is how a missing form is found.
 */
export function formatCountLabel(
  t: (key: string) => string,
  uiLanguage: string,
  baseKey: string,
  count: number,
): string {
  const categoryKey = `${baseKey}_${new Intl.PluralRules(uiLanguage).select(count)}`;
  const template = t(categoryKey);
  return (template === categoryKey ? t(`${baseKey}_other`) : template).replace(
    "{count}",
    String(count),
  );
}

/**
 * Compact one-line summary: the "all" label when nothing narrows the group,
 * the selected names up to `maxListed`, otherwise "{selected} of {total}".
 */
export function formatSelectionSummary(
  state: SelectionState,
  {
    allLabel,
    ofTotalTemplate,
    getLabel,
    maxListed,
  }: {
    allLabel: string;
    ofTotalTemplate: string;
    getLabel: (value: string) => string;
    maxListed: number;
  },
): string {
  if (state.kind !== "some") return allLabel;
  if (state.count <= maxListed) {
    return state.selected.map(getLabel).join(", ");
  }
  return fillTemplate(ofTotalTemplate, {
    selected: state.count,
    total: state.total,
  });
}

/** Replaces `{name}` placeholders in a translated template. */
export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template,
  );
}
