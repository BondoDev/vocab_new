// STAGING-ONLY, FULL-CORPUS Cloudflare Worker. Scope: all 7 UI languages ×
// all 7 target languages × all CEFR levels (~74,000 concepts / ~518,000
// renderable canonical routes). This is a SEPARATE entry point from
// src/index.ts (the original 81-word English-A1 sample, left untouched for
// rollback) — see the final report's "Existing sample files and retirement
// status" section for why both exist side by side.
//
// Data comes from Cloudflare Workers Static Assets (env.ASSETS), NOT R2 —
// R2 is not enabled on this account and must not be (no billing). See
// src/shard-store.ts for the storage abstraction that makes this swappable
// later without touching this file's routing/rendering logic.
import {
  parseWordRoutePathname,
  buildWordBrowsePagePathFromSlug,
  stripDiacriticsForComparison,
  type ParsedWordRoutePathnameResult,
} from "../../../src/data/seo/wordRouteManifest";
import { renderWordPage } from "./render-entry";
import { createAssetsShardStore, withInIsolateMemoization, type ShardStore } from "./shard-store";

const BROWSE_PAGE_SIZE = 54;
const SITE_ORIGIN_FALLBACK = "https://staging.example.internal";

// Mirrors production's UI_LANG_TO_VOCAB (src/data/seo/wordPageData.ts,
// private/not exported there) — which UI language shows which language's
// OWN vocabulary as overlay data when it differs from the word's target
// language.
const UI_LANG_TO_VOCAB: Record<string, string> = {
  en: "english",
  es: "spanish",
  fr: "french",
  de: "german",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

interface ConceptRecord {
  lemma: string;
  definition: string;
  example: string;
  grammarType: string;
  category: string;
  level: string;
  canonicalSlug: string;
  relatedIds: string[];
  discoveryIds: string[];
  otherMeanings: Array<{ conceptId: string; lemma: string; definition: string; level: string; grammarType: string }>;
}

interface OverlayRecord {
  lemma: string;
  definition: string;
  grammarType: string;
  category: string;
}

interface BrowseShard {
  targetLanguage: string;
  level: string;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  words: Array<{ conceptId: string; lemma: string }>;
}

type ConceptShardIndexEntry = string | Array<{ rangeStart: number; rangeEnd: number; path: string }>;

interface Manifest {
  dataVersion: string;
  browsePageSize: number;
  shards: {
    concepts: Record<string, Record<string, ConceptShardIndexEntry>>;
    overlays: Record<string, Record<string, string>>;
    browse: Record<string, Record<string, string>>;
  };
}

let manifestStore: ShardStore | null = null;
let conceptStore: ShardStore | null = null;

function getConceptLevel(conceptId: string): string {
  // Concept IDs are "{LEVEL}-{5-digit-number}", e.g. "B2-03057" -> "B2".
  return conceptId.split("-")[0];
}

function getConceptNumericId(conceptId: string): number {
  return Number.parseInt(conceptId.split("-")[1] ?? "0", 10);
}

async function loadManifest(assets: Fetcher, siteOrigin: string): Promise<Manifest> {
  if (!manifestStore) {
    manifestStore = withInIsolateMemoization(createAssetsShardStore(assets, siteOrigin));
  }
  // "latest" is a stable, version-independent pointer path (see
  // publish-shards.mjs) — refetching it (subject to in-isolate memoization)
  // is how a newly-published data version becomes visible without a Worker
  // redeploy. Cache API entries elsewhere already key on dataVersion, so a
  // moved pointer naturally busts stale cached responses (Phase 10).
  const manifest = await manifestStore.getShard<Manifest>("records/latest/manifest.json");
  if (!manifest) {
    throw new Error("records/latest/manifest.json not found in Static Assets — run publish-shards.mjs.");
  }
  return manifest;
}

function resolveConceptShardPath(entry: ConceptShardIndexEntry, conceptId: string): string | null {
  if (typeof entry === "string") {
    return entry;
  }
  const numericId = getConceptNumericId(conceptId);
  const match = entry.find((range) => numericId >= range.rangeStart && numericId <= range.rangeEnd);
  return match?.path ?? null;
}

function getConceptStore(assets: Fetcher, siteOrigin: string): ShardStore {
  if (!conceptStore) {
    conceptStore = withInIsolateMemoization(createAssetsShardStore(assets, siteOrigin));
  }
  return conceptStore;
}

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

function textResponse(body: string, status: number, extraHeaders: Record<string, string> = {}, dataVersion = "unknown"): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": buildCacheControl(status),
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": dataVersion,
      ...extraHeaders,
    },
  });
}

function redirectResponse(location: string, dataVersion: string): Response {
  // See src/index.ts for why encodeURI (not raw UTF-8) is required here —
  // the Workers Headers API enforces ISO-8859-1 for header values.
  return new Response("", {
    status: 308,
    headers: {
      Location: encodeURI(location),
      "Cache-Control": buildCacheControl(308),
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": dataVersion,
    },
  });
}

function serverErrorResponse(dataVersion = "unknown"): Response {
  return new Response("Internal Server Error", {
    status: 500,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": dataVersion,
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
  return `<!doctype html>
<html lang="${params.uiLang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${params.headTags}${hydrationScript}${interfaceScript}
  </head>
  <body>
    <div id="root">${params.appHtml}</div>
  </body>
</html>`;
}

function classifyAndRespondNonCanonical(parsed: ParsedWordRoutePathnameResult, dataVersion: string): Response | null {
  if (parsed.kind === "legacy-single-hyphen" || parsed.kind === "legacy-slug-format") {
    const location = buildWordBrowsePagePathFromSlug(
      parsed.uiLang,
      parsed.targetLanguage,
      parsed.wordSlug,
      parsed.conceptId,
      parsed.browsePage,
    );
    return redirectResponse(location, dataVersion);
  }
  if (parsed.kind !== "canonical") {
    return textResponse("410 Gone", 410, {}, dataVersion);
  }
  return null;
}

async function handleWordPageRequest(request: Request, assets: Fetcher): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const siteOrigin = `${url.protocol}//${url.host}` || SITE_ORIGIN_FALLBACK;

  const manifest = await loadManifest(assets, siteOrigin);
  const dataVersion = manifest.dataVersion;

  const parsed = parseWordRoutePathname(pathname);
  const earlyResponse = classifyAndRespondNonCanonical(parsed, dataVersion);
  if (earlyResponse) {
    return earlyResponse;
  }

  const canonical = parsed as Extract<ParsedWordRoutePathnameResult, { kind: "canonical" }>;
  const level = getConceptLevel(canonical.conceptId);
  const conceptShardIndex = manifest.shards.concepts[canonical.targetLanguage]?.[level];
  if (!conceptShardIndex) {
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "missing-shard" }, dataVersion);
  }

  const conceptShardPath = resolveConceptShardPath(conceptShardIndex, canonical.conceptId);
  if (!conceptShardPath) {
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "missing-shard-range" }, dataVersion);
  }

  const store = getConceptStore(assets, siteOrigin);
  const conceptShard = await store.getShard<Record<string, ConceptRecord>>(
    `records/${dataVersion}/${conceptShardPath}`,
  );
  const record = conceptShard?.[canonical.conceptId];
  if (!record) {
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "missing-record" }, dataVersion);
  }

  if (record.canonicalSlug !== canonical.wordSlug) {
    if (stripDiacriticsForComparison(record.canonicalSlug) === stripDiacriticsForComparison(canonical.wordSlug)) {
      const location = buildWordBrowsePagePathFromSlug(
        canonical.uiLang,
        canonical.targetLanguage,
        record.canonicalSlug,
        canonical.conceptId,
        canonical.browsePage,
      );
      return redirectResponse(location, dataVersion);
    }
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "slug-mismatch" }, dataVersion);
  }

  const browseShardPath = manifest.shards.browse[canonical.targetLanguage]?.[level];
  const browseShard = browseShardPath
    ? await store.getShard<BrowseShard>(`records/${dataVersion}/${browseShardPath}`)
    : null;
  if (!browseShard) {
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "missing-browse-shard" }, dataVersion);
  }

  const totalBrowsePages = Math.max(1, Math.ceil(browseShard.totalCount / BROWSE_PAGE_SIZE));
  if (canonical.browsePage > totalBrowsePages) {
    return textResponse("410 Gone", 410, { "X-Staging-Reason": "browse-page-out-of-range" }, dataVersion);
  }

  // UI overlay: only consulted when the UI language's own vocabulary
  // differs from the word's target language (mirrors production's
  // buildResolvedWordPageData in src/data/seo/wordPageData.ts).
  let displayDefinition = record.definition;
  let displayWordLemma = record.lemma;
  let displayWordType = record.grammarType;
  let displayCategory = record.category;
  const overlayLanguage = UI_LANG_TO_VOCAB[canonical.uiLang];
  if (overlayLanguage && overlayLanguage !== canonical.targetLanguage) {
    const overlayShardPath = manifest.shards.overlays[canonical.uiLang]?.[level];
    const overlayShard = overlayShardPath
      ? await store.getShard<Record<string, OverlayRecord>>(`records/${dataVersion}/${overlayShardPath}`)
      : null;
    const overlayRecord = overlayShard?.[canonical.conceptId];
    if (overlayRecord) {
      displayDefinition = overlayRecord.definition || displayDefinition;
      displayWordLemma = overlayRecord.lemma || displayWordLemma;
      displayWordType = overlayRecord.grammarType || displayWordType;
      displayCategory = overlayRecord.category || displayCategory;
    }
  }

  const browseStart = (canonical.browsePage - 1) * BROWSE_PAGE_SIZE;
  const browseWords = browseShard.words
    .slice(browseStart, browseStart + BROWSE_PAGE_SIZE)
    .map((w) => ({ conceptId: w.conceptId, wordLemma: w.lemma }));

  // relatedIds/discoveryIds are both selected FROM the level's browse-
  // eligible word list (see generate-full-corpus.mjs: buildRelatedConceptIds
  // and selectDiscoveryConceptIds both filter/sample from the same
  // isValidBrowseWordLemma-filtered set that browseShard.words already is) —
  // so browseShard's already-fetched, always-FULL-LEVEL (conceptId, lemma)
  // list is guaranteed to contain every related/discovery reference, even
  // for a level whose concept records are range-sharded across multiple
  // files (14 of the 42 levels — see generate-full-corpus.mjs's
  // RANGE_THRESHOLD). Resolving from browseShard instead of the single,
  // possibly-partial conceptShard just fetched for the primary record
  // avoids silently dropping related/discovery links whose target concept
  // lives in a different range sub-shard.
  const levelLemmaByConceptId = new Map(browseShard.words.map((w) => [w.conceptId, w.lemma]));
  const resolveFromLevel = (id: string) => {
    const lemma = levelLemmaByConceptId.get(id);
    return lemma ? { conceptId: id, wordLemma: lemma } : null;
  };

  const initialWordPageData = {
    wordEntry: {
      conceptId: canonical.conceptId,
      wordLemma: record.lemma,
      definition: record.definition,
      sentence: record.example,
      grammarType: record.grammarType,
      category: record.category,
      level: record.level,
    },
    displayDefinition,
    displayWordLemma,
    displayWordType,
    displayCategory,
    relatedWords: record.relatedIds.map(resolveFromLevel).filter(Boolean),
    discoveryWords: record.discoveryIds.map(resolveFromLevel).filter(Boolean),
    browseWords,
    otherMeanings: record.otherMeanings.map((o) => ({
      conceptId: o.conceptId,
      wordLemma: o.lemma,
      definition: o.definition,
      level: o.level,
      grammarType: o.grammarType,
    })),
    browseWordsTotalCount: browseShard.totalCount,
    browsePage: canonical.browsePage,
  };

  const { appHtml, headTags } = await renderWordPage({
    pathname,
    siteOrigin,
    uiLang: canonical.uiLang,
    targetLanguage: canonical.targetLanguage,
    wordSlug: canonical.wordSlug,
    conceptId: canonical.conceptId,
    browsePage: canonical.browsePage,
    // Structurally matches HydrationWordPageData; `as never` only works
    // around relatedWords/discoveryWords still typing as (T | null)[] after
    // .filter(Boolean) above (a well-known TS narrowing gap, not a real
    // shape mismatch).
    initialWordPageData: initialWordPageData as never,
  });

  const html = buildFullHtmlDocument({ uiLang: canonical.uiLang, headTags, appHtml, wordPageData: initialWordPageData, pathname });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": buildCacheControl(200),
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": dataVersion,
    },
  });
}

async function handleBrowseSearchShardRequest(
  targetLanguage: string,
  level: string,
  assets: Fetcher,
  siteOrigin: string,
): Promise<Response> {
  const manifest = await loadManifest(assets, siteOrigin);
  const browseShardPath = manifest.shards.browse[targetLanguage]?.[level.toUpperCase()];
  if (!browseShardPath) {
    return textResponse("Not Found", 404, {}, manifest.dataVersion);
  }
  const store = getConceptStore(assets, siteOrigin);
  const browseShard = await store.getShard(`records/${manifest.dataVersion}/${browseShardPath}`);
  if (!browseShard) {
    return textResponse("Not Found", 404, {}, manifest.dataVersion);
  }
  return new Response(JSON.stringify(browseShard), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": buildCacheControl(200),
      "X-Robots-Tag": "noindex, nofollow",
      "X-Staging-Data-Version": manifest.dataVersion,
    },
  });
}

function buildCacheKeyRequest(request: Request, dataVersion: string): Request {
  const url = new URL(request.url);
  const keyUrl = new URL(`${url.protocol}//${url.host}${url.pathname}`);
  keyUrl.searchParams.set("v", dataVersion);
  return new Request(keyUrl.toString(), { method: "GET" });
}

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const browseSearchMatch = url.pathname.match(/^\/staging-assets\/browse-shard\/([a-z]+)\/([a-z0-9]+)\.json$/i);
      if (browseSearchMatch) {
        const [, targetLanguage, level] = browseSearchMatch;
        return handleBrowseSearchShardRequest(targetLanguage, level, env.ASSETS, `${url.protocol}//${url.host}`);
      }

      // dataVersion for the cache key: read from the manifest via the
      // memoized store (cheap after the first request in this isolate).
      const manifest = await loadManifest(env.ASSETS, `${url.protocol}//${url.host}`);

      const cache = caches.default;
      const cacheKeyRequest = buildCacheKeyRequest(request, manifest.dataVersion);
      const cached = await cache.match(cacheKeyRequest);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Staging-Cache", "HIT");
        return new Response(cached.body, { status: cached.status, headers });
      }

      const response = await handleWordPageRequest(request, env.ASSETS);
      const headers = new Headers(response.headers);
      headers.set("X-Staging-Cache", "MISS");
      const finalResponse = new Response(response.body, { status: response.status, headers });

      if (response.status !== 500) {
        ctx.waitUntil(cache.put(cacheKeyRequest, finalResponse.clone()));
      }

      return finalResponse;
    } catch (error) {
      console.error("Full-corpus staging word worker failed", error);
      return serverErrorResponse();
    }
  },
};
