// Owns the canonical practice-route <-> language-state synchronization
// lifecycle extracted from App.tsx: the live practiceRoute parse plus the
// route->state and state->URL effects. Mechanical extraction only — neither
// effect's behavior, guard, or dependency array changes here.
//
// Deliberately narrow scope: this hook does NOT own initialPracticeRouteRef
// (App.tsx must compute that before calling useStoredAppPreferences, which
// runs before this hook — see App.tsx) and does NOT own the stored-language
// auto-redirect refs/effect, which read state this hook produces and must
// stay registered after it.
//
// Call-order contract: must be called after useRouteLanguageSync(...) and
// before the stored-language auto-redirect effect in App.tsx's AppContent,
// matching the exact position of the two effects it replaces.
import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { NavigateFunction } from "react-router";
import type { UILanguage } from "../../contexts/LanguageContext";
import {
  buildPracticeRoute,
  parsePracticeRoute,
  type InteractiveRouteMap,
  type PageKey,
} from "../utils/pageRouting";
import { shouldCanonicalizePracticeRoute } from "../utils/practiceRouteCanonicalizationPolicy";

export interface UsePracticeRouteLanguageSyncParams {
  pathname: string;
  resolvedPage: PageKey;
  yourLanguage: string;
  practiceLanguage: string;
  setYourLanguage: Dispatch<SetStateAction<string>>;
  setPracticeLanguage: Dispatch<SetStateAction<string>>;
  navigate: NavigateFunction;
  routes: Pick<InteractiveRouteMap, "exerciseSelection">;
}

export function usePracticeRouteLanguageSync({
  pathname,
  resolvedPage,
  yourLanguage,
  practiceLanguage,
  setYourLanguage,
  setPracticeLanguage,
  navigate,
  routes,
}: UsePracticeRouteLanguageSyncParams): void {
  const practiceRoute = useMemo(
    () => parsePracticeRoute(pathname),
    [pathname],
  );

  useEffect(() => {
    if (resolvedPage !== "practice" || !practiceRoute) {
      return;
    }

    if (yourLanguage !== practiceRoute.yourLanguage) {
      setYourLanguage(practiceRoute.yourLanguage);
    }

    if (practiceLanguage !== practiceRoute.practiceLanguage) {
      setPracticeLanguage(practiceRoute.practiceLanguage);
    }
  }, [practiceLanguage, practiceRoute, resolvedPage, yourLanguage]);

  useEffect(() => {
    if (
      !shouldCanonicalizePracticeRoute(
        resolvedPage,
        practiceRoute !== null,
        yourLanguage,
        practiceLanguage,
      )
    ) {
      return;
    }

    const expectedPath = buildPracticeRoute(
      yourLanguage as UILanguage,
      practiceLanguage as UILanguage,
      routes,
    );
    if (pathname !== expectedPath) {
      navigate(expectedPath, { replace: true });
    }
  }, [
    pathname,
    navigate,
    practiceLanguage,
    practiceRoute,
    resolvedPage,
    yourLanguage,
  ]);
}
