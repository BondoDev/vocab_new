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
import { getAllWordPaths, resolveWordRoute } from "./data/seo/wordSlugs";
import { SUPPORTED_TARGET_LANGUAGES } from "./data/seo/slugs";
import englishVocab from "./data/vocabulary/english/vocabulary.json";
import germanVocab from "./data/vocabulary/german/vocabulary.json";
import spanishVocab from "./data/vocabulary/spanish/vocabulary.json";
import frenchVocab from "./data/vocabulary/french/vocabulary.json";
import italianVocab from "./data/vocabulary/italian/vocabulary.json";
import portugueseVocab from "./data/vocabulary/portuguese/vocabulary.json";
import russianVocab from "./data/vocabulary/russian/vocabulary.json";

type RawVocabEntry = { word_lemma: string; level: string };

const VOCAB_BY_LANGUAGE: Record<string, RawVocabEntry[]> = {
  english: englishVocab as RawVocabEntry[],
  german: germanVocab as RawVocabEntry[],
  spanish: spanishVocab as RawVocabEntry[],
  french: frenchVocab as RawVocabEntry[],
  italian: italianVocab as RawVocabEntry[],
  portuguese: portugueseVocab as RawVocabEntry[],
  russian: russianVocab as RawVocabEntry[],
};

export function getPrerenderRoutes(): string[] {
  const wordEntries = SUPPORTED_TARGET_LANGUAGES.flatMap((targetLanguage) =>
    (VOCAB_BY_LANGUAGE[targetLanguage] ?? []).map((w) => ({ targetLanguage, wordLemma: w.word_lemma })),
  );

  return [
    ...getAllLocalizedVocabularyRoutes().map((route) => route.path),
    ...getAllSeoHubPaths(),
    ...(["en", "es", "fr", "de", "it", "pt", "ru"] as const)
      .map((uiLang) => getLevelTestSeoPath(uiLang, "english"))
      .filter((route): route is string => Boolean(route)),
    ...getAllWordPaths(wordEntries),
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
