// STAGING-ONLY, Node-based, OFFLINE generator (like scripts/generation/generate-word-hub-data.mjs).
// Reads the real English vocabulary ONCE at generation time and writes compact,
// ready-to-serve HydrationWordPageData records for a deterministic ~81-word
// English A1 subset. The Worker itself never runs this script and never uses
// node:fs at request time — it only reads the JSON this script produces.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(workerDir, "..", "..");
const dataDir = path.join(workerDir, "data");

const TARGET_LANGUAGE = "english";
const UI_LANGUAGE = "en";
const CEFR_LEVEL = "A1";
const BROWSE_PAGE_SIZE = 54;
const DATA_VERSION = "staging-2026-07-08-01";

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
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
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

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/^﻿/, ""));
}

const fullVocabulary = readJson("src/data/vocabulary/english/vocabulary.json");
const a1Sorted = fullVocabulary
  .filter((entry) => entry.level === CEFR_LEVEL)
  .sort((a, b) => a.concept_id.localeCompare(b.concept_id));

// Same deterministic sample as the earlier proof-of-concept: first 80 by
// concept ID (covers 10 grammar types, several "other meanings" pairs, and a
// dense "places" category cluster), plus "café" (A1-00161) as the one
// accented word in the English A1 set.
const SAMPLE_SIZE = 80;
const sampledConceptIds = new Set(a1Sorted.slice(0, SAMPLE_SIZE).map((e) => e.concept_id));
sampledConceptIds.add("A1-00161"); // café

const sample = fullVocabulary.filter((entry) => sampledConceptIds.has(entry.concept_id));
sample.sort((a, b) => a.concept_id.localeCompare(b.concept_id));

const DELIBERATELY_MISSING_CONCEPT_ID = "A1-00500";
if (sampledConceptIds.has(DELIBERATELY_MISSING_CONCEPT_ID)) {
  throw new Error("sample selection accidentally includes the missing-record test ID");
}

const byId = new Map(sample.map((entry) => [entry.concept_id, entry]));
const bySlugGroup = new Map();
for (const entry of sample) {
  const key = normalizeLemma(entry.word_lemma);
  if (!bySlugGroup.has(key)) bySlugGroup.set(key, []);
  bySlugGroup.get(key).push(entry.concept_id);
}

const browseEligible = sample.filter((entry) => isValidBrowseWordLemma(entry.word_lemma));
const browseOrderedConceptIds = browseEligible.map((entry) => entry.concept_id);
const browseTotalPages = Math.max(1, Math.ceil(browseOrderedConceptIds.length / BROWSE_PAGE_SIZE));

function toLink(conceptId) {
  const entry = byId.get(conceptId);
  return entry ? { conceptId: entry.concept_id, wordLemma: entry.word_lemma } : null;
}

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

// wordPages: indexed by conceptId, each value is a ready-to-serve
// HydrationWordPageData object (matches src/data/seo/wordPages/wordPageData.ts's
// HydrationWordPageData shape exactly) for browsePage=1.
const wordPages = {};
// aliases: concept slug (as-generated) -> conceptId, used to validate the
// canonical slug for accent/legacy-format redirect checks without needing the
// full vocabulary array in the Worker.
const aliases = {};

for (const entry of sample) {
  const normalizedLemma = normalizeLemma(entry.word_lemma);
  const otherMeaningConceptIds = (bySlugGroup.get(normalizedLemma) ?? []).filter((id) => id !== entry.concept_id);
  const relatedConceptIds = buildRelatedConceptIds(entry);
  const discoveryConceptIds = selectDiscoveryConceptIds(entry.concept_id, browseOrderedConceptIds, 12);
  const page1ConceptIds = browseOrderedConceptIds.slice(0, BROWSE_PAGE_SIZE);

  wordPages[entry.concept_id] = {
    wordEntry: {
      conceptId: entry.concept_id,
      wordLemma: entry.word_lemma,
      definition: entry.definiton,
      sentence: entry.sentence,
      grammarType: entry.type,
      category: entry.category,
      level: entry.level,
    },
    displayDefinition: entry.definiton,
    displayWordLemma: entry.word_lemma,
    displayWordType: entry.type,
    displayCategory: entry.category,
    relatedWords: relatedConceptIds.map(toLink).filter(Boolean),
    discoveryWords: discoveryConceptIds.map(toLink).filter(Boolean),
    browseWords: page1ConceptIds.map(toLink).filter(Boolean),
    otherMeanings: otherMeaningConceptIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((other) => ({
        conceptId: other.concept_id,
        wordLemma: other.word_lemma,
        definition: other.definiton,
        level: other.level,
        grammarType: other.type,
      })),
    browseWordsTotalCount: browseOrderedConceptIds.length,
    browsePage: 1,
  };
}

// Slug is derived the same way production derives it (wordToSlug), computed
// here just for the alias/redirect-testing fixture, NOT re-derived by the Worker.
function toSlug(lemma) {
  return lemma
    .normalize("NFC")
    .toLowerCase()
    .replace(/['’`]/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

for (const entry of sample) {
  aliases[entry.concept_id] = toSlug(entry.word_lemma);
}

const browseShard = {
  targetLanguage: TARGET_LANGUAGE,
  level: CEFR_LEVEL,
  pageSize: BROWSE_PAGE_SIZE,
  totalCount: browseOrderedConceptIds.length,
  totalPages: browseTotalPages,
  words: browseOrderedConceptIds.map(toLink).filter(Boolean),
};

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "word-pages.english.a1.json"), JSON.stringify(wordPages));
fs.writeFileSync(path.join(dataDir, "aliases.english.a1.json"), JSON.stringify(aliases));
fs.writeFileSync(path.join(dataDir, "browse-shard.english-a1.json"), JSON.stringify(browseShard));
fs.writeFileSync(
  path.join(dataDir, "manifest.json"),
  JSON.stringify(
    {
      dataVersion: DATA_VERSION,
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

console.log(`Wrote ${Object.keys(wordPages).length} ready-to-serve word pages.`);
console.log(`Browse shard: ${browseShard.totalCount} words, ${browseShard.totalPages} pages of ${browseShard.pageSize}.`);
console.log(`Data version: ${DATA_VERSION}`);

// Extract the current production client bundle's script/style/favicon tags
// from the already-built dist/index.html, so the staging Worker's HTML shell
// references the SAME hydration-compatible client bundle `npm run build`
// already produced, instead of guessing/hardcoding content hashes.
const distIndexPath = path.join(rootDir, "dist", "index.html");
if (fs.existsSync(distIndexPath)) {
  const distHtml = fs.readFileSync(distIndexPath, "utf8");
  const scriptMatch = distHtml.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
  const styleMatch = distHtml.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);
  const faviconMatch = distHtml.match(/<link rel="icon"[^>]*href="([^"]+)"[^>]*>/);

  fs.writeFileSync(
    path.join(dataDir, "client-assets.json"),
    JSON.stringify(
      {
        scriptSrc: scriptMatch?.[1] ?? null,
        styleHref: styleMatch?.[1] ?? null,
        faviconHref: faviconMatch?.[1] ?? null,
        sourcedFrom: "dist/index.html (existing `npm run build` output)",
      },
      null,
      2,
    ),
  );
  console.log(`Client assets extracted from dist/index.html: script=${scriptMatch?.[1]}, style=${styleMatch?.[1]}`);
} else {
  console.warn("dist/index.html not found — run `npm run build` first if you need client-assets.json regenerated.");
}
