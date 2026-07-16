import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { StoredSupabaseSession } from "../../lib/supabaseAuth";
import {
  writeSupabaseUserProfile,
  writeStoredUserProfile,
  type UserProfile,
} from "../../lib/userProfile";
import { applyUserProfilePatch } from "../utils/accountProfile";
import { prepareAccountOnboardingSubmit } from "../utils/accountOnboarding";

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
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "We could not save your profile. Please try again.";
      setAccountOnboardingError(message);
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
