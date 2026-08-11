import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { useLanguage, type UILanguage } from "../../../../contexts/LanguageContext";
import { Button } from "../../../../app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../app/components/ui/dropdown-menu";
import { buildWordPath } from "../../../../data/seo/wordPages/wordSlugs";
import { getUiVocabularyLanguage } from "../../../../data/seo/shared/slugs";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { UserVocabularyList, UserVocabularyListMembership } from "../../../../lib/vocabularyLists";
import { loadVocabularyProgress, type ResolvedVocabularyRow } from "../vocabulary/loadVocabularyProgress";
import {
  filterVocabularyRowsByTab,
  filterVocabularyRowsBySearch,
  type VocabularyTabId,
} from "../vocabulary/vocabularyFiltering";
import type { ListCardMetrics } from "./listCardMetrics";
import { AddWordsDialog } from "./AddWordsDialog";

const PAGE_SIZE = 10;
type DetailSortMode = "recentlyAdded" | "nameAsc";
const STATUS_FILTERS: Exclude<VocabularyTabId, "favorites">[] = ["all", "learning", "known", "mastered"];

interface ListDetailRow extends ResolvedVocabularyRow {
  addedAt: string;
}

interface ListDetailViewProps {
  list: UserVocabularyList;
  metrics: ListCardMetrics;
  // This list's own membership rows (already filtered by the caller) —
  // used for the "Added" date and to exclude already-added words from the
  // Add Words picker.
  memberships: UserVocabularyListMembership[];
  // The full shared set (every studied word for the active target
  // language, not just this list's members) — resolved once, below, into
  // both this view's own row list (filtered to membership) and the Add
  // Words picker's available-words list (filtered to NOT-membership), so
  // vocabulary.json is never resolved twice for two different subsets.
  wordProgressRows: UserWordProgressFullRow[];
  nativeLanguage: UILanguage | "";
  onBack: () => void;
  onRename: () => void;
  onDelete: () => void;
  onRemoveWord: (wordProgressId: string) => void;
  // Add Words dialog state/actions — owned by MyListsSection (it makes the
  // actual RPC call and updates the shared membership state that also
  // drives the list card's counts), rendered here because the dialog needs
  // this view's own resolved-word data (see the resolution effect below).
  isAddWordsDialogOpen: boolean;
  isAddingWords: boolean;
  addWordsError: string | null;
  onOpenAddWords: () => void;
  onCloseAddWords: () => void;
  onSubmitAddWords: (wordProgressIds: string[]) => void;
}

type ResolveState = { status: "loading" } | { status: "error" } | { status: "ready"; rows: ResolvedVocabularyRow[] };

// The list-detail shell: back link, name, count, Add Words + rename/delete
// actions, search/status filter, and either a real empty state or a
// finished word table/mobile-card list (reusing the Vocabulary page's own
// design language and pure filtering helpers, never a second
// implementation of either). Word display data (target word/translation/
// CEFR) is resolved once here via loadVocabularyProgress, for the FULL
// active-language word set (not just this list's members) — the resolved
// superset is filtered locally, both for this view's own rows (membership
// subset) and for AddWordsDialog's available-words list (non-membership
// subset) — see this file's own useResolvedAllRows effect.
export function ListDetailView({
  list,
  metrics,
  memberships,
  wordProgressRows,
  nativeLanguage,
  onBack,
  onRename,
  onDelete,
  onRemoveWord,
  isAddWordsDialogOpen,
  isAddingWords,
  addWordsError,
  onOpenAddWords,
  onCloseAddWords,
  onSubmitAddWords,
}: ListDetailViewProps) {
  const { t, uiLanguage } = useLanguage();
  const [resolveState, setResolveState] = useState<ResolveState>({ status: "loading" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VocabularyTabId>("all");
  const [sortMode, setSortMode] = useState<DetailSortMode>("recentlyAdded");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!nativeLanguage) {
      setResolveState({ status: "loading" });
      return;
    }

    let cancelled = false;
    setResolveState({ status: "loading" });

    void (async () => {
      try {
        // The full active-language progress set, not memberProgressRows —
        // this is what makes the same resolved data reusable for the Add
        // Words picker (every studied word) as well as this view's own
        // table (the membership subset, derived below).
        const result = await loadVocabularyProgress({
          progressRows: wordProgressRows,
          targetLanguage: list.targetLanguage,
          nativeLanguage,
        });
        if (cancelled) return;
        setResolveState({ status: "ready", rows: result.rows });
      } catch (error) {
        if (cancelled) return;
        console.warn("ListDetailView: failed to resolve vocabulary data.", error);
        setResolveState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately not keyed on `memberships` — adding/removing a word
    // never changes the resolved display data for the words that were
    // already resolved, only which subset of them counts as "in this
    // list". Re-resolving here on every membership change would re-import
    // vocabulary.json (cached by the module loader, but still wasted
    // resolver-rebuild work) for no visible benefit.
  }, [list.targetLanguage, nativeLanguage, wordProgressRows]);

  const addedAtByProgressId = useMemo(
    () => new Map(memberships.map((membership) => [membership.wordProgressId, membership.createdAt])),
    [memberships],
  );
  const membershipIds = useMemo(() => new Set(memberships.map((m) => m.wordProgressId)), [memberships]);

  const allResolvedRows = resolveState.status === "ready" ? resolveState.rows : [];

  const listRows: ListDetailRow[] = useMemo(() => {
    const rows: ListDetailRow[] = [];
    for (const row of allResolvedRows) {
      const addedAt = addedAtByProgressId.get(row.id);
      if (addedAt) rows.push({ ...row, addedAt });
    }
    return rows;
  }, [allResolvedRows, addedAtByProgressId]);

  const filteredRows = useMemo(() => {
    const byStatus = filterVocabularyRowsByTab(listRows, statusFilter);
    const bySearch = filterVocabularyRowsBySearch(byStatus, searchQuery);
    const sorted = [...bySearch];
    if (sortMode === "nameAsc") {
      sorted.sort((a, b) => a.targetWord.localeCompare(b.targetWord));
    } else {
      sorted.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    }
    return sorted;
  }, [listRows, statusFilter, searchQuery, sortMode]);

  // Resets to page 1 whenever the visible set could change shape (a new
  // search/filter/sort) — but not on every render, so removing one word
  // from the current page doesn't silently bounce the user back to page 1.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);
  const pageWindow = getPageWindow(clampedPage, totalPages);
  const hasMoreAfterWindow = pageWindow[pageWindow.length - 1] < totalPages;

  const isLoading = resolveState.status === "loading";
  const isError = resolveState.status === "error";
  const hasMembers = memberships.length > 0;

  const statusLabel = (category: ResolvedVocabularyRow["category"]) =>
    t(`userProfile.vocabularySection.table.statuses.${category}`);

  const wordDetailPath = (row: ResolvedVocabularyRow) =>
    buildWordPath(
      uiLanguage,
      // list.targetLanguage is plain `string` on UserVocabularyList
      // (mirrors the DB column) but is always one of the 7 UI language
      // codes — enforced server-side by the schema's own CHECK constraint.
      getUiVocabularyLanguage(list.targetLanguage as UILanguage),
      row.targetWord,
      row.conceptId,
    );

  return (
    <>
      <button type="button" className="my-lists-detail__back" onClick={onBack}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
        {t("userProfile.myListsSection.detail.backToMyLists")}
      </button>

      <header className="my-lists-detail__header">
        <div className="my-lists-detail__heading">
          <h1 className="my-lists-detail__title">{list.name}</h1>
          <p className="my-lists-detail__subtitle">
            {metrics.total} {t("userProfile.myListsSection.wordsUnit")}
          </p>
        </div>
        <div className="my-lists-detail__actions">
          <Button type="button" onClick={onOpenAddWords} className="my-lists-detail__add-button">
            <Plus aria-hidden="true" />
            {t("userProfile.myListsSection.addWords")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="my-lists-card__menu-trigger" aria-label={list.name}>
                <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRename}>{t("userProfile.myListsSection.rename")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                {t("userProfile.myListsSection.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isLoading ? (
        <div className="my-lists-loading-block" role="status" aria-live="polite" aria-busy="true">
          <div className="my-lists-loading-row" />
          <div className="my-lists-loading-row" />
        </div>
      ) : isError ? (
        <div className="my-lists-message-block" role="status">
          <p className="my-lists-message-block__text">{t("userProfile.myListsSection.loadError")}</p>
        </div>
      ) : !hasMembers ? (
        <div className="my-lists-empty-state">
          <h2 className="my-lists-empty-state__title">{t("userProfile.myListsSection.detail.emptyState")}</h2>
          <p className="my-lists-empty-state__description">
            {t("userProfile.myListsSection.detail.emptyStateDescription")}
          </p>
          <Button type="button" onClick={onOpenAddWords} className="my-lists-empty-state__button">
            <Plus aria-hidden="true" />
            {t("userProfile.myListsSection.addWords")}
          </Button>
        </div>
      ) : (
        <>
          <div className="my-lists-toolbar">
            <div className="my-lists-toolbar__search">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("userProfile.myListsSection.searchWords")}
                aria-label={t("userProfile.myListsSection.searchWords")}
                className="my-lists-toolbar__search-input"
              />
            </div>
            <label className="my-lists-toolbar__sort">
              <span className="sr-only">{t("userProfile.myListsSection.sort.ariaLabel")}</span>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as DetailSortMode)}
                className="my-lists-toolbar__sort-select"
              >
                <option value="recentlyAdded">{t("userProfile.myListsSection.detail.sortRecentlyAdded")}</option>
                <option value="nameAsc">{t("userProfile.myListsSection.detail.sortNameAsc")}</option>
              </select>
            </label>
          </div>

          <div className="my-lists-picker__status-filters my-lists-detail__status-filters" role="group">
            {STATUS_FILTERS.map((id) => (
              <button
                key={id}
                type="button"
                className={`my-lists-picker__status-filter ${statusFilter === id ? "is-active" : ""}`}
                aria-pressed={statusFilter === id}
                onClick={() => setStatusFilter(id)}
              >
                {id === "all" ? t("userProfile.myListsSection.statusAll") : statusLabel(id)}
              </button>
            ))}
          </div>

          {filteredRows.length === 0 ? (
            <div className="my-lists-message-block" role="status">
              <p className="my-lists-message-block__text">{t("userProfile.myListsSection.detail.noMatch")}</p>
            </div>
          ) : (
            <>
              <div className="my-lists-detail-table-container">
                <table className="my-lists-detail-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("userProfile.vocabularySection.table.columns.word")}</th>
                      <th scope="col">{t("userProfile.vocabularySection.table.columns.translation")}</th>
                      <th scope="col">{t("userProfile.vocabularySection.table.columns.level")}</th>
                      <th scope="col">{t("userProfile.vocabularySection.table.columns.status")}</th>
                      <th scope="col">{t("userProfile.myListsSection.detail.addedColumn")}</th>
                      <th scope="col" className="my-lists-detail-table__actions-head">
                        {t("userProfile.vocabularySection.table.columns.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr key={row.id}>
                        <td className="my-lists-detail-table__word">{row.targetWord}</td>
                        <td className="my-lists-detail-table__translation">{row.translation}</td>
                        <td>{row.level ? <span className="my-lists-level-badge">{row.level}</span> : null}</td>
                        <td>
                          <span className={`my-lists-status-badge my-lists-status-badge--${row.category}`}>
                            {statusLabel(row.category)}
                          </span>
                        </td>
                        <td className="my-lists-detail-table__meta">
                          {new Date(row.addedAt).toLocaleDateString(uiLanguage)}
                        </td>
                        <td>
                          <RowActionsMenu
                            row={row}
                            wordDetailPath={wordDetailPath(row)}
                            onRemove={() => onRemoveWord(row.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="my-lists-mobile-list">
                {pagedRows.map((row) => (
                  <li key={row.id} className="my-lists-mobile-card">
                    <div className="my-lists-mobile-card__top">
                      <span className="my-lists-detail-table__word">{row.targetWord}</span>
                      <RowActionsMenu
                        row={row}
                        wordDetailPath={wordDetailPath(row)}
                        onRemove={() => onRemoveWord(row.id)}
                      />
                    </div>
                    <p className="my-lists-mobile-card__translation">{row.translation}</p>
                    <div className="my-lists-mobile-card__meta-row">
                      {row.level ? <span className="my-lists-level-badge">{row.level}</span> : null}
                      <span className={`my-lists-status-badge my-lists-status-badge--${row.category}`}>
                        {statusLabel(row.category)}
                      </span>
                      <span className="my-lists-mobile-card__meta-text">
                        {new Date(row.addedAt).toLocaleDateString(uiLanguage)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {totalPages > 1 ? (
                <div className="my-lists-detail-pagination">
                  <button
                    type="button"
                    className="my-lists-detail-pagination__nav"
                    aria-label={t("userProfile.vocabularySection.pagination.previous")}
                    disabled={clampedPage <= 1}
                    onClick={() => setPage(Math.max(1, clampedPage - 1))}
                  >
                    <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                  {pageWindow.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`my-lists-detail-pagination__page ${
                        clampedPage === pageNumber ? "is-active" : ""
                      }`}
                      aria-current={clampedPage === pageNumber ? "page" : undefined}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  {hasMoreAfterWindow ? (
                    <span className="my-lists-detail-pagination__ellipsis" aria-hidden="true">
                      …
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="my-lists-detail-pagination__nav"
                    aria-label={t("userProfile.vocabularySection.pagination.next")}
                    disabled={clampedPage >= totalPages}
                    onClick={() => setPage(Math.min(totalPages, clampedPage + 1))}
                  >
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      <AddWordsDialog
        open={isAddWordsDialogOpen}
        isSubmitting={isAddingWords}
        error={addWordsError}
        resolveStatus={resolveState.status}
        allResolvedRows={allResolvedRows}
        alreadyAddedIds={membershipIds}
        onOpenChange={(open) => {
          if (!open) onCloseAddWords();
        }}
        onSubmit={onSubmitAddWords}
      />
    </>
  );
}

function RowActionsMenu({
  row,
  wordDetailPath,
  onRemove,
}: {
  row: ResolvedVocabularyRow;
  wordDetailPath: string;
  onRemove: () => void;
}) {
  const { t } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="my-lists-card__menu-trigger"
          aria-label={`${t("userProfile.vocabularySection.table.moreActionsAriaLabel")} — ${row.targetWord}`}
        >
          <MoreHorizontal size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={wordDetailPath} target="_blank" rel="noopener noreferrer">
            {t("userProfile.myListsSection.viewWordDetails")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRemove}>{t("userProfile.myListsSection.removeFromList")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Same simple, always-in-range 3-button windowing VocabularyTable.tsx uses
// for the Vocabulary page's own pagination — duplicated rather than
// imported/shared since it's a small, private, unexported helper there too
// (see that file's own precedent for why a third small copy is simpler
// than introducing a new shared pagination module for it).
function getPageWindow(page: number, totalPages: number, windowSize = 3): number[] {
  if (totalPages <= windowSize) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = start + windowSize - 1;
  if (end > totalPages) {
    end = totalPages;
    start = end - windowSize + 1;
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
