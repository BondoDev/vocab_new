// Deliberately import-free: scripts/tests/account/test-account-language-sync.mjs loads this
// file directly via Node's native TypeScript stripping (see
// storedLanguagePreferencePolicy.ts for why extensionless relative imports
// block that path). Keeping this file dependency-free is what lets the
// regression test exercise the real decision logic instead of a
// reimplementation of it.
//
// Owns the two pure decisions behind the Languages-page/signed-in-profile
// language conflict fix:
//   1. resolveHydratedLanguagePair - on profile load, does the saved Supabase
//      pair take priority over whatever the live app language state is?
//   2. shouldConfirmAccountLanguageChange - on the Languages page's Continue
//      click, does the current selection differ from the saved profile pair
//      enough to need the "Use selected / Save to account / Cancel" popup?

export interface AccountLanguagePair {
  nativeLanguage: string;
  practiceLanguage: string;
}

export function hasCompleteLanguagePair(pair: AccountLanguagePair): boolean {
  return Boolean(pair.nativeLanguage && pair.practiceLanguage);
}

export interface ResolveHydratedLanguagePairInput {
  // The raw pair read back from the Supabase profile row on this load, not
  // merged with any local fallback - only this tells us whether the account
  // actually has a saved pair.
  supabaseLanguages: AccountLanguagePair;
  // The fallback-filled pair (Supabase -> local cache -> current selection)
  // used when Supabase has no valid pair yet.
  mergedLanguages: AccountLanguagePair;
  // The live app-wide selection at the moment the profile finished loading.
  currentLanguages: AccountLanguagePair;
}

export interface ResolveHydratedLanguagePairResult {
  // null means "leave this value as it currently is".
  nativeLanguage: string | null;
  practiceLanguage: string | null;
}

// Product rule: a complete saved Supabase pair has priority over whatever is
// currently selected (stale anonymous/local values must not win). When
// Supabase has no valid pair yet, fall back to the pre-existing fill-blanks-
// only behavior so onboarding/anonymous flows are unaffected.
export function resolveHydratedLanguagePair(
  input: ResolveHydratedLanguagePairInput,
): ResolveHydratedLanguagePairResult {
  if (hasCompleteLanguagePair(input.supabaseLanguages)) {
    return {
      nativeLanguage: input.supabaseLanguages.nativeLanguage,
      practiceLanguage: input.supabaseLanguages.practiceLanguage,
    };
  }

  return {
    nativeLanguage:
      !input.currentLanguages.nativeLanguage && input.mergedLanguages.nativeLanguage
        ? input.mergedLanguages.nativeLanguage
        : null,
    practiceLanguage:
      !input.currentLanguages.practiceLanguage && input.mergedLanguages.practiceLanguage
        ? input.mergedLanguages.practiceLanguage
        : null,
  };
}

export interface ShouldConfirmAccountLanguageChangeInput {
  isSignedIn: boolean;
  // False while the authenticated profile's language pair is not yet known
  // (fetch in flight). The popup must never show until this is true.
  isProfileLoaded: boolean;
  profileLanguages: AccountLanguagePair;
  selectedLanguages: AccountLanguagePair;
}

export function shouldConfirmAccountLanguageChange(
  input: ShouldConfirmAccountLanguageChangeInput,
): boolean {
  if (!input.isSignedIn || !input.isProfileLoaded) {
    return false;
  }

  // No valid saved pair yet (never onboarded, or profile still incomplete):
  // preserve existing fallback/onboarding behavior instead of inventing a
  // new flow.
  if (!hasCompleteLanguagePair(input.profileLanguages)) {
    return false;
  }

  return (
    input.profileLanguages.nativeLanguage !== input.selectedLanguages.nativeLanguage ||
    input.profileLanguages.practiceLanguage !== input.selectedLanguages.practiceLanguage
  );
}
