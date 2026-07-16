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
      error: string;
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
    return { ok: false, error: "Sign in again to finish your profile." };
  }

  if (!nickname) {
    return { ok: false, error: "Please choose a nickname." };
  }

  if (!startsWithLetter(nickname)) {
    return { ok: false, error: "Nickname must start with a letter." };
  }

  if (!userProfile.languageLevel) {
    return { ok: false, error: "Please choose your language level." };
  }

  if (age === null) {
    return { ok: false, error: "Please set your age." };
  }

  if (!birthMonth || !birthDay) {
    return {
      ok: false,
      error: "Please choose your birth month and day.",
    };
  }

  if (!nativeLanguage || !nextPracticeLanguage) {
    return { ok: false, error: "Please choose both languages." };
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
