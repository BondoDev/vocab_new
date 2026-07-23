// Node-based, OFFLINE generator (Phase 3 of the full-corpus migration) that
// produces the production full-corpus data; also used for local
// staging/preview builds. Generalizes generate-staging-records.mjs's per-record shape
// and helper algorithms (isValidBrowseWordLemma / normalizeLemma / hashString
// + gcd + selectDiscoveryConceptIds / wordToSlug) from one hardcoded 81-word
// English-A1 sample to the full 7-language, 6-level corpus.
//
// The Worker itself never runs this script and never uses node:fs at request
// time — it only reads the JSON this script produces (see Phase 5/6).
//
// Sharding (see measure-shard-formats.mjs / the final report's "Sharding
// decision" section for the measured comparison that led here):
//   concepts/{targetLanguage}/{level}.json   — keyed by conceptId
//   overlays/{uiLanguage}/{level}.json       — keyed by conceptId (that UI
//                                               language's OWN vocabulary,
//                                               reshaped; NOT duplicated per
//                                               target language — see the
//                                               plan's "Key design decision")
//   browse/{targetLanguage}/{level}.json     — ordered conceptId+lemma list
//   manifest.json
//
// Related/discovery references are stored as conceptId-only arrays (always
// resolvable within the SAME concept shard, since "related" is defined as
// same category + same level, i.e. same target language + same level shard).
// otherMeanings references CAN span levels (e.g. English "above":
// A1-00002/B1-00007/B1-00008), so those are denormalized in full (id, lemma,
// definition, level, grammarType) to avoid a second R2 read per request.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileTsToCommonJs, ROOT_DIR, readJson } from "../../../scripts/lib/compileTs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(__dirname, "..");
const dataDir = path.join(workerDir, "data", "full-corpus");
const BROWSE_PAGE_SIZE = 54;
const DATA_VERSION = `full-${new Date().toISOString().slice(0, 10)}-01`;

const compiled = compileTsToCommonJs(".tmp-generate-full-corpus", [
  path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordRouteManifest.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
]);
const wordRouteManifest = compiled.require("src/data/seo/wordPages/wordRouteManifest");
const slugsModule = compiled.require("src/data/seo/shared/slugs");
const { SUPPORTED_TARGET_LANGUAGES, SUPPORTED_UI_LANGUAGES } = slugsModule;
const { wordToSlug } = wordRouteManifest;

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

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

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

function selectDiscoveryConceptIds(conceptId, candidateIds, count) {
  const filtered = candidateIds.filter((id) => id !== conceptId);
  if (filtered.length <= count) return filtered;
  const seed = hashString(conceptId);
  const startIndex = seed % filtered.length;
  let step = (seed % Math.max(filtered.length - 1, 1)) + 1;
  while (gcd(step, filtered.length) !== 1) step += 1;
  const selected = [];
  let index = startIndex;
  while (selected.length < count) {
    selected.push(filtered[index]);
    index = (index + step) % filtered.length;
  }
  return selected;
}

function loadVocabulary(language) {
  return readJson(path.join("src", "data", "vocabulary", language, "vocabulary.json"));
}

const stats = {
  dataVersion: DATA_VERSION,
  conceptShards: [],
  overlayShards: [],
  browseShards: [],
};

// ── Base concept shards + browse shards, per target language ────────────────
const manifestShardIndex = { concepts: {}, overlays: {}, browse: {} };
const testFixtureConceptIds = {};

for (const targetLanguage of SUPPORTED_TARGET_LANGUAGES) {
  const vocabulary = loadVocabulary(targetLanguage);
  const byId = new Map(vocabulary.map((e) => [e.concept_id, e]));

  const bySlugGroup = new Map();
  for (const entry of vocabulary) {
    const key = normalizeLemma(entry.word_lemma);
    if (!bySlugGroup.has(key)) bySlugGroup.set(key, []);
    bySlugGroup.get(key).push(entry.concept_id);
  }

  const byLevel = new Map();
  for (const entry of vocabulary) {
    if (!byLevel.has(entry.level)) byLevel.set(entry.level, []);
    byLevel.get(entry.level).push(entry);
  }

  manifestShardIndex.concepts[targetLanguage] = {};
  manifestShardIndex.browse[targetLanguage] = {};

  for (const [level, levelEntries] of byLevel) {
    const browseEligible = levelEntries.filter((e) => isValidBrowseWordLemma(e.word_lemma));
    const browseOrderedIds = browseEligible.map((e) => e.concept_id);
    const browseTotalPages = Math.max(1, Math.ceil(browseOrderedIds.length / BROWSE_PAGE_SIZE));

    const conceptShard = {};
    for (const entry of levelEntries) {
      const normalizedLemma = normalizeLemma(entry.word_lemma);
      const otherMeaningIds = (bySlugGroup.get(normalizedLemma) ?? []).filter((id) => id !== entry.concept_id);

      const relatedIds = [];
      const seenRelated = new Set([entry.concept_id]);
      for (const candidate of levelEntries) {
        if (!isValidBrowseWordLemma(candidate.word_lemma)) continue;
        if (candidate.category === entry.category && !seenRelated.has(candidate.concept_id)) {
          seenRelated.add(candidate.concept_id);
          relatedIds.push(candidate.concept_id);
          if (relatedIds.length >= 20) break;
        }
      }

      const discoveryIds = selectDiscoveryConceptIds(entry.concept_id, browseOrderedIds, 12);
      const canonicalSlug = wordToSlug(entry.word_lemma);

      conceptShard[entry.concept_id] = {
        lemma: entry.word_lemma,
        definition: entry.definiton,
        example: entry.sentence,
        grammarType: entry.type,
        category: entry.category,
        level: entry.level,
        canonicalSlug,
        relatedIds,
        discoveryIds,
        otherMeanings: otherMeaningIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((o) => ({ conceptId: o.concept_id, lemma: o.word_lemma, definition: o.definiton, level: o.level, grammarType: o.type })),
      };
    }

    // Fixed-size concept-ID-range sub-sharding: only kicks in once a single
    // (targetLanguage, level) shard would exceed RANGE_THRESHOLD records.
    // None of the current corpus's 42 shards exceed this (max is 3,057
    // Russian B2 records / 2.17MB raw — comfortably under both the
    // threshold and Workers Static Assets' 25MiB-per-file limit), so this
    // path is inert today but present and exercised by generation so it's
    // proven correct before the corpus grows past the threshold. The range
    // boundary is the numeric suffix of the concept ID (e.g. "B2-03057" ->
    // 3057), NOT array-slice position, so which sub-shard owns a given
    // conceptId is derivable from the ID alone (consistent with Phase 4's
    // "shard key needs no separate index" principle) — the Worker still
    // reads the small range list out of manifest.json rather than
    // recomputing RANGE_SIZE locally, since manifest.json is fetched once
    // per cold start regardless.
    const RANGE_THRESHOLD = 2000;
    const RANGE_SIZE = 1500;
    fs.mkdirSync(path.join(dataDir, "concepts", targetLanguage), { recursive: true });
    const conceptEntries = Object.entries(conceptShard);

    if (conceptEntries.length <= RANGE_THRESHOLD) {
      const conceptShardPath = path.join("concepts", targetLanguage, `${level.toLowerCase()}.json`);
      const conceptJson = JSON.stringify(conceptShard);
      fs.writeFileSync(path.join(dataDir, conceptShardPath), conceptJson);
      manifestShardIndex.concepts[targetLanguage][level] = conceptShardPath.replace(/\\/g, "/");
      stats.conceptShards.push({ targetLanguage, level, recordCount: conceptEntries.length, bytes: conceptJson.length, ranged: false });
    } else {
      const byNumericId = conceptEntries
        .map(([id, record]) => ({ id, record, numericId: Number.parseInt(id.split("-")[1], 10) }))
        .sort((a, b) => a.numericId - b.numericId);
      const ranges = [];
      for (let i = 0; i < byNumericId.length; i += RANGE_SIZE) {
        const chunk = byNumericId.slice(i, i + RANGE_SIZE);
        const rangeStart = chunk[0].numericId;
        const rangeEnd = chunk[chunk.length - 1].numericId;
        const rangeShard = Object.fromEntries(chunk.map(({ id, record }) => [id, record]));
        const rangeShardPath = path.join(
          "concepts",
          targetLanguage,
          `${level.toLowerCase()}-${String(rangeStart).padStart(5, "0")}-${String(rangeEnd).padStart(5, "0")}.json`,
        );
        const rangeJson = JSON.stringify(rangeShard);
        fs.writeFileSync(path.join(dataDir, rangeShardPath), rangeJson);
        ranges.push({ rangeStart, rangeEnd, path: rangeShardPath.replace(/\\/g, "/") });
        stats.conceptShards.push({ targetLanguage, level, recordCount: chunk.length, bytes: rangeJson.length, ranged: true, rangeStart, rangeEnd });
      }
      manifestShardIndex.concepts[targetLanguage][level] = ranges;
    }

    const browseShard = {
      targetLanguage,
      level,
      pageSize: BROWSE_PAGE_SIZE,
      totalCount: browseOrderedIds.length,
      totalPages: browseTotalPages,
      words: browseOrderedIds.map((id) => {
        const e = byId.get(id);
        return { conceptId: id, lemma: e.word_lemma };
      }),
    };
    const browseShardPath = path.join("browse", targetLanguage, `${level.toLowerCase()}.json`);
    fs.mkdirSync(path.join(dataDir, "browse", targetLanguage), { recursive: true });
    const browseJson = JSON.stringify(browseShard);
    fs.writeFileSync(path.join(dataDir, browseShardPath), browseJson);
    manifestShardIndex.browse[targetLanguage][level] = browseShardPath.replace(/\\/g, "/");
    stats.browseShards.push({ targetLanguage, level, totalCount: browseShard.totalCount, bytes: browseJson.length });
  }

  // Deterministic test-fixture concept IDs, generalized across languages
  // (mirrors manifest.json's deliberatelyMissingConceptId/legacyTestConceptId/
  // accentTestConceptId/otherMeaningsTestConceptIds from the 81-word sample).
  const firstEntry = vocabulary[0];
  const ambiguous = Array.from(bySlugGroup.values()).find((ids) => ids.length > 1);
  const accented = vocabulary.find((e) => /[^\x00-\x7f]/.test(wordToSlug(e.word_lemma)));
  testFixtureConceptIds[targetLanguage] = {
    legacyTestConceptId: firstEntry.concept_id,
    otherMeaningsTestConceptIds: ambiguous ?? [],
    accentTestConceptId: accented?.concept_id ?? null,
    deliberatelyMissingConceptId: `${firstEntry.concept_id.split("-")[0]}-99999`, // never a real ID (max real IDs are 5-digit but generated sequentially from 1)
  };
}

// ── UI overlay shards — one per UI language, independent of target language ─
manifestShardIndex.overlays = {};
for (const uiLanguage of SUPPORTED_UI_LANGUAGES) {
  // A UI language's overlay data is simply that language's OWN vocabulary
  // (if it has one — all 7 UI languages here map 1:1 to one of the 7
  // SUPPORTED_TARGET_LANGUAGES's vocabulary.json files) reshaped to only the
  // 4 fields production's buildResolvedWordPageData actually substitutes
  // (displayDefinition/displayWordLemma/displayWordType/displayCategory).
  const overlayLanguage = { en: "english", es: "spanish", de: "german", fr: "french", ru: "russian", pt: "portuguese", it: "italian" }[uiLanguage];
  const vocabulary = loadVocabulary(overlayLanguage);
  const byLevel = new Map();
  for (const entry of vocabulary) {
    if (!byLevel.has(entry.level)) byLevel.set(entry.level, []);
    byLevel.get(entry.level).push(entry);
  }

  manifestShardIndex.overlays[uiLanguage] = {};
  for (const [level, levelEntries] of byLevel) {
    const overlayShard = {};
    for (const entry of levelEntries) {
      overlayShard[entry.concept_id] = {
        lemma: entry.word_lemma,
        definition: entry.definiton,
        grammarType: entry.type,
        category: entry.category,
      };
    }
    const overlayShardPath = path.join("overlays", uiLanguage, `${level.toLowerCase()}.json`);
    fs.mkdirSync(path.join(dataDir, "overlays", uiLanguage), { recursive: true });
    const overlayJson = JSON.stringify(overlayShard);
    fs.writeFileSync(path.join(dataDir, overlayShardPath), overlayJson);
    manifestShardIndex.overlays[uiLanguage][level] = overlayShardPath.replace(/\\/g, "/");
    stats.overlayShards.push({ uiLanguage, level, recordCount: Object.keys(overlayShard).length, bytes: overlayJson.length });
  }
}

const manifest = {
  dataVersion: DATA_VERSION,
  generatedAt: new Date().toISOString(),
  browsePageSize: BROWSE_PAGE_SIZE,
  targetLanguages: SUPPORTED_TARGET_LANGUAGES,
  uiLanguages: SUPPORTED_UI_LANGUAGES,
  shards: manifestShardIndex,
  testFixtureConceptIds,
};
fs.writeFileSync(path.join(dataDir, "manifest.json"), JSON.stringify(manifest, null, 2));

const totalConceptBytes = stats.conceptShards.reduce((s, x) => s + x.bytes, 0);
const totalOverlayBytes = stats.overlayShards.reduce((s, x) => s + x.bytes, 0);
const totalBrowseBytes = stats.browseShards.reduce((s, x) => s + x.bytes, 0);
const totalRecords = stats.conceptShards.reduce((s, x) => s + x.recordCount, 0);

console.log(`Data version: ${DATA_VERSION}`);
console.log(`Concept shards: ${stats.conceptShards.length} files, ${totalRecords} records, ${(totalConceptBytes / 1024 / 1024).toFixed(2)} MB total`);
console.log(`Overlay shards: ${stats.overlayShards.length} files, ${(totalOverlayBytes / 1024 / 1024).toFixed(2)} MB total`);
console.log(`Browse shards: ${stats.browseShards.length} files, ${(totalBrowseBytes / 1024 / 1024).toFixed(2)} MB total`);
console.log(`Total objects (incl. manifest): ${stats.conceptShards.length + stats.overlayShards.length + stats.browseShards.length + 1}`);
console.log(`Total raw size: ${((totalConceptBytes + totalOverlayBytes + totalBrowseBytes) / 1024 / 1024).toFixed(2)} MB`);
fs.writeFileSync(path.join(dataDir, "generation-stats.json"), JSON.stringify(stats, null, 2));

compiled.cleanup();
