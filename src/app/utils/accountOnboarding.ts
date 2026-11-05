import {
  startsWithLetter,
  type UserProfile,
} from "../../lib/userProfile";
import { getOnboardingAgeIssue } from "./accountOnboardingAge";
import { calendarDateInTimeZone, getDeclaredAgeIssue, type CalendarDate } from "./accountAge";
import { detectBrowserTimezone } from "./browserTimezone";

interface PrepareAccountOnboardingSubmitParams {
  authUserId: string | null;
  userProfile: UserProfile;
  yourLanguage: string;
  practiceLanguage: string;
  // Injectable for tests; defaults to today in the browser's time zone.
  today?: CalendarDate;
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
  today,
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

  const ageIssue = getOnboardingAgeIssue(age);
  if (ageIssue) {
    return {
      ok: false,
      errorKey:
        ageIssue === "belowMinimum"
          ? "accountOnboarding.errors.ageMinimum"
          : "accountOnboarding.errors.ageOutOfRange",
    };
  }

  if (!birthMonth || !birthDay) {
    return { ok: false, errorKey: "accountOnboarding.errors.birthDateRequired" };
  }

  // Early, specific feedback only; the server repeats both checks with its
  // own clock (complete_user_profile_onboarding).
  const birthDateIssue = getDeclaredAgeIssue(
    age,
    Number(birthMonth),
    Number(birthDay),
    today ?? calendarDateInTimeZone(new Date(), detectBrowserTimezone()),
  );
  if (birthDateIssue) {
    return {
      ok: false,
      errorKey:
        birthDateIssue === "invalidBirthDate"
          ? "accountOnboarding.errors.birthDateInvalid"
          : "accountOnboarding.errors.birthDateLeapDay",
    };
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
