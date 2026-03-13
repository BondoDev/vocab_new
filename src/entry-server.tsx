import ReactDOMServer from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import App from "./app/App";
import {
  getAllLocalizedVocabularyRoutes,
  resolveVocabularyRoute,
  type UiLanguageCode,
} from "./data/seo/slugs";
import { renderSeoTags, type SeoManager } from "./seo/SeoContext";
import { DEFAULT_SITE_ORIGIN } from "./seo/site";

export function getPrerenderRoutes(): string[] {
  return [
    ...getAllLocalizedVocabularyRoutes().map((route) => route.path),
    "/en/english-level-test",
  ];
}

function getInitialUiLanguage(url: string): UiLanguageCode {
  if (url === "/en/english-level-test") {
    return "en";
  }

  const match = url.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) {
    return "en";
  }

  const [, uiLang, slug] = match;
  return resolveVocabularyRoute(uiLang, slug)?.uiLang ?? "en";
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
