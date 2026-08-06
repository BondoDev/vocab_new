import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { useLanguage } from "../../contexts/LanguageContext";
import type { StoredSupabaseSession } from "../../lib/supabaseAuth";
import {
  writeSupabaseUserProfile,
  writeStoredUserProfile,
  type UserProfile,
} from "../../lib/userProfile";
import {
  classifySupabaseError,
  describeSupabaseError,
  resolveSupabaseErrorMessageKey,
} from "../../lib/supabaseError";
import { applyUserProfilePatch } from "../utils/accountProfile";
import { prepareAccountOnboardingSubmit } from "../utils/accountOnboarding";

// Fallback translation key for onboarding-save failures that aren't one of
// the four universal categories (unauthenticated/forbidden/missing_rpc/
// network — see resolveSupabaseErrorMessageKey in src/lib/supabaseError.ts).
// Carries the exact English text this catch block already showed before
// this fix, now reached deliberately via classification instead of as the
// unconditional fallback for every error.
const ACCOUNT_ONBOARDING_SAVE_FALLBACK_KEY = "accountOnboarding.saveError";

interface UseAccountOnboardingParams {
  authSession: StoredSupabaseSession | null;
  authUserId: string | null;
  getUserProfile: () => UserProfile;
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;
  yourLanguage: string;
  practiceLanguage: string;
  setYourLanguage: Dispatch<SetStateAction<string>>;
  setPracticeLanguage: Dispatch<SetStateAction<string>>;
}

export function useAccountOnboarding({
  authSession,
  authUserId,
  getUserProfile,
  setUserProfile,
  yourLanguage,
  practiceLanguage,
  setYourLanguage,
  setPracticeLanguage,
}: UseAccountOnboardingParams) {
  const { t } = useLanguage();
  const [isAccountOnboardingOpen, setIsAccountOnboardingOpen] = useState(false);
  const [isAccountOnboardingSubmitting, setIsAccountOnboardingSubmitting] =
    useState(false);
  const [accountOnboardingError, setAccountOnboardingError] = useState<
    string | null
  >(null);

  const handleUserProfileChange = (patch: Partial<UserProfile>) => {
    setAccountOnboardingError(null);
    setUserProfile((current) => applyUserProfilePatch(current, patch));

    if (patch.nativeLanguage !== undefined) {
      setYourLanguage(patch.nativeLanguage);
    }

    if (patch.practiceLanguage !== undefined) {
      setPracticeLanguage(patch.practiceLanguage);
    }
  };

  const handleAccountOnboardingSubmit = async () => {
    const submitPreparation = prepareAccountOnboardingSubmit({
      authUserId,
      userProfile: getUserProfile(),
      yourLanguage,
      practiceLanguage,
    });

    if (submitPreparation.ok === false) {
      setAccountOnboardingError(submitPreparation.error);
      return;
    }

    setIsAccountOnboardingSubmitting(true);

    try {
      const profileToSave = submitPreparation.profile;
      const supabaseProfile = authSession
        ? await writeSupabaseUserProfile(authSession, profileToSave)
        : {};
      const nextProfile = writeStoredUserProfile(submitPreparation.authUserId, {
        ...profileToSave,
        ...supabaseProfile,
      });

      setUserProfile(nextProfile);
      setYourLanguage(submitPreparation.nativeLanguage);
      setPracticeLanguage(submitPreparation.practiceLanguage);
      setIsAccountOnboardingOpen(false);
      setAccountOnboardingError(null);
    } catch (error) {
      const category = classifySupabaseError(error);
      // Structured, privacy-safe diagnostics only — never the raw error
      // object (see src/lib/supabaseError.ts's own header for what this
      // deliberately excludes: tokens, session objects, email).
      console.warn(
        "useAccountOnboarding: failed to save account onboarding profile.",
        describeSupabaseError("save account onboarding profile", error),
      );
      // Never error.message: a raw Supabase/PostgreSQL string (RLS denial,
      // constraint violation, ...) must not reach this dialog. The four
      // universal categories resolve to the shared supabaseErrors.* copy;
      // everything else keeps this screen's own onboarding-save fallback.
      setAccountOnboardingError(
        t(resolveSupabaseErrorMessageKey(category, ACCOUNT_ONBOARDING_SAVE_FALLBACK_KEY)),
      );
    } finally {
      setIsAccountOnboardingSubmitting(false);
    }
  };

  return {
    isAccountOnboardingOpen,
    setIsAccountOnboardingOpen,
    isAccountOnboardingSubmitting,
    accountOnboardingError,
    setAccountOnboardingError,
    handleUserProfileChange,
    handleAccountOnboardingSubmit,
  };
}
