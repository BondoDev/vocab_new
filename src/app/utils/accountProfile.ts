import {
  isUserProfileComplete,
  normalizeLanguage,
  normalizeUserProfile,
  type UserProfile,
} from "../../lib/userProfile";

interface CurrentProfileLanguages {
  yourLanguage: string;
  practiceLanguage: string;
}

interface BuildMergedUserProfileParams extends CurrentProfileLanguages {
  storedProfile: UserProfile | null;
  supabaseProfile: Partial<UserProfile> | null;
}

export function buildMergedUserProfile({
  storedProfile,
  supabaseProfile,
  yourLanguage,
  practiceLanguage,
}: BuildMergedUserProfileParams): UserProfile {
  return normalizeUserProfile({
    ...storedProfile,
    ...supabaseProfile,
    nickname: supabaseProfile?.nickname || storedProfile?.nickname || "",
    nativeLanguage: normalizeLanguage(
      supabaseProfile?.nativeLanguage ||
        storedProfile?.nativeLanguage ||
        yourLanguage ||
        "",
    ),
    practiceLanguage: normalizeLanguage(
      supabaseProfile?.practiceLanguage ||
        storedProfile?.practiceLanguage ||
        practiceLanguage ||
        "",
    ),
  });
}

export function buildFallbackUserProfile({
  storedProfile,
  yourLanguage,
  practiceLanguage,
}: Omit<BuildMergedUserProfileParams, "supabaseProfile">): UserProfile {
  return normalizeUserProfile({
    ...storedProfile,
    nativeLanguage: normalizeLanguage(
      storedProfile?.nativeLanguage || yourLanguage || "",
    ),
    practiceLanguage: normalizeLanguage(
      storedProfile?.practiceLanguage || practiceLanguage || "",
    ),
  });
}

export function shouldOpenAccountOnboarding(
  hasSupabaseProfileRow: boolean,
  profile: Partial<UserProfile> | null | undefined,
): boolean {
  return !hasSupabaseProfileRow || !isUserProfileComplete(profile);
}

export function buildProfileWithCurrentLanguages(
  profile: UserProfile,
  { yourLanguage, practiceLanguage }: CurrentProfileLanguages,
): UserProfile {
  return normalizeUserProfile({
    ...profile,
    nativeLanguage: normalizeLanguage(yourLanguage || profile.nativeLanguage),
    practiceLanguage: normalizeLanguage(
      practiceLanguage || profile.practiceLanguage,
    ),
  });
}

export function areProfilesJsonEqual(
  firstProfile: UserProfile,
  secondProfile: UserProfile,
): boolean {
  return JSON.stringify(firstProfile) === JSON.stringify(secondProfile);
}

export function isProfileSyncedToCurrentLanguages(
  profile: UserProfile,
  { yourLanguage, practiceLanguage }: CurrentProfileLanguages,
): boolean {
  return (
    profile.nativeLanguage === yourLanguage &&
    profile.practiceLanguage === practiceLanguage
  );
}

export function buildLanguageSyncedProfile(
  profile: UserProfile,
  { yourLanguage, practiceLanguage }: CurrentProfileLanguages,
): UserProfile {
  return {
    ...profile,
    nativeLanguage: yourLanguage as UserProfile["nativeLanguage"],
    practiceLanguage: practiceLanguage as UserProfile["practiceLanguage"],
  };
}

export function applyUserProfilePatch(
  profile: UserProfile,
  patch: Partial<UserProfile>,
): UserProfile {
  return normalizeUserProfile({ ...profile, ...patch });
}

interface BuildAccountOnboardingProfileToSaveParams {
  userProfile: UserProfile;
  nickname: string;
  age: number | null;
  birthMonth: string;
  birthDay: string;
  nativeLanguage: UserProfile["nativeLanguage"];
  practiceLanguage: UserProfile["practiceLanguage"];
}

export function buildAccountOnboardingProfileToSave({
  userProfile,
  nickname,
  age,
  birthMonth,
  birthDay,
  nativeLanguage,
  practiceLanguage,
}: BuildAccountOnboardingProfileToSaveParams): UserProfile {
  return {
    ...userProfile,
    nickname,
    age,
    birthMonth,
    birthDay,
    nativeLanguage,
    practiceLanguage,
    onboardingCompleted: true,
  };
}
