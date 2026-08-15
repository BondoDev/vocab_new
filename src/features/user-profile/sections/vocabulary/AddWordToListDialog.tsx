import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { Button } from "../../../../app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../../app/components/ui/dialog";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../../../lib/supabaseError";
import {
  addWordsToVocabularyList,
  createUserVocabularyList,
  readUserVocabularyLists,
  readUserVocabularyListMembershipsForWord,
  removeWordFromVocabularyList,
  VocabularyListError,
  type UserVocabularyList,
} from "../../../../lib/vocabularyLists";
import { notifyVocabularyListsChanged } from "../../../../lib/sharedProgressInvalidation";
// Reuses My Lists' own pure search filter/name-validation helpers, and its
// existing Create List dialog itself, rather than duplicating any of it —
// "Create List" here opens the identical dialog MyListsSection uses, as a
// second popup stacked on top of this one (see the render below).
import { filterListsBySearchQuery } from "../my-lists/listSearchSort";
import { normalizeListNameForComparison, validateListName } from "../my-lists/listNameValidation";
import { CreateListDialog } from "../my-lists/CreateListDialog";

export interface AddToListWord {
  // Vocabulary concept id (ResolvedVocabularyRow.conceptId) — the same id
  // user_vocabulary_list_words.word_id stores. Never the progress row id
  // (ResolvedVocabularyRow.id) — a list's membership is concept-based, see
  // vocabularyLists.ts's own header.
  wordId: string;
  targetWord: string;
}

interface AddWordToListDialogProps {
  // null closes the dialog; a word opens it scoped to that word — mirrors
  // RenameListDialog's "list: UserVocabularyList | null" shape, since this
  // dialog needs the word's id/display text, not just a boolean.
  word: AddToListWord | null;
  targetLanguage: string;
  onOpenChange: (open: boolean) => void;
  // Reuses VocabularySection's own Toast/useAutoDismissMessage instance
  // rather than mounting a second one — this dialog never renders its own
  // Toast.
  onShowToast: (message: string) => void;
}

type ListsLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; lists: UserVocabularyList[] };

// The scroll box's own SCSS (.vocabulary-add-to-list__list max-height)
// hardcodes a 5-row cap matching this comment — a user with a large number
// of lists still gets a compact popup with search, rather than every list
// rendered at once.

// Vocabulary page's "Add to list" popup: pick from the caller's existing
// lists (search + scroll, capped at roughly 5 visible rows) or
// create a new one inline, all for exactly one word. Each list row is a
// toggle (click adds, click again removes) — mirrors VocabularySection's
// own Favorites-star optimistic-toggle precedent rather than a separate
// "confirm" step. Lists and this word's own membership are both fetched
// fresh every time the dialog opens (no cross-open caching) — this dialog
// intentionally stays a self-contained data owner rather than adding a
// second lists cache to VocabularySection itself.
export function AddWordToListDialog({ word, targetLanguage, onOpenChange, onShowToast }: AddWordToListDialogProps) {
  const { t } = useLanguage();
  const open = word !== null;
  const [state, setState] = useState<ListsLoadState>({ status: "loading" });
  const [memberListIds, setMemberListIds] = useState<ReadonlySet<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingListIds, setTogglingListIds] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Resets every draft/error whenever the dialog closes, so reopening it —
  // for the same word or a different one — never shows stale search text,
  // a still-open create dialog, or a previous attempt's error.
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setActionError(null);
      setIsCreateDialogOpen(false);
      setCreateError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !word) return;

    let cancelled = false;
    setState({ status: "loading" });
    setMemberListIds(new Set());

    void (async () => {
      const session = getStoredSupabaseSession();
      if (!session) {
        if (!cancelled) {
          setState({ status: "ready", lists: [] });
          onShowToast(t("supabaseErrors.sessionExpired"));
        }
        return;
      }

      try {
        const [lists, memberships] = await Promise.all([
          readUserVocabularyLists(session, targetLanguage),
          readUserVocabularyListMembershipsForWord(session, word.wordId),
        ]);
        if (cancelled) return;
        setState({ status: "ready", lists });
        setMemberListIds(new Set(memberships.map((membership) => membership.listId)));
      } catch (error) {
        if (cancelled) return;
        console.warn("AddWordToListDialog: failed to load lists.", describeSupabaseError("readUserVocabularyLists", error));
        setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, word?.wordId, targetLanguage]);

  const lists = state.status === "ready" ? state.lists : [];
  const visibleLists = useMemo(() => filterListsBySearchQuery(lists, searchQuery), [lists, searchQuery]);

  // Optimistic add/remove toggle — the row's checkmark flips immediately,
  // the RPC call happens in the background, and a failure rolls the
  // membership back and surfaces an inline error, matching
  // VocabularySection.handleToggleFavorite's own precedent exactly.
  const handleToggleList = (list: UserVocabularyList) => {
    if (!word || togglingListIds.has(list.id)) return;
    const session = getStoredSupabaseSession();
    if (!session) {
      onShowToast(t("supabaseErrors.sessionExpired"));
      return;
    }

    const isMember = memberListIds.has(list.id);
    setActionError(null);
    setTogglingListIds((prev) => new Set(prev).add(list.id));
    setMemberListIds((prev) => {
      const next = new Set(prev);
      if (isMember) next.delete(list.id);
      else next.add(list.id);
      return next;
    });

    const request = isMember
      ? removeWordFromVocabularyList(session, list.id, word.wordId)
      : addWordsToVocabularyList(session, list.id, [word.wordId]);

    void request
      .then(() => {
        const messageKey = isMember
          ? "userProfile.vocabularySection.addToListDialog.removedFromList"
          : "userProfile.vocabularySection.addToListDialog.addedToList";
        onShowToast(t(messageKey).replace("{name}", list.name));
        // This dialog is a self-contained data owner (see this file's own
        // header) with no access to My Lists' own shared cache
        // (useProfileSharedMyLists) — it can't patch that cache precisely
        // (addWordsToVocabularyList's response has no created_at for the
        // new membership row; see sharedProgressInvalidation.ts's own
        // header for the full reasoning), so it notifies the narrow
        // vocabulary-lists channel instead, which triggers a background
        // refetch only if My Lists has actually already been loaded this
        // profile session.
        notifyVocabularyListsChanged();
      })
      .catch((error) => {
        console.warn("AddWordToListDialog: failed to toggle list membership.", error);
        setMemberListIds((prev) => {
          const next = new Set(prev);
          if (isMember) next.add(list.id);
          else next.delete(list.id);
          return next;
        });
        const category = error instanceof VocabularyListError ? error.category : "unknown";
        const fallbackKey = isMember
          ? "userProfile.vocabularySection.addToListDialog.removeWordError"
          : "userProfile.vocabularySection.addToListDialog.addWordError";
        setActionError(t(resolveSupabaseErrorMessageKey(category, fallbackKey)));
      })
      .finally(() => {
        setTogglingListIds((prev) => {
          const next = new Set(prev);
          next.delete(list.id);
          return next;
        });
      });
  };

  // Passed as CreateListDialog's own onSubmit — that dialog already trims/
  // validates the name itself before ever calling this, so the
  // validateListName check below is defensive only.
  const handleCreateList = async (name: string) => {
    if (!word) return;
    const validation = validateListName(name);
    if (!validation.ok) return;

    const normalized = normalizeListNameForComparison(validation.name);
    if (lists.some((list) => normalizeListNameForComparison(list.name) === normalized)) {
      setCreateError(t("userProfile.myListsSection.duplicateNameError"));
      return;
    }

    const session = getStoredSupabaseSession();
    if (!session) {
      setCreateError(t("supabaseErrors.sessionExpired"));
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await createUserVocabularyList(session, targetLanguage, validation.name);
      setState((prev) => (prev.status === "ready" ? { status: "ready", lists: [created, ...prev.lists] } : prev));
      // Signaled independently of the handleToggleList(created) call below
      // — the new list itself already exists server-side the instant this
      // resolves, regardless of whether the follow-up add-word call
      // succeeds, so My Lists' own shared cache must not miss it if that
      // follow-up happens to fail.
      notifyVocabularyListsChanged();
      // Closes the Create List popup — the Add to List popup underneath was
      // never actually closed (see the render below), so it's already
      // visible again the instant this one goes away.
      setIsCreateDialogOpen(false);
      // Reuses the same optimistic add path every existing-list row uses —
      // `created` is guaranteed not yet in memberListIds/togglingListIds.
      handleToggleList(created);
    } catch (error) {
      console.warn("AddWordToListDialog: failed to create list.", error);
      const category = error instanceof VocabularyListError ? error.category : "unknown";
      setCreateError(
        category === "conflict"
          ? t("userProfile.myListsSection.duplicateNameError")
          : t(resolveSupabaseErrorMessageKey(category, "userProfile.myListsSection.createError")),
      );
    } finally {
      setIsCreating(false);
    }
  };

  const dialogTitle = word
    ? `${t("userProfile.vocabularySection.addToListDialog.titlePrefix")} "${word.targetWord}" ${t(
        "userProfile.vocabularySection.addToListDialog.titleSuffix",
      )}`.replace(/\s+/g, " ").trim()
    : t("userProfile.vocabularySection.table.menu.addToList");

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isCreating) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="vocabulary-add-to-list-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">{dialogTitle}</DialogDescription>
        </DialogHeader>

        {word ? (
          <div className="vocabulary-add-to-list">
            <div className="vocabulary-add-to-list__search">
              <Search size={15} strokeWidth={2} aria-hidden="true" className="vocabulary-add-to-list__search-icon" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("userProfile.myListsSection.search.placeholder")}
                aria-label={t("userProfile.myListsSection.search.ariaLabel")}
                className="vocabulary-add-to-list__search-input"
              />
            </div>

            {actionError ? (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            ) : null}

            <div className="vocabulary-add-to-list__list" role="listbox" aria-multiselectable="true">
              {state.status === "loading" ? (
                <div className="vocabulary-add-to-list__loading" role="status" aria-live="polite" aria-busy="true">
                  <Loader2 size={16} className="vocabulary-add-to-list__spinner" aria-hidden="true" />
                  <span>{t("userProfile.vocabularySection.addToListDialog.loading")}</span>
                </div>
              ) : state.status === "error" ? (
                <p className="vocabulary-add-to-list__message">{t("userProfile.myListsSection.loadError")}</p>
              ) : lists.length === 0 ? (
                <p className="vocabulary-add-to-list__message">
                  {t("userProfile.vocabularySection.addToListDialog.emptyState")}
                </p>
              ) : visibleLists.length === 0 ? (
                <p className="vocabulary-add-to-list__message">
                  {t("userProfile.vocabularySection.addToListDialog.noMatch")}
                </p>
              ) : (
                visibleLists.map((list) => {
                  const isMember = memberListIds.has(list.id);
                  const isToggling = togglingListIds.has(list.id);
                  return (
                    <button
                      key={list.id}
                      type="button"
                      role="option"
                      aria-selected={isMember}
                      disabled={isToggling}
                      className={`vocabulary-add-to-list__row ${isMember ? "is-member" : ""}`}
                      onClick={() => handleToggleList(list)}
                    >
                      <span className="vocabulary-add-to-list__row-name">{list.name}</span>
                      {isToggling ? (
                        <Loader2 size={15} className="vocabulary-add-to-list__spinner" aria-hidden="true" />
                      ) : isMember ? (
                        <span className="vocabulary-add-to-list__row-status">
                          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                          {t("userProfile.vocabularySection.addToListDialog.added")}
                        </span>
                      ) : (
                        <Plus size={15} strokeWidth={2} aria-hidden="true" className="vocabulary-add-to-list__row-add-icon" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="vocabulary-add-to-list__footer">
              {/* Opens CreateListDialog as a second, stacked popup (see the
                  render below) rather than expanding an inline form here —
                  this popup itself is never closed underneath it, so it's
                  visible again the instant the create popup closes. */}
              <button
                type="button"
                className="vocabulary-add-to-list__create-trigger"
                onClick={() => {
                  setCreateError(null);
                  setIsCreateDialogOpen(true);
                }}
              >
                <Plus size={15} strokeWidth={2} aria-hidden="true" />
                {t("userProfile.myListsSection.createButton")}
              </button>
              <Button type="button" disabled={isCreating} onClick={() => onOpenChange(false)}>
                {t("userProfile.vocabularySection.addToListDialog.done")}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>

    <CreateListDialog
      open={isCreateDialogOpen}
      isSubmitting={isCreating}
      error={createError}
      onOpenChange={setIsCreateDialogOpen}
      onSubmit={handleCreateList}
    />
    </>
  );
}
