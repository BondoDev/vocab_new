// EXPERIMENTAL / Node-only measurement tool — NOT part of production. Read-only
// performance profile of the prototype renderer, mirroring the shape of
// scripts/benchmark-word-render.mjs (one cold sample via a fresh child
// process, N warm in-process samples) so the numbers are comparable.
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSharedWordRouteModules } from "./compile-shared-modules.mjs";
import { renderWordPocResponse } from "./renderer.mjs";
import { loadStore } from "./load-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLD_WORKER_PATH = path.join(__dirname, "cold-worker-once.mjs");

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length));
  return sortedValues[index];
}

function formatMs(ms) {
  return typeof ms === "number" ? `${ms.toFixed(4)}ms` : "n/a";
}

function runColdSample() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [COLD_WORKER_PATH], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`cold worker exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`cold worker produced non-JSON output: ${stdout}\n${stderr}`));
      }
    });
  });
}

function measureOnePass(shared, store) {
  const t0 = process.hrtime.bigint();
  const parsed = shared.parseWordRoutePathname("/en/english-word-about--A1-00001");
  const t1 = process.hrtime.bigint();
  void parsed;

  const t2 = process.hrtime.bigint();
  const concept = store.concepts["A1-00001"]; // O(1) lookup
  const otherMeanings = concept.otherMeaningConceptIds.map((id) => store.concepts[id]);
  const relatedWords = concept.relatedConceptIds.map((id) => store.concepts[id]);
  void otherMeanings;
  void relatedWords;
  const t3 = process.hrtime.bigint();

  const t4 = process.hrtime.bigint();
  const response = renderWordPocResponse(
    "/en/english-word-about--A1-00001",
    "https://www.fluentstellar.com",
    shared,
    store,
  );
  const t5 = process.hrtime.bigint();

  const ns = (a, b) => Number(b - a) / 1_000_000;
  return {
    stages: {
      routeParse: ns(t0, t1),
      recordLookup: ns(t2, t3),
      fullResponseComposition: ns(t4, t5),
    },
    totalMs: ns(t0, t5),
    outputBytes: Buffer.byteLength(response.body, "utf8"),
    heapUsedBytes: process.memoryUsage().heapUsed,
  };
}

async function main() {
  console.log("Prototype word-page render pipeline benchmark (read-only, no assertions)\n");

  console.log("[cold] spawning a fresh process for a genuine cold-start sample...");
  const coldSample = await runColdSample();
  console.log(
    `  total: ${formatMs(coldSample.totalMs)}  (heapUsed: ${(coldSample.heapUsedBytes / 1024 / 1024).toFixed(1)}MB, output: ${coldSample.outputBytes} bytes)`,
  );
  for (const [stage, ms] of Object.entries(coldSample.stages)) {
    console.log(`    ${stage}: ${formatMs(ms)}`);
  }
  console.log(
    `    recordStoreLoad (cold, includes reading 3 JSON files off disk): ${formatMs(coldSample.recordStoreLoadMs)}`,
  );

  const samples = 200;
  console.log(`\n[warm] running ${samples} in-process sample(s) (1 untimed warm-up + ${samples} measured)...`);
  const shared = loadSharedWordRouteModules();
  const store = loadStore();
  measureOnePass(shared, store); // warm-up, discarded
  const warmSamples = [];
  for (let i = 0; i < samples; i += 1) {
    warmSamples.push(measureOnePass(shared, store));
  }

  const warmTotals = warmSamples.map((s) => s.totalMs).sort((a, b) => a - b);
  const warmAvg = warmTotals.reduce((sum, v) => sum + v, 0) / warmTotals.length;
  console.log(`\n  total (avg): ${formatMs(warmAvg)}`);
  console.log(`  total (p50): ${formatMs(percentile(warmTotals, 50))}`);
  console.log(`  total (p95): ${formatMs(percentile(warmTotals, 95))}`);
  console.log(`  total (min/max): ${formatMs(warmTotals[0])} / ${formatMs(warmTotals[warmTotals.length - 1])}`);

  console.log("\n  per-stage (warm):");
  for (const stage of Object.keys(warmSamples[0].stages)) {
    const values = warmSamples.map((s) => s.stages[stage]).sort((a, b) => a - b);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    console.log(
      `    ${stage}: avg=${formatMs(avg)} p50=${formatMs(percentile(values, 50))} p95=${formatMs(percentile(values, 95))}`,
    );
  }

  console.log(`\n  rendered HTML size: ${warmSamples[0].outputBytes} bytes`);
  const heapValues = warmSamples.map((s) => s.heapUsedBytes);
  const heapDeltaMb = ((heapValues[heapValues.length - 1] - heapValues[0]) / 1024 / 1024).toFixed(2);
  console.log(`  approximate heap growth across ${samples} warm samples: ${heapDeltaMb}MB (directional only)`);

  console.log(
    "\nNote: this benchmark always exits 0 — it is a measurement tool, not a pass/fail gate, matching\n" +
      "the convention of scripts/benchmark-word-render.mjs.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
