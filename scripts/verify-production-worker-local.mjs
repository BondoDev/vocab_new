import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import workerModule from "../workers/word-ssr/worker-dist-full/index.full.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(projectRoot, "workers", "word-ssr", "assets-full");
const cacheStore = new Map();

globalThis.caches = {
  default: {
    async match(request) {
      return cacheStore.get(typeof request === "string" ? request : request.url) ?? null;
    },
    async put(request, response) {
      cacheStore.set(typeof request === "string" ? request : request.url, response.clone());
    },
  },
};

function contentTypeFor(filePath) {
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

const assetsFetcher = {
  async fetch(input) {
    const url = new URL(typeof input === "string" ? input : input.url);
    const relPath = url.pathname.replace(/^\/+/, "").replace(/\//g, path.sep);
    const absPath = path.join(assetsRoot, relPath);
    try {
      const body = await fs.readFile(absPath);
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": contentTypeFor(absPath),
        },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  },
};

const env = {
  ASSETS: assetsFetcher,
  DEPLOYMENT_ENV: "production",
  SITE_ORIGIN: "https://www.fluentstellar.com",
  CANONICAL_HOST: "www.fluentstellar.com",
  ENABLE_CANONICAL_HOST_REDIRECT: "false",
  WORKER_LOG_LABEL: "Production word worker",
};

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

async function render(pathname) {
  const request = new Request(`https://www.fluentstellar.com${pathname}`);
  return workerModule.fetch(request, env, ctx);
}

const canonicalResponse = await render("/ru/english-word-wisdom--B2-04096");
assert.equal(canonicalResponse.status, 200, "canonical production word page should return 200");
assert.equal(canonicalResponse.headers.get("x-robots-tag"), null, "canonical production word page must not send global noindex");
const canonicalHtml = await canonicalResponse.text();
assert.match(canonicalHtml, /<link rel="canonical" href="https:\/\/www\.fluentstellar\.com\/ru\/english-word-wisdom--B2-04096"/i);
assert.match(canonicalHtml, /<meta property="og:url" content="https:\/\/www\.fluentstellar\.com\/ru\/english-word-wisdom--B2-04096"/i);
assert.match(canonicalHtml, /"@id":"https:\/\/www\.fluentstellar\.com\/ru\/english-word-wisdom--B2-04096#webpage"/i);
assert.ok(!canonicalHtml.includes("fluentstellar-word-staging"), "production HTML must not reference staging hostname");

const goneResponse = await render("/en/english-word-about--A1-00001/browse/page/99");
assert.equal(goneResponse.status, 410, "out-of-range production browse page should return 410");
assert.equal(goneResponse.headers.get("x-robots-tag"), "noindex, nofollow", "production 410 should retain noindex behavior");

console.log("local production worker verification passed");
