import { useEffect } from "react";
import type { UiLanguageCode } from "../../data/seo/slugs";
import type { UILanguage } from "../../contexts/LanguageContext";

export function useRouteLanguageSync(
  routeUILanguage: UiLanguageCode | null,
  uiLanguage: UILanguage,
  setUILanguage: (lang: UILanguage) => void,
): void {
  useEffect(() => {
    if (routeUILanguage && uiLanguage !== routeUILanguage) {
      setUILanguage(routeUILanguage);
    }
  }, [routeUILanguage, setUILanguage, uiLanguage]);
}
