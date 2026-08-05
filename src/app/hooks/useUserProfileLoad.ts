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
import { describeSupabaseError } from "../../lib/supabaseError";
import {
  buildFallbackUserProfile,
  buildMergedUserProfile,
  shouldOpenAccountOnboarding,
} from "../utils/accountProfile";
import { resolveHydratedLanguagePair } from "../utils/languageProfileSyncPolicy";

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
  // False while a signed-in user's profile fetch is in flight. Consumers
  // (the Languages-page account-confirmation popup) must not compare
  // against userProfile's language pair until this is true, so a
  // not-yet-loaded profile is never mistaken for "no saved pair".
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);

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
      // Nothing to load for a signed-out visitor - trivially "known".
      setIsProfileLoaded(true);
      return;
    }

    let cancelled = false;
    // A new authUserId means any previously loaded profile belongs to a
    // different account - it must not be treated as "loaded" for this one
    // until its own fetch resolves.
    setIsProfileLoaded(false);
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

        // A complete saved Supabase pair has priority over whatever is
        // currently selected - a stale anonymous/local value must not win
        // over the account's real saved languages. When Supabase has no
        // valid pair yet, fall back to the pre-existing fill-blanks-only
        // behavior (onboarding/anonymous flows are unaffected).
        const hydratedPair = resolveHydratedLanguagePair({
          supabaseLanguages: {
            nativeLanguage: supabaseProfile?.nativeLanguage ?? "",
            practiceLanguage: supabaseProfile?.practiceLanguage ?? "",
          },
          mergedLanguages: {
            nativeLanguage: nextProfile.nativeLanguage,
            practiceLanguage: nextProfile.practiceLanguage,
          },
          currentLanguages: {
            nativeLanguage: currentYourLanguage,
            practiceLanguage: currentPracticeLanguage,
          },
        });
        if (hydratedPair.nativeLanguage !== null) {
          setYourLanguage(hydratedPair.nativeLanguage);
        }
        if (hydratedPair.practiceLanguage !== null) {
          setPracticeLanguage(hydratedPair.practiceLanguage);
        }

        setUserProfile(nextProfile);
        setIsAccountOnboardingOpen(
          shouldOpenAccountOnboarding(hasSupabaseProfileRow, nextProfile),
        );
        setAccountOnboardingError(null);
        setIsProfileLoaded(true);
      } catch (error) {
        if (cancelled) {
          return;
        }

        // Falls back to the locally-stored/default profile either way (see
        // buildFallbackUserProfile below) — this was previously silent, so
        // a failed load was indistinguishable from "the account genuinely
        // has no saved profile yet." Structured, privacy-safe diagnostics
        // now make the actual cause (session/permissions/network/...)
        // visible in development without changing that fallback behavior.
        console.warn("useUserProfileLoad: failed to load the user profile.", describeSupabaseError("readSupabaseUserProfile", error));

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
        setIsProfileLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  return { userProfile, setUserProfile, isProfileLoaded };
}
