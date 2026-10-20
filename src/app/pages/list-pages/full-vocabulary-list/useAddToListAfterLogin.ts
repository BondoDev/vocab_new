import { useEffect, useState } from "react";
import type { AddToListWord } from "../../../../features/user-profile";
import type { StoredSupabaseSession } from "../../../../lib/supabaseAuth";

// Owns the "Add to list" flow of the full vocabulary list rows:
// - signed in: opens the shared AddWordToListDialog for the word;
// - signed out: remembers the word, asks App to open the login dialog in
//   stay-on-page mode, and opens the dialog for that word once a session
//   appears — including after a Google OAuth round-trip, which reloads the
//   page (hence sessionStorage, scoped to this pathname and short-lived so an
//   abandoned login can't pop the dialog open much later).
const STORAGE_KEY = "fullVocabularyList.pendingAddToList";
const MAX_AGE_MS = 15 * 60 * 1000;

interface PendingRecord {
  pathname: string;
  savedAt: number;
  word: AddToListWord;
}

function readPending(pathname: string): AddToListWord | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const record = JSON.parse(raw) as Partial<PendingRecord>;
    const fresh = typeof record.savedAt === "number" && Date.now() - record.savedAt < MAX_AGE_MS;
    if (record.pathname !== pathname || !fresh || !record.word?.wordId) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return record.word;
  } catch {
    return null;
  }
}

function writePending(pathname: string, word: AddToListWord | null): void {
  try {
    if (word) {
      const record: PendingRecord = { pathname, savedAt: Date.now(), word };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Without storage, the password-login path still works (state below);
    // only the Google round-trip loses the pending word.
  }
}

export function useAddToListAfterLogin({
  authSession,
  onRequestLogin,
  pathname,
}: {
  authSession: StoredSupabaseSession | null;
  onRequestLogin: () => void;
  pathname: string;
}) {
  const [dialogWord, setDialogWord] = useState<AddToListWord | null>(null);
  // Never rendered, so reading storage in the initializer can't cause an
  // SSR/hydration mismatch (the server simply starts with null).
  const [pendingWord, setPendingWord] = useState<AddToListWord | null>(() => readPending(pathname));

  useEffect(() => {
    if (!authSession || !pendingWord) {
      return;
    }
    setDialogWord(pendingWord);
    setPendingWord(null);
    writePending(pathname, null);
  }, [authSession, pendingWord, pathname]);

  const requestAddToList = (word: AddToListWord) => {
    if (authSession) {
      setDialogWord(word);
      return;
    }
    setPendingWord(word);
    writePending(pathname, word);
    onRequestLogin();
  };

  return {
    dialogWord,
    requestAddToList,
    closeDialog: () => setDialogWord(null),
  };
}
