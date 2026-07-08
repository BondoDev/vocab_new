// STAGING-ONLY Cloudflare Worker. Not deployed, not wired to any production
// route or domain. Scope: UI=English, target=English, CEFR=A1, ~81 words.
//
// This whole file (plus render-entry.tsx, which imports the real
// WordSeoPage.tsx) is pre-bundled by Vite — see vite.worker.config.mjs and
// build-worker.mjs — NOT Wrangler's own esbuild, because WordSeoPage.tsx and
// its dependencies use import.meta.glob (Vite-only syntax) that plain esbuild
// cannot resolve. Vite statically transforms those globs into code-split
// dynamic import() targets at build time; wrangler.toml then loads the
// already-bundled output with `no_bundle = true` so Wrangler doesn't try to
// re-bundle (and inline) those already-resolved lazy chunks itself.
import {
  parseWordRoutePathname,
  buildWordBrowsePagePathFromSlug,
  stripDiacriticsForComparison,
  type ParsedWordRoutePathnameResult,
} from "../../../src/data/seo/wordSlugs";
import { renderWordPage } from "./render-entry";
import wordPages from "../data/word-pages.english.a1.json";
import aliases from "../data/aliases.english.a1.json";
import browseShard from "../data/browse-shard.english-a1.json";
import manifest from "../data/manifest.json";
import clientAssets from "../data/client-assets.json";

const DATA_VERSION = manifest.dataVersion;
const SITE_ORIGIN_FALLBACK = "https://staging.example.internal";
const WORD_PAGES: Record<string, any> = wordPages;
const ALIASES: Record<string, string> = aliases;

const LINE_SEPARATOR_RE = new RegExp(String.fromCharCode(0x2028), "g");
const PARAGRAPH_SEPARATOR_RE = new RegExp(String.fromCharCode(0x2029), "g");

function escapeJsonForScript(value: string): string {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATOR_RE, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR_RE, "\\u2029");
}

function buildCacheControl(status: number): string {
  if (status === 200) return "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
  if (status === 410 || status === 308) return "public, max-age=0, s-maxage=300";
  return "no-store";
}

function textResponse(body: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": buildCacheControl(status),
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": DATA_VERSION,
      ...extraHeaders,
    },
  });
}

function redirectResponse(location: string): Response {
  // The Workers Headers implementation enforces ISO-8859-1 for header
  // values (per the Fetch spec); a raw UTF-8 character like "é" written
  // directly would come back mojibake'd ("Ã©") when read back, because each
  // UTF-8 byte gets reinterpreted as a separate Latin-1 code point. encodeURI
  // keeps the path structure (/, --, etc.) intact while percent-encoding the
  // non-ASCII bytes, which is ASCII-safe for a header value either way.
  // Node's http module is lenient here and writes raw bytes through, which is
  // why this doesn't surface in the current production Vercel/Node SSR path.
  return new Response("", {
    status: 308,
    headers: {
      Location: encodeURI(location),
      "Cache-Control": buildCacheControl(308),
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": DATA_VERSION,
    },
  });
}

function serverErrorResponse(): Response {
  return new Response("Internal Server Error", {
    status: 500,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": DATA_VERSION,
    },
  });
}

function buildFullHtmlDocument(params: {
  uiLang: string;
  headTags: string;
  appHtml: string;
  wordPageData: unknown;
  pathname: string;
}): string {
  const hydrationScript = `\n    <script>window.__WORD_PAGE_DATA__=${escapeJsonForScript(
    JSON.stringify({ pathname: params.pathname, data: params.wordPageData }),
  )}</script>`;
  const interfaceScript = `\n    <script>window.__INITIAL_INTERFACE_DATA__=${escapeJsonForScript(
    JSON.stringify({ lang: params.uiLang, data: {} }),
  )}</script>`;
  // NOTE: __INITIAL_INTERFACE_DATA__ is intentionally left as an empty `data`
  // object here (LanguageProvider on the client would re-fetch its own lazy
  // chunk for "en" if this staging page were hydrated by the real
  // entry-client.tsx bundle). The SSR render itself (render-entry.tsx) DOES
  // use the real, full english_interface.json server-side via
  // initialTranslationData, so server-rendered text is correct; only the
  // client-side hydration re-hydration-source duplication is trimmed here.
  // See "Differences from production SSR" in the final report.
  const scriptTag = clientAssets.scriptSrc
    ? `<script type="module" crossorigin src="${clientAssets.scriptSrc}"></script>`
    : "";
  const styleTag = clientAssets.styleHref
    ? `<link rel="stylesheet" crossorigin href="${clientAssets.styleHref}">`
    : "";
  const faviconTag = clientAssets.faviconHref ? `<link rel="icon" type="image/png" href="${clientAssets.faviconHref}">` : "";

  return `<!doctype html>
<html lang="${params.uiLang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${faviconTag}
    ${scriptTag}
    ${styleTag}
    ${params.headTags}${hydrationScript}${interfaceScript}
  </head>
  <body>
    <div id="root">${params.appHtml}</div>
  </body>
</html>`;
}

function classifyAndRespondNonCanonical(parsed: ParsedWordRoutePathnameResult): Response | null {
  if (parsed.kind === "legacy-single-hyphen" || parsed.kind === "legacy-slug-format") {
    const location = buildWordBrowsePagePathFromSlug(
      parsed.uiLang,
      parsed.targetLanguage,
      parsed.wordSlug,
      parsed.conceptId,
      parsed.browsePage,
    );
    return redirectResponse(location);
  }

  if (parsed.kind !== "canonical") {
    return textResponse("410 Gone", 410);
  }

  return null;
}

async function handleWordPageRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const siteOrigin = `${url.protocol}//${url.host}` || SITE_ORIGIN_FALLBACK;

  const parsed = parseWordRoutePathname(pathname);
  const earlyResponse = classifyAndRespondNonCanonical(parsed);
  if (earlyResponse) {
    return earlyResponse;
  }

  // parsed.kind === "canonical" from here on.
  const canonical = parsed as Extract<ParsedWordRoutePathnameResult, { kind: "canonical" }>;
  const record = WORD_PAGES[canonical.conceptId];

  if (!record) {
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "missing-record" });
  }

  const canonicalSlug = ALIASES[canonical.conceptId];
  if (canonicalSlug !== canonical.wordSlug) {
    if (stripDiacriticsForComparison(canonicalSlug) === stripDiacriticsForComparison(canonical.wordSlug)) {
      const location = buildWordBrowsePagePathFromSlug(
        canonical.uiLang,
        canonical.targetLanguage,
        canonicalSlug,
        canonical.conceptId,
        canonical.browsePage,
      );
      return redirectResponse(location);
    }
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "slug-mismatch" });
  }

  const totalBrowsePages = Math.max(1, Math.ceil(browseShard.totalCount / 54));
  if (canonical.browsePage > totalBrowsePages) {
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "browse-page-out-of-range" });
  }

  const { appHtml, headTags } = await renderWordPage({
    pathname,
    siteOrigin,
    uiLang: canonical.uiLang,
    targetLanguage: canonical.targetLanguage,
    wordSlug: canonical.wordSlug,
    conceptId: canonical.conceptId,
    browsePage: canonical.browsePage,
    // See the NOTE in render-entry.tsx: this is actually the compact
    // HydrationWordPageData shape, accepted at runtime via
    // normalizeWordPageDataForRender()'s dual-shape support.
    initialWordPageData: record,
  });

  const html = buildFullHtmlDocument({
    uiLang: canonical.uiLang,
    headTags,
    appHtml,
    wordPageData: record,
    pathname,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": buildCacheControl(200),
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": DATA_VERSION,
    },
  });
}

function handleBrowseSearchShardRequest(): Response {
  return new Response(JSON.stringify(browseShard), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": buildCacheControl(200),
      "X-Staging-Data-Version": DATA_VERSION,
    },
  });
}

function buildCacheKeyRequest(request: Request): Request {
  const url = new URL(request.url);
  // Cache key: hostname + normalized pathname + data version. Irrelevant
  // query parameters are dropped entirely (word pages carry none that affect
  // rendering) so arbitrary query strings can't poison the cache.
  const keyUrl = new URL(`${url.protocol}//${url.host}${url.pathname}`);
  keyUrl.searchParams.set("v", DATA_VERSION);
  return new Request(keyUrl.toString(), { method: "GET" });
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/staging-assets/browse-shard/english-a1.json") {
        return handleBrowseSearchShardRequest();
      }

      const cache = caches.default;
      const cacheKeyRequest = buildCacheKeyRequest(request);
      const cached = await cache.match(cacheKeyRequest);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Staging-Cache", "HIT");
        return new Response(cached.body, { status: cached.status, headers });
      }

      const response = await handleWordPageRequest(request);
      const headers = new Headers(response.headers);
      headers.set("X-Staging-Cache", "MISS");
      const finalResponse = new Response(response.body, { status: response.status, headers });

      // Do not cache 500s; do cache 200/308/410 per their own Cache-Control
      // (all already carry an explicit, bounded TTL — never "forever").
      if (response.status !== 500) {
        ctx.waitUntil(cache.put(cacheKeyRequest, finalResponse.clone()));
      }

      return finalResponse;
    } catch (error) {
      console.error("Staging word worker failed", error);
      return serverErrorResponse();
    }
  },
};
