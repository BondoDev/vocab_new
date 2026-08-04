// Pure route-parsing and route-building helpers extracted from App.tsx.
//
// Everything in this module is a pure function of its inputs — no React
// state, no browser globals, no side effects — so it is safe to call during
// SSR, prerendering, and client hydration. All three environments must
// classify a given URL identically, which is why this logic is shared
// rather than duplicated.
//
// Ownership invariant: the literal `ROUTES` map intentionally stays in
// src/app/App.tsx. scripts/tests/routing/test-interactive-contracts.mjs parses App.tsx's
// source text for the `const ROUTES = { ... } as const;` block, so moving
// that constant here would silently break the guard. Helpers below accept
// the route map (or the slice they need) as a parameter instead of
// importing App.tsx, which would also create a circular dependency.
import type { UILanguage } from "../../contexts/LanguageContext";
import { resolveVocabularyRoute } from "../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import {
  isSupportedUiLanguage,
  type Level as CefrLevelCode,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/seo/shared/slugs";
import {
  parseWordRoutePathname,
  type CanonicalWordPageRouteMatch,
  resolveWordPageRoute,
} from "../../data/seo/wordPages/wordSlugs";
import { resolveSeoHubRoute } from "../../data/seo/shared/hub";
import {
  resolveWordSeoHubRoute,
  type WordSeoHubRoute,
} from "../../data/seo/wordPages/wordHubRoutes";
import { resolveLevelTestSeoRoute } from "../../data/seo/levelTests";
import { resolvePastVerbFormsRoute, resolveVerbListRoute } from "../../data/seo/verbLists";

// Shape of App.tsx's ROUTES map. The keys here must stay in sync with the
// literal block in App.tsx (guarded by scripts/tests/routing/test-interactive-contracts.mjs).
export interface InteractiveRouteMap {
  language: string;
  levelCategory: string;
  exerciseSelection: string;
  practice: string;
  explore: string;
  exam: string;
  about: string;
  help: string;
  profile: string;
  newWordStudy: string;
  reviewWords: string;
}

export type RouteKey = keyof InteractiveRouteMap;
export type PageKey =
  | RouteKey
  | "vocabularyLevel"
  | "levelTestSeo"
  | "verbListSeo"
  | "pastVerbFormsSeo"
  | "seoHub"
  | "wordSeoHub"
  | "wordPage"
  | "devSeoCefrPlaceholder"
  | "notFound";

export interface ParsedVocabularyRoute {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: CefrLevelCode;
}

export interface ParsedLevelTestSeoRoute {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
}

export interface ParsedVerbListSeoRoute {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
}

export interface ParsedPastVerbFormsSeoRoute {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
}

export type ParsedWordSeoHubRoute = WordSeoHubRoute;

export interface ParsedPracticeRoute {
  yourLanguage: UILanguage;
  practiceLanguage: UILanguage;
}

export const TARGET_LANGUAGE_TO_UI_CODE: Record<TargetLanguageSlug, UILanguage> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
};

export const VALID_LEVEL_CODES = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

export function parseVocabularyRoute(path: string): ParsedVocabularyRoute | null {
  const match = path.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) {
    return null;
  }

  const [, uiLangRaw, slug] = match;
  const resolved = resolveVocabularyRoute(uiLangRaw, slug);
  if (!resolved) {
    return null;
  }

  return {
    uiLang: resolved.uiLang,
    targetLanguage: resolved.targetLanguage,
    level: resolved.level,
  };
}

export function parseDevSeoCefrPlaceholderRoute(
  path: string,
): ParsedVocabularyRoute | null {
  if (!path.startsWith("/test/")) {
    return null;
  }

  return parseVocabularyRoute(path.slice("/test".length));
}

export function parseLevelTestSeoRoute(path: string): ParsedLevelTestSeoRoute | null {
  return resolveLevelTestSeoRoute(path);
}

export function parseVerbListSeoRoute(path: string): ParsedVerbListSeoRoute | null {
  return resolveVerbListRoute(path);
}

export function parsePastVerbFormsSeoRoute(path: string): ParsedPastVerbFormsSeoRoute | null {
  return resolvePastVerbFormsRoute(path);
}

export function parseSeoHubRoute(path: string): UiLanguageCode | null {
  return resolveSeoHubRoute(path);
}

export function parseWordSeoHubRoute(path: string): ParsedWordSeoHubRoute | null {
  return resolveWordSeoHubRoute(path);
}

export function parseWordRoute(path: string): CanonicalWordPageRouteMatch | null {
  return resolveWordPageRoute(path);
}

function parseAnyWordRoute(path: string) {
  const result = parseWordRoutePathname(path);
  return result.kind === "not-word-route" ? null : result;
}

export function buildPracticeRoute(
  yourLanguage: UILanguage,
  practiceLanguage: UILanguage,
  routes: Pick<InteractiveRouteMap, "exerciseSelection">,
): string {
  return `${routes.exerciseSelection}/${yourLanguage}-${practiceLanguage}/practice`;
}

export function parsePracticeRoute(path: string): ParsedPracticeRoute | null {
  const match = path.match(
    /^\/languages\/filters\/exercises\/([a-z]{2})-([a-z]{2})\/practice$/,
  );
  if (!match) {
    return null;
  }

  const [, yourLanguageRaw, practiceLanguageRaw] = match;
  if (
    !isSupportedUiLanguage(yourLanguageRaw) ||
    !isSupportedUiLanguage(practiceLanguageRaw)
  ) {
    return null;
  }

  return {
    yourLanguage: yourLanguageRaw,
    practiceLanguage: practiceLanguageRaw,
  };
}

// Maps the already-resolved page (see `pageFromPath` below) and its
// corresponding parsed route to the UI language that page's URL encodes.
// Switches on `resolvedPage` rather than testing route truthiness, so it
// inherits `pageFromPath`'s parser-precedence guarantee instead of
// re-deciding precedence itself — never duplicate that logic here.
export function getRouteUILanguage(
  resolvedPage: PageKey,
  routes: {
    vocabularyRoute: ParsedVocabularyRoute | null;
    levelTestSeoRoute: ParsedLevelTestSeoRoute | null;
    verbListSeoRoute: ParsedVerbListSeoRoute | null;
    pastVerbFormsSeoRoute: ParsedPastVerbFormsSeoRoute | null;
    seoHubRoute: UiLanguageCode | null;
    wordSeoHubRoute: ParsedWordSeoHubRoute | null;
    wordRoute: CanonicalWordPageRouteMatch | null;
  },
): UiLanguageCode | null {
  switch (resolvedPage) {
    case "vocabularyLevel":
      return routes.vocabularyRoute?.uiLang ?? null;
    case "levelTestSeo":
      return routes.levelTestSeoRoute?.uiLang ?? null;
    case "verbListSeo":
      return routes.verbListSeoRoute?.uiLang ?? null;
    case "pastVerbFormsSeo":
      return routes.pastVerbFormsSeoRoute?.uiLang ?? null;
    case "seoHub":
      return routes.seoHubRoute ?? null;
    case "wordSeoHub":
      return routes.wordSeoHubRoute?.uiLang ?? null;
    case "wordPage":
      return routes.wordRoute?.uiLang ?? null;
    default:
      return null;
  }
}

// Resolves a pathname to a PageKey. Pure and SSR-safe apart from the
// `import.meta.env.DEV` check, which Vite replaces at build time (the
// dev-only /test/ preview route must never match in production builds).
//
// Parser precedence in the default branch is load-bearing: more specific
// route families (dev placeholder, hub indexes, level-test, verb-list, word
// pages) must be checked before the broad /:uiLang/:slug vocabulary pattern,
// which would otherwise swallow their URLs. Reordering these checks changes
// how URLs are classified across client routing, prerendering, and Worker
// SSR simultaneously.
export const pageFromPath = (
  path: string,
  routes: InteractiveRouteMap,
): PageKey => {
  if (parsePracticeRoute(path)) {
    return "practice";
  }

  switch (path) {
    case "/":
    case routes.language:
      return "language";
    case routes.levelCategory:
      return "levelCategory";
    case routes.exerciseSelection:
      return "exerciseSelection";
    case routes.practice:
      return "practice";
    case routes.explore:
      return "explore";
    case routes.exam:
      return "exam";
    case routes.about:
      return "about";
    case routes.help:
      return "help";
    case routes.profile:
      return "profile";
    case routes.newWordStudy:
      return "newWordStudy";
    case routes.reviewWords:
      return "reviewWords";
    default: {
      if (import.meta.env.DEV && parseDevSeoCefrPlaceholderRoute(path)) {
        return "devSeoCefrPlaceholder";
      }
      if (parseSeoHubRoute(path)) {
        return "seoHub";
      }
      if (parseWordSeoHubRoute(path)) {
        return "wordSeoHub";
      }
      if (parseLevelTestSeoRoute(path)) {
        return "levelTestSeo";
      }
      if (parseVerbListSeoRoute(path)) {
        return "verbListSeo";
      }
      if (parsePastVerbFormsSeoRoute(path)) {
        return "pastVerbFormsSeo";
      }
      if (parseAnyWordRoute(path)) {
        return "wordPage";
      }
      if (parseVocabularyRoute(path)) {
        return "vocabularyLevel";
      }
      return "notFound";
    }
  }
};
