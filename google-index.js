import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { XMLParser } from "fast-xml-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITEMAP_INDEX_PATH = path.join(__dirname, "public", "sitemap.xml");
const SITEMAPS_DIR = path.join(__dirname, "public", "sitemaps");
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service-account.json");
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function toArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function normalizeLoc(entry) {
  if (typeof entry === "string") {
    return entry.trim();
  }

  if (entry && typeof entry.loc === "string") {
    return entry.loc.trim();
  }

  return "";
}

function resolveLocalSitemapPath(loc) {
  const url = new URL(loc);
  const fileName = path.basename(url.pathname);
  return path.join(SITEMAPS_DIR, fileName);
}

async function parseXmlFile(filePath) {
  const xml = await fs.readFile(filePath, "utf8");
  return parser.parse(xml);
}

async function collectUrlsFromSitemapIndex() {
  const sitemapIndex = await parseXmlFile(SITEMAP_INDEX_PATH);
  const sitemapEntries = toArray(sitemapIndex?.sitemapindex?.sitemap);
  const urls = [];

  for (const entry of sitemapEntries) {
    const loc = normalizeLoc(entry);
    if (!loc) {
      continue;
    }

    const childPath = resolveLocalSitemapPath(loc);
    const childSitemap = await parseXmlFile(childPath);
    const childUrls = toArray(childSitemap?.urlset?.url)
      .map((urlEntry) => normalizeLoc(urlEntry))
      .filter(Boolean);

    urls.push(...childUrls);
  }

  return urls;
}

async function getIndexingClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: [INDEXING_SCOPE],
  });

  return google.indexing({
    version: "v3",
    auth: await auth.getClient(),
  });
}

async function main() {
  const urls = await collectUrlsFromSitemapIndex();

  if (urls.length === 0) {
    throw new Error("No URLs were found in the local sitemap files.");
  }

  console.log(`Found ${urls.length} URLs in local sitemap files.`);

  const indexing = await getIndexingClient();

  for (const [index, url] of urls.entries()) {
    const progress = `[${index + 1}/${urls.length}]`;

    try {
      await indexing.urlNotifications.publish({
        requestBody: {
          url,
          type: "URL_UPDATED",
        },
      });

      console.log(`${progress} Submitted ${url}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`${progress} Failed ${url}`);
      console.error(message);
    }
  }
}

main().catch((error) => {
  console.error("Google indexing run failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
