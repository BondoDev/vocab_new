// STAGING-ONLY, Node-only, OFFLINE census tool (Phase 2 of the full-corpus
// migration). Reads the real vocabulary data and the centralized route
// manifest (src/data/seo/wordPages/wordRouteManifest.ts, src/data/seo/shared/slugs.ts) as the
// source of truth — does NOT assume the current ~84,550 sitemap count is the
// full route count, and computes both figures separately so the difference
// is explicit.
//
// Run: node workers/word-ssr/census-full-corpus.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileTsToCommonJs, ROOT_DIR, readJson } from "../../scripts/lib/compileTs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const compiled = compileTsToCommonJs(".tmp-census-full-corpus", [
  path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordRouteManifest.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
]);
const wordRouteManifest = compiled.require("src/data/seo/wordPages/wordRouteManifest");
const slugsModule = compiled.require("src/data/seo/shared/slugs");

const { SUPPORTED_TARGET_LANGUAGES, SUPPORTED_UI_LANGUAGES, SUPPORTED_LEVELS } = slugsModule;
const { WORD_SITEMAP_DEFINITIONS, CRAWLABLE_WORD_TARGET_LANGUAGES, wordToSlug } = wordRouteManifest;

const BROWSE_PAGE_SIZE = 54;

function isValidBrowseWordLemma(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.normalize("NFC").trim();
  if (trimmed.length <= 2) return false;
  if (/^[-–—]+$/u.test(trimmed)) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

function normalizeLemma(value) {
  return String(value ?? "").normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

const census = {
  generatedAt: new Date().toISOString(),
  targetLanguages: {},
  totals: {
    canonicalConceptRecords: 0,
    browseEligibleRecords: 0,
    grammarVariantGroups: 0, // concept groups sharing a normalized lemma (ambiguous slug / "other meanings")
    grammarVariantRecords: 0, // records that belong to such a group
    browsePagesAllLanguageLevelPairs: 0,
  },
  uiLanguages: SUPPORTED_UI_LANGUAGES,
  crawlableTargetLanguages: CRAWLABLE_WORD_TARGET_LANGUAGES,
  sitemapDefinitions: WORD_SITEMAP_DEFINITIONS,
};

for (const targetLanguage of SUPPORTED_TARGET_LANGUAGES) {
  const vocabPath = path.join(ROOT_DIR, "src", "data", "vocabulary", targetLanguage, "vocabulary.json");
  const vocabulary = readJson(path.relative(ROOT_DIR, vocabPath));

  const byLevel = {};
  const grammarTypeCounts = {};
  const bySlugGroup = new Map();
  let browseEligibleTotal = 0;

  for (const entry of vocabulary) {
    const level = entry.level;
    byLevel[level] ??= { conceptCount: 0, browseEligible: 0, grammarTypes: {} };
    byLevel[level].conceptCount += 1;
    grammarTypeCounts[entry.type] = (grammarTypeCounts[entry.type] ?? 0) + 1;
    byLevel[level].grammarTypes[entry.type] = (byLevel[level].grammarTypes[entry.type] ?? 0) + 1;

    if (isValidBrowseWordLemma(entry.word_lemma)) {
      byLevel[level].browseEligible += 1;
      browseEligibleTotal += 1;
    }

    const slugKey = normalizeLemma(entry.word_lemma);
    if (!bySlugGroup.has(slugKey)) bySlugGroup.set(slugKey, []);
    bySlugGroup.get(slugKey).push(entry.concept_id);
  }

  const ambiguousGroups = Array.from(bySlugGroup.values()).filter((ids) => ids.length > 1);
  const ambiguousRecordCount = ambiguousGroups.reduce((sum, ids) => sum + ids.length, 0);

  for (const level of Object.keys(byLevel)) {
    byLevel[level].browseTotalPages = Math.max(1, Math.ceil(byLevel[level].browseEligible / BROWSE_PAGE_SIZE));
  }

  const levelsPresent = Object.keys(byLevel);
  const missingLevels = SUPPORTED_LEVELS.map((l) => l.toUpperCase()).filter((l) => !levelsPresent.includes(l));

  census.targetLanguages[targetLanguage] = {
    totalConceptRecords: vocabulary.length,
    browseEligibleRecords: browseEligibleTotal,
    grammarTypeCounts,
    byLevel,
    ambiguousSlugGroupCount: ambiguousGroups.length,
    ambiguousSlugRecordCount: ambiguousRecordCount,
    levelsPresent,
    missingLevels,
    isCrawlable: CRAWLABLE_WORD_TARGET_LANGUAGES.includes(targetLanguage),
  };

  census.totals.canonicalConceptRecords += vocabulary.length;
  census.totals.browseEligibleRecords += browseEligibleTotal;
  census.totals.grammarVariantGroups += ambiguousGroups.length;
  census.totals.grammarVariantRecords += ambiguousRecordCount;
  census.totals.browsePagesAllLanguageLevelPairs += Object.values(byLevel).reduce(
    (sum, l) => sum + l.browseTotalPages,
    0,
  );
}

// Sitemap-published route count: recomputed from WORD_SITEMAP_DEFINITIONS
// (the actual production gate), not assumed from the previously-observed
// ~84,550 figure.
let sitemapPublishedRoutes = 0;
const sitemapBreakdown = [];
for (const def of WORD_SITEMAP_DEFINITIONS) {
  const count = census.targetLanguages[def.targetLanguage]?.totalConceptRecords ?? 0;
  sitemapPublishedRoutes += count;
  sitemapBreakdown.push({ ...def, routeCount: count });
}

// Total renderable canonical routes: every (uiLanguage, targetLanguage,
// conceptId) combination the Worker must correctly resolve to a 200,
// regardless of whether it's sitemap-published/crawlable. This is
// deliberately larger than the sitemap count (per the task's own
// instruction not to conflate the two).
const totalRenderableCanonicalRoutes =
  SUPPORTED_UI_LANGUAGES.length * census.totals.canonicalConceptRecords;

// Legacy/alias-redirect-eligible: every canonical record is also reachable
// via a legacy single-hyphen URL (parseWordRoutePathname's
// "legacy-single-hyphen" branch) and, for words whose current slug
// normalization differs from a naive slugification of themselves (rare,
// e.g. casing/punctuation drift), a "legacy-slug-format" alias. We can only
// directly count the single-hyphen alias here (it always exists), so:
const aliasRedirectEligibleRoutes = totalRenderableCanonicalRoutes;

census.derived = {
  sitemapPublishedRoutes,
  sitemapBreakdown,
  totalRenderableCanonicalRoutes,
  aliasRedirectEligibleRoutes,
  uiLanguageCount: SUPPORTED_UI_LANGUAGES.length,
  targetLanguageCount: SUPPORTED_TARGET_LANGUAGES.length,
};

const outPath = path.join(__dirname, "data", "full-corpus-census.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(census, null, 2));

console.log("=== Full corpus census ===\n");
console.log(`Target languages: ${SUPPORTED_TARGET_LANGUAGES.join(", ")}`);
console.log(`UI languages (${SUPPORTED_UI_LANGUAGES.length}): ${SUPPORTED_UI_LANGUAGES.join(", ")}`);
console.log(`Crawlable target languages (sitemap-eligible): ${CRAWLABLE_WORD_TARGET_LANGUAGES.join(", ")}\n`);

for (const [lang, data] of Object.entries(census.targetLanguages)) {
  console.log(
    `${lang}: ${data.totalConceptRecords} concepts, ${data.browseEligibleRecords} browse-eligible, ` +
      `${data.ambiguousSlugGroupCount} ambiguous-slug groups (${data.ambiguousSlugRecordCount} records), ` +
      `levels present: [${data.levelsPresent.join(", ")}]${data.missingLevels.length ? ` MISSING: [${data.missingLevels.join(", ")}]` : ""}`,
  );
}

console.log(`\nCanonical concept records (all target languages): ${census.totals.canonicalConceptRecords}`);
console.log(`Grammar-variant ("other meanings") groups: ${census.totals.grammarVariantGroups} (${census.totals.grammarVariantRecords} records)`);
console.log(`Total browse pages (all language×level pairs @ ${BROWSE_PAGE_SIZE}/page): ${census.totals.browsePagesAllLanguageLevelPairs}`);
console.log(`\nSitemap-published routes (from WORD_SITEMAP_DEFINITIONS, ${WORD_SITEMAP_DEFINITIONS.length} pairs): ${sitemapPublishedRoutes}`);
for (const b of sitemapBreakdown) {
  console.log(`  ${b.targetLanguage} words in ${b.uiLang} UI: ${b.routeCount}`);
}
console.log(`\nTotal renderable canonical routes (${SUPPORTED_UI_LANGUAGES.length} UI languages × ${census.totals.canonicalConceptRecords} concepts): ${totalRenderableCanonicalRoutes}`);
console.log(`  (This is larger than the sitemap-published count because non-English target-language words, e.g. French/Italian/Spanish/Portuguese/Russian, are renderable canonical pages today but are not in CRAWLABLE_WORD_TARGET_LANGUAGES / WORD_SITEMAP_DEFINITIONS.)`);
console.log(`\nWrote full report to ${path.relative(ROOT_DIR, outPath)}`);

compiled.cleanup();
