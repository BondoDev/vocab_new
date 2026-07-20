import {
  CRAWLABLE_WORD_TARGET_LANGUAGES,
  buildCanonicalWordPathFromSlug,
  buildWordBrowsePagePathFromSlug,
  buildWordRouteLookupKey,
  hasCrawlableWordSeoFamily,
  parseWordRoute as parseWordRouteFromManifest,
  parseWordRoutePathname,
  resolveWordPageRoute,
  resolveWordRoute,
  stripDiacriticsForComparison,
  wordToSlug,
  type CanonicalWordPageRouteMatch,
  type CanonicalWordRouteMatch,
  type LegacySlugFormatWordRouteMatch,
  type LegacyWordRouteMatch,
  type ParsedWordRoute,
  type SlugOnlyWordRouteMatch,
  type WordRouteMatch,
} from "./wordRouteManifest";
import {
  SUPPORTED_UI_LANGUAGES,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../slugs";
import { fixMojibake } from "../../../utils/fixMojibake";

export type {
  CanonicalWordPageRouteMatch,
  CanonicalWordRouteMatch,
  LegacySlugFormatWordRouteMatch,
  LegacyWordRouteMatch,
  ParsedWordRoute,
  SlugOnlyWordRouteMatch,
  WordRouteMatch,
};

export {
  CRAWLABLE_WORD_TARGET_LANGUAGES,
  hasCrawlableWordSeoFamily,
  parseWordRoutePathname,
  resolveWordPageRoute,
  resolveWordRoute,
};

export { stripDiacriticsForComparison, wordToSlug };

export function buildWordPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordLemma: string,
  conceptId?: string | null,
): string {
  return buildCanonicalWordPathFromSlug(
    uiLang,
    targetLanguage,
    wordToSlug(fixMojibake(wordLemma)),
    conceptId,
  );
}

export function buildWordPathFromSlug(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordSlug: string,
  conceptId?: string | null,
): string {
  return buildCanonicalWordPathFromSlug(uiLang, targetLanguage, wordSlug, conceptId);
}

export function buildWordBrowsePagePath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordLemma: string,
  conceptId: string,
  page: number,
): string {
  return buildWordBrowsePagePathFromSlug(
    uiLang,
    targetLanguage,
    wordToSlug(fixMojibake(wordLemma)),
    conceptId,
    page,
  );
}

export { buildWordBrowsePagePathFromSlug };

export function parseWordRoute(
  uiLangRaw: string,
  slug: string,
): ParsedWordRoute | null {
  return parseWordRouteFromManifest(uiLangRaw, slug);
}

export function getAllWordPaths(
  entries: Array<{ targetLanguage: TargetLanguageSlug; wordLemma: string; conceptId?: string | null }>,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const { targetLanguage, wordLemma, conceptId } of entries) {
    const slug = wordToSlug(wordLemma);
    if (!slug) continue;
    const key = buildWordRouteLookupKey(targetLanguage, conceptId, slug);
    if (seen.has(key)) continue;
    seen.add(key);

    for (const uiLang of SUPPORTED_UI_LANGUAGES) {
      paths.push(buildWordPath(uiLang, targetLanguage, wordLemma, conceptId));
    }
  }

  return paths;
}
