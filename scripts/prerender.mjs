import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SSR_DIR = path.join(ROOT_DIR, "server-build");
const TEMPLATE_PATH = path.join(DIST_DIR, "index.html");
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://www.fluentstellar.com";
const WORD_PRERENDER_LIMIT = Number.parseInt(process.env.WORD_PRERENDER_LIMIT || "0", 10);
const WORD_PRERENDER_OFFSET = Number.parseInt(process.env.WORD_PRERENDER_OFFSET || "0", 10);
const PRERENDER_BATCH_SIZE = Number.parseInt(process.env.PRERENDER_BATCH_SIZE || "50", 10);
const WORD_PRERENDER_DEFINITIONS = [
  { uiLang: "en", targetLanguage: "english" },
  { uiLang: "es", targetLanguage: "english" },
  { uiLang: "fr", targetLanguage: "english" },
  { uiLang: "de", targetLanguage: "english" },
  { uiLang: "it", targetLanguage: "english" },
  { uiLang: "pt", targetLanguage: "english" },
  { uiLang: "ru", targetLanguage: "english" },
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
  if (WORD_PRERENDER_DEFINITIONS.length === 0) return [];
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const normalizedOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const selectedTargetLanguages = Array.from(
    new Set(WORD_PRERENDER_DEFINITIONS.map(({ targetLanguage }) => targetLanguage)),
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
      const key = conceptId ? `${targetLanguage}:${conceptId}` : `${targetLanguage}:${slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueWords.push({ targetLanguage, slug, conceptId });
    }
  }

  const selected = uniqueWords.slice(normalizedOffset, normalizedOffset + limit);
  const routes = [];
  for (const item of selected) {
    const wordPathSuffix = item.conceptId ? `${item.slug}--${item.conceptId}` : item.slug;
    for (const { uiLang, targetLanguage } of WORD_PRERENDER_DEFINITIONS) {
      if (targetLanguage !== item.targetLanguage) continue;
      routes.push(`/${uiLang}/${targetLanguage}-word-${wordPathSuffix}`);
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

async function main() {
  const template = await fs.readFile(TEMPLATE_PATH, "utf8");
  const { getPrerenderRoutes, render } = await loadServerBundle();

  const baseRoutes = getPrerenderRoutes();
  const wordRoutes = await collectWordRoutesSubset(
    WORD_PRERENDER_LIMIT,
    WORD_PRERENDER_OFFSET,
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
      const html = injectRenderedPage(template, page);
      await writeRouteHtml(route, html);
      }),
    );
  }
  console.log(
    `Prerendered ${routes.length} SEO pages (${baseRoutes.length} base + ${wordRoutes.length} word routes).`,
  );
}

main().catch(async (error) => {
  console.error("Failed to prerender SEO pages:", error);
  process.exitCode = 1;
});
