import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SERVER_BUILD_DIR = path.join(ROOT_DIR, "server-build");
const TEMPLATE_PATH = path.join(DIST_DIR, "index.html");
const DEFAULT_SITE_ORIGIN = process.env.SITE_ORIGIN || "https://www.fluentstellar.com";

let templatePromise = null;
let entryServerPromise = null;

function summarizeHtmlBody(body) {
  const text = String(body ?? "");

  return {
    hasHomepageHeadline: text.includes("Practice Vocabulary"),
    hasHomepageSubheadline: text.includes("No lessons - Just practice."),
    hasWordPageHeading:
      text.includes("Meaning of the Italian Word") ||
      text.includes("Meaning of the English Word") ||
      text.includes("Meaning of the German Word") ||
      text.includes("Meaning of the Spanish Word") ||
      text.includes("Meaning of the French Word") ||
      text.includes("Meaning of the Portuguese Word") ||
      text.includes("Meaning of the Russian Word"),
    hasWordPayload: text.includes("window.__WORD_PAGE_DATA__"),
  };
}

function normalizePathname(pathname) {
  const rawValue = Array.isArray(pathname) ? pathname[0] : pathname;
  const withLeadingSlash = `/${String(rawValue ?? "/").replace(/^\/+/, "")}`;
  const normalized = withLeadingSlash.split(/[?#]/, 1)[0] || "/";

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.replace(/\/+$/, "");
  }

  return normalized;
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

async function getTemplate() {
  if (!templatePromise) {
    templatePromise = fs.readFile(TEMPLATE_PATH, "utf8");
  }

  return templatePromise;
}

async function loadEntryServerBundle() {
  if (!entryServerPromise) {
    const entryPath = path.join(SERVER_BUILD_DIR, "entry-server.js");
    entryServerPromise = import(pathToFileURL(entryPath).href);
  }

  return entryServerPromise;
}

async function readStaticHtmlForPath(pathname) {
  const normalizedRoute = pathname.replace(/^\/+/, "");
  const htmlPath = path.join(DIST_DIR, normalizedRoute, "index.html");

  try {
    return await fs.readFile(htmlPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function renderHtmlResponse(pathname, siteOrigin) {
  const [template, entryServer] = await Promise.all([
    getTemplate(),
    loadEntryServerBundle(),
  ]);
  const renderedPage = entryServer.render(pathname, siteOrigin);
  return injectRenderedPage(template, renderedPage);
}

function buildCacheHeaders(status) {
  if (status === 200) {
    return "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
  }

  if (status === 404 || status === 308) {
    return "public, max-age=0, s-maxage=300";
  }

  return "no-store";
}

export async function handleWordSsrPathname(pathname, siteOrigin = DEFAULT_SITE_ORIGIN) {
  const normalizedPathname = normalizePathname(pathname);
  const entryServer = await loadEntryServerBundle();
  const resolution = entryServer.resolveWordSeoRequest(normalizedPathname);

  if (resolution.kind === "redirect") {
    return {
      status: 308,
      headers: {
        Location: resolution.location,
        "Cache-Control": buildCacheHeaders(308),
      },
      body: "",
      routeKind: resolution.kind,
      pathname: normalizedPathname,
    };
  }

  if (resolution.kind === "canonical") {
    const staticHtml = await readStaticHtmlForPath(normalizedPathname);
    if (staticHtml) {
      console.log("[word-ssr-runtime] canonical static hit", {
        pathname: normalizedPathname,
        routeKind: resolution.kind,
        source: "static",
        ...summarizeHtmlBody(staticHtml),
      });
      return {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": buildCacheHeaders(200),
        },
        body: staticHtml,
        routeKind: resolution.kind,
        pathname: normalizedPathname,
        source: "static",
      };
    }

    const body = await renderHtmlResponse(normalizedPathname, siteOrigin);
    console.log("[word-ssr-runtime] canonical dynamic render", {
      pathname: normalizedPathname,
      routeKind: resolution.kind,
      source: "dynamic",
      ...summarizeHtmlBody(body),
    });
    return {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": buildCacheHeaders(200),
      },
      body,
      routeKind: resolution.kind,
      pathname: normalizedPathname,
      source: "dynamic",
    };
  }

  const staticHtml = await readStaticHtmlForPath(normalizedPathname);
  if (staticHtml) {
    return {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": buildCacheHeaders(200),
      },
      body: staticHtml,
      routeKind: resolution.kind,
      pathname: normalizedPathname,
      source: "static-fallback",
    };
  }

  const body = await renderHtmlResponse(normalizedPathname, siteOrigin);
  console.log("[word-ssr-runtime] not-found dynamic render", {
    pathname: normalizedPathname,
    routeKind: resolution.kind,
    reason: resolution.reason,
    source: "dynamic-404",
    ...summarizeHtmlBody(body),
  });
  return {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": buildCacheHeaders(404),
      "X-Robots-Tag": "noindex, nofollow",
    },
    body,
    routeKind: resolution.kind,
    pathname: normalizedPathname,
    reason: resolution.reason,
  };
}

export function getWordRouteRewritePattern() {
  return "/:uiLang([a-z]{2})/:wordRoute([^/]*-word-[^/]+)";
}
