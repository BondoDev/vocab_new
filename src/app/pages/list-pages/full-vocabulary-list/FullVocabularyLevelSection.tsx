import { useDeferredValue, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  formatContentTemplate,
  GRAMMAR_TYPE_KEYS,
  type FullVocabularyListContentEntry,
  type FullVocabularyListLevelContent,
} from "../../../../data/seo/listPages/fullVocabularyList";
import {
  collectGrammarTypes,
  FULL_VOCABULARY_INITIAL_ROWS,
  EMPTY_FULL_VOCABULARY_FILTER,
  filterFullVocabularyRows,
  isFullVocabularyFilterActive,
  type FullVocabularyFilter,
  type FullVocabularyRow,
} from "../../../../data/seo/listPages/fullVocabularyList/fullVocabularyListEntries";
import type { UiLanguageCode } from "../../../../data/seo/shared/slugs";
import { FullVocabularyTable } from "./FullVocabularyTable";
import { VocabularyFilterBar } from "./VocabularyFilterBar";

// Rows shown when a level is first opened (or its filters change), and
// appended per Load More click.
export const FULL_VOCABULARY_BATCH_SIZE = 300;

export type FullVocabularyLoadStatus = "idle" | "loading" | "ready" | "error";

interface FullVocabularyLevelSectionProps {
  uiLang: UiLanguageCode;
  speechLang: string;
  showTranslations: boolean;
  level: FullVocabularyListLevelContent;
  panelCopy: FullVocabularyListContentEntry["levelPanel"];
  grammarTypes: FullVocabularyListContentEntry["grammarTypes"];
  isOpen: boolean;
  onToggle: () => void;
  status: FullVocabularyLoadStatus;
  // This level's complete row list (null until loaded).
  rows: FullVocabularyRow[] | null;
  // False while `rows` are only the server-rendered first rows; filtering
  // and filtered counts wait for the complete list (see the page).
  rowsComplete: boolean;
  // The complete list failed to load (only matters while rows are partial).
  fullLoadFailed: boolean;
  // The page-wide filter, already deferred by the page.
  globalFilter: FullVocabularyFilter;
  onRetry: () => void;
  onAddToList: (row: FullVocabularyRow) => void;
  // Unfiltered word total, available before `rows` (see the page).
  levelWordCount: number | null;
  // Width, in characters, of the desktop count slot shared by all levels.
  countSlotChars: number;
  // Optional "{level} English Vocabulary — {name}" heading template.
  levelHeadingTemplate?: string;
}

function filterKey(filters: FullVocabularyFilter[]): string {
  return filters
    .map((filter) => `${filter.query.trim().toLowerCase()}\u0000${[...filter.types].sort().join(",")}`)
    .join("\u0001");
}

// One CEFR accordion item (WAI-ARIA accordion pattern: a heading wrapping a
// disclosure button that controls a labelled region). The section itself
// never unmounts, so its local filters and Load More progress survive
// collapsing and stay independent of every other level. Collapsed panels keep
// their table in the (hidden) DOM once rows exist — that is how the
// server-rendered first rows reach search engines.
export function FullVocabularyLevelSection({
  uiLang,
  speechLang,
  showTranslations,
  level,
  panelCopy,
  grammarTypes,
  isOpen,
  onToggle,
  status,
  rows,
  rowsComplete,
  fullLoadFailed,
  globalFilter,
  onRetry,
  onAddToList,
  levelWordCount,
  countSlotChars,
  levelHeadingTemplate,
}: FullVocabularyLevelSectionProps) {
  // "{total} words" puts the number first; "Слов: {total}" puts text first.
  const countNumberFirst = panelCopy.headerCountLabel.trimStart().startsWith("{");
  const [localFilter, setLocalFilter] = useState<FullVocabularyFilter>(EMPTY_FULL_VOCABULARY_FILTER);
  // Typing stays responsive: the input updates immediately, the (cheap but
  // per-keystroke) filtering and table re-render follow at lower priority.
  const deferredLocalFilter = useDeferredValue(localFilter);
  const activeFilters = useMemo(
    () => [globalFilter, deferredLocalFilter],
    [globalFilter, deferredLocalFilter],
  );
  const filteredRows = useMemo(
    () => (rows ? filterFullVocabularyRows(rows, activeFilters) : []),
    [rows, activeFilters],
  );

  // Load More progress is tied to the filter combination it was earned
  // under: any filter change starts again from the first batch, derived
  // during render rather than reset in an effect.
  const currentFilterKey = filterKey(activeFilters);
  const [paging, setPaging] = useState({ filterKey: currentFilterKey, count: FULL_VOCABULARY_BATCH_SIZE });
  const visibleCount = paging.filterKey === currentFilterKey ? paging.count : FULL_VOCABULARY_BATCH_SIZE;

  const levelCode = level.level.toUpperCase();
  const buttonId = `full-vocabulary-${level.level}-button`;
  const panelId = `full-vocabulary-${level.level}-panel`;
  const levelTotal = rows?.length ?? 0;
  const matchTotal = filteredRows.length;
  const shown = Math.min(visibleCount, matchTotal);
  // A collapsed level keeps only its server-rendered first rows in the
  // (hidden) DOM, so loading the complete lists doesn't add hundreds of
  // invisible rows per level; opening it shows the full batch again.
  const nextBatch = Math.min(FULL_VOCABULARY_BATCH_SIZE, matchTotal - shown);
  const isFiltered = activeFilters.some(isFullVocabularyFilterActive);
  // Shown in the header (beside the chevron on wide screens, under the
  // description on phones) so a global search reveals which levels match
  // without opening each one.
  const countLabel =
    isFiltered && status === "ready" && rowsComplete
      ? formatContentTemplate(panelCopy.headerFilteredCountLabel, { shown: matchTotal, total: levelTotal }, uiLang)
      : levelWordCount !== null
        ? formatContentTemplate(panelCopy.headerCountLabel, { total: levelWordCount }, uiLang)
        : null;
  const countBadgeClass = `rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
    isFiltered ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
  }`;

  const categoryOptions = useMemo(
    () =>
      collectGrammarTypes(rows ?? [], GRAMMAR_TYPE_KEYS).map((type) => ({
        value: type,
        label: grammarTypes[type as keyof typeof grammarTypes] ?? type,
      })),
    [grammarTypes, rows],
  );

  // Open sections get an inset accent bar on the left edge plus a faint
  // tint, so where one level's content ends and the next header begins
  // stays obvious while scrolling a long table. Inset shadow rather than a
  // border keeps the row widths identical whether open or closed.
  // A filter over only the server-rendered first rows would give wrong
  // results, so until the complete list is in, a filtered level shows the
  // loading (or load-error) state instead.
  const bodyStatus: FullVocabularyLoadStatus =
    isFiltered && !rowsComplete ? (fullLoadFailed ? "error" : "loading") : status;

  // When the record authors a heading template, the <h3>'s text is that
  // descriptive heading ("A1 English Vocabulary — Beginner"), carried by a
  // visually hidden span so the visible header is unchanged. The visible
  // badge/name/description/count are then aria-hidden (they'd otherwise
  // repeat the level and name) and the description + count are attached as
  // the button's accessible description instead.
  const headingText = levelHeadingTemplate
    ? formatContentTemplate(levelHeadingTemplate, { level: levelCode, name: level.name })
    : null;
  const visualOnly = headingText ? true : undefined;
  const descriptionId = `${panelId}-description`;
  const countId = `${panelId}-count`;

  return (
    <div className={isOpen ? "bg-muted/20 shadow-[inset_3px_0_0_0_var(--primary)]" : undefined}>
      <h3>
        <button
          id={buttonId}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-describedby={headingText ? (countLabel ? `${descriptionId} ${countId}` : descriptionId) : undefined}
          onClick={onToggle}
          className={`group flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-primary/[0.07] focus-visible:bg-primary/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 sm:px-5 ${
            isOpen ? "border-b border-foreground/10" : ""
          }`}
        >
          {headingText ? <span className="sr-only">{headingText}</span> : null}
          <span
            aria-hidden={visualOnly}
            className="inline-flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold tracking-wide text-primary transition-colors group-hover:bg-primary/15"
          >
            {levelCode}
          </span>
          <span aria-hidden={visualOnly} className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-foreground">{level.name}</span>
            <span id={descriptionId} className="mt-0.5 block text-sm text-muted-foreground">
              {level.description}
            </span>
            {countLabel ? (
              <span className={`mt-1.5 inline-flex sm:hidden ${countBadgeClass}`}>{countLabel}</span>
            ) : null}
          </span>
          {/* Desktop badge sits in a slot with the same minimum width in all
              six headers (the longest unfiltered count; 0.85ch per character
              since 1ch, the "0" glyph, runs wide), so the badges line up: by their right edge
              when the label starts with the number ("962 words"), by their
              left edge when it starts with text ("Слов: 962"). */}
          {countLabel ? (
            <span
              aria-hidden={visualOnly}
              className={`hidden shrink-0 text-xs sm:flex ${countNumberFirst ? "justify-end" : "justify-start"}`}
              style={{ minWidth: `calc(${(countSlotChars * 0.85).toFixed(2)}ch + 1.25rem)` }}
            >
              <span id={countId} className={`inline-flex ${countBadgeClass}`}>
                {countLabel}
              </span>
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
              isOpen
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-foreground/15 bg-card text-muted-foreground group-hover:border-primary/50 group-hover:text-primary"
            }`}
          >
            <ChevronDown
              className={`size-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </span>
        </button>
      </h3>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!isOpen}
        className="space-y-4 px-4 pb-5 pt-4 sm:px-5"
      >
        {/* Rendered while collapsed too once rows exist, so the
            server-rendered first rows are in the HTML for search engines
            (the panel itself stays `hidden`). */}
        {isOpen || (bodyStatus === "ready" && rows) ? (
          <>
            <div
              role="search"
              aria-label={formatContentTemplate(panelCopy.filtersLabel, { level: levelCode })}
              className="rounded-xl bg-muted/50 p-2.5"
            >
              <VocabularyFilterBar
                idPrefix={`full-vocabulary-${level.level}`}
                variant="local"
                searchLabel={formatContentTemplate(panelCopy.searchLabel, { level: levelCode })}
                searchPlaceholder={formatContentTemplate(panelCopy.searchPlaceholder, { level: levelCode })}
                categoryLabel={panelCopy.categoryLabel}
                categoryAllOption={panelCopy.categoryAllOption}
                categoryApplyLabel={panelCopy.categoryApplyLabel}
                categoryCloseLabel={panelCopy.categoryCloseLabel}
                resetLabel={panelCopy.resetLabel}
                value={localFilter}
                onChange={setLocalFilter}
                categoryOptions={categoryOptions}
              />
            </div>

            {bodyStatus === "ready" && rows ? (
              matchTotal > 0 ? (
                <>
                  <FullVocabularyTable
                    rows={filteredRows.slice(0, isOpen ? shown : Math.min(shown, FULL_VOCABULARY_INITIAL_ROWS))}
                    label={formatContentTemplate(panelCopy.tableLabel, { level: levelCode })}
                    columns={panelCopy.tableColumns}
                    grammarTypes={grammarTypes}
                    pronounceLabel={panelCopy.pronounceLabel}
                    speechLang={speechLang}
                    showTranslations={showTranslations}
                    detailsLabel={panelCopy.detailsLabel}
                    hideLabel={panelCopy.hideLabel}
                    rowActionsLabel={panelCopy.rowActionsLabel}
                    addToListLabel={panelCopy.addToListLabel}
                    onAddToList={onAddToList}
                  />
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {/* Until the complete list arrives, `rows` holds only the
                          server-rendered first rows; the real total is the
                          level's word count (as in the header), so the
                          prerendered HTML reads "100 of 962", not "100 of 100". */}
                      {formatContentTemplate(
                        panelCopy.shownCountLabel,
                        { shown, total: rowsComplete ? matchTotal : (levelWordCount ?? matchTotal) },
                        uiLang,
                      )}
                    </p>
                    {nextBatch > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPaging({ filterKey: currentFilterKey, count: visibleCount + FULL_VOCABULARY_BATCH_SIZE })
                        }
                        className="rounded-xl border border-primary/35 bg-primary/5 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10"
                      >
                        {formatContentTemplate(panelCopy.loadMoreLabel, { count: nextBatch }, uiLang)}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p
                  role="status"
                  className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {levelTotal > 0 ? panelCopy.noMatchesLabel : panelCopy.emptyLabel}
                </p>
              )
            ) : bodyStatus === "error" ? (
              <div
                role="alert"
                className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center"
              >
                <p className="text-sm text-foreground">{panelCopy.loadErrorLabel}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-xl border border-primary/35 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10"
                >
                  {panelCopy.retryLabel}
                </button>
              </div>
            ) : (
              <p
                role="status"
                className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
              >
                {formatContentTemplate(panelCopy.loadingLabel, { level: levelCode })}
              </p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
