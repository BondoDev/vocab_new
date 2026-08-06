// Owns the "Languages page vs. signed-in profile pair" confirmation flow:
// deciding whether Continue needs to show the account-language popup, and
// the three popup actions (Use selected languages / Save to account /
// Cancel). Replaces the automatic language-sync-to-Supabase behavior that
// used to live in the now-deleted useUserProfileSync.ts - nothing here ever
// writes to Supabase except the explicit "Save to account" action.
import { useState, type Dispatch, type SetStateAction } from "react";

import { useLanguage } from "../../contexts/LanguageContext";
import type { StoredSupabaseSession } from "../../lib/supabaseAuth";
import {
  writeSupabaseUserProfile,
  writeStoredUserProfile,
  type UserProfile,
} from "../../lib/userProfile";
import { buildLanguageSyncedProfile } from "../utils/accountProfile";
import { saveAccountLanguagePair } from "../utils/accountLanguageSave";
import { shouldConfirmAccountLanguageChange } from "../utils/languageProfileSyncPolicy";

export interface UseAccountLanguageConfirmParams {
  authSession: StoredSupabaseSession | null;
  authUserId: string | null;
  isProfileLoaded: boolean;
  userProfile: UserProfile;
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;
  yourLanguage: string;
  practiceLanguage: string;
  // What to do once it's safe to leave the Languages page (existing
  // navigation flow - unchanged by this hook).
  proceed: () => void;
}

export interface UseAccountLanguageConfirmResult {
  isOpen: boolean;
  isSaving: boolean;
  saveError: string | null;
  // Call this instead of navigating directly from the Languages page's
  // Continue button. Either proceeds immediately or opens the popup.
  attemptContinue: () => void;
  handleUseSelectedLanguages: () => void;
  handleSaveToAccount: () => void;
  handleCancel: () => void;
}

export function useAccountLanguageConfirm({
  authSession,
  authUserId,
  isProfileLoaded,
  userProfile,
  setUserProfile,
  yourLanguage,
  practiceLanguage,
  proceed,
}: UseAccountLanguageConfirmParams): UseAccountLanguageConfirmResult {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const attemptContinue = () => {
    const needsConfirmation = shouldConfirmAccountLanguageChange({
      isSignedIn: Boolean(authUserId),
      isProfileLoaded,
      profileLanguages: {
        nativeLanguage: userProfile.nativeLanguage,
        practiceLanguage: userProfile.practiceLanguage,
      },
      selectedLanguages: {
        nativeLanguage: yourLanguage,
        practiceLanguage: practiceLanguage,
      },
    });

    if (!needsConfirmation) {
      proceed();
      return;
    }

    setSaveError(null);
    setIsOpen(true);
  };

  // Simple temporary/local choice: the selected pair is already the live
  // app-wide state (set by the Languages page's own selectors), so there is
  // nothing to apply here beyond closing the popup and continuing. No
  // Supabase call, no UI-language or exercise-filter changes.
  const handleUseSelectedLanguages = () => {
    if (isSaving) {
      return;
    }
    setIsOpen(false);
    setSaveError(null);
    proceed();
  };

  const handleSaveToAccount = () => {
    if (isSaving || !authSession || !authUserId) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    void saveAccountLanguagePair<UserProfile, Partial<UserProfile>>({
      buildPatchedProfile: () =>
        buildLanguageSyncedProfile(userProfile, { yourLanguage, practiceLanguage }),
      writeSupabaseUserProfile: (profile) => writeSupabaseUserProfile(authSession, profile),
      writeStoredUserProfile: (profile) => writeStoredUserProfile(authUserId, profile),
    }).then((result) => {
      setIsSaving(false);

      if (result.ok === false) {
        // Keep the popup open with the failure visible and the user's
        // selections untouched, so they can retry or fall back to
        // "Use selected languages". result.error is a translation key (see
        // accountLanguageSave.ts's own header) — never a raw Supabase/
        // PostgreSQL message — translated here since that module stays
        // React/i18n-free for Node-testability.
        setSaveError(t(result.error));
        return;
      }

      setUserProfile(result.profile);
      setIsOpen(false);
      proceed();
    });
  };

  const handleCancel = () => {
    if (isSaving) {
      return;
    }
    setIsOpen(false);
    setSaveError(null);
    // Deliberately does not touch yourLanguage/practiceLanguage or
    // userProfile - the user's edited selections stay visible on the page.
  };

  return {
    isOpen,
    isSaving,
    saveError,
    attemptContinue,
    handleUseSelectedLanguages,
    handleSaveToAccount,
    handleCancel,
  };
}
