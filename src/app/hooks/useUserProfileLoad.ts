import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import {
  EMPTY_USER_PROFILE,
  readSupabaseUserProfile,
  readStoredUserProfile,
  type UserProfile,
} from "../../lib/userProfile";
import {
  buildFallbackUserProfile,
  buildMergedUserProfile,
  shouldOpenAccountOnboarding,
} from "../utils/accountProfile";

interface UseUserProfileLoadParams {
  authUserId: string | null;
  yourLanguage: string;
  practiceLanguage: string;
  setYourLanguage: Dispatch<SetStateAction<string>>;
  setPracticeLanguage: Dispatch<SetStateAction<string>>;
  setIsAccountOnboardingOpen: Dispatch<SetStateAction<boolean>>;
  setAccountOnboardingError: Dispatch<SetStateAction<string | null>>;
}

export function useUserProfileLoad({
  authUserId,
  yourLanguage,
  practiceLanguage,
  setYourLanguage,
  setPracticeLanguage,
  setIsAccountOnboardingOpen,
  setAccountOnboardingError,
}: UseUserProfileLoadParams) {
  const [userProfile, setUserProfile] =
    useState<UserProfile>(EMPTY_USER_PROFILE);

  // Languages are read through a ref so language changes don't refire the
  // profile fetch below - they are only fallbacks, not fetch inputs.
  const languagesRef = useRef({ yourLanguage, practiceLanguage });
  useEffect(() => {
    languagesRef.current = { yourLanguage, practiceLanguage };
  });

  useEffect(() => {
    if (!authUserId) {
      setUserProfile(EMPTY_USER_PROFILE);
      setIsAccountOnboardingOpen(false);
      setAccountOnboardingError(null);
      return;
    }

    let cancelled = false;
    const storedProfile = readStoredUserProfile(authUserId);

    void (async () => {
      try {
        // Read the session from storage: token refreshes replace the session
        // object, and depending on it here would refetch the profile each time.
        const session = getStoredSupabaseSession();
        const supabaseProfile = session
          ? await readSupabaseUserProfile(session)
          : null;
        const hasSupabaseProfileRow = Boolean(supabaseProfile);
        if (cancelled) {
          return;
        }

        const {
          yourLanguage: currentYourLanguage,
          practiceLanguage: currentPracticeLanguage,
        } = languagesRef.current;
        const nextProfile = buildMergedUserProfile({
          storedProfile,
          supabaseProfile,
          yourLanguage: currentYourLanguage,
          practiceLanguage: currentPracticeLanguage,
        });

        if (!currentYourLanguage && nextProfile.nativeLanguage) {
          setYourLanguage(nextProfile.nativeLanguage);
        }
        if (!currentPracticeLanguage && nextProfile.practiceLanguage) {
          setPracticeLanguage(nextProfile.practiceLanguage);
        }

        setUserProfile(nextProfile);
        setIsAccountOnboardingOpen(
          shouldOpenAccountOnboarding(hasSupabaseProfileRow, nextProfile),
        );
        setAccountOnboardingError(null);
      } catch {
        if (cancelled) {
          return;
        }

        const fallbackProfile = buildFallbackUserProfile({
          storedProfile,
          yourLanguage: languagesRef.current.yourLanguage,
          practiceLanguage: languagesRef.current.practiceLanguage,
        });

        setUserProfile(fallbackProfile);
        setIsAccountOnboardingOpen(
          shouldOpenAccountOnboarding(true, fallbackProfile),
        );
        setAccountOnboardingError(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  return { userProfile, setUserProfile };
}
