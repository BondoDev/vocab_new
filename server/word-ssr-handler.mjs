import { handleWordSsrPathname } from "./word-ssr-runtime.mjs";
import {
  API_METHODS,
  PAGE_METHODS,
  buildBlockedWordApiResponse,
  buildMethodNotAllowedResponse,
  buildOptionsResponse,
  buildServerErrorResponse,
  getRequestMethod,
  normalizeWordSsrPathname,
  requestHasTrustedWordRewrite,
} from "./word-ssr-http.mjs";

const SUPPORTED_TARGET_LANGUAGES = [
  "english",
  "german",
  "spanish",
  "french",
  "italian",
  "portuguese",
  "russian",
];

const CONCEPT_ID_PATTERN = /^(A1|A2|B1|B2|C1|C2)-\d{5}$/;

function buildWordPathFromSlug(uiLang, targetLanguage, wordSlug, conceptId) {
  return `/${uiLang}/${targetLanguage}-word-${wordSlug}--${conceptId}`;
}

function parseLegacyWordRoute(uiLangRaw, slug) {
  if (!/^[a-z]{2}$/i.test(uiLangRaw)) {
    return null;
  }

  for (const targetLanguage of SUPPORTED_TARGET_LANGUAGES) {
    const prefix = `${targetLanguage}-word-`;
    if (!slug.startsWith(prefix)) {
      continue;
    }

    const suffix = slug.slice(prefix.length);
    if (!suffix || suffix.includes("--")) {
      return null;
    }

    const legacyMatch = suffix.match(/^(.*)-((?:A1|A2|B1|B2|C1|C2)-\d{5})$/);
    if (!legacyMatch) {
      return null;
    }

    const [, wordSlug, conceptId] = legacyMatch;
    if (!wordSlug || !CONCEPT_ID_PATTERN.test(conceptId)) {
      return null;
    }

    return {
      uiLang: uiLangRaw,
      targetLanguage,
      wordSlug,
      conceptId,
    };
  }

  return null;
}

export function buildWordSsrRequest(req, fallbackUrl = "/") {
  const pathnameValue = req?.query?.pathname ?? req?.url ?? fallbackUrl;
  const pathname = Array.isArray(pathnameValue) ? pathnameValue[0] : pathnameValue;
  const normalizedPathname = normalizeWordSsrPathname(pathname);

  return {
    method: getRequestMethod(req),
    pathname,
    normalizedPathname,
  };
}

export async function handleBlockedWordApiRequest(req) {
  const { method } = buildWordSsrRequest(req);

  if (method === "OPTIONS") {
    return buildOptionsResponse(API_METHODS);
  }

  if (method !== "GET" && method !== "HEAD") {
    return buildMethodNotAllowedResponse(API_METHODS);
  }

  return buildBlockedWordApiResponse();
}

export async function handleInternalWordSsrRequest(req) {
  const { method, pathname, normalizedPathname } = buildWordSsrRequest(req);
  const routeMatch = normalizedPathname.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  const isTrustedRewrite = requestHasTrustedWordRewrite(req, normalizedPathname);

  if (method === "OPTIONS") {
    return buildOptionsResponse(isTrustedRewrite ? PAGE_METHODS : API_METHODS);
  }

  if (method !== "GET" && method !== "HEAD") {
    return buildMethodNotAllowedResponse(isTrustedRewrite ? PAGE_METHODS : API_METHODS);
  }

  if (isTrustedRewrite && routeMatch) {
    const [, uiLangRaw, slug] = routeMatch;
    const parsedRoute = parseLegacyWordRoute(uiLangRaw, slug);

    if (parsedRoute) {
      return {
        status: 308,
        headers: {
          Location: buildWordPathFromSlug(
            parsedRoute.uiLang,
            parsedRoute.targetLanguage,
            parsedRoute.wordSlug,
            parsedRoute.conceptId,
          ),
          "Cache-Control": "public, max-age=0, s-maxage=300",
        },
        body: "",
      };
    }
  }

  if (!isTrustedRewrite) {
    return buildBlockedWordApiResponse();
  }

  try {
    return await handleWordSsrPathname(normalizedPathname);
  } catch (error) {
    console.error("Word SSR handler failed", {
      pathname,
      error,
    });
    return buildServerErrorResponse();
  }
}
