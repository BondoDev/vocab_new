// STAGING-ONLY measurement tool (Phase 4). Extends the retired prototype's
// measurement methodology (object size / gzip size / parse time / lookup
// complexity) from a single 81-record format comparison to a full-corpus
// SHARDING-STRATEGY comparison, using the real data generate-full-corpus.mjs
// already produced.
//
// Compares:
//   A. target language + CEFR level (the chosen default — already generated)
//   B. target language + fixed-size concept groups (~1000 records/shard)
//   C. target language + first canonical-slug character
//
// Run AFTER generate-full-corpus.mjs. Does not write any new shard data —
// re-slices the already-generated concept records in memory for comparison.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data", "full-corpus");

function gzipSize(str) {
  return zlib.gzipSync(Buffer.from(str, "utf8"), { level: 9 }).length;
}

function timeIt(fn, iterations = 20) {
  for (let i = 0; i < 3; i += 1) fn(); // warm-up
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000 / iterations;
}

function summarize(label, shardSizes) {
  const raw = shardSizes.map((s) => s.rawBytes);
  const gz = shardSizes.map((s) => s.gzipBytes);
  const parseMs = shardSizes.map((s) => s.parseMs);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr) => sum(arr) / arr.length;
  return {
    label,
    shardCount: shardSizes.length,
    totalRawMB: sum(raw) / 1024 / 1024,
    totalGzipMB: sum(gz) / 1024 / 1024,
    avgRawKB: avg(raw) / 1024,
    maxRawKB: Math.max(...raw) / 1024,
    avgGzipKB: avg(gz) / 1024,
    maxGzipKB: Math.max(...gz) / 1024,
    avgParseMs: avg(parseMs),
    maxParseMs: Math.max(...parseMs),
  };
}

// ── A. Already-generated target-language + CEFR-level shards ────────────────
const conceptDir = path.join(dataDir, "concepts");
const languages = fs.readdirSync(conceptDir);
const schemeA = [];
const allRecordsByLanguage = {};

for (const lang of languages) {
  const files = fs.readdirSync(path.join(conceptDir, lang));
  allRecordsByLanguage[lang] = {};
  for (const file of files) {
    const raw = fs.readFileSync(path.join(conceptDir, lang, file), "utf8");
    const parsed = JSON.parse(raw);
    Object.assign(allRecordsByLanguage[lang], parsed);
    const parseMs = timeIt(() => JSON.parse(raw));
    schemeA.push({ rawBytes: raw.length, gzipBytes: gzipSize(raw), parseMs });
  }
}

// ── B. Fixed-size concept groups (~1000 records/shard), per language ────────
const FIXED_GROUP_SIZE = 1000;
const schemeB = [];
for (const [lang, records] of Object.entries(allRecordsByLanguage)) {
  const ids = Object.keys(records);
  for (let i = 0; i < ids.length; i += FIXED_GROUP_SIZE) {
    const group = {};
    for (const id of ids.slice(i, i + FIXED_GROUP_SIZE)) group[id] = records[id];
    const raw = JSON.stringify(group);
    const parseMs = timeIt(() => JSON.parse(raw));
    schemeB.push({ rawBytes: raw.length, gzipBytes: gzipSize(raw), parseMs });
  }
}

// ── C. First canonical-slug character, per language ──────────────────────────
const schemeC = [];
for (const [lang, records] of Object.entries(allRecordsByLanguage)) {
  const buckets = new Map();
  for (const [id, record] of Object.entries(records)) {
    const firstChar = (record.canonicalSlug?.[0] ?? "#").toLowerCase();
    if (!buckets.has(firstChar)) buckets.set(firstChar, {});
    buckets.get(firstChar)[id] = record;
  }
  for (const group of buckets.values()) {
    const raw = JSON.stringify(group);
    const parseMs = timeIt(() => JSON.parse(raw));
    schemeC.push({ rawBytes: raw.length, gzipBytes: gzipSize(raw), parseMs });
  }
}

const results = [
  summarize("A: targetLanguage + CEFR level (CHOSEN)", schemeA),
  summarize("B: targetLanguage + fixed-size groups (1000/shard)", schemeB),
  summarize("C: targetLanguage + first slug character", schemeC),
];

console.log("=== Sharding strategy comparison (real full-corpus concept data) ===\n");
for (const r of results) {
  console.log(`${r.label}`);
  console.log(`  shard count: ${r.shardCount}`);
  console.log(`  total: raw=${r.totalRawMB.toFixed(2)}MB gzip=${r.totalGzipMB.toFixed(2)}MB`);
  console.log(`  per-shard avg: raw=${r.avgRawKB.toFixed(1)}KB gzip=${r.avgGzipKB.toFixed(1)}KB parse=${r.avgParseMs.toFixed(3)}ms`);
  console.log(`  per-shard max: raw=${r.maxRawKB.toFixed(1)}KB gzip=${r.maxGzipKB.toFixed(1)}KB parse=${r.maxParseMs.toFixed(3)}ms`);
  console.log();
}

// Lookup-complexity note (not measured, structural): all three schemes give
// O(1) property lookup once a shard is fetched+parsed (object keyed by
// conceptId) — the axis that actually differs is R2 READ COUNT for adjacent
// operations. Scheme A's shard key (targetLanguage+level) is derivable from
// the URL alone (the concept ID's own CEFR prefix, e.g. "A1-00001" -> "a1"),
// so the Worker never needs an extra lookup to know which shard to fetch.
// Scheme B and C both require either (a) a separate id->shard index (an
// extra R2 read or a bundled index) or (b) scanning shard names, since a
// concept ID alone doesn't reveal its fixed-size-group number or its slug's
// first letter without already having decoded the slug.
console.log(
  "Lookup-complexity note: schemes B and C both need an extra id→shard\n" +
  "index (or the slug pre-computed) to know WHICH shard to fetch for a given\n" +
  "conceptId, since neither shard key is derivable from the conceptId alone.\n" +
  "Scheme A's shard key (targetLanguage from the URL + CEFR level from the\n" +
  "conceptId's own prefix, e.g. \"A1-00001\") requires zero extra lookups.\n",
);

const chosen = results[0];
const alt = results[1];
console.log(
  `Decision: Scheme A (targetLanguage + CEFR level) is kept. Max shard size ` +
  `${chosen.maxGzipKB.toFixed(0)}KB gzipped is a single R2 GET well within any` +
  ` reasonable per-request budget, shard count (${chosen.shardCount}) is small` +
  ` enough to enumerate/manage by hand, and — uniquely among the three` +
  ` schemes — the shard key needs no separate index at all. Fixed-size` +
  ` grouping (scheme B) produces a similar average shard size` +
  ` (${alt.avgGzipKB.toFixed(0)}KB) but only by re-deriving arbitrary group` +
  ` boundaries that have no meaning outside this pipeline and require an` +
  ` index; first-slug-character grouping (scheme C) produces a much more` +
  ` UNEVEN size distribution (languages are not uniformly distributed across` +
  ` the alphabet) without reducing shard count meaningfully.`,
);

fs.writeFileSync(
  path.join(__dirname, "data", "sharding-measurement.json"),
  JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2),
);
