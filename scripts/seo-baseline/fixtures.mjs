/**
 * Baseline SEO fixture registry.
 *
 * This is the single, shared, deterministic source of representative routes
 * used by the new seo-baseline test/benchmark/capture scripts (it does not
 * replace or modify any pre-existing test script's own inline fixtures).
 *
 * Every fixture is derived programmatically from the *current* repository
 * data (vocabulary JSON, route-building helpers) rather than hardcoded as a
 * frozen word/ID list, so the suite keeps working if vocabulary rows are
 * reordered, added, or renumbered — as long as the same *selection rule*
 * still finds a candidate. Each fixture below documents the rule used and
 * why it is expected to remain stable.
 *
 * Usage:
 *   import { loadBaselineContext, buildFixtureMatrix } from "./fixtures.mjs";
 *   const ctx = loadBaselineContext();
 *   const fixtures = buildFixtureMatrix(ctx);
 *   ctx.cleanup(); // removes the scratch TypeScript-compile directory
 */

import path from "node:path";
import { compileTsToCommonJs, readJson, ROOT_DIR } from "./lib/compileTs.mjs";

const SITE_ORIGIN = "https://www.fluentstellar.com";
const TARGET_LANGUAGES = [
  "english",
  "german",
  "spanish",
  "french",
  "italian",
  "portuguese",
  "russian",
];
const UI_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ru"];

export function loadBaselineContext() {
  const compiled = compileTsToCommonJs(".tmp-seo-baseline-fixtures", [
    path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordSlugs.ts"),
    path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordPageData.ts"),
    path.join(ROOT_DIR, "src", "data", "seo", "slugs.ts"),
    path.join(ROOT_DIR, "src", "data", "seo", "shared", "hub.ts"),
    path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordHubRoutes.ts"),
    path.join(ROOT_DIR, "src", "data", "seo", "shared", "browseWordValidation.ts"),
    path.join(ROOT_DIR, "src", "utils", "fixMojibake.ts"),
  ]);

  const wordSlugs = compiled.require("src/data/seo/wordPages/wordSlugs");
  const wordPageData = compiled.require("src/data/seo/wordPages/wordPageData");
  const slugsModule = compiled.require("src/data/seo/slugs");
  const hub = compiled.require("src/data/seo/shared/hub");
  const wordHubRoutes = compiled.require("src/data/seo/wordPages/wordHubRoutes");
  const browseWordValidation = compiled.require("src/data/seo/shared/browseWordValidation");
  const { fixMojibake } = compiled.require("src/utils/fixMojibake");

  const vocabularies = Object.fromEntries(
    TARGET_LANGUAGES.map((lang) => [
      lang,
      readJson(`src/data/vocabulary/${lang}/vocabulary.json`),
    ]),
  );

  return {
    wordSlugs,
    wordPageData,
    slugsModule,
    hub,
    wordHubRoutes,
    browseWordValidation,
    fixMojibake,
    vocabularies,
    siteOrigin: SITE_ORIGIN,
    uiLanguages: UI_LANGUAGES,
    targetLanguages: TARGET_LANGUAGES,
    cleanup: compiled.cleanup,
  };
}

// ── Deterministic selection rules ────────────────────────────────────────────
// Each rule scans the vocabulary array in its existing (stored) order and
// takes the first match. As long as the underlying vocabulary.json files
// aren't reordered, the same fixture is produced on every run.

function firstEntry(vocabulary) {
  return vocabulary[0];
}

function lastEntry(vocabulary) {
  return vocabulary[vocabulary.length - 1];
}

function firstEntryAtLevel(vocabulary, level) {
  return vocabulary.find((entry) => entry.level === level) ?? null;
}

/** First lemma (by slug) that maps to more than one vocabulary row. */
function findAmbiguousSlugGroup(vocabulary, wordToSlug) {
  const bySlug = new Map();
  for (const entry of vocabulary) {
    const slug = wordToSlug(entry.word_lemma);
    const list = bySlug.get(slug) ?? [];
    list.push(entry);
    bySlug.set(slug, list);
  }
  for (const group of bySlug.values()) {
    if (group.length > 1) return group;
  }
  return null;
}

/** First entry whose slug is plain ASCII a-z0-9- (used as a general-purpose "simple" word). */
function findSimpleAsciiEntry(vocabulary, wordToSlug) {
  return (
    vocabulary.find((entry) => {
      const slug = wordToSlug(entry.word_lemma);
      return /^[a-z0-9-]+$/.test(slug) && String(entry.concept_id ?? "").trim().length > 0;
    }) ?? vocabulary[0]
  );
}

/** First entry whose slug contains a Unicode diacritic (needs NFC/accent-preserving handling). */
function findDiacriticEntry(vocabulary, wordToSlug) {
  return vocabulary.find((entry) => {
    const slug = wordToSlug(entry.word_lemma);
    return /[^\x00-\x7f]/.test(slug);
  });
}

/**
 * Builds the declarative baseline fixture matrix.
 *
 * @param {ReturnType<typeof loadBaselineContext>} ctx
 * @returns {Array<{
 *   id: string,
 *   family: string,
 *   url: string,
 *   expectedStatus: number,
 *   expectedRedirectLocation?: string,
 *   expectedCanonical?: string,
 *   expectedRobots?: string,
 *   reason: string,
 * }>}
 */
export function buildFixtureMatrix(ctx) {
  const { wordSlugs, vocabularies, siteOrigin, hub, wordHubRoutes } = ctx;
  const english = vocabularies.english;
  const fixtures = [];

  // ── Canonical word pages: one per target language ─────────────────────────
  for (const targetLanguage of ctx.targetLanguages) {
    const vocabulary = vocabularies[targetLanguage];
    const entry =
      targetLanguage === "english"
        ? english.find((e) => e.concept_id === "A1-00001") // "about" — used pervasively elsewhere, proven stable
        : findSimpleAsciiEntry(vocabulary, wordSlugs.wordToSlug);
    const pathname = wordSlugs.buildWordPath("en", targetLanguage, entry.word_lemma, entry.concept_id);
    fixtures.push({
      id: `word-canonical-${targetLanguage}`,
      family: "word-canonical",
      url: pathname,
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}${pathname}`,
      reason: `First unambiguous-slug entry in ${targetLanguage} vocabulary.json — covers one canonical word page per target language.`,
      entry,
      targetLanguage,
      uiLang: "en",
    });
  }

  // ── Canonical word page: one per UI language (reusing the English "about" word) ──
  const aboutEntry = english.find((e) => e.concept_id === "A1-00001");
  for (const uiLang of ctx.uiLanguages) {
    const pathname = wordSlugs.buildWordPath(uiLang, "english", aboutEntry.word_lemma, aboutEntry.concept_id);
    fixtures.push({
      id: `word-ui-lang-${uiLang}`,
      family: "word-ui-language-variant",
      url: pathname,
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}${pathname}`,
      reason: `English "about" (A1-00001) rendered under UI language "${uiLang}" — same underlying word/canonical resolution, different <html lang> and localized copy.`,
      entry: aboutEntry,
      targetLanguage: "english",
      uiLang,
    });
  }

  // ── Words across multiple CEFR levels (English) ───────────────────────────
  for (const level of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
    const entry = firstEntryAtLevel(english, level);
    if (!entry) continue;
    const pathname = wordSlugs.buildWordPath("en", "english", entry.word_lemma, entry.concept_id);
    fixtures.push({
      id: `word-level-${level}`,
      family: "word-cefr-level",
      url: pathname,
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}${pathname}`,
      reason: `First English vocabulary entry at CEFR level ${level} (grammar type: "${entry.type}").`,
      entry,
      targetLanguage: "english",
      uiLang: "en",
    });
  }

  // ── Ambiguous slug / multiple grammar types / "other meanings" ────────────
  const ambiguousGroup = findAmbiguousSlugGroup(english, wordSlugs.wordToSlug);
  if (ambiguousGroup) {
    for (const [index, entry] of ambiguousGroup.entries()) {
      const pathname = wordSlugs.buildWordPath("en", "english", entry.word_lemma, entry.concept_id);
      fixtures.push({
        id: `word-ambiguous-slug-${index}`,
        family: "word-ambiguous-slug",
        url: pathname,
        expectedStatus: 200,
        expectedCanonical: `${siteOrigin}${pathname}`,
        reason: `One of ${ambiguousGroup.length} vocabulary rows sharing the slug "${wordSlugs.wordToSlug(entry.word_lemma)}" (grammar type: "${entry.type}") — covers duplicate-lemma / otherMeanings / multi-grammar-type behavior with a single stable group.`,
        entry,
        targetLanguage: "english",
        uiLang: "en",
        siblingConceptIds: ambiguousGroup.map((e) => e.concept_id),
      });
    }
  }

  // ── Diacritic-normalization word (Spanish) ────────────────────────────────
  const diacriticEntry =
    vocabularies.spanish.find((e) => e.concept_id === "C1-00035") ??
    findDiacriticEntry(vocabularies.spanish, wordSlugs.wordToSlug);
  if (diacriticEntry) {
    const pathname = wordSlugs.buildWordPath("en", "spanish", diacriticEntry.word_lemma, diacriticEntry.concept_id);
    fixtures.push({
      id: "word-diacritic",
      family: "word-diacritic",
      url: pathname,
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}${pathname}`,
      reason: `Spanish "${diacriticEntry.word_lemma}" (${diacriticEntry.concept_id}) — wordToSlug preserves accents, so this must resolve directly (canonical), never redirect. Already relied on by scripts/test-word-seo-routes.mjs.`,
      entry: diacriticEntry,
      targetLanguage: "spanish",
      uiLang: "en",
    });
  }

  // ── Mojibake handling: no live vocabulary record currently triggers repair.
  // Verified by scanning every language's vocabulary.json for any string field
  // where fixMojibake(value) !== value — none found as of this suite's
  // creation. Documented rather than silently skipped; the direct-unit-test
  // coverage for fixMojibake() itself already exists in
  // scripts/test-word-seo-routes.mjs (real corrupted-byte strings, asserted
  // against exact expected repairs), so this is intentionally not duplicated
  // here. If a future data import reintroduces mojibake, that existing test
  // (and scripts/test-sitemap-structure.mjs's slug-shape checks) will still
  // catch slug/URL fallout.
  fixtures.push({
    id: "word-mojibake-note",
    family: "informational",
    url: null,
    expectedStatus: null,
    reason:
      "No live vocabulary record currently contains mojibake-corrupted text (scanned all 7 languages). fixMojibake() unit coverage already exists in scripts/test-word-seo-routes.mjs.",
  });

  // ── First / last entries in a vocabulary dataset ──────────────────────────
  const firstEnglish = firstEntry(english);
  const lastEnglish = lastEntry(english);
  fixtures.push({
    id: "word-dataset-first",
    family: "word-dataset-boundary",
    url: wordSlugs.buildWordPath("en", "english", firstEnglish.word_lemma, firstEnglish.concept_id),
    expectedStatus: 200,
    expectedCanonical: `${siteOrigin}${wordSlugs.buildWordPath("en", "english", firstEnglish.word_lemma, firstEnglish.concept_id)}`,
    reason: `First row (index 0, concept_id ${firstEnglish.concept_id}) of english/vocabulary.json.`,
    entry: firstEnglish,
    targetLanguage: "english",
    uiLang: "en",
  });
  fixtures.push({
    id: "word-dataset-last",
    family: "word-dataset-boundary",
    url: wordSlugs.buildWordPath("en", "english", lastEnglish.word_lemma, lastEnglish.concept_id),
    expectedStatus: 200,
    expectedCanonical: `${siteOrigin}${wordSlugs.buildWordPath("en", "english", lastEnglish.word_lemma, lastEnglish.concept_id)}`,
    reason: `Last row (index ${english.length - 1}, concept_id ${lastEnglish.concept_id}) of english/vocabulary.json.`,
    entry: lastEnglish,
    targetLanguage: "english",
    uiLang: "en",
  });

  // ── Redirect routes ────────────────────────────────────────────────────────
  const legacySingleHyphenPath = wordSlugs
    .buildWordPath("en", "english", aboutEntry.word_lemma, aboutEntry.concept_id)
    .replace("--", "-");
  fixtures.push({
    id: "redirect-legacy-single-hyphen",
    family: "redirect",
    url: legacySingleHyphenPath,
    expectedStatus: 308,
    expectedRedirectLocation: wordSlugs.buildWordPath("en", "english", aboutEntry.word_lemma, aboutEntry.concept_id),
    reason: "Pre-double-hyphen legacy word URL format for the same stable 'about' (A1-00001) record.",
  });

  const caseDriftPath = `/en/english-word-ABOUT--${aboutEntry.concept_id}`;
  fixtures.push({
    id: "redirect-case-drift",
    family: "redirect",
    url: caseDriftPath,
    expectedStatus: 308,
    expectedRedirectLocation: wordSlugs.buildWordPath("en", "english", aboutEntry.word_lemma, aboutEntry.concept_id),
    reason: "Non-accent slug drift (stray casing) must redirect to the normalized slug form (parseWordRoute 'legacy-slug-format').",
  });

  // ── Error routes ───────────────────────────────────────────────────────────
  fixtures.push(
    {
      id: "error-slug-only",
      family: "error",
      url: `/en/english-word-${wordSlugs.wordToSlug(aboutEntry.word_lemma)}`,
      expectedStatus: 410,
      reason: "Slug without a concept ID suffix — cannot disambiguate, must be 410 (not a redirect).",
    },
    {
      id: "error-nonexistent-concept-id",
      family: "error",
      url: "/en/english-word-about--Z9-99999",
      expectedStatus: 410,
      reason: "Valid-looking canonical shape but a concept ID that does not exist in the dataset.",
    },
    {
      id: "error-slug-concept-mismatch",
      family: "error",
      url: "/en/english-word-bank--A1-00001",
      expectedStatus: 410,
      reason: "concept_id A1-00001 exists (it's 'about') but the slug in the URL ('bank') does not match it.",
    },
    {
      id: "error-malformed-separator",
      family: "error",
      url: "/en/english-word-about----A1-00001",
      expectedStatus: 410,
      reason: "Malformed canonical separator (more than one '--').",
    },
    {
      id: "error-unsupported-ui-language",
      family: "error",
      url: "/xx/english-word-about--A1-00001",
      expectedStatus: 410,
      reason: "'xx' is not one of the 7 supported UI languages.",
    },
    {
      id: "error-unsupported-target-language",
      family: "error",
      url: "/en/japanese-word-about--A1-00001",
      expectedStatus: 410,
      reason: "'japanese' is not one of the 7 supported target languages.",
    },
    {
      id: "error-invalid-browse-page",
      family: "error",
      url: "/en/english-word-about--A1-00001/browse/page/0",
      expectedStatus: 410,
      reason: "Browse page 0 is out of range (pages are 1-indexed).",
    },
  );

  // ── Other SEO categories: static/core routes ──────────────────────────────
  fixtures.push(
    {
      id: "core-homepage",
      family: "core",
      url: "/",
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}/`,
      expectedRobots: undefined,
      reason: "Homepage.",
    },
    {
      id: "core-about",
      family: "core",
      url: "/about",
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}/about`,
      reason: "Static informational page, indexable.",
    },
    {
      id: "core-help",
      family: "core",
      url: "/help",
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}/help`,
      reason: "Static informational page, indexable.",
    },
    {
      id: "core-profile",
      family: "core",
      url: "/profile",
      expectedStatus: 200,
      expectedRobots: "noindex, nofollow",
      reason: "Personalized account page — deliberately not indexed.",
    },
    {
      id: "core-practice",
      family: "core",
      url: "/languages/filters/exercises/en-es/practice",
      expectedStatus: 200,
      expectedRobots: "noindex, nofollow",
      reason: "Interactive practice session page — deliberately not indexed.",
    },
  );

  // ── SEO-hub index page (buildSeoHubMetadata) ───────────────────────────────
  // Single fixture is sufficient: the builder has no other branch — it only
  // looks up one per-uiLang template record (SEO_HUB_METADATA) and builds
  // alternates from SUPPORTED_UI_LANGUAGES, a pattern already exercised
  // broadly elsewhere in this matrix. No JSON-LD, no robots override (always
  // indexable), confirmed by reading src/seo/metadata.ts's
  // buildSeoHubMetadata directly — not inferred.
  const seoHubPathEn = hub.getSeoHubPath("en");
  fixtures.push({
    id: "seo-hub-en",
    family: "seo-hub",
    url: seoHubPathEn,
    expectedStatus: 200,
    expectedCanonical: `${siteOrigin}${seoHubPathEn}`,
    expectedRobots: undefined,
    reason:
      "buildSeoHubMetadata's only route family — title/description/canonical/alternates, no JSON-LD, no robots branch.",
  });

  // ── Word-hub index pages (buildWordSeoHubMetadata) ─────────────────────────
  // uiLang "de" and target "spanish" (rather than English/English) are chosen
  // to exercise buildWordSeoHubMetadata's `route.targetLanguage === "english"`
  // branch on its generic-copy side: WORD_SEO_HUB_METADATA (English copy) vs.
  // GENERIC_WORD_SEO_HUB_METADATA (generic copy, with `.toLowerCase()`
  // transforms) — the generic branch is the more complex of the two, so a
  // non-English target is the more valuable single sample.
  //
  // (A word-hub URL under uiLang=en was considered and specifically checked
  // against the word-page URL parser for a "-word-" substring collision,
  // since getWordSeoHubSummaryPath nests the word-hub segment under the
  // seo-hub prefix, e.g. "/en/seo-pages/english-word-pages" — three path
  // segments. parseWordRoutePathname only inspects the *second* segment
  // ("seo-pages"), never the third, so no collision occurs; confirmed by
  // calling resolveWordSeoRequest()/render() directly against the built
  // server-build/entry-server.js for that exact path. uiLang=en would have
  // worked equally well here — "de" was kept simply because it was already
  // chosen and verified.)
  const wordHubUiLang = "de";
  const wordHubTargetLanguage = "spanish";
  const wordHubLevel = "a1";
  const wordHubSummaryPath = wordHubRoutes.getWordSeoHubSummaryPath(
    wordHubUiLang,
    wordHubTargetLanguage,
  );
  const wordHubLevelPath = wordHubRoutes.getWordSeoHubLevelPath(
    wordHubUiLang,
    wordHubTargetLanguage,
    wordHubLevel,
  );
  fixtures.push(
    {
      id: "word-hub-summary-de-spanish",
      family: "word-hub-summary",
      url: wordHubSummaryPath,
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}${wordHubSummaryPath}`,
      expectedRobots: undefined,
      reason:
        "buildWordSeoHubMetadata's 'summary' branch (route.kind === \"summary\"), generic (non-English) target-language copy path.",
    },
    {
      id: "word-hub-level-de-spanish-a1",
      family: "word-hub-level",
      url: wordHubLevelPath,
      expectedStatus: 200,
      expectedCanonical: `${siteOrigin}${wordHubLevelPath}`,
      expectedRobots: undefined,
      reason:
        "buildWordSeoHubMetadata's 'level' branch, page 1 (getWordSeoHubLevelPath omits the /page/N suffix for page <= 1). " +
        "No separate pagination fixture added: neither branch sets a robots field regardless of page number, and canonical " +
        "is always self-referential ({origin}{pathname}) for every page — confirmed by reading the builder source — so " +
        "page > 1 does not exercise a materially different metadata code path, only different template copy text.",
    },
  );

  return fixtures;
}
