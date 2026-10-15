import { useEffect, useRef } from "react";
import type { UiLanguageCode } from "../../data/seo/shared/slugs";
import { readStoredUiLanguage, type UILanguage } from "../../contexts/LanguageContext";

export function useRouteLanguageSync(
  routeUILanguage: UiLanguageCode | null,
  uiLanguage: UILanguage,
  setUILanguage: (lang: UILanguage) => void,
): void {
  // Routes without a language in the URL are prerendered in English, and
  // LanguageProvider hydrates with that SSR language to avoid a mismatch.
  // Once after mount, restore the user's saved UI language for those routes
  // so a reload doesn't reset it. Language-prefixed routes stay URL-driven.
  const didRestoreStoredRef = useRef(false);
  useEffect(() => {
    if (didRestoreStoredRef.current) {
      return;
    }
    didRestoreStoredRef.current = true;

    if (routeUILanguage) {
      return;
    }
    const stored = readStoredUiLanguage();
    if (stored && stored !== uiLanguage) {
      setUILanguage(stored);
    }
  }, [routeUILanguage, setUILanguage, uiLanguage]);

  useEffect(() => {
    if (routeUILanguage && uiLanguage !== routeUILanguage) {
      setUILanguage(routeUILanguage);
    }
  }, [routeUILanguage, setUILanguage, uiLanguage]);
}
