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

export function getPrerenderRoutes(): string[] {
  return [
    ...getAllLocalizedVocabularyRoutes().map((route) => route.path),
    ...getAllSeoHubPaths(),
    ...(["en", "es", "fr", "de", "it", "pt", "ru"] as const)
      .map((uiLang) => getLevelTestSeoPath(uiLang, "english"))
      .filter((route): route is string => Boolean(route)),
  ];
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
    headTags: seoManager.metadata ? renderSeoTags(seoManager.metadata) : "",
    htmlLang: initialUILanguage,
  };
}
