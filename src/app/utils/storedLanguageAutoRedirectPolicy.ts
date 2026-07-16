import type { PageKey } from "./pageRouting";

export interface StoredLanguageAutoRedirectPolicyInput {
  resolvedPage: PageKey;
  startedOnLanguagePage: boolean;
  startedOnLegacyPracticePage: boolean;
  startedFromReload: boolean;
  shouldAutoRedirectFromStoredLanguages: boolean;
  isContinueDisabled: boolean;
  hasAutoRedirected: boolean;
}

export function shouldAutoRedirectStoredLanguages({
  resolvedPage,
  startedOnLanguagePage,
  startedOnLegacyPracticePage,
  startedFromReload,
  shouldAutoRedirectFromStoredLanguages,
  isContinueDisabled,
  hasAutoRedirected,
}: StoredLanguageAutoRedirectPolicyInput): boolean {
  if (
    hasAutoRedirected ||
    !shouldAutoRedirectFromStoredLanguages ||
    isContinueDisabled
  ) {
    return false;
  }

  if (
    resolvedPage === "language" &&
    startedOnLanguagePage &&
    !startedFromReload
  ) {
    return true;
  }

  return resolvedPage === "practice" && startedOnLegacyPracticePage;
}
