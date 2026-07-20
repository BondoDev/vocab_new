import {
  SUPPORTED_TARGET_LANGUAGES,
  SUPPORTED_UI_LANGUAGES,
  isSupportedUiLanguage,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../shared/slugs";

export const WORD_ROUTE_FAMILY = "word";
export const CRAWLABLE_WORD_TARGET_LANGUAGES = ["english"] as const;
export const WORD_SITEMAP_DEFINITIONS = [
  { fileWordCode: "de", fileUiCode: "en", uiLang: "en", targetLanguage: "german" },
  { fileWordCode: "en", fileUiCode: "en", uiLang: "en", targetLanguage: "english" },
  { fileWordCode: "en", fileUiCode: "sp", uiLang: "es", targetLanguage: "english" },
  { fileWordCode: "en", fileUiCode: "fr", uiLang: "fr", targetLanguage: "english" },
  { fileWordCode: "en", fileUiCode: "de", uiLang: "de", targetLanguage: "english" },
  { fileWordCode: "en", fileUiCode: "it", uiLang: "it", targetLanguage: "english" },
  { fileWordCode: "en", fileUiCode: "pt", uiLang: "pt", targetLanguage: "english" },
  { fileWordCode: "en", fileUiCode: "ru", uiLang: "ru", targetLanguage: "english" },
] as const;

export const WORD_ROUTE_CONCEPT_ID_PATTERN = /^(A1|A2|B1|B2|C1|C2)-\d{5}$/;

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

export interface LegacySlugFormatWordRouteMatch extends WordRouteMatch {
  routeKind: "legacy-slug-format";
  conceptId: string;
}

export interface SlugOnlyWordRouteMatch extends WordRouteMatch {
  routeKind: "slug-only";
  conceptId: null;
}

export type ParsedWordRoute =
  | CanonicalWordRouteMatch
  | LegacyWordRouteMatch
  | LegacySlugFormatWordRouteMatch
  | SlugOnlyWordRouteMatch;

export interface CanonicalWordPageRouteMatch extends CanonicalWordRouteMatch {
  browsePage: number;
}

interface WordPathBase {
  family: typeof WORD_ROUTE_FAMILY;
  pathname: string;
  normalizedPathname: string;
  uiLangRaw: string;
  slug: string;
  browsePage: number;
}

export interface CanonicalWordPathResult extends WordPathBase {
  kind: "canonical";
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId: string;
}

export interface LegacyWordPathResult extends WordPathBase {
  kind: "legacy-single-hyphen";
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId: string;
}

export interface NormalizedSlugAliasPathResult extends WordPathBase {
  kind: "legacy-slug-format";
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId: string;
}

export interface SlugOnlyWordPathResult extends WordPathBase {
  kind: "slug-only";
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId: null;
}

export interface NotWordRouteResult {
  kind: "not-word-route";
  pathname: string;
  normalizedPathname: string;
}

export interface UnsupportedUiLanguageWordRouteResult {
  kind: "unsupported-ui-language";
  family: typeof WORD_ROUTE_FAMILY;
  pathname: string;
  normalizedPathname: string;
  uiLangRaw: string;
  slug: string;
}

export interface UnsupportedTargetLanguageWordRouteResult {
  kind: "unsupported-target-language";
  family: typeof WORD_ROUTE_FAMILY;
  pathname: string;
  normalizedPathname: string;
  uiLangRaw: string;
  uiLang: UiLanguageCode;
  slug: string;
  targetLanguageRaw: string;
}

export interface InvalidConceptIdWordRouteResult extends WordPathBase {
  kind: "invalid-concept-id";
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptIdRaw: string;
}

export interface InvalidBrowsePageWordRouteResult {
  kind: "invalid-browse-page";
  family: typeof WORD_ROUTE_FAMILY;
  pathname: string;
  normalizedPathname: string;
  uiLangRaw: string;
  slug: string;
  browsePageRaw: string;
}

export interface MalformedWordRouteResult {
  kind: "malformed-route";
  family: typeof WORD_ROUTE_FAMILY;
  pathname: string;
  normalizedPathname: string;
  uiLangRaw: string;
  slug: string;
  reason:
    | "invalid-encoding"
    | "missing-word-slug"
    | "malformed-canonical-separator"
    | "invalid-word-slug"
    | "unexpected-trailing-segments";
}

export type ParsedWordRoutePathnameResult =
  | CanonicalWordPathResult
  | LegacyWordPathResult
  | NormalizedSlugAliasPathResult
  | SlugOnlyWordPathResult
  | NotWordRouteResult
  | UnsupportedUiLanguageWordRouteResult
  | UnsupportedTargetLanguageWordRouteResult
  | InvalidConceptIdWordRouteResult
  | InvalidBrowsePageWordRouteResult
  | MalformedWordRouteResult;

function isSupportedTargetLanguage(value: string): value is TargetLanguageSlug {
  return (SUPPORTED_TARGET_LANGUAGES as readonly string[]).includes(value);
}

export function hasCrawlableWordSeoFamily(targetLanguage: TargetLanguageSlug): boolean {
  return (CRAWLABLE_WORD_TARGET_LANGUAGES as readonly TargetLanguageSlug[]).includes(targetLanguage);
}

export function isWordRouteFamily(pathname: string): boolean {
  return parseWordRoutePathname(pathname).kind !== "not-word-route";
}

export function normalizeWordRoutePathname(pathname: string): string {
  const withLeadingSlash = `/${String(pathname ?? "/").replace(/^\/+/, "")}`;
  const normalized = withLeadingSlash.split(/[?#]/, 1)[0] || "/";
  return normalized.length > 1 && normalized.endsWith("/")
    ? normalized.replace(/\/+$/, "")
    : normalized;
}

export function validateWordUiLanguage(value: string): value is UiLanguageCode {
  return isSupportedUiLanguage(value);
}

export function validateWordTargetLanguage(value: string): value is TargetLanguageSlug {
  return isSupportedTargetLanguage(value);
}

export function validateWordConceptId(value: string): boolean {
  return WORD_ROUTE_CONCEPT_ID_PATTERN.test(value.trim());
}

export function wordToSlug(lemma: string): string {
  return lemma
    .normalize("NFC")
    .toLowerCase()
    .replace(/['вЂ™вЂ`]/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripDiacriticsForComparison(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function buildCanonicalWordPathFromSlug(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordSlug: string,
  conceptId?: string | null,
): string {
  const base = `/${uiLang}/${targetLanguage}-word-${wordSlug}`;
  if (!conceptId || !conceptId.trim()) {
    return base;
  }
  return `${base}--${conceptId.trim()}`;
}

export function buildCanonicalWordPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordLemma: string,
  conceptId?: string | null,
): string {
  return buildCanonicalWordPathFromSlug(uiLang, targetLanguage, wordToSlug(wordLemma), conceptId);
}

export function buildWordBrowsePagePathFromSlug(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordSlug: string,
  conceptId: string,
  page: number,
): string {
  const canonicalPath = buildCanonicalWordPathFromSlug(uiLang, targetLanguage, wordSlug, conceptId);
  return page <= 1 ? canonicalPath : `${canonicalPath}/browse/page/${page}`;
}

export function buildWordBrowsePagePath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordLemma: string,
  conceptId: string,
  page: number,
): string {
  return buildWordBrowsePagePathFromSlug(uiLang, targetLanguage, wordToSlug(wordLemma), conceptId, page);
}

export function extractBrowsePageNumber(rawValue: string | null | undefined): number | null {
  if (!rawValue) {
    return 1;
  }
  if (!/^\d+$/.test(rawValue)) {
    return null;
  }
  const page = Number.parseInt(rawValue, 10);
  return Number.isFinite(page) && page >= 1 ? page : null;
}

export function detectLegacySingleHyphenSyntax(suffix: string): {
  wordSlug: string;
  conceptId: string;
} | null {
  const legacyMatch = suffix.match(/^(.*)-((?:A1|A2|B1|B2|C1|C2)-\d{5})$/);
  if (!legacyMatch) {
    return null;
  }
  const [, wordSlug, conceptId] = legacyMatch;
  return wordSlug.length > 0 ? { wordSlug, conceptId } : null;
}

export function buildWordRouteLookupKey(
  targetLanguage: TargetLanguageSlug,
  conceptId?: string | null,
  wordSlug?: string | null,
): string {
  const normalizedConceptId = conceptId?.trim();
  if (normalizedConceptId) {
    return `${targetLanguage}:${normalizedConceptId}`;
  }
  return `${targetLanguage}:${wordSlug ?? ""}`;
}

function parseWordRouteSlug(
  uiLangRaw: string,
  slug: string,
): ParsedWordRoutePathnameResult {
  const decodedSlug = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return null;
    }
  })();

  if (decodedSlug === null) {
    return {
      kind: "malformed-route",
      family: WORD_ROUTE_FAMILY,
      pathname: `/${uiLangRaw}/${slug}`,
      normalizedPathname: `/${uiLangRaw}/${slug}`,
      uiLangRaw,
      slug,
      reason: "invalid-encoding",
    };
  }

  const wordMarkerIndex = decodedSlug.indexOf("-word-");
  if (wordMarkerIndex === -1) {
    return {
      kind: "not-word-route",
      pathname: `/${uiLangRaw}/${slug}`,
      normalizedPathname: `/${uiLangRaw}/${slug}`,
    };
  }

  if (!validateWordUiLanguage(uiLangRaw)) {
    return {
      kind: "unsupported-ui-language",
      family: WORD_ROUTE_FAMILY,
      pathname: `/${uiLangRaw}/${slug}`,
      normalizedPathname: `/${uiLangRaw}/${slug}`,
      uiLangRaw,
      slug,
    };
  }

  const targetLanguageRaw = decodedSlug.slice(0, wordMarkerIndex);
  if (!validateWordTargetLanguage(targetLanguageRaw)) {
    return {
      kind: "unsupported-target-language",
      family: WORD_ROUTE_FAMILY,
      pathname: `/${uiLangRaw}/${slug}`,
      normalizedPathname: `/${uiLangRaw}/${slug}`,
      uiLangRaw,
      uiLang: uiLangRaw,
      slug,
      targetLanguageRaw,
    };
  }

  const suffix = decodedSlug.slice(wordMarkerIndex + "-word-".length);
  if (!suffix) {
    return {
      kind: "malformed-route",
      family: WORD_ROUTE_FAMILY,
      pathname: `/${uiLangRaw}/${slug}`,
      normalizedPathname: `/${uiLangRaw}/${slug}`,
      uiLangRaw,
      slug,
      reason: "missing-word-slug",
    };
  }

  const base = {
    family: WORD_ROUTE_FAMILY,
    pathname: `/${uiLangRaw}/${slug}`,
    normalizedPathname: `/${uiLangRaw}/${slug}`,
    uiLangRaw,
    slug,
    browsePage: 1,
    uiLang: uiLangRaw,
    targetLanguage: targetLanguageRaw,
  } as const;

  const canonicalParts = suffix.split("--");
  if (suffix.includes("--") && canonicalParts.length !== 2) {
    return {
      kind: "malformed-route",
      ...base,
      reason: "malformed-canonical-separator",
    };
  }

  if (canonicalParts.length === 2) {
    const [rawWordSlug, conceptIdRaw] = canonicalParts;
    const conceptId = conceptIdRaw.trim();
    if (!rawWordSlug.length) {
      return {
        kind: "malformed-route",
        ...base,
        reason: "missing-word-slug",
      };
    }
    if (!validateWordConceptId(conceptId)) {
      return {
        kind: "invalid-concept-id",
        ...base,
        wordSlug: rawWordSlug,
        conceptIdRaw,
      };
    }

    const normalizedWordSlug = wordToSlug(rawWordSlug);
    if (!normalizedWordSlug.length) {
      return {
        kind: "malformed-route",
        ...base,
        reason: "invalid-word-slug",
      };
    }

    if (normalizedWordSlug !== rawWordSlug) {
      return {
        kind: "legacy-slug-format",
        ...base,
        wordSlug: normalizedWordSlug,
        conceptId,
      };
    }

    return {
      kind: "canonical",
      ...base,
      wordSlug: rawWordSlug,
      conceptId,
    };
  }

  const legacyMatch = detectLegacySingleHyphenSyntax(suffix);
  if (legacyMatch) {
    return {
      kind: "legacy-single-hyphen",
      ...base,
      wordSlug: wordToSlug(legacyMatch.wordSlug) || legacyMatch.wordSlug,
      conceptId: legacyMatch.conceptId,
    };
  }

  const conceptIdCandidate = suffix.match(/--(.+)$/)?.[1] ?? null;
  if (conceptIdCandidate?.length) {
    return {
      kind: "invalid-concept-id",
      ...base,
      wordSlug: suffix.split("--")[0] ?? suffix,
      conceptIdRaw: conceptIdCandidate,
    };
  }

  return {
    kind: "slug-only",
    ...base,
    wordSlug: suffix,
    conceptId: null,
  };
}

export function parseWordRoute(
  uiLangRaw: string,
  slug: string,
): ParsedWordRoute | null {
  const result = parseWordRouteSlug(uiLangRaw, slug);
  switch (result.kind) {
    case "canonical":
      return {
        routeKind: "canonical",
        uiLang: result.uiLang,
        targetLanguage: result.targetLanguage,
        wordSlug: result.wordSlug,
        conceptId: result.conceptId,
      };
    case "legacy-single-hyphen":
      return {
        routeKind: "legacy-single-hyphen",
        uiLang: result.uiLang,
        targetLanguage: result.targetLanguage,
        wordSlug: result.wordSlug,
        conceptId: result.conceptId,
      };
    case "legacy-slug-format":
      return {
        routeKind: "legacy-slug-format",
        uiLang: result.uiLang,
        targetLanguage: result.targetLanguage,
        wordSlug: result.wordSlug,
        conceptId: result.conceptId,
      };
    case "slug-only":
      return {
        routeKind: "slug-only",
        uiLang: result.uiLang,
        targetLanguage: result.targetLanguage,
        wordSlug: result.wordSlug,
        conceptId: result.conceptId,
      };
    default:
      return null;
  }
}

export function parseWordRoutePathname(pathname: string): ParsedWordRoutePathnameResult {
  const normalizedPathname = normalizeWordRoutePathname(pathname);
  const segments = normalizedPathname.replace(/^\/+/, "").split("/");
  if (segments.length < 2) {
    return {
      kind: "not-word-route",
      pathname,
      normalizedPathname,
    };
  }

  const [uiLangRaw, slug, ...rest] = segments;
  if (!slug || !slug.includes("-word-")) {
    return {
      kind: "not-word-route",
      pathname,
      normalizedPathname,
    };
  }

  const parsedSlugResult = parseWordRouteSlug(uiLangRaw, slug);
  if (parsedSlugResult.kind === "not-word-route") {
    return {
      kind: "not-word-route",
      pathname,
      normalizedPathname,
    };
  }

  if (rest.length === 0) {
    return {
      ...parsedSlugResult,
      pathname,
      normalizedPathname,
    };
  }

  if (rest.length !== 3 || rest[0] !== "browse" || rest[1] !== "page") {
    return {
      kind: "malformed-route",
      family: WORD_ROUTE_FAMILY,
      pathname,
      normalizedPathname,
      uiLangRaw,
      slug,
      reason: "unexpected-trailing-segments",
    };
  }

  const browsePageRaw = rest[2];
  const browsePage = extractBrowsePageNumber(browsePageRaw);
  if (browsePage === null) {
    return {
      kind: "invalid-browse-page",
      family: WORD_ROUTE_FAMILY,
      pathname,
      normalizedPathname,
      uiLangRaw,
      slug,
      browsePageRaw,
    };
  }

  if (
    parsedSlugResult.kind === "canonical" ||
    parsedSlugResult.kind === "legacy-single-hyphen" ||
    parsedSlugResult.kind === "legacy-slug-format" ||
    parsedSlugResult.kind === "slug-only"
  ) {
    return {
      ...parsedSlugResult,
      pathname,
      normalizedPathname,
      browsePage,
    };
  }

  return {
    ...parsedSlugResult,
    pathname,
    normalizedPathname,
  };
}

export function resolveWordRoute(
  uiLangRaw: string,
  slug: string,
): CanonicalWordRouteMatch | null {
  const parsedRoute = parseWordRoute(uiLangRaw, slug);
  return parsedRoute?.routeKind === "canonical" ? parsedRoute : null;
}

export function resolveWordPageRoute(pathname: string): CanonicalWordPageRouteMatch | null {
  const result = parseWordRoutePathname(pathname);
  return result.kind === "canonical"
    ? {
        routeKind: "canonical",
        uiLang: result.uiLang,
        targetLanguage: result.targetLanguage,
        wordSlug: result.wordSlug,
        conceptId: result.conceptId,
        browsePage: result.browsePage,
      }
    : null;
}

export function getWordRouteFamily(pathname: string): typeof WORD_ROUTE_FAMILY | null {
  return isWordRouteFamily(pathname) ? WORD_ROUTE_FAMILY : null;
}

export function isWordLikePathname(pathname: string): boolean {
  const normalizedPathname = normalizeWordRoutePathname(pathname);
  const segments = normalizedPathname.replace(/^\/+/, "").split("/");
  return segments.length >= 2 && segments[1].includes("-word-");
}

export function isPotentiallyIndexableWordRouteResult(
  result: ParsedWordRoutePathnameResult,
): boolean {
  return result.kind === "canonical";
}

export function isSitemapEligibleWordRouteResult(
  result: ParsedWordRoutePathnameResult,
): boolean {
  if (result.kind !== "canonical" || result.browsePage !== 1) {
    return false;
  }
  return WORD_SITEMAP_DEFINITIONS.some(
    (definition) =>
      definition.uiLang === result.uiLang && definition.targetLanguage === result.targetLanguage,
  );
}
