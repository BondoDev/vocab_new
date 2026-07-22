/**
 * SEO snapshot capture tool.
 *
 * Captures a normalized, comparable "SEO snapshot" for every URL fixture in
 * fixtures.mjs, from one of two sources:
 *   - "local" (default, no network): calls the exact same render() export
 *     from server-build/entry-server.js that both scripts/build/prerender.mjs and
 *     server/word-ssr-runtime.mjs call, plus the word-route resolver for
 *     status/redirect fixtures. No network access, no live URL required.
 *   - "live": fetches each fixture's URL against a base URL you provide
 *     (e.g. the current production site, or a preview deployment) over real
 *     HTTP. Only used if you explicitly pass --base-url.
 *
 * This is the mechanism described in the regression-suite spec as "future
 * command can compare current local Node/React SSR, future Cloudflare
 * renderer, optional live production URL" — capture.mjs produces one
 * snapshot; compare.mjs (in this same directory) diffs two snapshots.
 *
 * Usage:
 *   node scripts/seo-baseline/capture.mjs --out snapshot-local.json
 *   node scripts/seo-baseline/capture.mjs --base-url https://www.fluentstellar.com --out snapshot-prod.json
 *
 * Requires a prior `npm run build` for the "local" source (needs
 * server-build/entry-server.js). Not required for "--base-url" captures.
 */

import fs from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadBaselineContext, buildFixtureMatrix } from "./fixtures.mjs";
import { ROOT_DIR } from "../lib/compileTs.mjs";

const DEFAULT_OUT_DIR =
  process.env.CLAUDE_SCRATCHPAD_DIR ||
  path.join(process.env.TEMP || process.env.TMPDIR || ROOT_DIR, "seo-baseline-snapshots");

function parseArgs(argv) {
  const args = { out: null, baseUrl: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--base-url") args.baseUrl = argv[++i];
  }
  return args;
}

function extractTagContent(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ?? null;
}

function extractAllMetaByAttr(html, attribute, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(
    html.matchAll(new RegExp(`<meta[^>]*${attribute}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "gi")),
  ).map((m) => m[1]);
}

function extractCanonical(html) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
}

function extractMetaRobots(html) {
  return html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? null;
}

function extractHreflangHrefs(html) {
  return Array.from(
    html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["']/gi),
  )
    .map(([, hreflang, href]) => `${hreflang}=${href}`)
    .sort();
}

function extractJsonLd(html) {
  const openMatch = /<script\s[^>]*type=["']application\/ld\+json["'][^>]*>/i.exec(html);
  if (!openMatch) return null;
  const start = openMatch.index + openMatch[0].length;
  const end = html.indexOf("</script>", start);
  if (end === -1) return null;
  try {
    return JSON.parse(html.slice(start, end));
  } catch {
    return { __unparsable__: html.slice(start, end).slice(0, 200) };
  }
}

function extractHydrationPayloadPresence(html) {
  return {
    wordPageData: html.includes("window.__WORD_PAGE_DATA__"),
    interfaceData: html.includes("window.__INITIAL_INTERFACE_DATA__"),
  };
}

function extractHtmlLang(html) {
  return html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ?? null;
}

/** Short, whitespace-normalized excerpt of visible body text (not full HTML) — for cheap drift detection without an oversized snapshot. */
function extractVisibleTextExcerpt(html) {
  const bodyStart = html.indexOf("<body");
  const body = bodyStart === -1 ? html : html.slice(bodyStart);
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 400);
}

function buildSnapshotFromHtmlDocument(status, html, extraHeaders = {}) {
  if (!html) {
    return { status, headers: extraHeaders };
  }
  return {
    status,
    headers: extraHeaders,
    title: extractTagContent(html, "title"),
    description: extractAllMetaByAttr(html, "name", "description")[0] ?? null,
    canonical: extractCanonical(html),
    robots: extractMetaRobots(html),
    hreflang: extractHreflangHrefs(html),
    openGraph: {
      title: extractAllMetaByAttr(html, "property", "og:title")[0] ?? null,
      type: extractAllMetaByAttr(html, "property", "og:type")[0] ?? null,
      url: extractAllMetaByAttr(html, "property", "og:url")[0] ?? null,
      description: extractAllMetaByAttr(html, "property", "og:description")[0] ?? null,
    },
    twitter: {
      card: extractAllMetaByAttr(html, "name", "twitter:card")[0] ?? null,
      title: extractAllMetaByAttr(html, "name", "twitter:title")[0] ?? null,
    },
    jsonLd: extractJsonLd(html),
    h1: extractTagContent(html, "h1"),
    visibleTextExcerpt: extractVisibleTextExcerpt(html),
    hydration: extractHydrationPayloadPresence(html),
    htmlLang: extractHtmlLang(html),
  };
}

async function captureLocal(fixtures, ctx) {
  const entryServerPath = path.join(ROOT_DIR, "server-build", "entry-server.js");
  if (!fsSync.existsSync(entryServerPath)) {
    throw new Error(
      "server-build/entry-server.js not found. Run `npm run build` first, or use --base-url to capture against a live/deployed URL instead.",
    );
  }
  const entryServer = await import(pathToFileURL(entryServerPath).href);
  const snapshots = {};

  for (const fixture of fixtures) {
    if (!fixture.url) {
      snapshots[fixture.id] = { skipped: true, reason: fixture.reason };
      continue;
    }

    const resolution = await entryServer.resolveWordSeoRequest(fixture.url);
    if (resolution.kind === "redirect") {
      snapshots[fixture.id] = { status: 308, headers: { Location: resolution.location } };
      continue;
    }
    if (resolution.kind === "not-found" && /-word-/.test(fixture.url)) {
      snapshots[fixture.id] = { status: 410 };
      continue;
    }

    try {
      const rendered = await entryServer.render(fixture.url, ctx.siteOrigin);
      // headTags (title/canonical/robots/hreflang/OG/Twitter/JSON-LD) and
      // appHtml (H1, visible text, hydration script tags) are the exact two
      // fragments both scripts/build/prerender.mjs and server/word-ssr-runtime.mjs
      // inject into their templates — concatenating them here is sufficient
      // for every field this snapshot extracts, without reconstructing a
      // full HTML document or touching either script's injection logic.
      const combinedHtml = `${rendered.headTags}\n${rendered.appHtml}`;
      const snapshot = buildSnapshotFromHtmlDocument(200, combinedHtml);
      snapshot.h1 = extractTagContent(rendered.appHtml, "h1");
      snapshot.visibleTextExcerpt = extractVisibleTextExcerpt(rendered.appHtml);
      snapshot.htmlLang = rendered.htmlLang;
      snapshots[fixture.id] = snapshot;
    } catch (error) {
      snapshots[fixture.id] = { status: null, error: String(error?.message ?? error) };
    }
  }

  return snapshots;
}

async function captureLive(fixtures, baseUrl) {
  const snapshots = {};
  for (const fixture of fixtures) {
    if (!fixture.url) {
      snapshots[fixture.id] = { skipped: true, reason: fixture.reason };
      continue;
    }
    const response = await fetch(new URL(fixture.url, baseUrl), { redirect: "manual" });
    const html = response.status === 200 ? await response.text() : null;
    const headers = {
      "content-type": response.headers.get("content-type"),
      "x-robots-tag": response.headers.get("x-robots-tag"),
      "cache-control": response.headers.get("cache-control"),
      location: response.headers.get("location"),
    };
    snapshots[fixture.id] = buildSnapshotFromHtmlDocument(response.status, html, headers);
  }
  return snapshots;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ctx = loadBaselineContext();
  const fixtures = buildFixtureMatrix(ctx);

  try {
    const snapshots = args.baseUrl
      ? await captureLive(fixtures, args.baseUrl)
      : await captureLocal(fixtures, ctx);

    const output = {
      capturedAt: new Date().toISOString(),
      source: args.baseUrl ? `live:${args.baseUrl}` : "local:server-build/entry-server.js",
      fixtureCount: fixtures.length,
      snapshots,
    };

    const outPath = args.out
      ? path.resolve(args.out)
      : path.join(DEFAULT_OUT_DIR, `seo-snapshot-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`Captured ${Object.keys(snapshots).length} fixture snapshot(s) → ${outPath}`);
  } finally {
    ctx.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
