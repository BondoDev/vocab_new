// Owns the "Create account / Log in / Continue as guest" decision gate shown
// on the Languages page's Continue click. Fires in the same situation the
// anonymous account-intro nudge (AccountIntroDialog) used to fire its
// "language-setup" trigger - an anonymous visitor completing their first
// language pair - but *before* navigating to the Filters page instead of
// after, and as an explicit choice rather than a dismissible toast.
//
// Reuses shouldSignalAccountIntro (the same first-time/anonymous
// eligibility rule) and the shared 24h cooldown storage
// (accountIntroStorage.ts) so choosing here also suppresses every other
// account-intro trigger (practice-complete, level-test-complete,
// seo-engagement) for the same window - the visitor has already been asked
// once, asking again minutes later would be redundant, not reassuring. This
// is also why the Languages page's Continue no longer attaches the old
// router-state showAccountIntro signal (see App.tsx): this popup fully
// replaces that trigger.
import { useState } from "react";
import {
  isWithinAccountIntroCooldown,
  shouldSignalAccountIntro,
} from "../utils/accountIntroPolicy";
import {
  markAccountIntroShown,
  readAccountIntroLastShownAtMs,
} from "../utils/accountIntroStorage";

export interface UseLanguageAccountChoiceParams {
  isAuthenticated: boolean;
  // Captured before this Continue click's save - see
  // hadCompleteStoredLanguagePairAtLoadRef's own doc comment
  // (useStoredAppPreferences.ts) for why the pre-save value is the only
  // valid "first-time" source here.
  hadCompleteStoredLanguagePairBeforeSetup: boolean;
  onCreateAccount: () => void;
  onLogIn: () => void;
  onContinueAsGuest: () => void;
}

export interface UseLanguageAccountChoiceResult {
  isOpen: boolean;
  // Call this instead of navigating directly from the Languages page's
  // Continue button. Opens the choice popup for an eligible anonymous
  // first-time visitor; otherwise proceeds exactly like "Continue as guest"
  // with no popup at all (signed-in users, returning visitors, and anyone
  // within the shared cooldown window).
  attemptProceed: () => void;
  handleCreateAccount: () => void;
  handleLogIn: () => void;
  handleContinueAsGuest: () => void;
  // Dismissing (backdrop/close button) without choosing - stays on the
  // Languages page, does not navigate, does not start the cooldown, so
  // clicking Continue again re-offers the same choice.
  close: () => void;
}

export function useLanguageAccountChoice({
  isAuthenticated,
  hadCompleteStoredLanguagePairBeforeSetup,
  onCreateAccount,
  onLogIn,
  onContinueAsGuest,
}: UseLanguageAccountChoiceParams): UseLanguageAccountChoiceResult {
  const [isOpen, setIsOpen] = useState(false);

  const attemptProceed = () => {
    const isEligible = shouldSignalAccountIntro({
      isAuthenticated,
      hadCompleteStoredLanguagePairBeforeSetup,
    });
    const isInCooldown = isWithinAccountIntroCooldown({
      lastShownAtMs: readAccountIntroLastShownAtMs(),
      nowMs: Date.now(),
    });

    if (isEligible && !isInCooldown) {
      setIsOpen(true);
      return;
    }

    onContinueAsGuest();
  };

  // Every explicit choice below - not just "Continue as guest" - starts the
  // shared 24h cooldown: the visitor has already been asked, so no other
  // account-intro trigger should ask again regardless of which option they
  // picked.
  const markShown = () => markAccountIntroShown(Date.now());

  const handleCreateAccount = () => {
    markShown();
    setIsOpen(false);
    onCreateAccount();
  };

  const handleLogIn = () => {
    markShown();
    setIsOpen(false);
    onLogIn();
  };

  const handleContinueAsGuest = () => {
    markShown();
    setIsOpen(false);
    onContinueAsGuest();
  };

  const close = () => setIsOpen(false);

  return {
    isOpen,
    attemptProceed,
    handleCreateAccount,
    handleLogIn,
    handleContinueAsGuest,
    close,
  };
}
