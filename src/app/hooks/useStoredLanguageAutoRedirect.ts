import { useEffect, useRef, type MutableRefObject } from "react";
import type { NavigateFunction } from "react-router";

import type { PageKey } from "../utils/pageRouting";
import { shouldAutoRedirectStoredLanguages } from "../utils/storedLanguageAutoRedirectPolicy";

export interface UseStoredLanguageAutoRedirectParams {
  resolvedPage: PageKey;
  initialPathname: string;
  startedOnLanguagePage: boolean;
  isContinueDisabled: boolean;
  shouldAutoRedirectFromStoredLanguagesRef: MutableRefObject<boolean>;
  navigate: NavigateFunction;
  legacyPracticePath: string;
  exerciseSelectionPath: string;
}

export function useStoredLanguageAutoRedirect({
  resolvedPage,
  initialPathname,
  startedOnLanguagePage,
  isContinueDisabled,
  shouldAutoRedirectFromStoredLanguagesRef,
  navigate,
  legacyPracticePath,
  exerciseSelectionPath,
}: UseStoredLanguageAutoRedirectParams): void {
  // One-shot per mount: once the redirect fires, this must never re-arm,
  // even though isContinueDisabled/resolvedPage legitimately re-run this
  // effect later (e.g. the user finishes selecting a language after the
  // first check declined). Do not lift this into reactive state or add it
  // (or the refs below) to the effect's dependency array — either would let
  // a later re-run treat itself as a fresh initial entry and call
  // navigate() again, causing a redirect loop / route oscillation instead
  // of the intended single auto-redirect.
  const hasAutoRedirectedRef = useRef(false);
  const initialPathRef = useRef(initialPathname);
  const startedOnLanguagePageRef = useRef(startedOnLanguagePage);
  const startedFromReloadRef = useRef(
    typeof window !== "undefined" &&
      window.performance
        .getEntriesByType("navigation")
        .some(
          (entry) =>
            "type" in entry &&
            (entry as PerformanceNavigationTiming).type === "reload",
        ),
  );

  useEffect(() => {
    const startedOnLegacyPracticePage =
      initialPathRef.current === legacyPracticePath;

    if (
      !shouldAutoRedirectStoredLanguages({
        resolvedPage,
        startedOnLanguagePage: startedOnLanguagePageRef.current,
        startedOnLegacyPracticePage,
        startedFromReload: startedFromReloadRef.current,
        shouldAutoRedirectFromStoredLanguages:
          shouldAutoRedirectFromStoredLanguagesRef.current,
        isContinueDisabled,
        hasAutoRedirected: hasAutoRedirectedRef.current,
      })
    ) {
      return;
    }

    hasAutoRedirectedRef.current = true;
    navigate(exerciseSelectionPath, { replace: true });
  }, [isContinueDisabled, navigate, resolvedPage]);
}
