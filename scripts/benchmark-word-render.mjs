/**
 * Read-only performance baseline for the word-page render pipeline.
 *
 * This is a BENCHMARK, not a correctness test — it never fails the process
 * and asserts nothing. It exists to give a "before" number ahead of any
 * future Cloudflare/rendering-architecture change, per the regression-suite
 * spec's requirement for a performance baseline kept separate from pass/fail
 * tests (so it can't make the correctness suite flaky).
 *
 * Measures, per stage: route parsing, vocabulary loading (raw JSON.parse),
 * resolveWordSeoRequest (route resolution + buildResolvedWordPageData),
 * full render() (metadata generation + React SSR combined — render() does
 * not expose these as separately callable units), and an approximate
 * template-injection cost. Reports:
 *   - one COLD sample (fresh child `node` process — genuine cold start,
 *     nothing cached, module graph loaded from scratch)
 *   - WARM samples (repeated in this same already-warmed-up process) with
 *     average, p50, p95
 *   - approximate heap delta (Node's GC makes exact numbers noisy — treat as
 *     directional, not authoritative)
 *
 * Run: node scripts/benchmark-word-render.mjs [--samples N]
 * Requires a prior `npm run build` (needs server-build/entry-server.js).
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { measureOnePass } from "./word-render-benchmark/wordRenderBreakdown.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLD_WORKER_PATH = path.join(__dirname, "word-render-benchmark", "benchmark-worker-once.mjs");

function parseArgs(argv) {
  const args = { samples: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--samples") args.samples = Number.parseInt(argv[++i], 10) || args.samples;
  }
  return args;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length));
  return sortedValues[index];
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
        reject(new Error(`cold benchmark worker exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`cold benchmark worker produced non-JSON output: ${stdout}\n${stderr}`));
      }
    });
  });
}

function formatMs(ms) {
  return typeof ms === "number" ? `${ms.toFixed(2)}ms` : "n/a";
}

function summarizeStage(samples, stageName) {
  const values = samples.map((s) => s.stages[stageName]).filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (values.length === 0) return null;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { avg, p50: percentile(values, 50), p95: percentile(values, 95), min: values[0], max: values[values.length - 1] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("Word-page render pipeline benchmark (read-only, no assertions)\n");

  console.log("[cold] spawning a fresh process for a genuine cold-start sample...");
  const coldSample = await runColdSample();
  console.log(`  total: ${formatMs(coldSample.totalMs)}  (heapUsed: ${(coldSample.heapUsedBytes / 1024 / 1024).toFixed(1)}MB)`);
  for (const [stage, ms] of Object.entries(coldSample.stages)) {
    console.log(`    ${stage}: ${formatMs(ms)}`);
  }

  console.log(`\n[warm] running ${args.samples} in-process sample(s) (1 untimed warm-up + ${args.samples} measured)...`);
  await measureOnePass(); // warm-up, discarded — primes module cache/JIT
  const warmSamples = [];
  for (let i = 0; i < args.samples; i += 1) {
    warmSamples.push(await measureOnePass());
  }

  const warmTotals = warmSamples.map((s) => s.totalMs).sort((a, b) => a - b);
  const warmAvg = warmTotals.reduce((sum, v) => sum + v, 0) / warmTotals.length;
  console.log(`\n  total (avg): ${formatMs(warmAvg)}`);
  console.log(`  total (p50): ${formatMs(percentile(warmTotals, 50))}`);
  console.log(`  total (p95): ${formatMs(percentile(warmTotals, 95))}`);
  console.log(`  total (min/max): ${formatMs(warmTotals[0])} / ${formatMs(warmTotals[warmTotals.length - 1])}`);

  console.log("\n  per-stage (warm):");
  const stageNames = Object.keys(warmSamples[0]?.stages ?? {});
  for (const stage of stageNames) {
    const summary = summarizeStage(warmSamples, stage);
    if (!summary) continue;
    console.log(
      `    ${stage}: avg=${formatMs(summary.avg)} p50=${formatMs(summary.p50)} p95=${formatMs(summary.p95)} min=${formatMs(summary.min)} max=${formatMs(summary.max)}`,
    );
  }

  const heapValues = warmSamples.map((s) => s.heapUsedBytes);
  const heapDeltaMb = ((heapValues[heapValues.length - 1] - heapValues[0]) / 1024 / 1024).toFixed(1);
  console.log(`\n  approximate heap growth across ${args.samples} warm samples: ${heapDeltaMb}MB (directional only — GC timing is not controlled)`);

  console.log(
    "\nNote: this benchmark always exits 0 — it is a measurement tool, not a pass/fail gate. " +
      "Compare these numbers to a future run (e.g. after raising WORD_PRERENDER_LIMIT, or against a " +
      "Cloudflare-native renderer) to see whether a change actually reduces per-request work.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
