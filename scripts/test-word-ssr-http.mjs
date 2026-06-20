import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { handleWordSsrPathname } from "../server/word-ssr-runtime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const siteOrigin = "https://www.fluentstellar.com";
const tempDir = path.join(rootDir, ".tmp-word-ssr-http-test");
const blockedApiHtml =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page Not Found | FluentStellar</title><meta name="description" content="The requested page could not be found on FluentStellar."><meta name="robots" content="noindex, nofollow"></head><body><main><h1>Page Not Found</h1><p>The requested page could not be found.</p></main></body></html>';
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

function buildBlockedApiResponse() {
  return {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
    body: blockedApiHtml,
  };
}

async function resolveStaticResponse(pathname) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const fileCandidate = path.join(distDir, normalizedPath.replace(/^\/+/, ""));
  const htmlCandidate = path.join(distDir, pathname.replace(/^\/+/, ""), "index.html");

  try {
    const stat = await fsp.stat(fileCandidate);
    if (stat.isFile()) {
      return {
        status: 200,
        headers: {
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
        headers: {
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

    try {
      if (pathname === "/api/word-ssr" || pathname === "/api/word-ssr-internal") {
        const response = buildBlockedApiResponse();
        res.statusCode = response.status;
        for (const [headerName, headerValue] of Object.entries(response.headers)) {
          res.setHeader(headerName, headerValue);
        }
        res.end(response.body);
        return;
      }

      if (isWordLikeRoute(pathname)) {
        const response = await handleWordSsrPathname(pathname, siteOrigin);
        res.statusCode = response.status;
        for (const [headerName, headerValue] of Object.entries(response.headers)) {
          res.setHeader(headerName, headerValue);
        }
        res.end(response.body);
        return;
      }

      if (pathname === "/profile" || pathname === "/languages/filters/exercises/practice") {
        const body = await fsp.readFile(path.join(distDir, "index.html"), "utf8");
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(body);
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
  assert.ok(response.body.includes(entry.sentence), `missing sentence for ${pathname}`);
  assert.ok(extractCanonical(response.body)?.endsWith(pathname), `wrong canonical for ${pathname}`);
  assert.ok(extractTagContent(response.body, "title"), `missing title for ${pathname}`);
  assert.ok(extractMetaContent(response.body, "description"), `missing description for ${pathname}`);
  assert.ok(response.body.includes("application/ld+json"), `missing JSON-LD for ${pathname}`);
  assert.ok(response.body.includes("hreflang="), `missing hreflang for ${pathname}`);
  assert.ok(countLinks(response.body) > 0, `expected internal links for ${pathname}`);
  assert.ok(!("x-robots-tag" in response.headers), `public route must stay indexable for ${pathname}`);
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
    assert.equal(extractHtmlLang(englishCanonicalResponse.body), "en");

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
    assert.equal(directApiResponse.status, 404);
    assert.equal(directApiResponse.headers["x-robots-tag"], "noindex, nofollow");
    assert.equal(extractCanonical(directApiResponse.body), null);

    const directHiddenApiResponse = await request(
      baseUrl,
      "/api/word-ssr-internal?pathname=/en/english-word-about--A1-00001",
    );
    assert.equal(directHiddenApiResponse.status, 404);
    assert.equal(directHiddenApiResponse.headers["x-robots-tag"], "noindex, nofollow");

    const directInvalidApiResponse = await request(baseUrl, "/api/word-ssr");
    assertNotFoundWordHtml(directInvalidApiResponse, "/api/word-ssr");
    assert.equal(directInvalidApiResponse.headers["x-robots-tag"], "noindex, nofollow");

    const canonicalAfterApiResponse = await request(baseUrl, englishCanonicalPath);
    assertWordHtml(canonicalAfterApiResponse, representativeEntries.english, englishCanonicalPath);
    assert.equal(extractCanonical(canonicalAfterApiResponse.body), `${siteOrigin}${englishCanonicalPath}`);

    const profileResponse = await request(baseUrl, "/profile");
    assert.equal(profileResponse.status, 200);
    assert.ok(profileResponse.body.includes(`<div id="root">`));

    const practiceResponse = await request(baseUrl, "/languages/filters/exercises/en-es/practice");
    assert.equal(practiceResponse.status, 200);
    assert.ok(practiceResponse.body.includes(`<div id="root">`));

    const sitemapXml = fs.readFileSync(
      path.join(rootDir, "public", "sitemaps", "sitemap-words-en-en.xml"),
      "utf8",
    );
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
