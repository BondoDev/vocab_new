import { handleWordSsrPathname } from "../server/word-ssr-runtime.mjs";

const SUPPORTED_TARGET_LANGUAGES = [
  "english",
  "german",
  "spanish",
  "french",
  "italian",
  "portuguese",
  "russian",
] as const;

const CONCEPT_ID_PATTERN = /^(A1|A2|B1|B2|C1|C2)-\d{5}$/;

function buildWordPathFromSlug(
  uiLang: string,
  targetLanguage: string,
  wordSlug: string,
  conceptId: string,
) {
  return `/${uiLang}/${targetLanguage}-word-${wordSlug}--${conceptId}`;
}

function parseLegacyWordRoute(uiLangRaw: string, slug: string) {
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

export default async function handler(req: any, res: any) {
  const pathnameValue = req.query?.pathname ?? req.url ?? "/";
  const pathname = Array.isArray(pathnameValue) ? pathnameValue[0] : pathnameValue;
  const normalizedPathname = `/${String(pathname ?? "/").replace(/^\/+/, "")}`.split(/[?#]/, 1)[0] || "/";
  const routeMatch = normalizedPathname.match(/^\/([a-z]{2})\/([^/?#]+)$/);

  if (routeMatch) {
    const [, uiLangRaw, slug] = routeMatch;
    const parsedRoute = parseLegacyWordRoute(uiLangRaw, slug);

    if (parsedRoute) {
      res.statusCode = 308;
      res.setHeader(
        "Location",
        buildWordPathFromSlug(
          parsedRoute.uiLang,
          parsedRoute.targetLanguage,
          parsedRoute.wordSlug,
          parsedRoute.conceptId,
        ),
      );
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
      res.end("");
      return;
    }
  }

  try {
    const response = await handleWordSsrPathname(normalizedPathname);

    res.statusCode = response.status;

    for (const [headerName, headerValue] of Object.entries(response.headers)) {
      res.setHeader(headerName, headerValue);
    }

    res.end(response.body);
  } catch (error) {
    console.error("Word SSR handler failed", {
      pathname,
      error,
    });

    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Server Error</title></head><body><h1>Server Error</h1><p>The requested page could not be rendered.</p></body></html>");
  }
}
