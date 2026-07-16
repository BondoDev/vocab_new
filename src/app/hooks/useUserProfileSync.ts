import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import type { StoredSupabaseSession } from "../../lib/supabaseAuth";
import {
  writeSupabaseUserProfile,
  writeStoredUserProfile,
  type UserProfile,
} from "../../lib/userProfile";
import {
  areProfilesJsonEqual,
  buildLanguageSyncedProfile,
  buildProfileWithCurrentLanguages,
  isProfileSyncedToCurrentLanguages,
} from "../utils/accountProfile";

interface UseUserProfileSyncParams {
  authSession: StoredSupabaseSession | null;
  authUserId: string | null;
  userProfile: UserProfile;
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;
  yourLanguage: string;
  practiceLanguage: string;
}

export function useUserProfileSync({
  authSession,
  authUserId,
  userProfile,
  setUserProfile,
  yourLanguage,
  practiceLanguage,
}: UseUserProfileSyncParams) {
  useEffect(() => {
    if (!authUserId) {
      return;
    }

    setUserProfile((current) => {
      const nextProfile = buildProfileWithCurrentLanguages(current, {
        yourLanguage,
        practiceLanguage,
      });

      return areProfilesJsonEqual(nextProfile, current) ? current : nextProfile;
    });
  }, [authUserId, practiceLanguage, yourLanguage]);

  const lastSyncedLanguagesRef = useRef("");

  useEffect(() => {
    if (
      !authSession ||
      !authUserId ||
      !userProfile.onboardingCompleted ||
      !yourLanguage ||
      !practiceLanguage
    ) {
      return;
    }

    if (
      isProfileSyncedToCurrentLanguages(userProfile, {
        yourLanguage,
        practiceLanguage,
      })
    ) {
      return;
    }

    // A late profile GET can reset userProfile to stale server languages and
    // re-run this effect; the sync key prevents re-writing the same values.
    const syncKey = `${authUserId}:${yourLanguage}:${practiceLanguage}`;
    if (lastSyncedLanguagesRef.current === syncKey) {
      return;
    }
    lastSyncedLanguagesRef.current = syncKey;

    const nextProfile = writeStoredUserProfile(
      authUserId,
      buildLanguageSyncedProfile(userProfile, {
        yourLanguage,
        practiceLanguage,
      }),
    );

    setUserProfile(nextProfile);
    void writeSupabaseUserProfile(authSession, nextProfile).catch(() => {});
  }, [authSession, authUserId, practiceLanguage, userProfile, yourLanguage]);
}
