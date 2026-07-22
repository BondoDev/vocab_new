/**
 * One measured pass through the word-page render pipeline, broken down by
 * stage. Shared by scripts/benchmark-word-render.mjs for both the "cold"
 * (fresh child process) and "warm" (repeated in-process) measurements, so
 * both use exactly the same stage boundaries.
 *
 * This duplicates a *measurement-only* path alongside the real
 * src/entry-server.tsx pipeline rather than instrumenting production code
 * directly — the benchmark's job is to report timings, not to change what
 * ships, so nothing here is imported by any production entry point.
 *
 * Owned by the word-render benchmark workflow, not SEO baseline — moved out
 * of scripts/seo-baseline/lib/ because no seo-baseline capture/compare/fixture
 * script ever consumed it, only scripts/benchmark-word-render.mjs and its
 * sibling benchmark-worker-once.mjs did.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT_DIR } from "../lib/compileTs.mjs";

const SITE_ORIGIN = "https://www.fluentstellar.com";

export async function measureOnePass({ uiLang = "en", targetLanguage = "english", conceptId = "A1-00001" } = {}) {
  const stages = {};
  const mark = (name, fn) => {
    const start = performance.now();
    const result = fn();
    stages[name] = performance.now() - start;
    return result;
  };
  const markAsync = async (name, fn) => {
    const start = performance.now();
    const result = await fn();
    stages[name] = performance.now() - start;
    return result;
  };

  const entryServerPath = path.join(ROOT_DIR, "server-build", "entry-server.js");
  if (!fs.existsSync(entryServerPath)) {
    throw new Error("server-build/entry-server.js not found — run `npm run build` first.");
  }

  const entryServer = await markAsync("moduleImport", () => import(pathToFileURL(entryServerPath).href));

  // Stage: route parsing (regex + slug/concept-ID validation only, no data access).
  const pathname = mark("routeParsing", () => {
    // Mirrors buildWordPath's own construction without importing wordSlugs.ts
    // separately (entry-server.js's compiled bundle doesn't re-export it) —
    // the canonical shape is fixed and documented in src/data/seo/wordPages/wordSlugs.ts.
    return `/${uiLang}/${targetLanguage}-word-about--${conceptId}`;
  });

  // Stage: vocabulary loading — raw JSON.parse cost, measured independently
  // of entry-server's own module-level memoization (which would make every
  // call after the first free and hide the real per-cold-start cost).
  const vocabPath = path.join(ROOT_DIR, "src", "data", "vocabulary", targetLanguage, "vocabulary.json");
  const vocabulary = mark("vocabularyLoad(rawJsonParse)", () =>
    JSON.parse(fs.readFileSync(vocabPath, "utf8").replace(new RegExp("^" + String.fromCharCode(0xfeff)), "")),
  );

  // Stage: resolveWordSeoRequest — route resolution + buildResolvedWordPageData
  // (the O(n) scans flagged in the hosting-efficiency audit) combined, since
  // resolveWordSeoRequest is the smallest exported unit that exercises them.
  const resolution = await markAsync("resolveWordSeoRequest", () => entryServer.resolveWordSeoRequest(pathname));

  // Stage: full render() — metadata generation + React SSR + serialization,
  // combined (render() does not expose these as separately callable units).
  const rendered = await markAsync("fullRender(metadata+reactSsr)", () => entryServer.render(pathname, SITE_ORIGIN));

  // Stage: template injection — approximates the string-manipulation cost
  // scripts/build/prerender.mjs / server/word-ssr-runtime.mjs pay when splicing
  // headTags + appHtml into a template (not an exact copy of either script's
  // regex set — see file header — close enough for relative timing).
  const templatePath = path.join(ROOT_DIR, "server-build", "ssr-template.html");
  mark("templateInjection(approx)", () => {
    if (!fs.existsSync(templatePath)) return null;
    const template = fs.readFileSync(templatePath, "utf8");
    const withHead = template.replace("</head>", `${rendered.headTags}\n</head>`);
    const rootStart = withHead.indexOf('<div id="root">');
    const rootEnd = withHead.indexOf("</body>", rootStart);
    return withHead.slice(0, rootStart) + rendered.appHtml + withHead.slice(rootEnd);
  });

  const totalMs = Object.values(stages).reduce((sum, ms) => sum + ms, 0);

  return {
    stages,
    totalMs,
    resolutionKind: resolution.kind,
    vocabularyEntryCount: vocabulary.length,
    heapUsedBytes: process.memoryUsage().heapUsed,
  };
}
