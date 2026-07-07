/**
 * SEO snapshot comparison tool.
 *
 * Diffs two snapshot JSON files produced by capture.mjs (e.g. "before" vs.
 * "after" a code change, local-vs-live, or local-vs-future-Cloudflare-
 * renderer) and reports mismatches grouped by category, per fixture.
 *
 * Usage:
 *   node scripts/seo-baseline/compare.mjs --a snapshot-before.json --b snapshot-after.json
 *
 * Exit code 0 = no mismatches (or only in fixtures explicitly marked
 * "skipped" in both snapshots). Exit code 1 = at least one mismatch found.
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--a") args.a = argv[++i];
    else if (argv[i] === "--b") args.b = argv[++i];
  }
  return args;
}

const FIELD_CATEGORIES = {
  status: "status mismatch",
  headers: "header mismatch",
  title: "metadata mismatch",
  description: "metadata mismatch",
  canonical: "metadata mismatch",
  robots: "metadata mismatch",
  hreflang: "metadata mismatch",
  openGraph: "metadata mismatch",
  twitter: "metadata mismatch",
  htmlLang: "metadata mismatch",
  jsonLd: "JSON-LD mismatch",
  h1: "visible-content mismatch",
  visibleTextExcerpt: "visible-content mismatch",
  hydration: "hydration mismatch",
};

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffFixture(id, a, b) {
  const mismatches = [];

  if (a?.skipped && b?.skipped) return mismatches;
  if (a?.skipped !== b?.skipped) {
    mismatches.push({ field: "skipped", category: "status mismatch", a: a?.skipped, b: b?.skipped });
    return mismatches;
  }

  for (const field of Object.keys(FIELD_CATEGORIES)) {
    if (!(field in (a ?? {})) && !(field in (b ?? {}))) continue;
    const aValue = a?.[field];
    const bValue = b?.[field];
    if (!deepEqual(aValue, bValue)) {
      mismatches.push({ field, category: FIELD_CATEGORIES[field], a: aValue, b: bValue });
    }
  }

  // Redirect target is nested inside headers.location / headers.Location depending on source.
  const aLocation = a?.headers?.location ?? a?.headers?.Location ?? null;
  const bLocation = b?.headers?.location ?? b?.headers?.Location ?? null;
  if (aLocation !== bLocation) {
    mismatches.push({ field: "redirect-location", category: "redirect mismatch", a: aLocation, b: bLocation });
  }

  return mismatches;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.a || !args.b) {
    console.error("Usage: node scripts/seo-baseline/compare.mjs --a <snapshot.json> --b <snapshot.json>");
    process.exitCode = 1;
    return;
  }

  const snapshotA = JSON.parse(fs.readFileSync(path.resolve(args.a), "utf8"));
  const snapshotB = JSON.parse(fs.readFileSync(path.resolve(args.b), "utf8"));

  console.log(`A: ${snapshotA.source} (captured ${snapshotA.capturedAt})`);
  console.log(`B: ${snapshotB.source} (captured ${snapshotB.capturedAt})`);

  const allIds = new Set([...Object.keys(snapshotA.snapshots ?? {}), ...Object.keys(snapshotB.snapshots ?? {})]);
  let totalMismatches = 0;
  const byCategory = {};

  for (const id of Array.from(allIds).sort()) {
    const a = snapshotA.snapshots?.[id];
    const b = snapshotB.snapshots?.[id];

    if (!a || !b) {
      console.log(`\n✗ ${id}: present in only one snapshot (A has it: ${Boolean(a)}, B has it: ${Boolean(b)})`);
      totalMismatches += 1;
      continue;
    }

    const mismatches = diffFixture(id, a, b);
    if (mismatches.length === 0) continue;

    console.log(`\n✗ ${id}`);
    for (const mismatch of mismatches) {
      byCategory[mismatch.category] = (byCategory[mismatch.category] ?? 0) + 1;
      totalMismatches += 1;
      console.log(`    [${mismatch.category}] ${mismatch.field}:`);
      console.log(`      A: ${JSON.stringify(mismatch.a)?.slice(0, 200)}`);
      console.log(`      B: ${JSON.stringify(mismatch.b)?.slice(0, 200)}`);
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  if (totalMismatches === 0) {
    console.log(`  No mismatches across ${allIds.size} fixture(s).`);
  } else {
    console.log(`  ${totalMismatches} mismatch(es) across ${allIds.size} fixture(s):`);
    for (const [category, count] of Object.entries(byCategory)) {
      console.log(`    - ${category}: ${count}`);
    }
  }
  console.log(`─────────────────────────────────────────\n`);

  process.exitCode = totalMismatches > 0 ? 1 : 0;
}

main();
