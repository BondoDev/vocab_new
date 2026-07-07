// EXPERIMENTAL / offline generation tool — NOT part of the production build or
// runtime. Reads the real, full English vocabulary JSON ONCE (build-time only,
// same as scripts/generate-word-hub-data.mjs already does for hub pages) and
// writes a small, deterministic subset of compact precomputed records used by
// the proof-of-concept renderer. The renderer itself never reads the full
// vocabulary array — only these compact shards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSharedWordRouteModules } from "./compile-shared-modules.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const recordsDir = path.join(__dirname, "records");
const formatComparisonDir = path.join(__dirname, "format-comparison");

const TARGET_LANGUAGE = "english";
const UI_LANGUAGE = "en";
const CEFR_LEVEL = "A1";
const BROWSE_PAGE_SIZE = 54; // matches WORD_PAGE_BROWSE_WORDS_PER_PAGE in production

const { wordToSlug, isValidBrowseWordLemma } = loadSharedWordRouteModules();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/^﻿/, ""));
}

function normalizeLemma(value) {
  return String(value ?? "").normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

const fullVocabulary = readJson("src/data/vocabulary/english/vocabulary.json");
const a1Sorted = fullVocabulary
  .filter((entry) => entry.level === CEFR_LEVEL)
  .sort((a, b) => a.concept_id.localeCompare(b.concept_id));

// Deterministic sample selection:
//  - first 80 concept IDs (A1-00001..) for volume (>54 so a real browse page 2 exists)
//  - explicitly add "café" (A1-00161): the one accented word in the English A1 set
//  - "American" (A1-00028, A1-00074) already falls inside the first 80 and gives
//    an "other meanings" pair (same normalized lemma, two concept IDs)
//  - "places" category is well represented in the first 80, giving café real
//    "related words" (same category + level) neighbors
const SAMPLE_SIZE = 80;
const sampledConceptIds = new Set(a1Sorted.slice(0, SAMPLE_SIZE).map((e) => e.concept_id));
sampledConceptIds.add("A1-00161"); // café

const sample = fullVocabulary.filter((entry) => sampledConceptIds.has(entry.concept_id));
sample.sort((a, b) => a.concept_id.localeCompare(b.concept_id));

// A real concept that exists in the full corpus but is deliberately NOT part of
// this POC's compact store — exercises the "missing record" / 410 path exactly
// like a not-yet-migrated or corrupted record would in production.
const DELIBERATELY_MISSING_CONCEPT_ID = "A1-00500";
if (sampledConceptIds.has(DELIBERATELY_MISSING_CONCEPT_ID)) {
  throw new Error("sample selection accidentally includes the missing-record test ID");
}

console.log(`Selected ${sample.length} sample records (level ${CEFR_LEVEL}, language ${TARGET_LANGUAGE}).`);

// ---------------------------------------------------------------------------
// Precompute related / other-meaning / browse relationships ONCE, offline —
// this is the core architectural difference from the current fallback: the
// renderer never scans the vocabulary array per-request, it just looks up
// precomputed ID lists by concept ID.
// ---------------------------------------------------------------------------
const bySlugGroup = new Map(); // normalized lemma -> concept_id[]
for (const entry of sample) {
  const key = normalizeLemma(entry.word_lemma);
  if (!bySlugGroup.has(key)) bySlugGroup.set(key, []);
  bySlugGroup.get(key).push(entry.concept_id);
}

const browseEligible = sample.filter((entry) => isValidBrowseWordLemma(entry.word_lemma));
const browseOrderedConceptIds = browseEligible.map((entry) => entry.concept_id);

function buildRelatedConceptIds(entry) {
  const seen = new Set([entry.concept_id]);
  const related = [];
  for (const candidate of sample) {
    if (!isValidBrowseWordLemma(candidate.word_lemma)) continue;
    if (candidate.category === entry.category && candidate.level === entry.level && !seen.has(candidate.concept_id)) {
      seen.add(candidate.concept_id);
      related.push(candidate.concept_id);
      if (related.length >= 20) break;
    }
  }
  return related;
}

const concepts = {};
for (const entry of sample) {
  const slug = wordToSlug(entry.word_lemma);
  const normalizedLemma = normalizeLemma(entry.word_lemma);
  const otherMeaningConceptIds = (bySlugGroup.get(normalizedLemma) ?? []).filter(
    (id) => id !== entry.concept_id,
  );

  concepts[entry.concept_id] = {
    conceptId: entry.concept_id,
    targetLanguage: TARGET_LANGUAGE,
    slug,
    level: entry.level,
    grammarType: entry.type,
    category: entry.category,
    wordLemma: entry.word_lemma,
    definition: entry.definiton,
    example: entry.sentence,
    otherMeaningConceptIds,
    relatedConceptIds: buildRelatedConceptIds(entry),
  };
}

// UI overlay: keyed by uiLanguage+targetLanguage+conceptId. For this sample,
// uiLanguage "en" and targetLanguage "english" are the same vocabulary, so the
// overlay is a pass-through of the UI-facing fields — this still proves out
// the schema (a cross-language UI, e.g. es-on-english, would populate
// definition/wordLemma from the Spanish interface vocabulary instead).
const uiOverlay = {};
for (const entry of sample) {
  uiOverlay[entry.concept_id] = {
    conceptId: entry.concept_id,
    uiLanguage: UI_LANGUAGE,
    targetLanguage: TARGET_LANGUAGE,
    wordLemma: entry.word_lemma,
    definition: entry.definiton,
    grammarType: entry.type,
    category: entry.category,
  };
}

const browseShard = {
  targetLanguage: TARGET_LANGUAGE,
  level: CEFR_LEVEL,
  pageSize: BROWSE_PAGE_SIZE,
  totalCount: browseOrderedConceptIds.length,
  totalPages: Math.max(1, Math.ceil(browseOrderedConceptIds.length / BROWSE_PAGE_SIZE)),
  orderedConceptIds: browseOrderedConceptIds,
};

fs.mkdirSync(recordsDir, { recursive: true });
fs.writeFileSync(path.join(recordsDir, "concepts.english.json"), JSON.stringify(concepts, null, 2));
fs.writeFileSync(
  path.join(recordsDir, "ui-overlay.en.english.json"),
  JSON.stringify(uiOverlay, null, 2),
);
fs.writeFileSync(
  path.join(recordsDir, "browse.english.a1.json"),
  JSON.stringify(browseShard, null, 2),
);
fs.writeFileSync(
  path.join(recordsDir, "manifest.json"),
  JSON.stringify(
    {
      targetLanguage: TARGET_LANGUAGE,
      uiLanguage: UI_LANGUAGE,
      level: CEFR_LEVEL,
      sampleSize: sample.length,
      deliberatelyMissingConceptId: DELIBERATELY_MISSING_CONCEPT_ID,
      legacyTestConceptId: "A1-00001",
      accentTestConceptId: "A1-00161",
      otherMeaningsTestConceptIds: ["A1-00028", "A1-00074"],
    },
    null,
    2,
  ),
);

console.log(`Wrote ${Object.keys(concepts).length} concept records to records/concepts.english.json`);
console.log(`Browse shard: ${browseShard.totalCount} words, ${browseShard.totalPages} pages of ${browseShard.pageSize}`);

// ---------------------------------------------------------------------------
// Storage-format comparison: same underlying data, four shapes.
// ---------------------------------------------------------------------------
fs.mkdirSync(path.join(formatComparisonDir, "per-record"), { recursive: true });
for (const [conceptId, record] of Object.entries(concepts)) {
  fs.writeFileSync(
    path.join(formatComparisonDir, "per-record", `${conceptId}.json`),
    JSON.stringify(record),
  );
}

const groupedShard = Object.values(concepts);
fs.writeFileSync(path.join(formatComparisonDir, "grouped-shard.json"), JSON.stringify(groupedShard));
fs.writeFileSync(path.join(formatComparisonDir, "indexed-object.json"), JSON.stringify(concepts));

// Simple compact binary encoding: length-prefixed UTF-8 fields per record,
// concatenated. No external dependency (no msgpack/protobuf in package.json);
// this is a minimal, deterministic, hand-rolled format purely to get a real
// "how much smaller could this be" data point.
const GRAMMAR_TYPES = [...new Set(groupedShard.map((r) => r.grammarType))];
const CATEGORIES = [...new Set(groupedShard.map((r) => r.category))];

function writeString(chunks, value) {
  const buf = Buffer.from(value, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16LE(buf.length, 0);
  chunks.push(len, buf);
}

function encodeBinary(records) {
  const chunks = [];
  const header = Buffer.alloc(2);
  header.writeUInt16LE(records.length, 0);
  chunks.push(header);

  // dictionaries first (grammar types, categories) so records store 1-byte indices
  const dictHeader = Buffer.alloc(2);
  dictHeader.writeUInt8(GRAMMAR_TYPES.length, 0);
  dictHeader.writeUInt8(CATEGORIES.length, 1);
  chunks.push(dictHeader);
  for (const type of GRAMMAR_TYPES) writeString(chunks, type);
  for (const category of CATEGORIES) writeString(chunks, category);

  for (const record of records) {
    writeString(chunks, record.conceptId);
    writeString(chunks, record.slug);
    writeString(chunks, record.wordLemma);
    writeString(chunks, record.definition);
    writeString(chunks, record.example);
    writeString(chunks, record.level);
    chunks.push(Buffer.from([GRAMMAR_TYPES.indexOf(record.grammarType)]));
    chunks.push(Buffer.from([CATEGORIES.indexOf(record.category)]));
    const relCount = Buffer.alloc(1);
    relCount.writeUInt8(record.relatedConceptIds.length, 0);
    chunks.push(relCount);
    for (const id of record.relatedConceptIds) writeString(chunks, id);
    const otherCount = Buffer.alloc(1);
    otherCount.writeUInt8(record.otherMeaningConceptIds.length, 0);
    chunks.push(otherCount);
    for (const id of record.otherMeaningConceptIds) writeString(chunks, id);
  }

  return Buffer.concat(chunks);
}

const binaryBuffer = encodeBinary(groupedShard);
fs.mkdirSync(path.join(formatComparisonDir, "binary"), { recursive: true });
fs.writeFileSync(path.join(formatComparisonDir, "binary", "records.bin"), binaryBuffer);

console.log("\nFormat comparison files written under format-comparison/:");
console.log(` - per-record/*.json (${Object.keys(concepts).length} files)`);
console.log(" - grouped-shard.json");
console.log(" - indexed-object.json");
console.log(` - binary/records.bin (${binaryBuffer.length} bytes)`);
