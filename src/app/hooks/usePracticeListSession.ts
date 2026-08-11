// Owns Practice List's (My Lists Phase 3) session-carrying state: the
// resolved, ordered concept-id set a user configured in the setup dialog,
// persisted to localStorage so a mid-session refresh can restore it —
// mirroring useStoredAppPreferences' own load-on-mount/persist-on-change
// pattern (see that hook's own header) rather than inventing a new
// mechanism. This is the same "reuse the existing durable-refresh
// mechanism" precedent selectedLevels/selectedCategories/selectedWordTypes/
// selectedExercises already use for the ordinary Custom Practice flow.
//
// Deliberately its own hook, not folded into useStoredAppPreferences: that
// hook's own header explicitly scopes itself to "the two language
// selections, the level-category/exercise filter selections" — a resolved
// list-practice word set is a different kind of state (a concrete snapshot
// tied to one specific list, not a standing filter preference), so it gets
// its own narrowly-scoped owner rather than widening that hook's contract.
import { useEffect, useState } from "react";
import { canUseLocalStorage } from "../utils/storage";

const STORAGE_KEY = "app.practiceListSession";

export interface PracticeListSession {
  listId: string;
  listName: string;
  // Already-resolved, already-ordered (random-sampled or list-order-sliced)
  // concept ids — see practiceListSelection.ts's selectListPracticeWords.
  // Never re-derived from this hook; it only carries what the setup dialog
  // already decided.
  conceptIds: string[];
}

function isPracticeListSession(value: unknown): value is PracticeListSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.listId === "string" &&
    candidate.listId.length > 0 &&
    typeof candidate.listName === "string" &&
    Array.isArray(candidate.conceptIds) &&
    candidate.conceptIds.length > 0 &&
    candidate.conceptIds.every((id) => typeof id === "string" && id.length > 0)
  );
}

function readStoredPracticeListSession(): PracticeListSession | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPracticeListSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface UsePracticeListSessionResult {
  practiceListSession: PracticeListSession | null;
  // Pass null to clear (also removes the localStorage entry) — used once
  // a Practice List session is left (Back/Finish) so a later, unrelated
  // visit to the plain Exercises route never accidentally restricts to a
  // stale list's words.
  setPracticeListSession: (session: PracticeListSession | null) => void;
}

// Loaded once on mount (matching useStoredAppPreferences' single-load
// effect shape), then kept in sync with localStorage on every change —
// never re-read from storage after mount; App.tsx's own state is the live
// source of truth once the component tree is up, exactly like every other
// stored preference this app already manages this way.
export function usePracticeListSession(): UsePracticeListSessionResult {
  const [practiceListSession, setPracticeListSessionState] =
    useState<PracticeListSession | null>(null);

  useEffect(() => {
    const stored = readStoredPracticeListSession();
    if (stored) {
      setPracticeListSessionState(stored);
    }
  }, []);

  const setPracticeListSession = (session: PracticeListSession | null) => {
    setPracticeListSessionState(session);
    if (!canUseLocalStorage()) {
      return;
    }
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  return { practiceListSession, setPracticeListSession };
}
