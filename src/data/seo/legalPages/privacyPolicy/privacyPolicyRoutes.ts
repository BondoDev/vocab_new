import { SUPPORTED_UI_LANGUAGES, isSupportedUiLanguage, type UiLanguageCode } from "../../shared/slugs";

// Privacy Policy: one page per UI language at /{ui}/privacy. This module is
// the single authority for building and parsing those URLs; consumers (the
// router, SSR/prerender, the header, the language switcher, the analytics
// consent banner) must call it rather than formatting the path themselves.
//
// Kept free of content imports and import.meta.glob so routing and the
// sitemap/prerender code can use it without pulling in document content.

const PRIVACY_POLICY_SLUG = "privacy";

export function getPrivacyPolicyPath(uiLang: UiLanguageCode): string {
  return `/${uiLang}/${PRIVACY_POLICY_SLUG}`;
}

export function resolvePrivacyPolicyRoute(path: string): UiLanguageCode | null {
  const match = /^\/([a-z]{2})\/privacy$/.exec(path);
  return match && isSupportedUiLanguage(match[1]) ? match[1] : null;
}

export function getAllPrivacyPolicyPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map(getPrivacyPolicyPath);
}
