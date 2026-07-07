// EXPERIMENTAL / measurement tool — not part of production. Compares raw size,
// gzip size, parse time, and memory footprint across four storage shapes for
// the same 81-record sample, to pick the simplest viable format for the
// prototype (per task instructions: no R2/KV/D1 yet, just measure and choose).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "format-comparison");

function gzipSize(buffer) {
  return zlib.gzipSync(buffer, { level: 9 }).length;
}

function formatBytes(n) {
  return `${n.toLocaleString()} B (${(n / 1024).toFixed(2)} KB)`;
}

function timeIt(fn, iterations) {
  // warm up
  for (let i = 0; i < 5; i += 1) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000 / iterations; // ms/iteration
}

const results = [];

// --- 1. One JSON file per record ---
{
  const files = fs.readdirSync(path.join(dir, "per-record")).filter((f) => f.endsWith(".json"));
  const buffers = files.map((f) => fs.readFileSync(path.join(dir, "per-record", f)));
  const totalRaw = buffers.reduce((sum, b) => sum + b.length, 0);
  const totalGzip = buffers.reduce((sum, b) => sum + gzipSize(b), 0); // gzip per-file (realistic: no shared dictionary)
  const parseMs = timeIt(() => {
    for (const b of buffers) JSON.parse(b.toString("utf8"));
  }, 50);
  results.push({
    format: "per-record JSON (81 files)",
    rawSize: totalRaw,
    gzipSize: totalGzip,
    parseMsFor81Lookups: parseMs,
    lookupComplexity: "O(1) file/key read, but 81 separate round-trips if remote (KV get-per-record)",
  });
}

// --- 2. One grouped JSON shard (array) ---
{
  const buf = fs.readFileSync(path.join(dir, "grouped-shard.json"));
  const gz = gzipSize(buf);
  const parseMs = timeIt(() => JSON.parse(buf.toString("utf8")), 50);
  const lookupMs = timeIt(() => {
    const arr = JSON.parse(buf.toString("utf8"));
    arr.find((r) => r.conceptId === "A1-00161");
  }, 50);
  results.push({
    format: "grouped JSON shard (array)",
    rawSize: buf.length,
    gzipSize: gz,
    parseMsFor81Lookups: parseMs,
    lookupComplexity: `O(n) array scan per lookup (~${lookupMs.toFixed(3)}ms incl. parse for 81 records — negligible at this size, but scales linearly)`,
  });
}

// --- 3. Indexed JSON object (keyed by conceptId) ---
{
  const buf = fs.readFileSync(path.join(dir, "indexed-object.json"));
  const gz = gzipSize(buf);
  const parseMs = timeIt(() => JSON.parse(buf.toString("utf8")), 50);
  const lookupMs = timeIt(() => {
    const obj = JSON.parse(buf.toString("utf8"));
    void obj["A1-00161"];
  }, 50);
  results.push({
    format: "indexed JSON object (keyed by conceptId)",
    rawSize: buf.length,
    gzipSize: gz,
    parseMsFor81Lookups: parseMs,
    lookupComplexity: `O(1) property access after one parse (~${lookupMs.toFixed(3)}ms incl. parse)`,
  });
}

// --- 4. Compact hand-rolled binary ---
{
  const buf = fs.readFileSync(path.join(dir, "binary", "records.bin"));
  const gz = gzipSize(buf);
  results.push({
    format: "compact custom binary (length-prefixed + dictionary-coded enums)",
    rawSize: buf.length,
    gzipSize: gz,
    parseMsFor81Lookups: null,
    lookupComplexity:
      "O(n) linear scan to decode (no index built in this prototype) — would need an offset table for O(1); not implemented here",
  });
}

console.log(`Sample: 81 concept records (English, A1)\n`);
console.log(
  results
    .map(
      (r) =>
        `${r.format}\n` +
        `  raw:   ${formatBytes(r.rawSize)}\n` +
        `  gzip:  ${formatBytes(r.gzipSize)}\n` +
        `  parse: ${r.parseMsFor81Lookups === null ? "n/a (no JSON.parse for binary)" : `${r.parseMsFor81Lookups.toFixed(4)} ms`}\n` +
        `  lookup: ${r.lookupComplexity}\n`,
    )
    .join("\n"),
);

const memBefore = process.memoryUsage().heapUsed;
const loadedIndexedObject = JSON.parse(fs.readFileSync(path.join(dir, "indexed-object.json"), "utf8"));
const memAfter = process.memoryUsage().heapUsed;
console.log(
  `Approx in-memory heap delta for holding the parsed indexed-object shard: ${((memAfter - memBefore) / 1024).toFixed(2)} KB (${Object.keys(loadedIndexedObject).length} records resident)`,
);

console.log(
  "\nChosen format for the prototype: INDEXED JSON OBJECT.\n" +
    "Reasoning: O(1) lookup by conceptId with no extra index-building step, native\n" +
    "JSON.parse/JSON.stringify support (no custom decoder needed), smallest complexity-to-benefit\n" +
    "ratio at this record count, and gzip size is within a few percent of the custom binary format\n" +
    "while being trivially debuggable. The custom binary format is ~" +
    `${(100 - (results[3].rawSize / results[2].rawSize) * 100).toFixed(0)}% smaller raw but requires a decoder\n` +
    "and an offset index to reach O(1) lookup — not justified at this stage (no R2/KV/D1 wiring yet).",
);
