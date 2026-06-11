import ReactDOMServer from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import App from "./app/App";
import {
  getAllLocalizedVocabularyRoutes,
  resolveVocabularyRoute,
  type UiLanguageCode,
} from "./data/seo/slugs";
import { getAllSeoHubPaths, resolveSeoHubRoute } from "./data/seo/hub";
import { getLevelTestSeoPath, resolveLevelTestSeoRoute } from "./data/levelTests";
import { renderSeoTags, type SeoManager } from "./seo/SeoContext";
import { DEFAULT_SITE_ORIGIN } from "./seo/site";
import { resolveWordRoute } from "./data/seo/wordSlugs";
import type { SeoMetadata } from "./seo/SeoContext";

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

export function getPrerenderRoutes(): string[] {
  return [...new Set([
    ...CORE_PRERENDER_ROUTES,
    ...getAllLocalizedVocabularyRoutes().map((route) => route.path),
    ...getAllSeoHubPaths(),
    ...(["en", "es", "fr", "de", "it", "pt", "ru"] as const)
      .map((uiLang) => getLevelTestSeoPath(uiLang, "english"))
      .filter((route): route is string => Boolean(route)),
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
  const appHtml = ReactDOMServer.renderToString(
    <StaticRouter location={url}>
      <App
        initialUILanguage={initialUILanguage}
        seoManager={seoManager}
        siteOrigin={siteOrigin}
      />
    </StaticRouter>,
  );

  return {
    appHtml,
    headTags: renderSeoTags(seoManager.metadata ?? buildFallbackSeoMetadata(url, siteOrigin) ?? {
      title: "FluentStellar - Structured Vocabulary Learning Platform",
      description: "Structured CEFR vocabulary system with interactive exercises and intelligent learning tools.",
      canonical: `${siteOrigin.replace(/\/$/, "")}/`,
    }),
    htmlLang: initialUILanguage,
  };
}
