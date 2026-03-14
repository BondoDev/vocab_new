import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SSR_DIR = path.join(ROOT_DIR, ".prerender");
const TEMPLATE_PATH = path.join(DIST_DIR, "index.html");
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://fluentstellar.com";

function stripManagedHeadTags(template) {
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[\s\S]*?>/i, "")
    .replace(/<link\s+rel="canonical"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:type"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:url"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:title"[\s\S]*?>/i, "")
    .replace(/<meta\s+property="og:description"[\s\S]*?>/i, "")
    .replace(/<link\s+rel="alternate"[\s\S]*?data-vocab-hreflang="true"[\s\S]*?>/gi, "");
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
  const routes = getPrerenderRoutes();

  await Promise.all(
    routes.map(async (route) => {
      const page = render(route, SITE_ORIGIN);
      const html = injectRenderedPage(template, page);
      await writeRouteHtml(route, html);
    }),
  );

  await fs.rm(SSR_DIR, { recursive: true, force: true });
  console.log(`Prerendered ${routes.length} vocabulary SEO pages.`);
}

main().catch(async (error) => {
  console.error("Failed to prerender SEO pages:", error);
  await fs.rm(SSR_DIR, { recursive: true, force: true });
  process.exitCode = 1;
});
