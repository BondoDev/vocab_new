import { useEffect, useState } from "react";
import { ListPlus, Plus } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { Button } from "../../../../app/components/ui/button";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../../../lib/supabaseError";
import {
  createUserVocabularyList,
  readUserVocabularyLists,
  VocabularyListCreateError,
  type UserVocabularyList,
} from "../../../../lib/vocabularyLists";
import type { UserProfile } from "../../../../lib/userProfile";
import { CreateListDialog } from "./CreateListDialog";
import "./my-lists-section.scss";

type LoadState = { status: "loading" } | { status: "error" } | { status: "result"; lists: UserVocabularyList[] };

interface MyListsSectionProps {
  // App.tsx's single shared profile load (useUserProfileLoad), matching
  // every sibling section's own precedent — practiceLanguage below is the
  // active target language lists are scoped to (see the migration's own
  // header for why a list belongs to exactly one target language).
  userProfile: UserProfile;
  isProfileLoaded: boolean;
}

// My Lists Phase 1: page header, empty state, Create List, and the create
// dialog. Deliberately does NOT fetch vocabulary.json, resolve words, or
// touch user_word_progress — a list is organization only (see
// src/lib/vocabularyLists.ts's own header). List detail pages, adding
// words to a list, and Study List are explicitly out of scope for this
// phase; the non-empty branch below renders only name (plus a future word
// count once a membership table exists), never a full list-detail layout.
export function MyListsSection({ userProfile, isProfileLoaded }: MyListsSectionProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const targetLanguage = userProfile.practiceLanguage;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!authUserId) {
      setState({ status: "result", lists: [] });
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
          if (!cancelled) setState({ status: "result", lists: [] });
          return;
        }

        const lists = await readUserVocabularyLists(session, targetLanguage);
        if (cancelled) return;
        setState({ status: "result", lists });
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

  const handleRetry = () => setRetryToken((token) => token + 1);

  const handleOpenDialog = () => {
    setCreateError(null);
    setIsDialogOpen(true);
  };

  // On success, prepends the new list to the already-loaded set and closes
  // the dialog — no refetch, no reload, so the page transitions out of the
  // empty state immediately (see the Phase 1 brief's own requirement).
  const handleCreate = async (name: string) => {
    if (!targetLanguage) return;

    const session = getStoredSupabaseSession();
    if (!session) {
      setCreateError(t("supabaseErrors.sessionExpired"));
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);
    try {
      const created = await createUserVocabularyList(session, targetLanguage, name);
      setState((prev) => ({
        status: "result",
        lists: [created, ...(prev.status === "result" ? prev.lists : [])],
      }));
      setIsDialogOpen(false);
    } catch (error) {
      console.warn("MyListsSection: failed to create list.", error);
      const category = error instanceof VocabularyListCreateError ? error.category : "unknown";
      setCreateError(t(resolveSupabaseErrorMessageKey(category, "userProfile.myListsSection.createError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const lists = state.status === "result" ? state.lists : [];
  const hasLists = lists.length > 0;

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
          <Button type="button" onClick={handleOpenDialog} className="my-lists-section__create-button">
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
          <Button type="button" onClick={handleOpenDialog} className="my-lists-empty-state__button">
            <Plus aria-hidden="true" />
            {t("userProfile.myListsSection.createButton")}
          </Button>
        </div>
      ) : (
        // Future-ready, deliberately minimal: name only today. A word count
        // is added once a membership table exists (Phase 2) — no fake
        // placeholder count is rendered in the meantime.
        <ul className="my-lists-grid">
          {lists.map((list) => (
            <li key={list.id} className="my-lists-grid__item">
              <span className="my-lists-grid__name">{list.name}</span>
            </li>
          ))}
        </ul>
      )}

      <CreateListDialog
        open={isDialogOpen}
        isSubmitting={isSubmitting}
        error={createError}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleCreate}
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
