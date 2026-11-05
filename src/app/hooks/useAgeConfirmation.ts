import { useEffect, useRef, useState } from "react";

import type { StoredSupabaseSession } from "../../lib/supabaseAuth";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../lib/supabaseError";
import { updateUserProfileDemographics, writeStoredUserProfile, type UserProfile } from "../../lib/userProfile";
import type { AgeConfirmationValues } from "../components/dialogs/AgeConfirmationDialog";

// One-time age confirmation for accounts that existed before automatic age
// (supabase/migrations/20261105160000_add_inferred_birth_year_and_current_age.sql).
// Their stored age has no trustworthy declaration date, so no birth year is
// guessed for them; instead userProfile.ageConfirmationRequired (set only
// when the server returned birth_year = null for a completed profile) opens
// AgeConfirmationDialog once the profile is loaded. Confirming goes through
// the same update_user_profile_demographics RPC as Settings, which infers
// and stores the birth year.
//
// "Later" postpones it for this browser session only: a sessionStorage flag
// (no user id in it). The flag is dropped when the signed-in account signs
// out or changes, so the next account is always asked.
export const AGE_CONFIRMATION_SNOOZE_KEY = "fluentstellar.ageConfirmation.later";

function readSnoozed(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(AGE_CONFIRMATION_SNOOZE_KEY) === "1";
  } catch {
    return false;
  }
}

function clearSnoozeFlag(): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(AGE_CONFIRMATION_SNOOZE_KEY);
  } catch {
    // Storage unavailable: nothing was stored either.
  }
}

interface UseAgeConfirmationParams {
  authSession: StoredSupabaseSession | null;
  authUserId: string | null;
  isAuthResolved: boolean;
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  // Another account flow (onboarding, password recovery, language confirm)
  // or an active learning session owns the screen right now.
  isBlocked: boolean;
  onConfirmed: (change: {
    age: number;
    birthMonth: string;
    birthDay: string;
    updatedAt: string;
    birthYear?: number;
    ageConfirmedAt?: string | null;
  }) => void;
}

export function useAgeConfirmation({
  authSession,
  authUserId,
  isAuthResolved,
  userProfile,
  isProfileLoaded,
  isBlocked,
  onConfirmed,
}: UseAgeConfirmationParams) {
  // Read lazily on the client; SSR renders signed-out, where it is unused.
  const [isSnoozed, setIsSnoozed] = useState(readSnoozed);
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null);

  // Same identity rule as App.tsx's account-data cleanup: only a real
  // sign-out or account switch re-arms the prompt, not a page reload of the
  // same account (authUserId is null before auth resolves).
  const previousAuthUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthResolved) return;
    const previous = previousAuthUserIdRef.current;
    previousAuthUserIdRef.current = authUserId;
    if (previous && previous !== authUserId) {
      clearSnoozeFlag();
      setIsSnoozed(false);
      setSaveErrorKey(null);
    }
  }, [authUserId, isAuthResolved]);

  const isOpen =
    Boolean(authUserId && authSession) &&
    isProfileLoaded &&
    userProfile.ageConfirmationRequired &&
    !isBlocked &&
    !isSnoozed;

  const handleLater = () => {
    try {
      window.sessionStorage.setItem(AGE_CONFIRMATION_SNOOZE_KEY, "1");
    } catch {
      // Without storage it is postponed until the next page load.
    }
    setIsSnoozed(true);
    setSaveErrorKey(null);
  };

  const handleConfirm = (values: AgeConfirmationValues) => {
    if (!authSession || !authUserId || isSaving) return;
    setIsSaving(true);
    setSaveErrorKey(null);
    void updateUserProfileDemographics(authSession, values)
      .then((result) => {
        const nextProfile = writeStoredUserProfile(authUserId, { ...userProfile, ...result });
        onConfirmed({
          age: nextProfile.age ?? values.age,
          birthMonth: nextProfile.birthMonth || values.birthMonth,
          birthDay: nextProfile.birthDay || values.birthDay,
          updatedAt: nextProfile.updatedAt ?? "",
          ...(nextProfile.birthYear !== null
            ? { birthYear: nextProfile.birthYear, ageConfirmedAt: nextProfile.ageConfirmedAt }
            : {}),
        });
        if (nextProfile.birthYear === null) {
          // Database without automatic age: nothing more to confirm.
          setIsSnoozed(true);
        }
      })
      .catch((error) => {
        const diagnostics = describeSupabaseError("updateUserProfileDemographics", error);
        console.warn("useAgeConfirmation: failed to confirm age.", diagnostics);
        setSaveErrorKey(resolveSupabaseErrorMessageKey(diagnostics.category, "ageConfirmation.saveError"));
      })
      .finally(() => setIsSaving(false));
  };

  return { isOpen, isSaving, saveErrorKey, handleConfirm, handleLater };
}
