import ReactDOMServer from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StaticRouter } from "react-router-dom/server";
import App from "./app/App";
import {
  getAllLocalizedVocabularyRoutes,
  resolveVocabularyRoute,
  type UiLanguageCode,
} from "./data/seo/slugs";
import { getAllSeoHubPaths, resolveSeoHubRoute } from "./data/seo/hub";
import { getAllLevelTestSeoPaths, resolveLevelTestSeoRoute } from "./data/levelTests";
import { renderSeoTags, type SeoManager } from "./seo/SeoContext";
import { DEFAULT_SITE_ORIGIN } from "./seo/site";
import {
  buildWordPathFromSlug,
  parseWordRoute,
  resolveWordRoute,
} from "./data/seo/wordSlugs";
import type { SeoMetadata } from "./seo/SeoContext";
import {
  buildHydrationWordPageData,
  buildResolvedWordPageData,
  getUiVocabularyLanguage,
  type ResolvedWordPageData,
  type WordPageVocabEntry,
} from "./data/seo/wordPageData";

export type WordSeoRequestResolution =
  | {
      kind: "canonical";
      pathname: string;
      initialWordPageData: ResolvedWordPageData;
    }
  | {
      kind: "redirect";
      pathname: string;
      location: string;
    }
  | {
      kind: "not-found";
      pathname: string;
      reason:
        | "not-word-route"
        | "invalid-route"
        | "slug-only-route"
        | "missing-record";
    };

const CORE_PRERENDER_ROUTES = [
  "/",
  "/languages",
  "/languages/filters",
  "/languages/filters/exercises",
  "/explore",
  "/languages/level-test",
  "/about",
  "/help",
] as const;
const PRACTICE_ROUTE_UI_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ru"] as const;
const ENTRY_SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT_DIR = path.resolve(ENTRY_SERVER_DIR, "..");

const CORE_ROUTE_SEO: Record<string, { title: string; description: string }> = {
  "/": {
    title: "FluentStellar - Structured Vocabulary Learning Platform",
    description:
      "Structured CEFR vocabulary system with interactive exercises and intelligent learning tools.",
  },
  "/languages": {
    title: "Choose Your Language Pair - FluentStellar",
    description:
      "Choose your interface language and practice language to start structured vocabulary learning on FluentStellar.",
  },
  "/languages/filters": {
    title: "Vocabulary Filters and Levels - FluentStellar",
    description:
      "Browse CEFR vocabulary by level and topic, then open targeted practice pages built around the words you need next.",
  },
  "/languages/filters/exercises": {
    title: "Vocabulary Exercises - FluentStellar",
    description:
      "Start vocabulary exercises with your selected language pair and practice route on FluentStellar.",
  },
  "/languages/level-test": {
    title: "English Level Test - FluentStellar",
    description:
      "Take the FluentStellar English level test to estimate your CEFR level and jump into the right vocabulary practice.",
  },
  "/explore": {
    title: "Explore Languages and Vocabulary - FluentStellar",
    description:
      "Explore FluentStellar language-learning tools, vocabulary routes, and practice pages from one hub.",
  },
  "/about": {
    title: "About FluentStellar",
    description:
      "Learn what FluentStellar is building and how the platform approaches structured vocabulary learning.",
  },
  "/help": {
    title: "FluentStellar Help",
    description:
      "Get help using FluentStellar, including navigation, practice routes, and core vocabulary features.",
  },
};

const vocabCache = new Map<string, WordPageVocabEntry[]>();

function loadVocabularySync(language: string): WordPageVocabEntry[] {
  const cached = vocabCache.get(language);
  if (cached) {
    return cached;
  }

  const vocabPath = path.join(
    PROJECT_ROOT_DIR,
    "src",
    "data",
    "vocabulary",
    language,
    "vocabulary.json",
  );
  const raw = fs.readFileSync(vocabPath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw) as WordPageVocabEntry[];
  vocabCache.set(language, parsed);
  return parsed;
}

function getInitialWordPageData(url: string): ResolvedWordPageData | null {
  const resolution = resolveWordSeoRequest(url);
  if (resolution.kind !== "canonical") {
    return null;
  }
  return resolution.initialWordPageData;
}

function buildNotFoundSeoMetadata(): SeoMetadata {
  return {
    title: "Page Not Found | FluentStellar",
    description:
      "The requested page could not be found on FluentStellar. Explore vocabulary routes and learning tools from valid pages instead.",
    robots: "noindex, follow",
  };
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function getPrerenderRoutes(): string[] {
  const practiceRoutes = PRACTICE_ROUTE_UI_LANGUAGES.flatMap((yourLanguage) =>
    PRACTICE_ROUTE_UI_LANGUAGES.flatMap((practiceLanguage) =>
      yourLanguage === practiceLanguage
        ? []
        : [`/languages/filters/exercises/${yourLanguage}-${practiceLanguage}/practice`],
    ),
  );

  return [...new Set([
    ...CORE_PRERENDER_ROUTES,
    ...practiceRoutes,
    ...getAllLocalizedVocabularyRoutes().map((route) => route.path),
    ...getAllSeoHubPaths(),
    ...getAllLevelTestSeoPaths(),
  ])];
}

export function resolveWordSeoRequest(url: string): WordSeoRequestResolution {
  const pathname = url.split(/[?#]/, 1)[0] || "/";
  const match = pathname.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) {
    return {
      kind: "not-found",
      pathname,
      reason: "not-word-route",
    };
  }

  const [, uiLangRaw, slug] = match;
  if (!slug.includes("-word-")) {
    return {
      kind: "not-found",
      pathname,
      reason: "not-word-route",
    };
  }

  const parsedWordRoute = parseWordRoute(uiLangRaw, slug);
  if (!parsedWordRoute) {
    return {
      kind: "not-found",
      pathname,
      reason: "invalid-route",
    };
  }

  if (parsedWordRoute.routeKind === "legacy-single-hyphen") {
    return {
      kind: "redirect",
      pathname,
      location: buildWordPathFromSlug(
        parsedWordRoute.uiLang,
        parsedWordRoute.targetLanguage,
        parsedWordRoute.wordSlug,
        parsedWordRoute.conceptId,
      ),
    };
  }

  if (parsedWordRoute.routeKind !== "canonical") {
    return {
      kind: "not-found",
      pathname,
      reason: "slug-only-route",
    };
  }

  const vocabulary = loadVocabularySync(parsedWordRoute.targetLanguage);
  const uiVocabLanguage = getUiVocabularyLanguage(parsedWordRoute.uiLang);
  const uiVocabulary =
    uiVocabLanguage !== parsedWordRoute.targetLanguage
      ? loadVocabularySync(uiVocabLanguage)
      : null;

  const initialWordPageData = buildResolvedWordPageData({
    uiLang: parsedWordRoute.uiLang,
    targetLanguage: parsedWordRoute.targetLanguage,
    wordSlug: parsedWordRoute.wordSlug,
    conceptId: parsedWordRoute.conceptId,
    vocabulary,
    uiVocabulary,
  });

  if (!initialWordPageData.wordEntry) {
    return {
      kind: "not-found",
      pathname,
      reason: "missing-record",
    };
  }

  return {
    kind: "canonical",
    pathname,
    initialWordPageData,
  };
}

function getInitialUiLanguage(url: string): UiLanguageCode {
  const levelTestRoute = resolveLevelTestSeoRoute(url);
  if (levelTestRoute) {
    return levelTestRoute.uiLang;
  }

  const seoHubRoute = resolveSeoHubRoute(url);
  if (seoHubRoute) {
    return seoHubRoute;
  }

  const match = url.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) {
    return "en";
  }

  const [, uiLang, slug] = match;
  return (
    resolveVocabularyRoute(uiLang, slug)?.uiLang ??
    resolveWordRoute(uiLang, slug)?.uiLang ??
    "en"
  );
}

function buildFallbackSeoMetadata(url: string, siteOrigin: string): SeoMetadata | null {
  const pathname = url.split(/[?#]/, 1)[0] || "/";
  const routeSeo = CORE_ROUTE_SEO[pathname];
  if (!routeSeo) {
    return null;
  }

  const origin = siteOrigin.replace(/\/$/, "");
  return {
    title: routeSeo.title,
    description: routeSeo.description,
    canonical: `${origin}${pathname}`,
  };
}

export function render(url: string, siteOrigin = DEFAULT_SITE_ORIGIN) {
  const seoManager: SeoManager = { metadata: null };
  const wordSeoResolution = resolveWordSeoRequest(url);
  const pathname = url.split(/[?#]/, 1)[0] || "/";
  const shouldUseWordNotFoundMetadata =
    wordSeoResolution.kind === "not-found" &&
    (pathname.startsWith("/api/word-ssr") ||
      (/^\/[a-z]{2}\/[^/?#]+$/.test(pathname) && pathname.includes("-word-")));
  const initialUILanguage = getInitialUiLanguage(url);
  const initialWordPageData =
    wordSeoResolution.kind === "canonical" ? wordSeoResolution.initialWordPageData : null;
  const appHtml = ReactDOMServer.renderToString(
    <StaticRouter location={url}>
      <App
        initialUILanguage={initialUILanguage}
        initialWordPageData={initialWordPageData}
        seoManager={seoManager}
        siteOrigin={siteOrigin}
      />
    </StaticRouter>,
  );
  const hydrationWordPageData = buildHydrationWordPageData(initialWordPageData);
  const routeDataScript = initialWordPageData
    ? `\n    <script>window.__WORD_PAGE_DATA__=${escapeJsonForHtml({ pathname: url, data: hydrationWordPageData })}</script>`
    : "";

  return {
    appHtml,
    headTags:
      renderSeoTags(
        seoManager.metadata ??
          (shouldUseWordNotFoundMetadata
            ? buildNotFoundSeoMetadata()
            : buildFallbackSeoMetadata(url, siteOrigin) ?? {
                title: "FluentStellar - Structured Vocabulary Learning Platform",
                description:
                  "Structured CEFR vocabulary system with interactive exercises and intelligent learning tools.",
                canonical: `${siteOrigin.replace(/\/$/, "")}/`,
              }),
      ) + routeDataScript,
    htmlLang: initialUILanguage,
  };
}
