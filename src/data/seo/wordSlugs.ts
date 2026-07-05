import {
  SUPPORTED_UI_LANGUAGES,
  SUPPORTED_TARGET_LANGUAGES,
  isSupportedUiLanguage,
  type UiLanguageCode,
  type TargetLanguageSlug,
} from "./slugs";
import { fixMojibake } from "../../utils/fixMojibake";

export interface WordRouteMatch {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId: string | null;
}

export interface CanonicalWordRouteMatch extends WordRouteMatch {
  routeKind: "canonical";
  conceptId: string;
}

export interface LegacyWordRouteMatch extends WordRouteMatch {
  routeKind: "legacy-single-hyphen";
  conceptId: string;
}

export interface SlugOnlyWordRouteMatch extends WordRouteMatch {
  routeKind: "slug-only";
  conceptId: null;
}

export interface CanonicalWordPageRouteMatch extends CanonicalWordRouteMatch {
  browsePage: number;
}

export type ParsedWordRoute =
  | CanonicalWordRouteMatch
  | LegacyWordRouteMatch
  | SlugOnlyWordRouteMatch;

// Only these word-page families are emitted as crawlable HTML today.
export const CRAWLABLE_WORD_TARGET_LANGUAGES = ["english"] as const;

const CONCEPT_ID_PATTERN = /^(A1|A2|B1|B2|C1|C2)-\d{5}$/;

export function hasCrawlableWordSeoFamily(
  targetLanguage: TargetLanguageSlug,
): boolean {
  return (
    CRAWLABLE_WORD_TARGET_LANGUAGES as readonly TargetLanguageSlug[]
  ).includes(targetLanguage);
}

export function wordToSlug(lemma: string): string {
  return lemma
    .normalize("NFC")
    .toLowerCase()
    .replace(/['’‘`]/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildWordPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordLemma: string,
  conceptId?: string | null,
): string {
  return buildWordPathFromSlug(
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
  const base = `/${uiLang}/${targetLanguage}-word-${wordSlug}`;
  if (!conceptId || !conceptId.trim()) return base;
  return `${base}--${conceptId.trim()}`;
}

export function buildWordBrowsePagePathFromSlug(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordSlug: string,
  conceptId: string,
  page: number,
): string {
  const canonicalPath = buildWordPathFromSlug(uiLang, targetLanguage, wordSlug, conceptId);
  return page <= 1 ? canonicalPath : `${canonicalPath}/browse/page/${page}`;
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

export function parseWordRoute(
  uiLangRaw: string,
  slug: string,
): ParsedWordRoute | null {
  if (!isSupportedUiLanguage(uiLangRaw)) return null;
  let decodedSlug = slug;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  for (const targetLanguage of SUPPORTED_TARGET_LANGUAGES) {
    const prefix = `${targetLanguage}-word-`;
    if (decodedSlug.startsWith(prefix)) {
      const suffix = decodedSlug.slice(prefix.length);
      if (!suffix) {
        return null;
      }

      const canonicalParts = suffix.split("--");
      if (suffix.includes("--") && canonicalParts.length !== 2) {
        return null;
      }
      if (canonicalParts.length === 2) {
        const [wordSlug, conceptIdRaw] = canonicalParts;
        const conceptId = conceptIdRaw.trim();
        if (wordSlug.length === 0 || !CONCEPT_ID_PATTERN.test(conceptId)) {
          return null;
        }

        return {
          routeKind: "canonical",
          uiLang: uiLangRaw,
          targetLanguage,
          wordSlug,
          conceptId,
        };
      }

      const legacyMatch = suffix.match(/^(.*)-((?:A1|A2|B1|B2|C1|C2)-\d{5})$/);
      if (legacyMatch) {
        const [, wordSlug, conceptId] = legacyMatch;
        if (wordSlug.length === 0) {
          return null;
        }

        return {
          routeKind: "legacy-single-hyphen",
          uiLang: uiLangRaw,
          targetLanguage,
          wordSlug,
          conceptId,
        };
      }

      return {
        routeKind: "slug-only",
        uiLang: uiLangRaw,
        targetLanguage,
        wordSlug: suffix,
        conceptId: null,
      };
    }
  }
  return null;
}

export function resolveWordRoute(
  uiLangRaw: string,
  slug: string,
): CanonicalWordRouteMatch | null {
  const parsedRoute = parseWordRoute(uiLangRaw, slug);
  return parsedRoute?.routeKind === "canonical" ? parsedRoute : null;
}

export function resolveWordPageRoute(path: string): CanonicalWordPageRouteMatch | null {
  const match = path.match(/^\/([a-z]{2})\/([^/?#]+)(?:\/browse\/page\/(\d+))?$/);
  if (!match) {
    return null;
  }

  const [, uiLangRaw, slug, browsePageRaw] = match;
  const resolvedRoute = resolveWordRoute(uiLangRaw, slug);
  if (!resolvedRoute) {
    return null;
  }

  const browsePage = browsePageRaw ? Number.parseInt(browsePageRaw, 10) : 1;
  if (!Number.isFinite(browsePage) || browsePage < 1) {
    return null;
  }

  return {
    ...resolvedRoute,
    browsePage,
  };
}

export function getAllWordPaths(
  entries: Array<{ targetLanguage: TargetLanguageSlug; wordLemma: string; conceptId?: string | null }>,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const { targetLanguage, wordLemma, conceptId } of entries) {
    const slug = wordToSlug(wordLemma);
    if (!slug) continue;
    const conceptKey = conceptId?.trim();
    const key = conceptKey ? `${targetLanguage}:${conceptKey}` : `${targetLanguage}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    for (const uiLang of SUPPORTED_UI_LANGUAGES) {
      paths.push(buildWordPath(uiLang, targetLanguage, wordLemma, conceptId));
    }
  }

  return paths;
}
