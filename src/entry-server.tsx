import ReactDOMServer from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
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
import { resolveWordRoute } from "./data/seo/wordSlugs";
import type { SeoMetadata } from "./seo/SeoContext";
import {
  buildHydrationWordPageData,
  buildResolvedWordPageData,
  getUiVocabularyLanguage,
  type ResolvedWordPageData,
  type WordPageVocabEntry,
} from "./data/seo/wordPageData";

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
    process.cwd(),
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
  const match = url.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) {
    return null;
  }

  const [, uiLangRaw, slug] = match;
  const wordRoute = resolveWordRoute(uiLangRaw, slug);
  if (!wordRoute) {
    return null;
  }

  const vocabulary = loadVocabularySync(wordRoute.targetLanguage);
  const uiVocabLanguage = getUiVocabularyLanguage(wordRoute.uiLang);
  const uiVocabulary =
    uiVocabLanguage !== wordRoute.targetLanguage
      ? loadVocabularySync(uiVocabLanguage)
      : null;

  return buildResolvedWordPageData({
    uiLang: wordRoute.uiLang,
    targetLanguage: wordRoute.targetLanguage,
    wordSlug: wordRoute.wordSlug,
    conceptId: wordRoute.conceptId,
    vocabulary,
    uiVocabulary,
  });
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
  const initialUILanguage = getInitialUiLanguage(url);
  const initialWordPageData = getInitialWordPageData(url);
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
      renderSeoTags(seoManager.metadata ?? buildFallbackSeoMetadata(url, siteOrigin) ?? {
        title: "FluentStellar - Structured Vocabulary Learning Platform",
        description: "Structured CEFR vocabulary system with interactive exercises and intelligent learning tools.",
        canonical: `${siteOrigin.replace(/\/$/, "")}/`,
      }) + routeDataScript,
    htmlLang: initialUILanguage,
  };
}
