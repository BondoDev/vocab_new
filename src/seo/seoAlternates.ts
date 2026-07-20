import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../data/seo/shared/slugs";
import { fixMojibake } from "../utils/fixMojibake";
import type { SeoAlternateLink } from "./SeoContext";

export function normalizeOrigin(siteOrigin: string): string {
  return siteOrigin.endsWith("/") ? siteOrigin.slice(0, -1) : siteOrigin;
}

export function sanitizeMetadataText(value: string): string {
  return fixMojibake(value);
}

/**
 * Builds the standard hreflang alternate-link set: one entry per supported UI
 * language (skipped when `getHref` returns null/undefined for that language)
 * plus a trailing "x-default" entry. Consolidates the identical pattern that
 * was previously duplicated inline across every SeoMetadata-returning builder
 * in this module.
 */
export function buildHreflangAlternates(
  getHref: (uiLang: UiLanguageCode) => string | null | undefined,
  xDefaultHref: string,
): SeoAlternateLink[] {
  return [
    ...SUPPORTED_UI_LANGUAGES.flatMap((lang) => {
      const href = getHref(lang);
      return href ? [{ hreflang: lang, href }] : [];
    }),
    {
      hreflang: "x-default",
      href: xDefaultHref,
    },
  ];
}
