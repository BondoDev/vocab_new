import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, MoreHorizontal, Play, Plus } from "lucide-react";
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
import { loadFullVocabularyForLanguagePair, type FullVocabularyConceptRow } from "../vocabulary/loadFullVocabulary";
import { resolveListWordStatus, type ListWordStatus } from "./listWordStatus";
import { filterListWordRowsBySearch } from "./listWordFiltering";
import { getPageWindow } from "./listPagination";
import { AddWordsDialog } from "./AddWordsDialog";
import { PracticeListSetupDialog } from "./PracticeListSetupDialog";
import { SortDropdown, type SortDropdownOption } from "./SortDropdown";
import type { ExerciseId } from "../../../../exercises/exerciseIds";

const PAGE_SIZE = 10;
type DetailSortMode = "recentlyAdded" | "nameAsc";

// The full resolved vocabulary set for the list's own target language,
// decorated with each concept's OPTIONAL current status — "notStudied" for
// a concept with no user_word_progress row, same as any other status. Never
// requires progress to exist; see listWordStatus.ts's own header.
export interface ListWordRow extends FullVocabularyConceptRow {
  status: ListWordStatus;
}

interface ListDetailRow extends ListWordRow {
  addedAt: string;
}

interface ListDetailViewProps {
  list: UserVocabularyList;
  // This list's own membership rows (already filtered by the caller) —
  // used for the "Added" date, the real word count, and to exclude
  // already-added words from the Add Words picker.
  memberships: UserVocabularyListMembership[];
  // The active target language's full user_word_progress set — consulted
  // ONLY to decorate resolved vocabulary rows with an optional status
  // (notStudied/learning/known/mastered). Never required for a list word to
  // render, and never written to by anything in this view.
  wordProgressRows: UserWordProgressFullRow[];
  nativeLanguage: UILanguage | "";
  onBack: () => void;
  onRemoveWord: (wordId: string) => void;
  // Opens the Practice List setup dialog (My Lists Phase 3) — owned by
  // MyListsSection, same reason as the Add Words wiring below. Only ever
  // called from the primary-action button below, which itself only
  // renders inside the `hasMembers` branch — a zero-word list never shows
  // it, so this callback never needs its own additional empty-list guard.
  onOpenPracticeList: () => void;
  isPracticeListDialogOpen: boolean;
  onClosePracticeList: () => void;
  onStartPracticeList: (config: { conceptIds: string[]; exercises: ExerciseId[] }) => void;
  // Add Words dialog state/actions — owned by MyListsSection (it makes the
  // actual RPC call and updates the shared membership state that also
  // drives the list card's count), rendered here because the dialog needs
  // this view's own resolved-vocabulary data (see the resolution effect
  // below).
  isAddWordsDialogOpen: boolean;
  isAddingWords: boolean;
  addWordsError: string | null;
  onOpenAddWords: () => void;
  onCloseAddWords: () => void;
  onSubmitAddWords: (wordIds: string[]) => void;
}

type ResolveState = { status: "loading" } | { status: "error" } | { status: "ready"; rows: FullVocabularyConceptRow[] };

// The list-detail shell: back link, name, count, Add Words + rename/delete
// actions, search/status filter, and either a real empty state or a
// finished word table/mobile-card list (reusing the Vocabulary page's own
// design language, never a second implementation of either). Word display
// data (target word/translation/CEFR) is resolved once here via
// loadFullVocabularyForLanguagePair, for the list's own target language's
// FULL vocabulary set (not filtered by studied/unstudied) — the resolved
// superset is filtered locally, both for this view's own rows (membership
// subset) and for AddWordsDialog's available-words list (non-membership
// subset) — see this file's own useEffect below. A word's optional status
// is layered on top from wordProgressRows purely for display; it is never
// what determines whether a word can appear here or in the picker.
export function ListDetailView({
  list,
  memberships,
  wordProgressRows,
  nativeLanguage,
  onBack,
  onRemoveWord,
  onOpenPracticeList,
  isPracticeListDialogOpen,
  onClosePracticeList,
  onStartPracticeList,
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
        // The list's own target_language is always what's resolved here —
        // never assumed to equal whichever language happens to be active
        // elsewhere in the app (they coincide for every list visible today
        // only because lists are themselves loaded scoped to the active
        // language — see MyListsSection — not because this view assumes it).
        const rows = await loadFullVocabularyForLanguagePair({
          targetLanguage: list.targetLanguage,
          nativeLanguage,
        });
        if (cancelled) return;
        setResolveState({ status: "ready", rows });
      } catch (error) {
        if (cancelled) return;
        console.warn("ListDetailView: failed to resolve vocabulary data.", error);
        setResolveState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately not keyed on `memberships` or `wordProgressRows` —
    // neither changes which concepts exist for this language pair, only
    // which of them are members or what their status is; both are layered
    // on top of this resolution, below, without re-importing
    // vocabulary.json.
  }, [list.targetLanguage, nativeLanguage]);

  const wordStateByConceptId = useMemo(() => {
    const map = new Map<string, UserWordProgressFullRow["wordState"]>();
    for (const row of wordProgressRows) map.set(row.wordId, row.wordState);
    return map;
  }, [wordProgressRows]);

  const allRows: ListWordRow[] = useMemo(() => {
    if (resolveState.status !== "ready") return [];
    return resolveState.rows.map((row) => ({
      ...row,
      status: resolveListWordStatus(wordStateByConceptId.get(row.conceptId)),
    }));
  }, [resolveState, wordStateByConceptId]);

  const addedAtByConceptId = useMemo(
    () => new Map(memberships.map((membership) => [membership.wordId, membership.createdAt])),
    [memberships],
  );
  const membershipIds = useMemo(() => new Set(memberships.map((m) => m.wordId)), [memberships]);

  const listRows: ListDetailRow[] = useMemo(() => {
    const rows: ListDetailRow[] = [];
    for (const row of allRows) {
      const addedAt = addedAtByConceptId.get(row.conceptId);
      if (addedAt) rows.push({ ...row, addedAt });
    }
    return rows;
  }, [allRows, addedAtByConceptId]);

  const filteredRows = useMemo(() => {
    const bySearch = filterListWordRowsBySearch(listRows, searchQuery);
    const sorted = [...bySearch];
    if (sortMode === "nameAsc") {
      sorted.sort((a, b) => a.targetWord.localeCompare(b.targetWord));
    } else {
      sorted.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    }
    return sorted;
  }, [listRows, searchQuery, sortMode]);
  const sortOptions = useMemo<SortDropdownOption<DetailSortMode>[]>(
    () => [
      { value: "recentlyAdded", label: t("userProfile.myListsSection.detail.sortRecentlyAdded") },
      { value: "nameAsc", label: t("userProfile.myListsSection.detail.sortNameAsc") },
    ],
    [t],
  );

  // Resets to page 1 whenever the visible set could change shape (a new
  // search/filter/sort) — but not on every render, so removing one word
  // from the current page doesn't silently bounce the user back to page 1.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);
  const pageWindow = getPageWindow(clampedPage, totalPages);
  const hasMoreAfterWindow = pageWindow[pageWindow.length - 1] < totalPages;

  const isLoading = resolveState.status === "loading";
  const isError = resolveState.status === "error";
  const hasMembers = memberships.length > 0;

  const grammarTypeLabel = (grammarType: string | undefined) => {
    if (!grammarType) return "-";
    const translated = t(`wordTypes.${grammarType}`);
    return translated === `wordTypes.${grammarType}` ? grammarType : translated;
  };

  const wordDetailPath = (row: ListWordRow) =>
    buildWordPath(
      uiLanguage,
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
            {memberships.length} {t("userProfile.myListsSection.wordsUnit")}
          </p>
        </div>
        {hasMembers ? (
          <div className="my-lists-detail__actions">
            <Button
              type="button"
              onClick={onOpenPracticeList}
              className="my-lists-detail__practice-button"
            >
              <Play aria-hidden="true" />
              {t("userProfile.myListsSection.practiceList")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onOpenAddWords}
              className="my-lists-detail__add-button"
            >
              <Plus aria-hidden="true" />
              {t("userProfile.myListsSection.addWords")}
            </Button>
          </div>
        ) : null}
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
            <div className="my-lists-toolbar__sort">
              <SortDropdown<DetailSortMode>
                value={sortMode}
                options={sortOptions}
                ariaLabel={t("userProfile.myListsSection.sort.ariaLabel")}
                onChange={setSortMode}
              />
            </div>
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
                      <th scope="col">{t("userProfile.vocabularySection.filters.partOfSpeech")}</th>
                      <th scope="col">{t("userProfile.vocabularySection.table.columns.level")}</th>
                      <th scope="col">{t("userProfile.myListsSection.detail.addedColumn")}</th>
                      <th scope="col" className="my-lists-detail-table__actions-head">
                        {t("userProfile.vocabularySection.table.columns.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr key={row.conceptId}>
                        <td className="my-lists-detail-table__word">{row.targetWord}</td>
                        <td className="my-lists-detail-table__translation">{row.translation}</td>
                        <td>
                          <span className="my-lists-grammar-badge">{grammarTypeLabel(row.grammarType)}</span>
                        </td>
                        <td>{row.level ? <span className="my-lists-level-badge">{row.level}</span> : null}</td>
                        <td className="my-lists-detail-table__meta">
                          {new Date(row.addedAt).toLocaleDateString(uiLanguage)}
                        </td>
                        <td>
                          <RowActionsMenu
                            row={row}
                            wordDetailPath={wordDetailPath(row)}
                            onRemove={() => onRemoveWord(row.conceptId)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="my-lists-mobile-list">
                {pagedRows.map((row) => (
                  <li key={row.conceptId} className="my-lists-mobile-card">
                    <div className="my-lists-mobile-card__top">
                      <span className="my-lists-detail-table__word">{row.targetWord}</span>
                      <RowActionsMenu
                        row={row}
                        wordDetailPath={wordDetailPath(row)}
                        onRemove={() => onRemoveWord(row.conceptId)}
                      />
                    </div>
                    <p className="my-lists-mobile-card__translation">{row.translation}</p>
                    <div className="my-lists-mobile-card__meta-row">
                      {row.level ? <span className="my-lists-level-badge">{row.level}</span> : null}
                      <span className="my-lists-grammar-badge">{grammarTypeLabel(row.grammarType)}</span>
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
        allRows={allRows}
        alreadyAddedIds={membershipIds}
        onOpenChange={(open) => {
          if (!open) onCloseAddWords();
        }}
        onSubmit={onSubmitAddWords}
      />

      <PracticeListSetupDialog
        open={isPracticeListDialogOpen}
        list={list}
        memberships={memberships}
        onOpenChange={(open) => {
          if (!open) onClosePracticeList();
        }}
        onStart={onStartPracticeList}
      />
    </>
  );
}

function RowActionsMenu({
  row,
  wordDetailPath,
  onRemove,
}: {
  row: ListWordRow;
  wordDetailPath: string;
  onRemove: () => void;
}) {
  const { t } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="my-lists-detail-table__menu-trigger"
          aria-label={`${t("userProfile.vocabularySection.table.moreActionsAriaLabel")} - ${row.targetWord}`}
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

