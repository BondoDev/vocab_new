import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { Button } from "../../../../app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../app/components/ui/dialog";
import { filterListWordRowsByStatus, filterListWordRowsBySearch, type ListWordStatusFilterId } from "./listWordFiltering";
import { getPageWindow } from "./listPagination";
import type { ListWordStatus } from "./listWordStatus";
import type { ListWordRow } from "./ListDetailView";

// All/Not studied/Learning/Known/Mastered — every real ListWordStatus plus
// "all", matching the picker's own "default All, never force filtering by
// status" requirement.
const STATUS_FILTERS: ListWordStatusFilterId[] = ["all", "notStudied", "learning", "known", "mastered"];

// A full vocabulary set can hold thousands of concepts — rendering them all
// as DOM rows at once would be a real performance problem, so the picker
// paginates client-side (no Supabase query per page) at a size within the
// 25-50 range this phase's own performance requirement suggests.
const PAGE_SIZE = 30;

interface AddWordsDialogProps {
  open: boolean;
  isSubmitting: boolean;
  error: string | null;
  // "loading" while the full vocabulary set is still resolving
  // (vocabulary.json import + concept resolution, owned by ListDetailView —
  // see that file's own header for why resolution happens exactly once
  // there rather than a second time in this dialog) — shown as a loading
  // state rather than ever flashing an empty "no results" search.
  resolveStatus: "loading" | "ready" | "error";
  // Every resolvable concept for the list's own target language — not just
  // already-studied words (see supabase/README.md's "My Lists Corrective
  // Phase" section) — each decorated with an OPTIONAL status
  // (notStudied/learning/known/mastered). This dialog filters out
  // already-list-members and applies search/status/pagination itself,
  // entirely client-side.
  allRows: ListWordRow[];
  alreadyAddedIds: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (selectedWordIds: string[]) => void | Promise<void>;
}

// Add Words picker: search + status filter + pagination over the FULL
// vocabulary set for the list's own target language (studied or not),
// multi-select, batch submit. Reuses filterListWordRowsByStatus/BySearch
// (this phase's own pure filtering, mirroring the Vocabulary page's own
// semantics for a superset status type — see listWordFiltering.ts) rather
// than building a second filtering system.
export function AddWordsDialog({
  open,
  isSubmitting,
  error,
  resolveStatus,
  allRows,
  alreadyAddedIds,
  onOpenChange,
  onSubmit,
}: AddWordsDialogProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListWordStatusFilterId>("all");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(1);

  // Resets the picker's own draft state whenever it closes, so reopening
  // it (for the same list or a different one) never shows a stale search/
  // filter/selection/page.
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setStatusFilter("all");
      setSelectedIds(new Set());
      setPage(1);
    }
  }, [open]);

  const availableRows = useMemo(
    () => allRows.filter((row) => !alreadyAddedIds.has(row.conceptId)),
    [allRows, alreadyAddedIds],
  );
  const visibleRows = useMemo(() => {
    const byStatus = filterListWordRowsByStatus(availableRows, statusFilter);
    return filterListWordRowsBySearch(byStatus, searchQuery);
  }, [availableRows, statusFilter, searchQuery]);

  // A new search/filter always jumps back to page 1 — never leaves the
  // user stranded on a now-out-of-range page.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const pagedRows = visibleRows.slice(pageStart, pageStart + PAGE_SIZE);
  const pageWindow = getPageWindow(clampedPage, totalPages);
  const hasMoreAfterWindow = pageWindow[pageWindow.length - 1] < totalPages;

  const toggleSelected = (conceptId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(conceptId)) {
        next.delete(conceptId);
      } else {
        next.add(conceptId);
      }
      return next;
    });
  };

  const selectedCount = selectedIds.size;
  const submitLabel =
    selectedCount === 0
      ? t("userProfile.myListsSection.picker.addSelected")
      : selectedCount === 1
        ? t("userProfile.myListsSection.picker.addWord").replace("{count}", "1")
        : t("userProfile.myListsSection.picker.addWords").replace("{count}", String(selectedCount));
  const selectedSummary =
    selectedCount === 1
      ? t("userProfile.myListsSection.picker.wordSelected").replace("{count}", "1")
      : t("userProfile.myListsSection.picker.wordsSelected").replace("{count}", String(selectedCount));

  const handleSubmit = () => {
    if (selectedCount === 0 || isSubmitting) return;
    void onSubmit([...selectedIds]);
  };

  const statusLabel = (status: ListWordStatus) =>
    status === "notStudied"
      ? t("userProfile.myListsSection.notStudied")
      : t(`userProfile.vocabularySection.table.statuses.${status}`);
  const filterLabel = (id: ListWordStatusFilterId) =>
    id === "all" ? t("userProfile.myListsSection.statusAll") : statusLabel(id);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="my-lists-add-words-dialog sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("userProfile.myListsSection.addWords")}</DialogTitle>
          <DialogDescription className="sr-only">{t("userProfile.myListsSection.addWords")}</DialogDescription>
        </DialogHeader>

        <div className="my-lists-picker">
          <div className="my-lists-picker__toolbar">
            <div className="my-lists-toolbar__search my-lists-picker__search">
              <Search size={15} strokeWidth={2} aria-hidden="true" className="my-lists-toolbar__search-icon" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("userProfile.myListsSection.searchWords")}
                aria-label={t("userProfile.myListsSection.searchWords")}
                className="my-lists-toolbar__search-input"
              />
            </div>
            <div className="my-lists-picker__status-filters" role="group" aria-label={t("userProfile.myListsSection.statusAll")}>
              {STATUS_FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`my-lists-picker__status-filter ${statusFilter === id ? "is-active" : ""}`}
                  aria-pressed={statusFilter === id}
                  onClick={() => setStatusFilter(id)}
                >
                  {filterLabel(id)}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="my-lists-picker__list" role="listbox" aria-multiselectable="true">
            {resolveStatus === "loading" ? (
              <div className="my-lists-loading-block" role="status" aria-live="polite" aria-busy="true">
                <div className="my-lists-loading-row" />
                <div className="my-lists-loading-row" />
                <div className="my-lists-loading-row" />
              </div>
            ) : resolveStatus === "error" ? (
              <p className="my-lists-message-block__text">{t("userProfile.myListsSection.loadError")}</p>
            ) : visibleRows.length === 0 ? (
              <p className="my-lists-message-block__text">{t("userProfile.myListsSection.detail.noMatch")}</p>
            ) : (
              pagedRows.map((row) => {
                const isSelected = selectedIds.has(row.conceptId);
                return (
                  <label key={row.conceptId} className={`my-lists-picker__row ${isSelected ? "is-selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(row.conceptId)}
                      disabled={isSubmitting}
                      className="my-lists-picker__checkbox"
                    />
                    <span className="my-lists-picker__row-word">{row.targetWord}</span>
                    <span className="my-lists-picker__row-translation">{row.translation}</span>
                    {row.level ? <span className="my-lists-level-badge">{row.level}</span> : <span />}
                    <span className={`my-lists-status-badge my-lists-status-badge--${row.status}`}>
                      {statusLabel(row.status)}
                    </span>
                  </label>
                );
              })
            )}

            {/* Already-added words are excluded from availableRows entirely
                (see the Phase 2B brief's "exclude them from available
                results OR show disabled" — exclusion fits this compact
                list better than a disabled row competing for space), but a
                search that matches an excluded word should still explain
                why it isn't in the results rather than looking like a
                silent gap. */}
            {resolveStatus === "ready" && searchQuery.trim() ? (
              <AlreadyAddedHint query={searchQuery} allRows={allRows} alreadyAddedIds={alreadyAddedIds} />
            ) : null}
          </div>

          {resolveStatus === "ready" && totalPages > 1 ? (
            <div className="my-lists-detail-pagination my-lists-picker__pagination">
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
                  className={`my-lists-detail-pagination__page ${clampedPage === pageNumber ? "is-active" : ""}`}
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
        </div>

        <DialogFooter className="my-lists-picker__footer">
          <span className="my-lists-picker__selected-summary">{selectedCount > 0 ? selectedSummary : null}</span>
          <div className="my-lists-picker__footer-buttons">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {t("userProfile.myListsSection.modal.cancel")}
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={selectedCount === 0 || isSubmitting}>
              {submitLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Explains a search hit that only matches an already-added word — without
// this, typing a word already in the list looks like a bug (zero results
// for something the user can clearly see exists) rather than the intended
// "it's already here" outcome.
function AlreadyAddedHint({
  query,
  allRows,
  alreadyAddedIds,
}: {
  query: string;
  allRows: ListWordRow[];
  alreadyAddedIds: ReadonlySet<string>;
}) {
  const { t } = useLanguage();
  const alreadyAddedMatches = filterListWordRowsBySearch(
    allRows.filter((row) => alreadyAddedIds.has(row.conceptId)),
    query,
  );

  if (alreadyAddedMatches.length === 0) return null;

  return (
    <ul className="my-lists-picker__already-added-list">
      {alreadyAddedMatches.map((row) => (
        <li key={row.conceptId} className="my-lists-picker__already-added-row">
          <span className="my-lists-picker__row-word">{row.targetWord}</span>
          <span className="my-lists-picker__already-added-badge">
            {t("userProfile.myListsSection.picker.alreadyAdded")}
          </span>
        </li>
      ))}
    </ul>
  );
}
