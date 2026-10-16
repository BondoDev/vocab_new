import {
  startsWithLetter,
  type UserProfile,
} from "../../lib/userProfile";

interface PrepareAccountOnboardingSubmitParams {
  authUserId: string | null;
  userProfile: UserProfile;
  yourLanguage: string;
  practiceLanguage: string;
}

type AccountOnboardingSubmitPreparation =
  | {
      ok: false;
      // An interface-locale key under accountOnboarding.errors; the caller
      // resolves it with t() so this pure helper stays locale-agnostic.
      errorKey: string;
    }
  | {
      ok: true;
      authUserId: string;
      profile: UserProfile;
      nativeLanguage: UserProfile["nativeLanguage"];
      practiceLanguage: UserProfile["practiceLanguage"];
    };

export function prepareAccountOnboardingSubmit({
  authUserId,
  userProfile,
  yourLanguage,
  practiceLanguage,
}: PrepareAccountOnboardingSubmitParams): AccountOnboardingSubmitPreparation {
  const nickname = userProfile.nickname.trim();
  const age = userProfile.age;
  const birthMonth = userProfile.birthMonth;
  const birthDay = userProfile.birthDay;
  const nativeLanguage = (userProfile.nativeLanguage ||
    yourLanguage) as UserProfile["nativeLanguage"];
  const nextPracticeLanguage = (userProfile.practiceLanguage ||
    practiceLanguage) as UserProfile["practiceLanguage"];

  if (!authUserId) {
    return { ok: false, errorKey: "accountOnboarding.errors.signInAgain" };
  }

  if (!nickname) {
    return { ok: false, errorKey: "accountOnboarding.errors.nicknameRequired" };
  }

  if (!startsWithLetter(nickname)) {
    return { ok: false, errorKey: "accountOnboarding.errors.nicknameStartsWithLetter" };
  }

  if (!userProfile.languageLevel) {
    return { ok: false, errorKey: "accountOnboarding.errors.levelRequired" };
  }

  if (age === null) {
    return { ok: false, errorKey: "accountOnboarding.errors.ageRequired" };
  }

  if (!birthMonth || !birthDay) {
    return { ok: false, errorKey: "accountOnboarding.errors.birthDateRequired" };
  }

  if (!nativeLanguage || !nextPracticeLanguage) {
    return { ok: false, errorKey: "accountOnboarding.errors.languagesRequired" };
  }

  return {
    ok: true,
    authUserId,
    nativeLanguage,
    practiceLanguage: nextPracticeLanguage,
    profile: {
      ...userProfile,
      nickname,
      age,
      birthMonth,
      birthDay,
      nativeLanguage,
      practiceLanguage: nextPracticeLanguage,
      onboardingCompleted: true,
    },
  };
}
