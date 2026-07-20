import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { StaticRouter } from "react-router-dom/server";
import App from "./app/App";
import {
  getAllLocalizedVocabularyRoutes,
  resolveVocabularyRoute,
} from "./data/seo/vocabularyLevels/vocabularyLevelRoutes";
import { getUiVocabularyLanguage, type UiLanguageCode } from "./data/seo/shared/slugs";
import { getAllSeoHubPaths, resolveSeoHubRoute } from "./data/seo/shared/hub";
import { getAllLevelTestSeoPaths, resolveLevelTestSeoRoute } from "./data/seo/levelTests";
import { getAllVerbListPaths, resolveVerbListRoute } from "./data/seo/verbLists";
import { renderSeoTags, type SeoManager } from "./seo/SeoContext";
import { buildRouteMetadata, classifyRouteMetadata } from "./seo/routeMetadataPolicy";
import { DEFAULT_SITE_ORIGIN } from "./seo/site";
import {
  buildWordBrowsePagePath,
  buildWordBrowsePagePathFromSlug,
  parseWordRoutePathname,
  resolveWordPageRoute,
  type CanonicalWordPageRouteMatch,
} from "./data/seo/wordPages/wordSlugs";
import type { SeoMetadata } from "./seo/SeoContext";
import {
  buildHydrationWordPageData,
  buildResolvedWordPageData,
  findWordEntryIgnoringAccents,
  WORD_PAGE_BROWSE_WORDS_PER_PAGE,
  type ResolvedWordPageData,
  type WordPageVocabEntry,
} from "./data/seo/wordPages/wordPageData";
import { getLevelBrowsePreviewData, type LevelBrowsePreviewData } from "./data/seo/vocabularyLevels/levelBrowseWords";
import { getAllWordSeoHubPaths } from "./data/seo/wordPages/wordHubData";
import { resolveWordSeoHubRoute } from "./data/seo/wordPages/wordHubRoutes";

export type WordSeoRequestResolution =
  | {
      kind: "canonical";
      pathname: string;
      initialWordPageData: ResolvedWordPageData;
      wordRoute: CanonicalWordPageRouteMatch;
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

export interface MinimalWordSeoNotFoundResponse {
  body: string;
  contentType: "text/plain; charset=utf-8";
  status: 410;
}

const CORE_PRERENDER_ROUTES = [
  "/",
  "/profile",
  "/languages",
  "/languages/filters",
  "/languages/filters/exercises",
  "/languages/filters/exercises/practice",
  "/explore",
  "/languages/level-test",
  "/about",
  "/help",
] as const;
const PRACTICE_ROUTE_UI_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ru"] as const;
const vocabularyModules = import.meta.glob("./data/vocabulary/*/vocabulary.json") as Record<
  string,
  () => Promise<{ default: WordPageVocabEntry[] }>
>;
const interfaceModules = import.meta.glob("./data/interface/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

const vocabCache = new Map<string, Promise<WordPageVocabEntry[]>>();
const interfaceCache = new Map<UiLanguageCode, Promise<unknown>>();

async function loadVocabulary(language: string): Promise<WordPageVocabEntry[]> {
  const cached = vocabCache.get(language);
  if (cached) {
    return cached;
  }

  const modulePath = `./data/vocabulary/${language}/vocabulary.json`;
  const loadModule = vocabularyModules[modulePath];
  if (!loadModule) {
    throw new Error(`Missing vocabulary module for language "${language}"`);
  }

  const pending = loadModule().then((module) => module.default);
  vocabCache.set(language, pending);
  return pending;
}

async function loadInterfaceData(uiLanguage: UiLanguageCode): Promise<unknown> {
  const cached = interfaceCache.get(uiLanguage);
  if (cached) {
    return cached;
  }

  const languageName =
    {
      en: "english",
      es: "spanish",
      fr: "french",
      de: "german",
      it: "italian",
      pt: "portuguese",
      ru: "russian",
    }[uiLanguage] ?? "english";
  const modulePath = `./data/interface/${languageName}_interface.json`;
  const loadModule =
    interfaceModules[modulePath] ?? interfaceModules["./data/interface/english_interface.json"];
  if (!loadModule) {
    throw new Error(`Missing interface module for ui language "${uiLanguage}"`);
  }

  const pending = loadModule().then((module) => module.default);
  interfaceCache.set(uiLanguage, pending);
  return pending;
}

function getInitialWordBrowsePage(resolution: WordSeoRequestResolution): number {
  return resolution.kind === "canonical" ? resolution.wordRoute.browsePage : 1;
}

async function getInitialBrowsePreviewData(url: string): Promise<LevelBrowsePreviewData | null> {
  const match = url.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) {
    return null;
  }

  const [, uiLang, slug] = match;
  const vocabularyRoute = resolveVocabularyRoute(uiLang, slug);
  if (!vocabularyRoute) {
    return null;
  }

  return getLevelBrowsePreviewData(vocabularyRoute.targetLanguage, vocabularyRoute.level);
}

function buildNotFoundSeoMetadata(): SeoMetadata {
  return buildRouteMetadata("/__invalid__", DEFAULT_SITE_ORIGIN);
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function buildMinimalWordSeoNotFoundResponse(): MinimalWordSeoNotFoundResponse {
  return {
    status: 410,
    contentType: "text/plain; charset=utf-8",
    body: "410 Gone",
  };
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
    ...getAllWordSeoHubPaths(),
    ...getAllLevelTestSeoPaths(),
    ...getAllVerbListPaths(),
  ])];
}

export async function resolveWordSeoRequest(url: string): Promise<WordSeoRequestResolution> {
  const pathname = url.split(/[?#]/, 1)[0] || "/";
  const parsedWordRoute = parseWordRoutePathname(pathname);
  if (parsedWordRoute.kind === "not-word-route") {
    return {
      kind: "not-found",
      pathname,
      reason: "not-word-route",
    };
  }

  if (parsedWordRoute.kind === "legacy-single-hyphen" || parsedWordRoute.kind === "legacy-slug-format") {
    return {
      kind: "redirect",
      pathname,
      location: buildWordBrowsePagePathFromSlug(
        parsedWordRoute.uiLang,
        parsedWordRoute.targetLanguage,
        parsedWordRoute.wordSlug,
        parsedWordRoute.conceptId,
        parsedWordRoute.browsePage,
      ),
    };
  }

  if (parsedWordRoute.kind !== "canonical") {
    const reason = parsedWordRoute.kind === "slug-only" ? "slug-only-route" : "invalid-route";
    return {
      kind: "not-found",
      pathname,
      reason,
    };
  }

  const vocabulary = await loadVocabulary(parsedWordRoute.targetLanguage);
  const uiVocabLanguage = getUiVocabularyLanguage(parsedWordRoute.uiLang);
  const uiVocabulary =
    uiVocabLanguage !== parsedWordRoute.targetLanguage
      ? await loadVocabulary(uiVocabLanguage)
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
    // The exact (accented) slug didn't match. Before giving up, check whether
    // this is an old link built while wordToSlug briefly stripped accents
    // (2026-06-22 to this revert) - if so the word still exists, just under
    // its accented URL, so redirect there instead of 410ing a real word.
    const accentInsensitiveMatch = findWordEntryIgnoringAccents(
      vocabulary,
      parsedWordRoute.wordSlug,
      parsedWordRoute.conceptId,
    );
    if (accentInsensitiveMatch) {
      return {
        kind: "redirect",
        pathname,
        location: buildWordBrowsePagePath(
          parsedWordRoute.uiLang,
          parsedWordRoute.targetLanguage,
          accentInsensitiveMatch.word_lemma,
          parsedWordRoute.conceptId,
          parsedWordRoute.browsePage,
        ),
      };
    }

    return {
      kind: "not-found",
      pathname,
      reason: "missing-record",
    };
  }

  const totalBrowsePages = Math.max(
    1,
    Math.ceil(initialWordPageData.browseWords.length / WORD_PAGE_BROWSE_WORDS_PER_PAGE),
  );
  if (parsedWordRoute.browsePage > totalBrowsePages) {
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
    wordRoute: {
      routeKind: "canonical",
      uiLang: parsedWordRoute.uiLang,
      targetLanguage: parsedWordRoute.targetLanguage,
      wordSlug: parsedWordRoute.wordSlug,
      conceptId: parsedWordRoute.conceptId,
      browsePage: parsedWordRoute.browsePage,
    },
  };
}

function getInitialUiLanguage(url: string): UiLanguageCode {
  const levelTestRoute = resolveLevelTestSeoRoute(url);
  if (levelTestRoute) {
    return levelTestRoute.uiLang;
  }

  const verbListRoute = resolveVerbListRoute(url);
  if (verbListRoute) {
    return verbListRoute.uiLang;
  }

  const seoHubRoute = resolveSeoHubRoute(url);
  if (seoHubRoute) {
    return seoHubRoute;
  }

  const wordSeoHubRoute = resolveWordSeoHubRoute(url);
  if (wordSeoHubRoute) {
    return wordSeoHubRoute.uiLang;
  }

  const wordPageRoute = resolveWordPageRoute(url);
  if (wordPageRoute) {
    return wordPageRoute.uiLang;
  }

  const match = url.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) {
    return "en";
  }

  const [, uiLang, slug] = match;
  return resolveVocabularyRoute(uiLang, slug)?.uiLang ?? "en";
}

export async function render(url: string, siteOrigin = DEFAULT_SITE_ORIGIN) {
  const seoManager: SeoManager = { metadata: null };
  const wordSeoResolution = await resolveWordSeoRequest(url);
  const pathname = url.split(/[?#]/, 1)[0] || "/";
  const shouldUseWordNotFoundMetadata =
    wordSeoResolution.kind === "not-found" &&
    (pathname.startsWith("/api/word-ssr") ||
      (/^\/[a-z]{2}\/[^/?#]+(?:\/browse\/page\/\d+)?$/.test(pathname) &&
        pathname.includes("-word-")));
  const initialUILanguage = getInitialUiLanguage(url);
  const initialInterfaceData = await loadInterfaceData(initialUILanguage);
  const initialWordPageData =
    wordSeoResolution.kind === "canonical" ? wordSeoResolution.initialWordPageData : null;
  const initialWordBrowsePage = getInitialWordBrowsePage(wordSeoResolution);
  const initialBrowsePreviewData = await getInitialBrowsePreviewData(url);
  const ssrWordRouteMatch = (() => {
    return resolveWordPageRoute(pathname);
  })();
  const ssrRouteOverride:
    | {
        page: "wordPage" | "notFound";
        wordRoute?: CanonicalWordPageRouteMatch | null;
      }
    | undefined =
    wordSeoResolution.kind === "canonical" && ssrWordRouteMatch
      ? {
          page: "wordPage",
          wordRoute: ssrWordRouteMatch,
        }
      : shouldUseWordNotFoundMetadata
        ? {
            page: "notFound",
          }
        : undefined;
  const appHtml = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const { pipe, abort } = renderToPipeableStream(
      <StaticRouter location={url}>
        <App
          initialUILanguage={initialUILanguage}
          initialTranslationData={initialInterfaceData}
          initialBrowsePreviewData={initialBrowsePreviewData}
          initialWordPageData={initialWordPageData}
          ssrRouteOverride={ssrRouteOverride}
          seoManager={seoManager}
          siteOrigin={siteOrigin}
        />
      </StaticRouter>,
      {
        onAllReady() {
          const writable = new Writable({
            write(chunk, _enc, cb) {
              chunks.push(chunk as Buffer);
              cb();
            },
            final(cb) {
              cb();
              resolve(Buffer.concat(chunks).toString("utf8"));
            },
          });
          pipe(writable);
        },
        onError(err) {
          reject(err);
        },
      },
    );
    setTimeout(abort, 30_000);
  });
  const hydrationWordPageData = buildHydrationWordPageData(
    initialWordPageData,
    initialWordBrowsePage,
  );
  const routeDataScript = initialWordPageData
    ? `\n    <script>window.__WORD_PAGE_DATA__=${escapeJsonForHtml({ pathname: url, data: hydrationWordPageData })}</script>`
    : "";
  const interfaceDataScript = `\n    <script>window.__INITIAL_INTERFACE_DATA__=${escapeJsonForHtml({ lang: initialUILanguage, data: initialInterfaceData })}</script>`;
  const fallbackMetadata =
    shouldUseWordNotFoundMetadata || classifyRouteMetadata(pathname) === "invalid"
      ? buildNotFoundSeoMetadata()
      : buildRouteMetadata(pathname, siteOrigin);

  return {
    appHtml,
    headTags:
      renderSeoTags(
        seoManager.metadata ?? fallbackMetadata,
      ) + routeDataScript + interfaceDataScript,
    htmlLang: initialUILanguage,
  };
}
