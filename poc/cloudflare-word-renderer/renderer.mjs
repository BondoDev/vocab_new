// EXPERIMENTAL / proof-of-concept ONLY.
//
// This module is NOT imported by any production entry point (src/, server/,
// scripts/ used by `npm run build`). It exists to prove that a word page can
// be rendered from compact precomputed records without:
//   - React / renderToPipeableStream
//   - node:fs / node:stream at request time (record loading is injected by the
//     caller — see run-parity-check.mjs / run-redirect-error-check.mjs for the
//     Node-only *local test harness* that loads JSON off disk; a real Workers
//     deployment would inject records fetched from R2/KV/D1 instead)
//   - full vocabulary array scans (all lookups below are O(1) object-key or
//     precomputed-array access against the ~81-record sample)
//
// Route classification is reused from the real production modules
// (src/data/seo/wordRouteManifest.ts et al, compiled via compile-shared-modules.mjs)
// so redirect/410 behavior matches production by construction, not by
// reimplementing regexes that could drift.
import {
  buildWordSeoMetadataPoc,
  renderSeoTagsPoc,
  renderWordPageBodyHtml,
  renderFullHtmlDocument,
} from "./template.mjs";

const TARGET_LANGUAGE_DISPLAY_NAMES = {
  english: "English",
  german: "German",
  spanish: "Spanish",
  french: "French",
  italian: "Italian",
  portuguese: "Portuguese",
  russian: "Russian",
};

const WORD_PAGE_BROWSE_WORDS_PER_PAGE = 54; // matches production WORD_PAGE_BROWSE_WORDS_PER_PAGE
const WORD_PAGE_DISCOVERY_LINK_COUNT = 12; // matches production WORD_PAGE_DISCOVERY_LINK_COUNT

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Same deterministic pseudo-random selection as buildDiscoveryWords() in wordPageData.ts. */
function selectDiscoveryConceptIds(conceptId, candidateIds) {
  const filtered = candidateIds.filter((id) => id !== conceptId);
  if (filtered.length <= WORD_PAGE_DISCOVERY_LINK_COUNT) {
    return filtered;
  }
  const seed = hashString(conceptId);
  const startIndex = seed % filtered.length;
  let step = (seed % Math.max(filtered.length - 1, 1)) + 1;
  while (gcd(step, filtered.length) !== 1) {
    step += 1;
  }
  const selected = [];
  let index = startIndex;
  while (selected.length < WORD_PAGE_DISCOVERY_LINK_COUNT) {
    selected.push(filtered[index]);
    index = (index + step) % filtered.length;
  }
  return selected;
}

function buildCacheControl(status) {
  if (status === 200) return "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
  if (status === 410 || status === 404 || status === 308) return "public, max-age=0, s-maxage=300";
  return "no-store";
}

function minimalNotFoundResponse(reason) {
  return {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": buildCacheControl(410),
      "X-Robots-Tag": "noindex, nofollow",
    },
    body: "410 Gone",
    routeKind: "not-found",
    reason,
  };
}

function redirectResponse(location) {
  return {
    status: 308,
    headers: {
      Location: location,
      "Cache-Control": buildCacheControl(308),
    },
    body: "",
    routeKind: "redirect",
  };
}

/**
 * Pure function: pathname + siteOrigin + already-loaded record store -> HTTP-shaped response.
 * `shared` is the object returned by loadSharedWordRouteModules().
 * `store` is { concepts, uiOverlay, browseShard } — plain objects, already in memory.
 */
export function renderWordPocResponse(pathname, siteOrigin, shared, store) {
  const parsed = shared.parseWordRoutePathname(pathname);

  if (parsed.kind === "not-word-route") {
    return minimalNotFoundResponse("not-word-route");
  }

  if (parsed.kind === "legacy-single-hyphen" || parsed.kind === "legacy-slug-format") {
    const location = shared.buildWordBrowsePagePathFromSlug(
      parsed.uiLang,
      parsed.targetLanguage,
      parsed.wordSlug,
      parsed.conceptId,
      parsed.browsePage,
    );
    return redirectResponse(location);
  }

  if (parsed.kind !== "canonical") {
    // invalid-concept-id, invalid-browse-page, malformed-route,
    // unsupported-ui-language, unsupported-target-language, slug-only
    return minimalNotFoundResponse(parsed.kind === "slug-only" ? "slug-only-route" : "invalid-route");
  }

  const concept = store.concepts[parsed.conceptId];
  if (!concept) {
    return minimalNotFoundResponse("missing-record");
  }

  if (concept.slug !== parsed.wordSlug) {
    // Accent-insensitive recovery, mirroring findWordEntryIgnoringAccents in
    // src/data/seo/wordPageData.ts: if the exact slug doesn't match but the
    // accent-insensitive form does, redirect to the canonical accented URL
    // instead of treating the word as missing.
    if (shared.stripDiacriticsForComparison(concept.slug) === shared.stripDiacriticsForComparison(parsed.wordSlug)) {
      const location = shared.buildWordBrowsePagePathFromSlug(
        parsed.uiLang,
        parsed.targetLanguage,
        concept.slug,
        parsed.conceptId,
        parsed.browsePage,
      );
      return redirectResponse(location);
    }
    return minimalNotFoundResponse("missing-record");
  }

  const browseShard = store.browseShard;
  const totalBrowsePages = Math.max(1, Math.ceil(browseShard.totalCount / WORD_PAGE_BROWSE_WORDS_PER_PAGE));
  if (parsed.browsePage > totalBrowsePages) {
    return minimalNotFoundResponse("missing-record");
  }

  const targetLanguageDisplayName = TARGET_LANGUAGE_DISPLAY_NAMES[parsed.targetLanguage] ?? parsed.targetLanguage;

  const otherMeanings = concept.otherMeaningConceptIds
    .map((id) => store.concepts[id])
    .filter(Boolean);
  const relatedWords = concept.relatedConceptIds.map((id) => store.concepts[id]).filter(Boolean);

  const discoveryConceptIds = selectDiscoveryConceptIds(concept.conceptId, browseShard.orderedConceptIds);
  const discoveryWords = discoveryConceptIds.map((id) => store.concepts[id]).filter(Boolean);

  const startIndex = (parsed.browsePage - 1) * WORD_PAGE_BROWSE_WORDS_PER_PAGE;
  const pageConceptIds = browseShard.orderedConceptIds.slice(startIndex, startIndex + WORD_PAGE_BROWSE_WORDS_PER_PAGE);
  const browseLinks = pageConceptIds
    .map((id) => store.concepts[id])
    .filter(Boolean)
    .map((entry) => ({
      conceptId: entry.conceptId,
      wordLemma: entry.wordLemma,
      href: shared.buildWordPath(parsed.uiLang, parsed.targetLanguage, entry.wordLemma, entry.conceptId),
    }));

  const canonicalPathname = shared.buildWordBrowsePagePathFromSlug(
    parsed.uiLang,
    parsed.targetLanguage,
    concept.slug,
    concept.conceptId,
    parsed.browsePage,
  );

  const metadata = buildWordSeoMetadataPoc({
    shared,
    uiLang: parsed.uiLang,
    targetLanguage: parsed.targetLanguage,
    targetLanguageDisplayName,
    wordLemma: concept.wordLemma,
    conceptId: concept.conceptId,
    definition: concept.definition,
    wordType: concept.grammarType,
    cefrLevel: concept.level,
    pathname: canonicalPathname,
    siteOrigin,
    browsePage: parsed.browsePage,
  });

  const headTags = renderSeoTagsPoc(metadata);
  const bodyHtml = renderWordPageBodyHtml({
    shared,
    uiLang: parsed.uiLang,
    targetLanguage: parsed.targetLanguage,
    targetLanguageDisplayName,
    concept,
    otherMeanings,
    relatedWords,
    discoveryWords,
    browseLinks,
    browsePage: parsed.browsePage,
    totalBrowsePages,
  });

  const hydrationPayload = {
    pathname: canonicalPathname,
    data: {
      wordEntry: concept,
      browseWordsTotalCount: browseShard.totalCount,
      browsePage: parsed.browsePage,
    },
  };

  const html = renderFullHtmlDocument({
    uiLang: parsed.uiLang,
    headTags,
    bodyHtml,
    hydrationPayload,
  });

  return {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": buildCacheControl(200),
    },
    body: html,
    routeKind: "canonical",
    metadata,
  };
}
