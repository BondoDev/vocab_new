import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SSR_DIR = path.join(ROOT_DIR, ".prerender");
const TEMPLATE_PATH = path.join(DIST_DIR, "index.html");
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://www.fluentstellar.com";
const WORD_PRERENDER_LIMIT = Number.parseInt(process.env.WORD_PRERENDER_LIMIT || "0", 10);
const WORD_PRERENDER_OFFSET = Number.parseInt(process.env.WORD_PRERENDER_OFFSET || "0", 10);
const UI_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ru"];
const TARGET_LANGUAGES = [
  "english",
  "german",
  "spanish",
  "french",
  "italian",
  "portuguese",
  "russian",
];

function wordToSlug(lemma) {
  return lemma
    .toLowerCase()
    .replace(/['’‘]/g, "")
    .replace(/[^a-z0-9À-ӿ\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function collectWordRoutesSubset(limit, offset) {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const normalizedOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const uniqueWords = [];
  const seen = new Set();

  for (const targetLanguage of TARGET_LANGUAGES) {
    const vocabPath = path.join(
      ROOT_DIR,
      "src",
      "data",
      "vocabulary",
      targetLanguage,
      "vocabulary.json",
    );
    const raw = await fs.readFile(vocabPath, "utf8");
    const vocab = JSON.parse(raw.replace(/^\uFEFF/, ""));
    for (const entry of vocab) {
      const slug = wordToSlug(entry.word_lemma || "");
      if (!slug) continue;
      const key = `${targetLanguage}:${slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueWords.push({ targetLanguage, slug });
    }
  }

  const selected = uniqueWords.slice(normalizedOffset, normalizedOffset + limit);
  const routes = [];
  for (const item of selected) {
    for (const uiLang of UI_LANGUAGES) {
      routes.push(`/${uiLang}/${item.targetLanguage}-word-${item.slug}`);
    }
  }
  return routes;
}

function stripManagedHeadTags(template) {
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[\s\S]*?>/i, "")
    .replace(/<link\s+rel="canonical"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:type"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:url"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:title"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:description"[\s\S]*?>/i, "")
    .replace(/<link\s+rel="alternate"[\s\S]*?data-vocab-hreflang="true"[\s\S]*?>/gi, "")
    .replace(/<script\s[^>]*data-managed-jsonld="true"[^>]*>[\s\S]*?<\/script>/gi, "");
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

  return withHead.replace(
    /<div id="root">(?:<!--app-html-->)?<\/div>/i,
    `<div id="root">${appHtml}</div>`,
  );
}

async function writeRouteHtml(route, html) {
  const normalizedRoute = route.replace(/^\/+/, "");
  const targetDir = path.join(DIST_DIR, normalizedRoute);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, "index.html"), html, "utf8");
}

async function main() {
  const template = await fs.readFile(TEMPLATE_PATH, "utf8");
  const { getPrerenderRoutes, render } = await loadServerBundle();
  const baseRoutes = getPrerenderRoutes();
  const wordRoutes = await collectWordRoutesSubset(
    WORD_PRERENDER_LIMIT,
    WORD_PRERENDER_OFFSET,
  );
  const routes = [...new Set([...baseRoutes, ...wordRoutes])];

  await Promise.all(
    routes.map(async (route) => {
      const page = render(route, SITE_ORIGIN);
      const html = injectRenderedPage(template, page);
      await writeRouteHtml(route, html);
    }),
  );

  await fs.rm(SSR_DIR, { recursive: true, force: true });
  console.log(
    `Prerendered ${routes.length} SEO pages (${baseRoutes.length} base + ${wordRoutes.length} word routes).`,
  );
}

main().catch(async (error) => {
  console.error("Failed to prerender SEO pages:", error);
  await fs.rm(SSR_DIR, { recursive: true, force: true });
  process.exitCode = 1;
});
