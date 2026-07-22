/**
 * Regression guard for the 2026-07-19 html-lang-mismatch fix.
 *
 * Root cause: index.html's pre-hydration <head> script used to fall back to
 * `localStorage.getItem('uiLanguage')` whenever the URL had no language
 * prefix, and force document.documentElement.lang to that stored value
 * before React ever ran. App-shell routes (home, /languages/filters,
 * /profile, /about, etc.) are always SSR/prerendered in English - their
 * content is not language-prefixed by design (see docs on LanguageContext's
 * getInitialUiLanguage priority) - so a returning visitor who had previously
 * switched the UI language would get `<html lang>` claiming their stored
 * language while every word on the page was still English. Because
 * LanguageContext's hydration-sync effect intentionally skips its first run
 * (assumes the initial DOM lang is already correct), nothing ever corrected
 * this - the mismatch persisted for the whole page view.
 *
 * Fix: the inline script now only ever sets html lang from the URL's
 * language-prefixed segment (which SSR/prerender already guarantees is
 * correct - see scripts/build/prerender.mjs and src/entry-server.tsx). It no
 * longer reads localStorage at all, so it can never contradict the
 * delivered HTML.
 *
 * This test loads the real script text out of index.html and executes it
 * (via node:vm, with a mock document/location/localStorage) rather than
 * re-implementing its logic, so it exercises the actual production script.
 *
 * Run: node scripts/test-html-lang-init-script.mjs
 * No build required.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function extractHeadLangScript(html) {
  const match = html.match(/<script>(try\{var _l=\[[\s\S]*?)<\/script>/);
  assert.ok(
    match,
    "could not locate the pre-hydration lang-detection <script> in index.html - has it moved or been renamed?",
  );
  return match[1];
}

function runHeadLangScript(scriptSource, { pathname, storedLanguage, initialLang }) {
  const documentElement = { lang: initialLang };
  const sandbox = {
    location: { pathname },
    localStorage: {
      getItem(key) {
        // A regression here (the script reading uiLanguage again) must be
        // caught even if the returned value would coincidentally match -
        // record that it was called at all.
        sandbox.__localStorageReads.push(key);
        return key === "uiLanguage" ? storedLanguage : null;
      },
    },
    document: { documentElement },
    __localStorageReads: [],
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);
  return { lang: documentElement.lang, localStorageReads: sandbox.__localStorageReads };
}

async function main() {
  const html = readFile("index.html");
  const scriptSource = extractHeadLangScript(html);

  console.log("\n[1] source no longer contains a localStorage fallback");

  test("script source contains no reference to localStorage at all", () => {
    assert.doesNotMatch(
      scriptSource,
      /localStorage/,
      "the pre-hydration script must never read localStorage - it cannot know whether the stored " +
        "language matches what the server actually delivered for this route",
    );
  });

  console.log("\n[2] language-prefixed SEO routes: html lang still derives from the URL");

  test("word/vocabulary/hub/level-test/verb-list style route sets html lang from its /xx/ prefix", () => {
    const { lang, localStorageReads } = runHeadLangScript(scriptSource, {
      pathname: "/es/inglese-word-house",
      storedLanguage: "fr",
      initialLang: "en",
    });
    assert.equal(lang, "es");
    assert.deepEqual(localStorageReads, []);
  });

  test("all seven supported UI languages are recognized from the URL prefix", () => {
    for (const code of ["en", "es", "fr", "de", "it", "pt", "ru"]) {
      const { lang } = runHeadLangScript(scriptSource, {
        pathname: `/${code}/some-slug`,
        storedLanguage: null,
        initialLang: "en",
      });
      assert.equal(lang, code, `expected pathname prefix "/${code}/" to set html lang to "${code}"`);
    }
  });

  test("an unsupported two-letter pathname prefix is ignored, leaving the SSR-delivered lang untouched", () => {
    const { lang } = runHeadLangScript(scriptSource, {
      pathname: "/xx/something",
      storedLanguage: null,
      initialLang: "en",
    });
    assert.equal(lang, "en");
  });

  console.log("\n[3] app-shell routes: no stale localStorage language can override html lang before hydration");

  test("home (\"/\") is left at its SSR-delivered lang even with a different stored UI language", () => {
    const { lang, localStorageReads } = runHeadLangScript(scriptSource, {
      pathname: "/",
      storedLanguage: "es",
      initialLang: "en",
    });
    assert.equal(
      lang,
      "en",
      "app-shell routes are always SSR/prerendered in English - the pre-hydration script must not " +
        "claim a different html lang than what was actually delivered",
    );
    assert.deepEqual(localStorageReads, [], "the script must not read localStorage at all");
  });

  for (const pathname of [
    "/languages/filters",
    "/languages/filters/exercises",
    "/languages/filters/exercises/en-es/practice",
    "/languages/level-test",
    "/about",
    "/help",
    "/profile",
    "/explore",
  ]) {
    test(`app-shell route "${pathname}" is left at its SSR-delivered lang regardless of stored preference`, () => {
      const { lang } = runHeadLangScript(scriptSource, {
        pathname,
        storedLanguage: "de",
        initialLang: "en",
      });
      assert.equal(lang, "en");
    });
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("html lang init-script tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
