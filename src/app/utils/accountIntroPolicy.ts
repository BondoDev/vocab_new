// Deliberately import-free: scripts/tests/account/test-account-intro-popup.mjs loads this
// file directly via Node's native TypeScript stripping (see
// storedLanguagePreferencePolicy.ts for why extensionless relative imports
// block that path). Keeping this file dependency-free is what lets the
// regression test exercise the real decision logic instead of a
// reimplementation of it.
//
// Owns the two pure decisions behind the anonymous "account intro" popup
// (shown once on the Filters page right after a brand-new visitor finishes
// the Languages page's language-selection flow for the first time):
//   1. shouldSignalAccountIntro - on the Languages page's Continue click,
//      should the one-time navigation signal be attached to the Filters
//      navigation at all?
//   2. shouldOpenAccountIntro - on the Filters page, given that a signal
//      arrived, should the popup actually open right now?
//
// "First-time" is decided from whether a *complete* language pair was
// already in localStorage before this Continue click saved anything -
// deliberately captured before that save (see useStoredAppPreferences.ts's
// mount effect), never re-derived afterward, since by then localStorage is
// never empty.

export interface ShouldSignalAccountIntroInput {
  isAuthenticated: boolean;
  // Whether a complete native+learning language pair was already stored in
  // localStorage before this Continue click's save - i.e. hasCompleteLanguagePair
  // (see languageProfileSyncPolicy.ts) applied to the *pre-save* stored pair.
  hadCompleteStoredLanguagePairBeforeSetup: boolean;
}

export function shouldSignalAccountIntro(
  input: ShouldSignalAccountIntroInput,
): boolean {
  return (
    !input.isAuthenticated && !input.hadCompleteStoredLanguagePairBeforeSetup
  );
}

export interface ShouldOpenAccountIntroInput {
  // Whether the Filters page just consumed a one-time showAccountIntro nav
  // signal (regardless of whether auth status is known yet).
  hasPendingIntroSignal: boolean;
  // False while auth status has not been read from storage yet - the popup
  // must never open (even for a moment) until this is true, so a signed-in
  // user is never shown it, not even for a single frame.
  isAuthResolved: boolean;
  isAuthenticated: boolean;
}

export function shouldOpenAccountIntro(
  input: ShouldOpenAccountIntroInput,
): boolean {
  if (!input.hasPendingIntroSignal || !input.isAuthResolved) {
    return false;
  }
  return !input.isAuthenticated;
}
