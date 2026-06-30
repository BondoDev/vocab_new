import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
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
import { buildRouteMetadata, classifyRouteMetadata } from "./seo/routeMetadataPolicy";
import { DEFAULT_SITE_ORIGIN } from "./seo/site";
import {
  buildWordPathFromSlug,
  parseWordRoute,
  resolveWordRoute,
  type WordRouteMatch,
} from "./data/seo/wordSlugs";
import type { SeoMetadata } from "./seo/SeoContext";
import {
  buildHydrationWordPageData,
  buildResolvedWordPageData,
  getUiVocabularyLanguage,
  type ResolvedWordPageData,
  type WordPageVocabEntry,
} from "./data/seo/wordPageData";
import { getLevelBrowsePreviewData, type LevelBrowsePreviewData } from "./data/seo/levelBrowseWords";

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

export interface MinimalWordSeoNotFoundResponse {
  body: string;
  contentType: "text/plain; charset=utf-8";
  status: 404;
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
const ENTRY_SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT_DIR = path.resolve(ENTRY_SERVER_DIR, "..");
const INTERFACE_FILENAME_BY_UI_LANGUAGE: Record<UiLanguageCode, string> = {
  en: "english_interface.json",
  es: "spanish_interface.json",
  fr: "french_interface.json",
  de: "german_interface.json",
  it: "italian_interface.json",
  pt: "portuguese_interface.json",
  ru: "russian_interface.json",
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

function loadInterfaceDataSync(uiLanguage: UiLanguageCode): unknown {
  const interfaceFilename = INTERFACE_FILENAME_BY_UI_LANGUAGE[uiLanguage] ?? INTERFACE_FILENAME_BY_UI_LANGUAGE.en;
  const interfacePath = path.join(PROJECT_ROOT_DIR, "src", "data", "interface", interfaceFilename);
  const raw = fs.readFileSync(interfacePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function getInitialWordPageData(url: string): ResolvedWordPageData | null {
  const resolution = resolveWordSeoRequest(url);
  if (resolution.kind !== "canonical") {
    return null;
  }
  return resolution.initialWordPageData;
}

function getInitialBrowsePreviewData(url: string): LevelBrowsePreviewData | null {
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
    status: 404,
    contentType: "text/plain; charset=utf-8",
    body: "404 Not Found",
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

export async function render(url: string, siteOrigin = DEFAULT_SITE_ORIGIN) {
  const seoManager: SeoManager = { metadata: null };
  const wordSeoResolution = resolveWordSeoRequest(url);
  const pathname = url.split(/[?#]/, 1)[0] || "/";
  const shouldUseWordNotFoundMetadata =
    wordSeoResolution.kind === "not-found" &&
    (pathname.startsWith("/api/word-ssr") ||
      (/^\/[a-z]{2}\/[^/?#]+$/.test(pathname) && pathname.includes("-word-")));
  const initialUILanguage = getInitialUiLanguage(url);
  const initialInterfaceData = loadInterfaceDataSync(initialUILanguage);
  const initialWordPageData =
    wordSeoResolution.kind === "canonical" ? wordSeoResolution.initialWordPageData : null;
  const initialBrowsePreviewData = getInitialBrowsePreviewData(url);
  const ssrWordRouteMatch = (() => {
    const routeMatch = pathname.match(/^\/([a-z]{2})\/([^/?#]+)$/);
    if (!routeMatch) {
      return null;
    }

    return resolveWordRoute(routeMatch[1], routeMatch[2]);
  })();
  const ssrRouteOverride:
    | {
        page: "wordPage" | "notFound";
        wordRoute?: WordRouteMatch | null;
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
  const hydrationWordPageData = buildHydrationWordPageData(initialWordPageData);
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
