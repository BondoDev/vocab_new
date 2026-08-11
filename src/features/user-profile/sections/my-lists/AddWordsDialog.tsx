import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import {
  filterVocabularyRowsByTab,
  filterVocabularyRowsBySearch,
  type VocabularyTabId,
} from "../vocabulary/vocabularyFiltering";
import type { ResolvedVocabularyRow } from "../vocabulary/loadVocabularyProgress";

// All/Learning/Known/Mastered only — Favorites has no meaning in this
// picker (adding a word to a list is unrelated to favoriting it).
const STATUS_FILTERS: Exclude<VocabularyTabId, "favorites">[] = ["all", "learning", "known", "mastered"];

interface AddWordsDialogProps {
  open: boolean;
  isSubmitting: boolean;
  error: string | null;
  // "loading" while the full resolved word set is still resolving
  // (vocabulary.json import + concept lookup, owned by ListDetailView —
  // see that file's own header for why resolution happens exactly once
  // there rather than a second time in this dialog) — shown as a loading
  // state rather than ever flashing an empty "no results" search.
  resolveStatus: "loading" | "ready" | "error";
  // The user's full resolved word set for the active target language
  // (every studied word, not just this list's members) — this dialog
  // filters out already-list-members and applies search/status itself,
  // entirely client-side.
  allResolvedRows: ResolvedVocabularyRow[];
  alreadyAddedIds: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (selectedWordProgressIds: string[]) => void | Promise<void>;
}

// Add Words picker: search + status filter over the user's own already-
// studied vocabulary (never the full vocabulary database — see this
// phase's own "only add words with an existing user_word_progress row"
// requirement), multi-select, batch submit. Reuses
// filterVocabularyRowsByTab/BySearch as-is (the same pure filtering the
// Vocabulary page itself uses) rather than building a second filtering
// system.
export function AddWordsDialog({
  open,
  isSubmitting,
  error,
  resolveStatus,
  allResolvedRows,
  alreadyAddedIds,
  onOpenChange,
  onSubmit,
}: AddWordsDialogProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VocabularyTabId>("all");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  // Resets the picker's own draft state whenever it closes, so reopening
  // it (for the same list or a different one) never shows a stale search/
  // filter/selection.
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setStatusFilter("all");
      setSelectedIds(new Set());
    }
  }, [open]);

  const availableRows = useMemo(
    () => allResolvedRows.filter((row) => !alreadyAddedIds.has(row.id)),
    [allResolvedRows, alreadyAddedIds],
  );
  const visibleRows = useMemo(() => {
    const byStatus = filterVocabularyRowsByTab(availableRows, statusFilter);
    return filterVocabularyRowsBySearch(byStatus, searchQuery);
  }, [availableRows, statusFilter, searchQuery]);

  const toggleSelected = (rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
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

  const statusLabel = (id: VocabularyTabId) =>
    id === "all" ? t("userProfile.myListsSection.statusAll") : t(`userProfile.vocabularySection.table.statuses.${id}`);

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
                  {statusLabel(id)}
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
              visibleRows.map((row) => {
                const isSelected = selectedIds.has(row.id);
                return (
                  <label key={row.id} className={`my-lists-picker__row ${isSelected ? "is-selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(row.id)}
                      disabled={isSubmitting}
                      className="my-lists-picker__checkbox"
                    />
                    <span className="my-lists-picker__row-word">{row.targetWord}</span>
                    <span className="my-lists-picker__row-translation">{row.translation}</span>
                    {row.level ? <span className="my-lists-level-badge">{row.level}</span> : <span />}
                    <span className={`my-lists-status-badge my-lists-status-badge--${row.category}`}>
                      {t(`userProfile.vocabularySection.table.statuses.${row.category}`)}
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
              <AlreadyAddedHint
                query={searchQuery}
                allResolvedRows={allResolvedRows}
                alreadyAddedIds={alreadyAddedIds}
              />
            ) : null}
          </div>
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
  allResolvedRows,
  alreadyAddedIds,
}: {
  query: string;
  allResolvedRows: ResolvedVocabularyRow[];
  alreadyAddedIds: ReadonlySet<string>;
}) {
  const { t } = useLanguage();
  const alreadyAddedMatches = filterVocabularyRowsBySearch(
    allResolvedRows.filter((row) => alreadyAddedIds.has(row.id)),
    query,
  );

  if (alreadyAddedMatches.length === 0) return null;

  return (
    <ul className="my-lists-picker__already-added-list">
      {alreadyAddedMatches.map((row) => (
        <li key={row.id} className="my-lists-picker__already-added-row">
          <span className="my-lists-picker__row-word">{row.targetWord}</span>
          <span className="my-lists-picker__already-added-badge">
            {t("userProfile.myListsSection.picker.alreadyAdded")}
          </span>
        </li>
      ))}
    </ul>
  );
}
