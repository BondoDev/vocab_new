import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ListPlus, Plus, Search } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { Button } from "../../../../app/components/ui/button";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../../../lib/supabaseError";
import {
  addWordsToVocabularyList,
  createUserVocabularyList,
  deleteUserVocabularyList,
  readUserVocabularyListMemberships,
  readUserVocabularyLists,
  removeWordFromVocabularyList,
  renameUserVocabularyList,
  VocabularyListError,
  type UserVocabularyList,
  type UserVocabularyListMembership,
} from "../../../../lib/vocabularyLists";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { UserProfile } from "../../../../lib/userProfile";
import type { ExerciseId } from "../../../../exercises/exerciseIds";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import { CreateListDialog } from "./CreateListDialog";
import { RenameListDialog } from "./RenameListDialog";
import { DeleteListDialog } from "./DeleteListDialog";
import { AddWordsDialog } from "./AddWordsDialog";
import { ListCard } from "./ListCard";
import { ListDetailView } from "./ListDetailView";
import { normalizeListNameForComparison } from "./listNameValidation";
import { computeListWordCountsByListId, getListWordCount } from "./listWordCounts";
import { filterListsBySearchQuery, sortLists, type ListSortMode } from "./listSearchSort";
import "./my-lists-section.scss";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "result"; lists: UserVocabularyList[]; memberships: UserVocabularyListMembership[] };

// The fully-resolved Practice List launch config (My Lists Phase 3):
// conceptIds/exercises are already final (quantity+order already applied —
// see PracticeListSetupDialog/practiceListSelection.ts) by the time this
// reaches App.tsx, which only needs to set up the existing Custom Practice
// session state and navigate. listName is carried only for display (the
// setup dialog's own title, and — via App.tsx's usePracticeListSession —
// this same session's "Back" destination); it is never sent anywhere.
export interface PracticeListStartConfig {
  listId: string;
  listName: string;
  targetLanguage: string;
  conceptIds: string[];
  exercises: ExerciseId[];
}

interface MyListsSectionProps {
  // App.tsx's single shared profile load, matching every sibling section's
  // own precedent — practiceLanguage is the active target language lists
  // are scoped to (see the migration's own header). wordProgressRows/
  // wordProgressStatus are UserProfileDashboardPage's shared
  // useProfileSharedProgressData rows (Phase 2A's own addition to this
  // section's props) — card/detail counts are computed from these
  // already-loaded rows locally; this section never issues a second
  // user_word_progress query of its own.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onRetryWordProgress: () => void;
  // Owned by App.tsx (My Lists Phase 3) — sets up the existing Custom
  // Practice session state (selectedExercises, the practice-list session
  // snapshot) and navigates into the existing practice route. This
  // section never navigates into practice itself and never touches
  // App.tsx-level state directly.
  onStartPracticeList?: (config: PracticeListStartConfig) => void;
}

function resolveListIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("listId");
}

function resolveListMutationErrorMessage(
  t: (key: string) => string,
  error: unknown,
  fallbackKey: string,
): string {
  const category = error instanceof VocabularyListError ? error.category : "unknown";
  // A duplicate-name rejection (category "conflict" — see
  // src/lib/supabaseError.ts's 23505 classification) always shows this
  // specific copy, regardless of which operation (create/rename) hit it —
  // never the generic create/rename-failed fallback.
  if (category === "conflict") {
    return t("userProfile.myListsSection.duplicateNameError");
  }
  return t(resolveSupabaseErrorMessageKey(category, fallbackKey));
}

// My Lists Phase 2A: real list cards (name, word count, Learning/Known/
// Mastered counts), search/sort, rename/delete, and a list-detail shell —
// on top of Phase 1's create flow and empty state (kept byte-for-byte
// behaviorally: zero lists still shows the same centered empty state, no
// search/sort/grid). Add Words and Study List remain explicitly out of
// scope — see ListDetailView's own header for why its word table only
// reads already-existing membership, never writes it.
export function MyListsSection({
  userProfile,
  isProfileLoaded,
  wordProgressRows,
  wordProgressStatus,
  onRetryWordProgress,
  onStartPracticeList,
}: MyListsSectionProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const location = useLocation();
  const navigate = useNavigate();
  const targetLanguage = userProfile.practiceLanguage;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<UserVocabularyList | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<UserVocabularyList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isAddWordsDialogOpen, setIsAddWordsDialogOpen] = useState(false);
  const [isAddingWords, setIsAddingWords] = useState(false);
  const [addWordsError, setAddWordsError] = useState<string | null>(null);

  const [isPracticeListDialogOpen, setIsPracticeListDialogOpen] = useState(false);

  const { message: toastMessage, show: showToast } = useAutoDismissMessage();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<ListSortMode>("recentlyUpdated");

  useEffect(() => {
    if (!authUserId) {
      setState({ status: "result", lists: [], memberships: [] });
      return;
    }

    if (!isProfileLoaded || !targetLanguage) {
      setState({ status: "loading" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "result", lists: [], memberships: [] });
          return;
        }

        const lists = await readUserVocabularyLists(session, targetLanguage);
        if (cancelled) return;
        // Batched — one request for every loaded list's memberships, never
        // one request per card (see the Phase 2A brief's own "avoid one
        // query per card" requirement).
        const memberships = await readUserVocabularyListMemberships(
          session,
          lists.map((list) => list.id),
        );
        if (cancelled) return;
        setState({ status: "result", lists, memberships });
      } catch (error) {
        if (cancelled) return;
        console.warn("MyListsSection: failed to load vocabulary lists.", describeSupabaseError("readUserVocabularyLists", error));
        setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, isProfileLoaded, targetLanguage, retryToken]);

  const lists = state.status === "result" ? state.lists : [];
  const memberships = state.status === "result" ? state.memberships : [];

  // A card's word count comes directly from its membership rows — never
  // from resolving learning progress or the vocabulary dataset (membership
  // is concept-based and independent of progress; see this file's own
  // handleSubmitAddWords/handleRemoveWord below and supabase/README.md's
  // "My Lists Corrective Phase" section).
  const wordCountsByListId = useMemo(() => computeListWordCountsByListId(memberships), [memberships]);

  const listId = resolveListIdFromSearch(location.search);
  const activeList = listId ? (lists.find((list) => list.id === listId) ?? null) : null;

  const goToGrid = () => navigate({ pathname: location.pathname, search: "?section=myLists" });
  const goToDetail = (id: string) => navigate({ pathname: location.pathname, search: `?section=myLists&listId=${id}` });

  // A stale/foreign listId (deleted elsewhere, bad deep link) once lists
  // have actually finished loading — bounce back to the grid rather than
  // rendering a detail view for a list that doesn't exist.
  useEffect(() => {
    if (state.status === "result" && listId && !activeList) {
      goToGrid();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, listId, activeList]);

  const handleRetry = () => {
    onRetryWordProgress();
    setRetryToken((token) => token + 1);
  };

  // ---- create ----
  const handleOpenCreateDialog = () => {
    setCreateError(null);
    setIsCreateDialogOpen(true);
  };

  // Optional fast client-side duplicate check against already-loaded
  // lists (same normalization the database uses) before ever calling the
  // RPC — database uniqueness (the migration's unique index +
  // create_user_vocabulary_list's own proactive check) remains
  // authoritative; this only skips a round trip for the common case.
  const handleCreate = async (name: string) => {
    if (!targetLanguage) return;

    const normalized = normalizeListNameForComparison(name);
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
      const created = await createUserVocabularyList(session, targetLanguage, name);
      setState((prev) =>
        prev.status === "result"
          ? { status: "result", lists: [created, ...prev.lists], memberships: prev.memberships }
          : prev,
      );
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.warn("MyListsSection: failed to create list.", error);
      setCreateError(resolveListMutationErrorMessage(t, error, "userProfile.myListsSection.createError"));
    } finally {
      setIsCreating(false);
    }
  };

  // ---- rename ----
  const handleOpenRenameDialog = (list: UserVocabularyList) => {
    setRenameError(null);
    setRenameTarget(list);
  };

  const handleRename = async (name: string) => {
    if (!renameTarget) return;

    const normalized = normalizeListNameForComparison(name);
    const collides = lists.some(
      (list) => list.id !== renameTarget.id && normalizeListNameForComparison(list.name) === normalized,
    );
    if (collides) {
      setRenameError(t("userProfile.myListsSection.duplicateNameError"));
      return;
    }

    const session = getStoredSupabaseSession();
    if (!session) {
      setRenameError(t("supabaseErrors.sessionExpired"));
      return;
    }

    setIsRenaming(true);
    setRenameError(null);
    try {
      const renamed = await renameUserVocabularyList(session, renameTarget.id, name);
      setState((prev) =>
        prev.status === "result"
          ? {
              status: "result",
              lists: prev.lists.map((list) => (list.id === renamed.id ? renamed : list)),
              memberships: prev.memberships,
            }
          : prev,
      );
      setRenameTarget(null);
    } catch (error) {
      console.warn("MyListsSection: failed to rename list.", error);
      setRenameError(resolveListMutationErrorMessage(t, error, "userProfile.myListsSection.renameError"));
    } finally {
      setIsRenaming(false);
    }
  };

  // ---- delete ----
  const handleOpenDeleteDialog = (list: UserVocabularyList) => {
    setDeleteError(null);
    setDeleteTarget(list);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;

    const session = getStoredSupabaseSession();
    if (!session) {
      setDeleteError(t("supabaseErrors.sessionExpired"));
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteUserVocabularyList(session, deletedId);
      setState((prev) =>
        prev.status === "result"
          ? {
              status: "result",
              lists: prev.lists.filter((list) => list.id !== deletedId),
              memberships: prev.memberships.filter((membership) => membership.listId !== deletedId),
            }
          : prev,
      );
      setDeleteTarget(null);
      // The deleted list's own detail view can't render anything once it's
      // gone from state — navigate back to the grid rather than leaving the
      // user on a now-empty detail shell.
      if (listId === deletedId) {
        goToGrid();
      }
    } catch (error) {
      console.warn("MyListsSection: failed to delete list.", error);
      setDeleteError(resolveListMutationErrorMessage(t, error, "userProfile.myListsSection.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  // ---- add words ----
  const handleOpenAddWordsDialog = () => {
    setAddWordsError(null);
    setIsAddWordsDialogOpen(true);
  };

  const handleCloseAddWordsDialog = () => {
    if (!isAddingWords) setIsAddWordsDialogOpen(false);
  };

  // On success, re-fetches only this list's own memberships (one small
  // request) rather than trusting a client-synthesized created_at for the
  // newly-added rows — the RPC's own RETURNS TABLE deliberately doesn't
  // include created_at (see the migration's own header), so this is the
  // simplest way to get the authoritative "Added" timestamps without
  // guessing. Replaces only this list's own membership rows in local
  // state; every other list's memberships are left untouched. No full
  // page reload, no refetch of the list's own row set.
  const handleSubmitAddWords = async (wordIds: string[]) => {
    if (!activeList) return;
    const listIdToUpdate = activeList.id;

    const session = getStoredSupabaseSession();
    if (!session) {
      setAddWordsError(t("supabaseErrors.sessionExpired"));
      return;
    }

    setIsAddingWords(true);
    setAddWordsError(null);
    try {
      await addWordsToVocabularyList(session, listIdToUpdate, wordIds);
      const freshMemberships = await readUserVocabularyListMemberships(session, [listIdToUpdate]);
      setState((prev) =>
        prev.status === "result"
          ? {
              status: "result",
              lists: prev.lists,
              memberships: [
                ...prev.memberships.filter((membership) => membership.listId !== listIdToUpdate),
                ...freshMemberships,
              ],
            }
          : prev,
      );
      setIsAddWordsDialogOpen(false);
    } catch (error) {
      console.warn("MyListsSection: failed to add words to list.", error);
      setAddWordsError(resolveListMutationErrorMessage(t, error, "userProfile.myListsSection.addWordsError"));
    } finally {
      setIsAddingWords(false);
    }
  };

  // ---- practice list (My Lists Phase 3) ----
  const handleOpenPracticeListDialog = () => {
    setIsPracticeListDialogOpen(true);
  };

  const handleClosePracticeListDialog = () => {
    setIsPracticeListDialogOpen(false);
  };

  // The setup dialog has already resolved conceptIds/exercises (quantity +
  // order already applied — see PracticeListSetupDialog) by the time this
  // fires. This function only attaches the list's own identity/language and
  // hands off to App.tsx, which owns navigation into the existing Custom
  // Practice route — this section itself never navigates into practice.
  const handleStartPracticeListSetup = (config: { conceptIds: string[]; exercises: ExerciseId[] }) => {
    if (!activeList || config.conceptIds.length === 0) return;
    setIsPracticeListDialogOpen(false);
    onStartPracticeList?.({
      listId: activeList.id,
      listName: activeList.name,
      targetLanguage: activeList.targetLanguage,
      conceptIds: config.conceptIds,
      exercises: config.exercises,
    });
  };

  // ---- remove word ----
  // Optimistic, matching VocabularySection's own favorite-toggle precedent:
  // the row disappears immediately (removing membership from local state
  // first), the RPC call happens in the background, and a failure rolls
  // the membership back and surfaces a toast — never a blocking
  // confirmation dialog, per the Phase 2B brief's own "should NOT need a
  // scary destructive confirmation" guidance (removing organization
  // membership only; user_word_progress is never touched, client-side or
  // server-side).
  const handleRemoveWord = (wordId: string) => {
    if (!activeList) return;
    const listIdToUpdate = activeList.id;

    const session = getStoredSupabaseSession();
    if (!session) {
      showToast(t("supabaseErrors.sessionExpired"));
      return;
    }

    const removedMembership = memberships.find(
      (membership) => membership.listId === listIdToUpdate && membership.wordId === wordId,
    );
    setState((prev) =>
      prev.status === "result"
        ? {
            status: "result",
            lists: prev.lists,
            memberships: prev.memberships.filter(
              (membership) => !(membership.listId === listIdToUpdate && membership.wordId === wordId),
            ),
          }
        : prev,
    );

    void removeWordFromVocabularyList(session, listIdToUpdate, wordId)
      .then(() => showToast(t("userProfile.myListsSection.removedFromList")))
      .catch((error) => {
        console.warn("MyListsSection: failed to remove word from list.", error);
        if (removedMembership) {
          setState((prev) =>
            prev.status === "result"
              ? { status: "result", lists: prev.lists, memberships: [...prev.memberships, removedMembership] }
              : prev,
          );
        }
        showToast(t("userProfile.myListsSection.removeError"));
      });
  };

  const isLoading = state.status === "loading" || wordProgressStatus === "loading";
  const isError = state.status === "error" || wordProgressStatus === "error";
  const hasLists = lists.length > 0;

  const visibleLists = useMemo(
    () => sortLists(filterListsBySearchQuery(lists, searchQuery), sortMode),
    [lists, searchQuery, sortMode],
  );

  if (!isLoading && !isError && activeList) {
    const listMemberships = memberships.filter((membership) => membership.listId === activeList.id);
    return (
      <>
        <ListDetailView
          list={activeList}
          memberships={listMemberships}
          wordProgressRows={wordProgressRows}
          nativeLanguage={userProfile.nativeLanguage}
          onBack={goToGrid}
          onRename={() => handleOpenRenameDialog(activeList)}
          onDelete={() => handleOpenDeleteDialog(activeList)}
          onRemoveWord={handleRemoveWord}
          onOpenPracticeList={handleOpenPracticeListDialog}
          isPracticeListDialogOpen={isPracticeListDialogOpen}
          onClosePracticeList={handleClosePracticeListDialog}
          onStartPracticeList={handleStartPracticeListSetup}
          isAddWordsDialogOpen={isAddWordsDialogOpen}
          isAddingWords={isAddingWords}
          addWordsError={addWordsError}
          onOpenAddWords={handleOpenAddWordsDialog}
          onCloseAddWords={handleCloseAddWordsDialog}
          onSubmitAddWords={handleSubmitAddWords}
        />

        <RenameListDialog
          list={renameTarget}
          isSubmitting={isRenaming}
          error={renameError}
          onOpenChange={(open) => !open && setRenameTarget(null)}
          onSubmit={handleRename}
        />
        <DeleteListDialog
          list={deleteTarget}
          isDeleting={isDeleting}
          error={deleteError}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
        <Toast message={toastMessage} />
      </>
    );
  }

  return (
    <>
      <header className="my-lists-section__header">
        <div className="my-lists-section__heading">
          <h1 className="my-lists-section__title">{t("userProfile.myListsSection.title")}</h1>
          <p className="my-lists-section__subtitle">{t("userProfile.myListsSection.subtitle")}</p>
        </div>
        {/* The header's own Create List button only appears once at least
            one list exists — while empty, the single centered button inside
            the empty state below is the only entry point, matching the
            "do not show empty grid cards / duplicate controls" requirement. */}
        {!isLoading && !isError && hasLists ? (
          <Button type="button" onClick={handleOpenCreateDialog} className="my-lists-section__create-button">
            <Plus aria-hidden="true" />
            {t("userProfile.myListsSection.createButton")}
          </Button>
        ) : null}
      </header>

      {isLoading ? (
        <MyListsLoadingBlock />
      ) : isError ? (
        <div className="my-lists-message-block" role="status">
          <p className="my-lists-message-block__text">{t("userProfile.myListsSection.loadError")}</p>
          <button type="button" onClick={handleRetry} className="my-lists-retry-button">
            {t("userProfile.myListsSection.retryButton")}
          </button>
        </div>
      ) : !hasLists ? (
        <div className="my-lists-empty-state">
          <div className="my-lists-empty-state__icon" aria-hidden="true">
            <ListPlus size={28} strokeWidth={1.75} />
          </div>
          <h2 className="my-lists-empty-state__title">{t("userProfile.myListsSection.emptyState.title")}</h2>
          <p className="my-lists-empty-state__description">{t("userProfile.myListsSection.emptyState.description")}</p>
          <Button type="button" onClick={handleOpenCreateDialog} className="my-lists-empty-state__button">
            <Plus aria-hidden="true" />
            {t("userProfile.myListsSection.createButton")}
          </Button>
        </div>
      ) : (
        <>
          <div className="my-lists-toolbar">
            <div className="my-lists-toolbar__search">
              <Search size={15} strokeWidth={2} aria-hidden="true" className="my-lists-toolbar__search-icon" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("userProfile.myListsSection.search.placeholder")}
                aria-label={t("userProfile.myListsSection.search.ariaLabel")}
                className="my-lists-toolbar__search-input"
              />
            </div>
            <label className="my-lists-toolbar__sort">
              <span className="sr-only">{t("userProfile.myListsSection.sort.ariaLabel")}</span>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as ListSortMode)}
                className="my-lists-toolbar__sort-select"
              >
                <option value="recentlyUpdated">{t("userProfile.myListsSection.sort.recentlyUpdated")}</option>
                <option value="nameAsc">{t("userProfile.myListsSection.sort.nameAsc")}</option>
                <option value="nameDesc">{t("userProfile.myListsSection.sort.nameDesc")}</option>
              </select>
            </label>
          </div>

          <div className="my-lists-card-grid">
            {visibleLists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                wordCount={getListWordCount(wordCountsByListId, list.id)}
                onView={() => goToDetail(list.id)}
                onRename={() => handleOpenRenameDialog(list)}
                onDelete={() => handleOpenDeleteDialog(list)}
                onPracticeList={
                  onStartPracticeList && getListWordCount(wordCountsByListId, list.id) > 0
                    ? () => goToDetail(list.id)
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}

      <CreateListDialog
        open={isCreateDialogOpen}
        isSubmitting={isCreating}
        error={createError}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleCreate}
      />
      <RenameListDialog
        list={renameTarget}
        isSubmitting={isRenaming}
        error={renameError}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onSubmit={handleRename}
      />
      <DeleteListDialog
        list={deleteTarget}
        isDeleting={isDeleting}
        error={deleteError}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

function MyListsLoadingBlock() {
  return (
    <div className="my-lists-loading-block" role="status" aria-live="polite" aria-busy="true">
      <div className="my-lists-loading-row" />
      <div className="my-lists-loading-row" />
    </div>
  );
}
