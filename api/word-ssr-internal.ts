import { handleWordSsrPathname } from "../server/word-ssr-runtime.mjs";
import {
  buildWordPathFromSlug,
  parseWordRoute,
} from "../src/data/seo/wordSlugs";

export default async function handler(req: any, res: any) {
  const pathnameValue = req.query?.pathname ?? req.url ?? "/";
  const pathname = Array.isArray(pathnameValue) ? pathnameValue[0] : pathnameValue;
  const normalizedPathname = `/${String(pathname ?? "/").replace(/^\/+/, "")}`.split(/[?#]/, 1)[0] || "/";
  const routeMatch = normalizedPathname.match(/^\/([a-z]{2})\/([^/?#]+)$/);

  if (routeMatch) {
    const [, uiLangRaw, slug] = routeMatch;
    const parsedRoute = parseWordRoute(uiLangRaw, slug);

    if (parsedRoute?.routeKind === "legacy-single-hyphen") {
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
