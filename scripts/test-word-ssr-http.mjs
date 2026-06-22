import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { sendNodeResponse } from "../server/word-ssr-http.mjs";
import {
  handleBlockedWordApiRequest,
  handleInternalWordSsrRequest,
} from "../server/word-ssr-handler.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const siteOrigin = "https://www.fluentstellar.com";
const tempDir = path.join(rootDir, ".tmp-word-ssr-http-test");
const require = createRequire(import.meta.url);

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/^\uFEFF/, ""),
  );
}

function compileWordSlugModule() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const program = ts.createProgram({
    rootNames: [path.join(rootDir, "src", "data", "seo", "wordSlugs.ts")],
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      rootDir,
      outDir: tempDir,
      noEmit: false,
    },
  });

  const emitResult = program.emit();
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => rootDir,
      getNewLine: () => "\n",
    });
    throw new Error(`TypeScript compile failed:\n${formatted}`);
  }

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2),
  );

  return require(path.join(tempDir, "src", "data", "seo", "wordSlugs.js"));
}

const wordSlugs = compileWordSlugModule();
const wordToSlug = wordSlugs.wordToSlug;

function buildCanonicalPath(uiLang, targetLanguage, entry) {
  return wordSlugs.buildWordPath(
    uiLang,
    targetLanguage,
    entry.word_lemma,
    String(entry.concept_id).trim(),
  );
}

function buildLegacyPath(uiLang, targetLanguage, entry) {
  return buildCanonicalPath(uiLang, targetLanguage, entry).replace("--", "-");
}

function findDuplicateLemmaEntries(vocabulary) {
  const bySlug = new Map();

  for (const entry of vocabulary) {
    const slug = wordToSlug(entry.word_lemma);
    const list = bySlug.get(slug) ?? [];
    list.push(entry);
    bySlug.set(slug, list);
  }

  return Array.from(bySlug.values()).find((entries) => entries.length > 1) ?? null;
}

function findRepresentativeEntry(vocabulary) {
  return (
    vocabulary.find((entry) => {
      const slug = wordToSlug(entry.word_lemma);
      return /^[a-z0-9-]+$/.test(slug) && String(entry.concept_id ?? "").trim().length > 0;
    }) ?? vocabulary[0]
  );
}

function extractTagContent(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ?? null;
}

function extractMetaContent(html, nameOrProperty, attribute = "name") {
  const escapedValue = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]*${attribute}=["']${escapedValue}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  return html.match(pattern)?.[1] ?? null;
}

function extractCanonical(html) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
}

function extractHtmlLang(html) {
  return html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ?? null;
}

function countLinks(html) {
  return Array.from(html.matchAll(/<a\b/gi)).length;
}

function extractRootHtml(html) {
  const rootStart = html.indexOf('<div id="root">');
  if (rootStart === -1) {
    return "";
  }

  const bodyEnd = html.indexOf("</body>", rootStart);
  if (bodyEnd === -1) {
    return html.slice(rootStart);
  }

  return html.slice(rootStart, bodyEnd);
}

async function resolveStaticResponse(pathname) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const fileCandidate = path.join(distDir, normalizedPath.replace(/^\/+/, ""));
  const htmlCandidate = path.join(distDir, pathname.replace(/^\/+/, ""), "index.html");
  const isNoindexAppRoute =
    pathname === "/profile" ||
    pathname === "/languages/filters/exercises/practice" ||
    /^\/languages\/filters\/exercises\/[a-z]{2}-[a-z]{2}\/practice$/i.test(pathname);
  const routeHeaders = isNoindexAppRoute
    ? {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      }
    : null;

  try {
    const stat = await fsp.stat(fileCandidate);
    if (stat.isFile()) {
      return {
        status: 200,
        headers:
          routeHeaders ??
          {
            "Content-Type": fileCandidate.endsWith(".html")
              ? "text/html; charset=utf-8"
              : "application/octet-stream",
          },
        body: await fsp.readFile(fileCandidate, "utf8"),
      };
    }
  } catch {}

  try {
    const stat = await fsp.stat(htmlCandidate);
    if (stat.isFile()) {
      return {
        status: 200,
        headers:
          routeHeaders ??
          {
            "Content-Type": "text/html; charset=utf-8",
          },
        body: await fsp.readFile(htmlCandidate, "utf8"),
      };
    }
  } catch {}

  return null;
}

function isWordLikeRoute(pathname) {
  return /^\/[a-z]{2}\/[^/]*-word-[^/]+$/i.test(pathname);
}

async function createVerificationServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;
    const requestState = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: Object.fromEntries(url.searchParams.entries()),
    };

    try {
      if (pathname === "/api/word-ssr" || pathname === "/api/word-ssr-internal") {
        const response =
          pathname === "/api/word-ssr"
            ? await handleBlockedWordApiRequest(requestState)
            : await handleInternalWordSsrRequest(requestState);
        sendNodeResponse(res, response, String(req.method ?? "GET").toUpperCase());
        return;
      }

      if (isWordLikeRoute(pathname)) {
        const response = await handleInternalWordSsrRequest({
          method: req.method,
          url: `/api/word-ssr-internal?pathname=${encodeURIComponent(pathname)}`,
          query: { pathname },
          headers: {
            ...req.headers,
            "x-matched-path": pathname,
          },
        });
        sendNodeResponse(res, response, String(req.method ?? "GET").toUpperCase());
        return;
      }

      const staticResponse = await resolveStaticResponse(pathname);
      if (staticResponse) {
        res.statusCode = staticResponse.status;
        for (const [headerName, headerValue] of Object.entries(staticResponse.headers)) {
          res.setHeader(headerName, headerValue);
        }
        res.end(staticResponse.body);
        return;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not Found");
    } catch (error) {
      console.error("Verification server error", { pathname, error });
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Server Error");
    }
  });
}

async function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    redirect: "manual",
    headers: options.headers,
  });
  const body = await response.text();

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    finalUrl: response.url,
  };
}

function assertWordHtml(response, entry, pathname) {
  assert.equal(response.status, 200, `expected 200 for ${pathname}`);
  assert.ok(response.body.includes(`<div id="root">`), `missing app root for ${pathname}`);
  assert.ok(response.body.includes(entry.word_lemma), `missing lemma for ${pathname}`);
  assert.ok(response.body.includes(entry.definiton), `missing definition for ${pathname}`);
  assert.ok(extractCanonical(response.body)?.endsWith(pathname), `wrong canonical for ${pathname}`);
  assert.ok(extractTagContent(response.body, "title"), `missing title for ${pathname}`);
  assert.ok(extractMetaContent(response.body, "description"), `missing description for ${pathname}`);
  assert.ok(response.body.includes("application/ld+json"), `missing JSON-LD for ${pathname}`);
  assert.ok(response.body.includes("window.__WORD_PAGE_DATA__"), `missing word payload for ${pathname}`);
  assert.ok(response.body.includes("hreflang="), `missing hreflang for ${pathname}`);
  assert.ok(countLinks(response.body) > 0, `expected internal links for ${pathname}`);
  assert.ok(!("x-robots-tag" in response.headers), `public route must stay indexable for ${pathname}`);
}

function assertImmediateWordServerRender(response, pathname) {
  const rootHtml = extractRootHtml(response.body);

  assert.ok(rootHtml.includes("about"), `missing word content in server render for ${pathname}`);
  assert.match(
    rootHtml,
    /<h1[^>]*>[^<]*(Meaning of the|Learn the)[^<]*about[^<]*<\/h1>/i,
    `missing word page heading in server render for ${pathname}`,
  );
  assert.ok(response.body.includes("window.__WORD_PAGE_DATA__"), `missing word payload for ${pathname}`);
  assert.ok(
    !rootHtml.includes("Practice Vocabulary"),
    `homepage headline leaked into server render for ${pathname}`,
  );
  assert.ok(
    !rootHtml.includes("No lessons - Just practice."),
    `homepage subheadline leaked into server render for ${pathname}`,
  );
}

function assertNotFoundWordHtml(response, pathname) {
  assert.equal(response.status, 404, `expected 404 for ${pathname}`);
  assert.equal(
    extractTagContent(response.body, "title"),
    "Page Not Found | FluentStellar",
    `wrong not-found title for ${pathname}`,
  );
  assert.match(
    extractMetaContent(response.body, "robots") ?? "",
    /noindex/i,
    `missing noindex robots meta for ${pathname}`,
  );
  assert.equal(extractCanonical(response.body), null, `404 must not emit canonical for ${pathname}`);
  assert.ok(!response.body.includes('hreflang='), `404 must not emit hreflang for ${pathname}`);
  assert.ok(
    !response.body.includes("application/ld+json"),
    `404 must not emit word JSON-LD for ${pathname}`,
  );
}

function assertBlockedApiResponse(response, pathname, expectedStatus = 404) {
  assert.equal(response.status, expectedStatus, `wrong status for ${pathname}`);
  assert.match(
    response.headers["x-robots-tag"] ?? "",
    /noindex,\s*nofollow/i,
    `missing noindex nofollow header for ${pathname}`,
  );
  assert.equal(response.headers["cache-control"], "no-store", `wrong cache control for ${pathname}`);
  assert.equal(extractCanonical(response.body), null, `blocked API must not emit canonical for ${pathname}`);
  assert.ok(!response.body.includes("hreflang="), `blocked API must not emit hreflang for ${pathname}`);
  assert.ok(
    !response.body.includes("application/ld+json"),
    `blocked API must not emit JSON-LD for ${pathname}`,
  );
  assert.ok(
    !/FluentStellar - Structured Vocabulary Learning Platform/i.test(response.body),
    `blocked API must not emit homepage metadata for ${pathname}`,
  );
}

function assertRouteMetadata(response, pathname, expectations) {
  assert.equal(response.status, expectations.status ?? 200, `wrong status for ${pathname}`);
  if (expectations.title) {
    assert.equal(extractTagContent(response.body, "title"), expectations.title, `wrong title for ${pathname}`);
  }
  if (expectations.robots) {
    assert.equal(
      extractMetaContent(response.body, "robots"),
      expectations.robots,
      `wrong robots for ${pathname}`,
    );
  }
  assert.equal(
    extractCanonical(response.body),
    expectations.canonical ?? null,
    `wrong canonical for ${pathname}`,
  );
  assert.ok(!response.body.includes("hreflang="), `unexpected hreflang for ${pathname}`);
  assert.ok(!response.body.includes("application/ld+json"), `unexpected JSON-LD for ${pathname}`);
}

async function main() {
  const englishVocabulary = readJson("src/data/vocabulary/english/vocabulary.json");
  const germanVocabulary = readJson("src/data/vocabulary/german/vocabulary.json");
  const spanishVocabulary = readJson("src/data/vocabulary/spanish/vocabulary.json");
  const frenchVocabulary = readJson("src/data/vocabulary/french/vocabulary.json");
  const italianVocabulary = readJson("src/data/vocabulary/italian/vocabulary.json");
  const portugueseVocabulary = readJson("src/data/vocabulary/portuguese/vocabulary.json");
  const russianVocabulary = readJson("src/data/vocabulary/russian/vocabulary.json");

  const aboutEntry = englishVocabulary.find((entry) => entry.concept_id === "A1-00001");
  assert.ok(aboutEntry, "missing about test entry");

  const duplicateEnglishEntries = findDuplicateLemmaEntries(englishVocabulary);
  assert.ok(duplicateEnglishEntries, "missing duplicate lemma entries");

  const representativeEntries = {
    english: aboutEntry,
    german: findRepresentativeEntry(germanVocabulary),
    spanish: findRepresentativeEntry(spanishVocabulary),
    french: findRepresentativeEntry(frenchVocabulary),
    italian: findRepresentativeEntry(italianVocabulary),
    portuguese: findRepresentativeEntry(portugueseVocabulary),
    russian: findRepresentativeEntry(russianVocabulary),
  };

  const server = await createVerificationServer();
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const englishCanonicalPath = buildCanonicalPath("en", "english", representativeEntries.english);
    const englishCanonicalResponse = await request(baseUrl, englishCanonicalPath);
    assertWordHtml(englishCanonicalResponse, representativeEntries.english, englishCanonicalPath);
    assertImmediateWordServerRender(englishCanonicalResponse, englishCanonicalPath);
    assert.equal(extractHtmlLang(englishCanonicalResponse.body), "en");
    assert.equal(
      englishCanonicalResponse.headers["cache-control"],
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    );

    const englishCanonicalHeadResponse = await request(baseUrl, englishCanonicalPath, {
      method: "HEAD",
    });
    assert.equal(englishCanonicalHeadResponse.status, 200);
    assert.equal(
      englishCanonicalHeadResponse.headers["cache-control"],
      englishCanonicalResponse.headers["cache-control"],
    );
    assert.equal(englishCanonicalHeadResponse.body, "");

    const englishCanonicalOptionsResponse = await request(baseUrl, englishCanonicalPath, {
      method: "OPTIONS",
    });
    assert.equal(englishCanonicalOptionsResponse.status, 204);
    assert.equal(englishCanonicalOptionsResponse.headers.allow, "GET, HEAD, OPTIONS");

    const englishCanonicalPostResponse = await request(baseUrl, englishCanonicalPath, {
      method: "POST",
    });
    assert.equal(englishCanonicalPostResponse.status, 405);
    assert.equal(englishCanonicalPostResponse.headers.allow, "GET, HEAD, OPTIONS");
    assert.equal(englishCanonicalPostResponse.headers["cache-control"], "no-store");

    const englishDeVariantPath = buildCanonicalPath("de", "english", representativeEntries.english);
    const englishDeVariantResponse = await request(baseUrl, englishDeVariantPath);
    assertWordHtml(englishDeVariantResponse, representativeEntries.english, englishDeVariantPath);
    assert.equal(extractHtmlLang(englishDeVariantResponse.body), "de");

    for (const [targetLanguage, entry] of Object.entries(representativeEntries).filter(
      ([targetLanguage]) => targetLanguage !== "english",
    )) {
      const pathname = buildCanonicalPath("en", targetLanguage, entry);
      const response = await request(baseUrl, pathname);
      assertWordHtml(response, entry, pathname);
      assert.equal(extractHtmlLang(response.body), "en");
    }

    const [duplicateEntryA, duplicateEntryB] = duplicateEnglishEntries;
    const duplicatePathA = buildCanonicalPath("en", "english", duplicateEntryA);
    const duplicatePathB = buildCanonicalPath("en", "english", duplicateEntryB);
    const duplicateResponseA = await request(baseUrl, duplicatePathA);
    const duplicateResponseB = await request(baseUrl, duplicatePathB);
    assertWordHtml(duplicateResponseA, duplicateEntryA, duplicatePathA);
    assertWordHtml(duplicateResponseB, duplicateEntryB, duplicatePathB);
    assert.notEqual(
      extractCanonical(duplicateResponseA.body),
      extractCanonical(duplicateResponseB.body),
      "duplicate lemma records must keep separate canonical URLs",
    );
    assert.notEqual(
      extractMetaContent(duplicateResponseA.body, "description"),
      extractMetaContent(duplicateResponseB.body, "description"),
      "duplicate lemma records should emit page-specific metadata",
    );

    const legacyPath = buildLegacyPath("en", "english", representativeEntries.english);
    const legacyResponse = await request(baseUrl, legacyPath);
    assert.equal(legacyResponse.status, 308);
    assert.equal(legacyResponse.headers.location, englishCanonicalPath);

    const slugOnlyResponse = await request(
      baseUrl,
      `/en/english-word-${wordToSlug(representativeEntries.english.word_lemma)}`,
    );
    assertNotFoundWordHtml(slugOnlyResponse, slugOnlyResponse.finalUrl.replace(baseUrl, ""));

    const invalidConceptResponse = await request(baseUrl, "/en/english-word-about--Z9-99999");
    assertNotFoundWordHtml(invalidConceptResponse, "/en/english-word-about--Z9-99999");

    const mismatchResponse = await request(baseUrl, "/en/english-word-bank--A1-00001");
    assertNotFoundWordHtml(mismatchResponse, "/en/english-word-bank--A1-00001");

    const malformedResponse = await request(baseUrl, "/en/english-word-about----A1-00001");
    assertNotFoundWordHtml(malformedResponse, "/en/english-word-about----A1-00001");

    const unsupportedUiResponse = await request(baseUrl, "/xx/english-word-about--A1-00001");
    assertNotFoundWordHtml(unsupportedUiResponse, "/xx/english-word-about--A1-00001");

    const unsupportedTargetResponse = await request(baseUrl, "/en/japanese-word-about--A1-00001");
    assertNotFoundWordHtml(unsupportedTargetResponse, "/en/japanese-word-about--A1-00001");

    const directApiResponse = await request(
      baseUrl,
      "/api/word-ssr?pathname=/en/english-word-about--A1-00001",
    );
    assertBlockedApiResponse(
      directApiResponse,
      "/api/word-ssr?pathname=/en/english-word-about--A1-00001",
    );

    const directHiddenApiResponse = await request(
      baseUrl,
      "/api/word-ssr-internal?pathname=/en/english-word-about--A1-00001",
    );
    assertBlockedApiResponse(
      directHiddenApiResponse,
      "/api/word-ssr-internal?pathname=/en/english-word-about--A1-00001",
    );

    const directInvalidApiResponse = await request(baseUrl, "/api/word-ssr");
    assertBlockedApiResponse(directInvalidApiResponse, "/api/word-ssr");

    const directMalformedApiResponse = await request(
      baseUrl,
      "/api/word-ssr-internal?pathname=../../etc/passwd",
    );
    assertBlockedApiResponse(directMalformedApiResponse, "/api/word-ssr-internal?pathname=../../etc/passwd");

    const directApiHeadResponse = await request(
      baseUrl,
      "/api/word-ssr-internal?pathname=/en/english-word-about--A1-00001",
      { method: "HEAD" },
    );
    assert.equal(directApiHeadResponse.status, 404);
    assert.equal(directApiHeadResponse.body, "");
    assert.equal(directApiHeadResponse.headers["cache-control"], "no-store");

    const directApiOptionsResponse = await request(
      baseUrl,
      "/api/word-ssr-internal?pathname=/en/english-word-about--A1-00001",
      { method: "OPTIONS" },
    );
    assert.equal(directApiOptionsResponse.status, 204);
    assert.equal(directApiOptionsResponse.headers.allow, "GET, HEAD, OPTIONS");

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const blockedMethodResponse = await request(
        baseUrl,
        "/api/word-ssr-internal?pathname=/en/english-word-about--A1-00001",
        { method },
      );
      assert.equal(blockedMethodResponse.status, 405, `expected 405 for ${method} direct API`);
      assert.equal(blockedMethodResponse.headers.allow, "GET, HEAD, OPTIONS");
      assert.equal(blockedMethodResponse.headers["cache-control"], "no-store");
    }

    const canonicalAfterApiResponse = await request(baseUrl, englishCanonicalPath);
    assertWordHtml(canonicalAfterApiResponse, representativeEntries.english, englishCanonicalPath);
    assert.equal(extractCanonical(canonicalAfterApiResponse.body), `${siteOrigin}${englishCanonicalPath}`);
    assert.ok(
      !canonicalAfterApiResponse.body.includes("/api/word-ssr"),
      "canonical word page must not link to internal API routes",
    );

    const homepageResponse = await request(baseUrl, "/");
    assertRouteMetadata(homepageResponse, "/", {
      title: "FluentStellar - Structured Vocabulary Learning Platform",
      canonical: `${siteOrigin}/`,
    });

    const profileResponse = await request(baseUrl, "/profile");
    assertRouteMetadata(profileResponse, "/profile", {
      title: "Profile | FluentStellar",
      robots: "noindex, nofollow",
    });
    assert.equal(profileResponse.headers["x-robots-tag"], "noindex, nofollow");
    assert.equal(profileResponse.headers["cache-control"], "no-store");
    assert.ok(profileResponse.body.includes(`<div id="root">`));

    for (const practicePath of [
      "/languages/filters/exercises/en-es/practice",
      "/languages/filters/exercises/de-en/practice",
      "/languages/filters/exercises/fr-it/practice",
    ]) {
      const practiceResponse = await request(baseUrl, practicePath);
      assertRouteMetadata(practiceResponse, practicePath, {
        title: "Vocabulary Practice | FluentStellar",
        robots: "noindex, nofollow",
      });
      assert.equal(practiceResponse.headers["x-robots-tag"], "noindex, nofollow");
      assert.equal(practiceResponse.headers["cache-control"], "no-store");
      assert.ok(practiceResponse.body.includes(`<div id="root">`));
    }

    const sitemapXml = fs.readFileSync(
      path.join(rootDir, "public", "sitemaps", "sitemap-words-en-en.xml"),
      "utf8",
    );
    assert.ok(!/api\/word-ssr/i.test(sitemapXml), "API URLs must not appear in word sitemap");
    const sitemapUrlMatch = sitemapXml.match(/<loc>https:\/\/www\.fluentstellar\.com([^<]+)<\/loc>/);
    assert.ok(sitemapUrlMatch, "missing sitemap word URL");
    const sitemapWordResponse = await request(baseUrl, sitemapUrlMatch[1]);
    assert.equal(sitemapWordResponse.status, 200);
    assert.ok(sitemapWordResponse.body.includes("application/ld+json"));

    const googlebotHeaders = {
      "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    };
    const googlebotResponse = await request(baseUrl, englishCanonicalPath, {
      headers: googlebotHeaders,
    });
    assert.equal(googlebotResponse.status, 200);
    assert.equal(
      extractCanonical(googlebotResponse.body),
      extractCanonical(englishCanonicalResponse.body),
    );
    assert.equal(
      extractTagContent(googlebotResponse.body, "title"),
      extractTagContent(englishCanonicalResponse.body, "title"),
    );

    const dynamicGermanResponse = await request(
      baseUrl,
      buildCanonicalPath("en", "german", representativeEntries.german),
      { headers: googlebotHeaders },
    );
    assert.equal(dynamicGermanResponse.status, 200);
    assert.ok(dynamicGermanResponse.body.includes(representativeEntries.german.definiton));

    console.log("word SSR HTTP tests passed");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(undefined);
      });
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
