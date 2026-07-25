import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadWordRouteManifest } from "../lib/load-word-route-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SSR_DIR = path.join(ROOT_DIR, "server-build");
const TEMPLATE_PATH = path.join(DIST_DIR, "index.html");
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://www.fluentstellar.com";
const WORD_PRERENDER_LIMIT = Number.parseInt(process.env.WORD_PRERENDER_LIMIT || "0", 10);
const WORD_PRERENDER_OFFSET = Number.parseInt(process.env.WORD_PRERENDER_OFFSET || "0", 10);
const PRERENDER_BATCH_SIZE = Number.parseInt(process.env.PRERENDER_BATCH_SIZE || "50", 10);

function getWordPrerenderDefinitions(wordRouteManifest) {
  return wordRouteManifest.WORD_SITEMAP_DEFINITIONS.filter(
    ({ targetLanguage }) => targetLanguage === "english",
  ).map(({ uiLang, targetLanguage }) => ({ uiLang, targetLanguage }));
}

async function collectWordRoutesSubset(limit, offset, wordRouteManifest) {
  const definitions = getWordPrerenderDefinitions(wordRouteManifest);
  const { buildCanonicalWordPathFromSlug, buildWordRouteLookupKey, wordToSlug } = wordRouteManifest;

  if (definitions.length === 0) return [];
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const normalizedOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const selectedTargetLanguages = Array.from(
    new Set(definitions.map(({ targetLanguage }) => targetLanguage)),
  );
  const uniqueWords = [];

  for (const targetLanguage of selectedTargetLanguages) {
    const seen = new Set();
    const vocabPath = path.join(ROOT_DIR, "src", "data", "vocabulary", targetLanguage, "vocabulary.json");
    const raw = await fs.readFile(vocabPath, "utf8");
    const vocab = JSON.parse(raw.replace(/^\uFEFF/, ""));
    for (const entry of vocab) {
      const slug = wordToSlug(entry.word_lemma || "");
      if (!slug) continue;
      const conceptId = String(entry.concept_id ?? "").trim();
      const key = buildWordRouteLookupKey(targetLanguage, conceptId, slug);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueWords.push({ targetLanguage, slug, conceptId });
    }
  }

  const selected = uniqueWords.slice(normalizedOffset, normalizedOffset + limit);
  const routes = [];
  for (const item of selected) {
    for (const { uiLang, targetLanguage } of definitions) {
      if (targetLanguage !== item.targetLanguage) continue;
      routes.push(
        buildCanonicalWordPathFromSlug(uiLang, targetLanguage, item.slug, item.conceptId),
      );
    }
  }
  return routes;
}

function stripManagedHeadTags(template) {
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[\s\S]*?>/i, "")
    .replace(/<meta\s+name="robots"[\s\S]*?>/gi, "")
    .replace(/<link\s+rel="canonical"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:type"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:url"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:title"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:description"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:image"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:image:width"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:image:height"[\s\S]*?>/i, "")
    .replace(/<link\s+rel="alternate"[\s\S]*?data-vocab-hreflang="true"[\s\S]*?>/gi, "")
    .replace(/<script\s[^>]*data-managed-jsonld="true"[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script>\s*window\.__WORD_PAGE_DATA__=[\s\S]*?<\/script>/gi, "")
    .replace(/<script>\s*window\.__INITIAL_INTERFACE_DATA__=[\s\S]*?<\/script>/gi, "");
}

async function loadServerBundle() {
  const entryPath = path.join(SSR_DIR, "entry-server.js");
  return import(pathToFileURL(entryPath).href);
}

function injectRenderedPage(template, { appHtml, headTags, htmlLang }) {
  const withLanguage = template.replace(/<html lang="[^"]*">/i, `<html lang="${htmlLang}">`);
  const withHead = stripManagedHeadTags(withLanguage).replace(
    "</head>",
    `    ${headTags}\n  </head>`,
  );
  const rootStart = withHead.indexOf('<div id="root">');
  const bodyClose = withHead.lastIndexOf("</body>");

  // dist/index.html's empty `<div id="root">...</div>` mount point (from
  // Vite's client build) is expected here, but if that marker shape is ever
  // missing or malformed, skip body injection instead of throwing — one
  // route's unexpected template shape must not abort the whole prerender
  // batch. `<head>` tags above are already injected either way, so the
  // route keeps correct SEO metadata; it just falls back to client-side
  // rendering (the shipped bundle hydrates the empty root on load) instead
  // of shipping SSR markup baked into this file. Preserve this graceful,
  // non-throwing fallback.
  if (rootStart === -1 || bodyClose === -1 || bodyClose <= rootStart) {
    return withHead;
  }

  const rootClose = withHead.lastIndexOf("</div>", bodyClose);
  if (rootClose === -1 || rootClose <= rootStart) {
    return withHead;
  }

  return (
    withHead.slice(0, rootStart) +
    `<div id="root">${appHtml}</div>` +
    withHead.slice(rootClose + "</div>".length)
  );
}

async function writeRouteHtml(route, html) {
  const normalizedRoute = route.replace(/^\/+/, "");
  const targetDir = path.join(DIST_DIR, normalizedRoute);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, "index.html"), html, "utf8");
}

async function buildLazyPreloadMap() {
  const assetsDir = path.join(DIST_DIR, "assets");
  const files = await fs.readdir(assetsDir);
  const find = (prefix) =>
    files.find((f) => f.startsWith(prefix) && f.endsWith(".js")) ?? null;
  return {
    About: find("About-"),
    Help: find("Help-"),
    ExerciseSelection: find("ExerciseSelection-"),
    LevelCategorySelection: find("LevelCategorySelection-"),
    VocabularyPractice: find("VocabularyPractice-"),
    VocabularyLevelExam: find("VocabularyLevelExam-"),
  };
}

function getLazyChunkForRoute(route, chunkMap) {
  if (route === "/about" || route.startsWith("/about/")) return chunkMap.About;
  if (route === "/help" || route.startsWith("/help/")) return chunkMap.Help;
  if (route.includes("/languages/filters/exercises") && route.includes("/practice")) return chunkMap.VocabularyPractice;
  if (route.startsWith("/languages/filters/exercises")) return chunkMap.ExerciseSelection;
  if (route === "/languages/filters" || route === "/languages/filters/") return chunkMap.LevelCategorySelection;
  if (route.startsWith("/languages/level-test")) return chunkMap.VocabularyLevelExam;
  return null;
}

async function main() {
  const manifestLoader = loadWordRouteManifest(".tmp-word-route-manifest-prerender");

  try {
    const template = await fs.readFile(TEMPLATE_PATH, "utf8");
    const [{ getPrerenderRoutes, render }, chunkMap] = await Promise.all([
      loadServerBundle(),
      buildLazyPreloadMap(),
    ]);

    const baseRoutes = getPrerenderRoutes();
    const wordRoutes = await collectWordRoutesSubset(
      WORD_PRERENDER_LIMIT,
      WORD_PRERENDER_OFFSET,
      manifestLoader.manifest,
    );
    const routes = [...new Set([...baseRoutes, ...wordRoutes])];
    const batchSize = Number.isFinite(PRERENDER_BATCH_SIZE) && PRERENDER_BATCH_SIZE > 0
      ? PRERENDER_BATCH_SIZE
      : 50;

    for (let index = 0; index < routes.length; index += batchSize) {
      const batch = routes.slice(index, index + batchSize);
      await Promise.all(
        batch.map(async (route) => {
          const page = await render(route, SITE_ORIGIN);
          let html = injectRenderedPage(template, page);
          const lazyChunk = getLazyChunkForRoute(route, chunkMap);
          if (lazyChunk) {
            html = html.replace(
              "</head>",
              `  <link rel="modulepreload" href="/assets/${lazyChunk}">\n  </head>`,
            );
          }
          await writeRouteHtml(route, html);
        }),
      );
    }
    console.log(
      `Prerendered ${routes.length} SEO pages (${baseRoutes.length} base + ${wordRoutes.length} word routes).`,
    );
  } finally {
    manifestLoader.cleanup();
  }
}

main().catch(async (error) => {
  console.error("Failed to prerender SEO pages:", error);
  process.exitCode = 1;
});
