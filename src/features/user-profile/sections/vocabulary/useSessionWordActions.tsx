import { useState, type ReactNode } from "react";
import { ListPlus, Star } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { resolveSupabaseErrorMessageKey } from "../../../../lib/supabaseError";
import { updateWordProgressFavorite, VocabularyFavoriteUpdateError } from "../../../../lib/newWordProgress";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import type { SessionWordRowAction } from "../../../../app/components/session-word-list/SessionWordList";
import { AddWordToListDialog, type AddToListWord } from "./AddWordToListDialog";

// Per-word "Add to list" / "Add to favorites" actions for the learning
// completion screens' word lists (Study New Words and Review Words), owned
// here next to the Vocabulary page's own list dialog and favorite toggle so
// both screens share one implementation.

export interface SessionWordForActions {
  conceptId: string;
  targetWord: string;
  // user_word_progress row id and its favorite flag — both needed to toggle
  // a favorite. A word without a row id gets the favorite action disabled.
  progressRowId?: string;
  isFavorite?: boolean;
}

export interface SessionWordActionLabels {
  addToList: string;
  addToFavorites: string;
  removeFromFavorites: string;
  // Toast text after the quoted word, e.g. `"Haus" added to favorites.`
  favoriteAddedSuffix: string;
  favoriteRemovedSuffix: string;
}

export function useSessionWordActions({
  targetLanguage,
  labels,
}: {
  targetLanguage: string;
  labels: SessionWordActionLabels;
}): { getRowActions: (word: SessionWordForActions) => SessionWordRowAction[]; overlay: ReactNode } {
  const { t } = useLanguage();
  const [addToListWord, setAddToListWord] = useState<AddToListWord | null>(null);
  // Favorite flags changed here, by concept id, over the values the caller's
  // data had (optimistic; reverted on failure).
  const [favoriteOverrides, setFavoriteOverrides] = useState<Readonly<Record<string, boolean>>>({});
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(new Set());
  const { message: toastMessage, show: showToast } = useAutoDismissMessage();

  const isFavorite = (word: SessionWordForActions) => favoriteOverrides[word.conceptId] ?? word.isFavorite ?? false;

  // Same RPC and optimistic pattern as the Vocabulary page's star toggle
  // (VocabularySection.handleToggleFavorite).
  const toggleFavorite = (word: SessionWordForActions) => {
    const progressRowId = word.progressRowId;
    if (!progressRowId || togglingIds.has(word.conceptId)) return;
    const session = getStoredSupabaseSession();
    if (!session) {
      showToast(t("supabaseErrors.sessionExpired"));
      return;
    }
    const previous = isFavorite(word);
    const next = !previous;
    setFavoriteOverrides((current) => ({ ...current, [word.conceptId]: next }));
    setTogglingIds((current) => new Set(current).add(word.conceptId));
    void updateWordProgressFavorite(session, progressRowId, next)
      .then(() => {
        showToast(`"${word.targetWord}" ${next ? labels.favoriteAddedSuffix : labels.favoriteRemovedSuffix}`);
      })
      .catch((error) => {
        // Structured diagnostics are logged inside updateWordProgressFavorite.
        console.warn("useSessionWordActions: failed to update favorite.", error);
        setFavoriteOverrides((current) => ({ ...current, [word.conceptId]: previous }));
        const category = error instanceof VocabularyFavoriteUpdateError ? error.category : "unknown";
        showToast(t(resolveSupabaseErrorMessageKey(category, "userProfile.vocabularySection.favoriteError")));
      })
      .finally(() => {
        setTogglingIds((current) => {
          const remaining = new Set(current);
          remaining.delete(word.conceptId);
          return remaining;
        });
      });
  };

  const getRowActions = (word: SessionWordForActions): SessionWordRowAction[] => {
    const favorite = isFavorite(word);
    return [
      {
        key: "addToList",
        label: labels.addToList,
        icon: <ListPlus aria-hidden="true" />,
        onSelect: () => setAddToListWord({ wordId: word.conceptId, targetWord: word.targetWord }),
      },
      {
        key: "favorite",
        label: favorite ? labels.removeFromFavorites : labels.addToFavorites,
        icon: <Star aria-hidden="true" fill={favorite ? "currentColor" : "none"} />,
        disabled: !word.progressRowId || togglingIds.has(word.conceptId),
        onSelect: () => toggleFavorite(word),
      },
    ];
  };

  const overlay = (
    <>
      <AddWordToListDialog
        word={addToListWord}
        targetLanguage={targetLanguage}
        onOpenChange={(open) => {
          if (!open) setAddToListWord(null);
        }}
        onShowToast={showToast}
      />
      <Toast message={toastMessage} />
    </>
  );

  return { getRowActions, overlay };
}
