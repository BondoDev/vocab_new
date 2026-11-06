/**
 * Hydration contract of the shared Toast (src/app/components/Toast.tsx).
 *
 * Toast portals to document.body, which does not exist during prerendering.
 * It used to return null on the server but a portal on the client's first
 * render; React 18 then failed to hydrate the surrounding markup (#418) and
 * client-rendered the whole route, visibly replacing the prerendered full
 * vocabulary list and 100-noun pages on load. This test pins the fix:
 *
 *   1. Server render (renderToString) emits no toast markup, with or without
 *      a message.
 *   2. Hydrating that server markup in Chromium with development React logs
 *      no hydration warning or recoverable error and keeps the server DOM.
 *   3. After hydration exactly one live region is mounted under <body>; a
 *      triggered message shows and auto-dismisses.
 *   4. Swapping the page subtree after hydration (what client-side navigation
 *      does) mounts a fresh toast that still works, with no leftover region.
 *   5. A client-only mount (createRoot, no hydration) has the region on its
 *      very first commit.
 *
 * The real Toast source is bundled with esbuild (a Vite dependency) into a
 * temporary directory outside the repository; nothing is written to the
 * working tree.
 *
 * Run: node scripts/tests/runtime/test-toast-hydration.mjs
 * Requires the Playwright Chromium browser (npx playwright install chromium).
 */

// page.evaluate/waitForFunction callbacks run in the browser.
/* global window, document */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { ROOT_DIR } from "../../lib/compileTs.mjs";

const TOAST_SOURCE = path.join(ROOT_DIR, "src/app/components/Toast.tsx").replace(/\\/g, "/");
const DURATION_MS = 300;

// Two "pages", each owning its own toast like the real route components do.
// The ?page query and window.__navigate stand in for the router.
const HARNESS = `
import { useState } from "react";
import { Toast, useAutoDismissMessage } from ${JSON.stringify(TOAST_SOURCE)};

function Page({ name }) {
  const { message, show } = useAutoDismissMessage(${DURATION_MS});
  return (
    <section data-page={name}>
      <h1>{name}</h1>
      <button type="button" onClick={() => show("Saved on " + name)}>Show {name}</button>
      <Toast message={message} />
    </section>
  );
}

export function App({ initialPage }) {
  const [page, setPage] = useState(initialPage);
  if (typeof window !== "undefined") window.__navigate = setPage;
  return <main><Page key={page} name={page} /></main>;
}
`;

const CLIENT = `
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./harness.jsx";

window.__recoverable = [];
window.hydrateApp = () => {
  hydrateRoot(document.getElementById("root"), <App initialPage="first" />, {
    onRecoverableError: (error) => window.__recoverable.push(String(error && error.message)),
  });
};
// Returns the number of toast regions present right after the first commit.
window.mountClientOnly = () => {
  const root = createRoot(document.getElementById("root"));
  flushSync(() => root.render(<App initialPage="first" />));
  return document.querySelectorAll('body > div[role="status"]').length;
};
`;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${String(error.message).split("\n").join("\n    ")}`);
  }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toast-hydration-"));
let browser;

try {
  fs.writeFileSync(path.join(tempDir, "harness.jsx"), HARNESS);
  fs.writeFileSync(path.join(tempDir, "client.jsx"), CLIENT);
  fs.writeFileSync(
    path.join(tempDir, "server.jsx"),
    `import { renderToString } from "react-dom/server";
     import { App } from "./harness.jsx";
     import { Toast } from ${JSON.stringify(TOAST_SOURCE)};
     export const renderApp = () => renderToString(<App initialPage="first" />);
     export const renderToast = (message) => renderToString(<Toast message={message} />);`,
  );
  const shared = {
    bundle: true,
    jsx: "automatic",
    logLevel: "silent",
    nodePaths: [path.join(ROOT_DIR, "node_modules")],
    // Development React: hydration mismatches are reported as warnings.
    define: { "process.env.NODE_ENV": '"development"' },
  };
  await build({ ...shared, entryPoints: [path.join(tempDir, "client.jsx")], outfile: path.join(tempDir, "client.js"), format: "iife", platform: "browser" });
  await build({ ...shared, entryPoints: [path.join(tempDir, "server.jsx")], outfile: path.join(tempDir, "server.cjs"), format: "cjs", platform: "node" });
  const server = createRequire(import.meta.url)(path.join(tempDir, "server.cjs"));
  const clientScript = fs.readFileSync(path.join(tempDir, "client.js"), "utf8");

  console.log("\n=== server render ===\n");
  const serverHtml = server.renderApp();

  await test("renderToString emits no toast markup, with or without a message", () => {
    assert.equal(server.renderToast(null), "");
    assert.equal(server.renderToast("Saved"), "");
    assert.doesNotMatch(serverHtml, /role="status"/);
    assert.match(serverHtml, /<main><section data-page="first">/);
  });

  browser = await chromium.launch();
  const openPage = async (rootHtml) => {
    const page = await browser.newPage();
    const consoleProblems = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") consoleProblems.push(message.text());
    });
    page.on("pageerror", (error) => consoleProblems.push(error.message));
    await page.setContent(`<!doctype html><html><body><div id="root">${rootHtml}</div></body></html>`);
    await page.addScriptTag({ content: clientScript });
    return { page, consoleProblems };
  };
  const regionCount = (page) => page.locator('body > div[role="status"]').count();
  const region = (page) => page.locator('body > div[role="status"]');

  console.log("\n=== hydration ===\n");
  const { page, consoleProblems } = await openPage(serverHtml);
  // Hold a reference to a server-rendered node: it survives only if React
  // hydrates it instead of client-rendering the tree.
  await page.evaluate(() => { window.__serverHeading = document.querySelector("#root h1"); });
  await page.evaluate(() => window.hydrateApp());
  await page.waitForFunction(() => document.querySelectorAll('body > div[role="status"]').length > 0);

  await test("hydration reports no mismatch and keeps the server DOM", async () => {
    const recoverable = await page.evaluate(() => window.__recoverable);
    assert.deepEqual(recoverable, [], `recoverable errors: ${recoverable.join(" | ")}`);
    const hydrationWarnings = consoleProblems.filter((text) => /hydrat|did not match|Expected server HTML/i.test(text));
    assert.deepEqual(hydrationWarnings, []);
    assert.equal(await page.evaluate(() => window.__serverHeading === document.querySelector("#root h1")), true);
  });

  await test("exactly one empty, hidden live region is mounted after hydration", async () => {
    assert.equal(await regionCount(page), 1);
    assert.equal(await region(page).getAttribute("aria-live"), "polite");
    assert.equal(await region(page).textContent(), "");
    assert.match(await region(page).getAttribute("class"), /\binvisible\b/);
  });

  await test("a message triggered after hydration shows, then auto-dismisses", async () => {
    await page.getByRole("button", { name: "Show first" }).click();
    assert.equal(await region(page).textContent(), "Saved on first");
    assert.match(await region(page).getAttribute("class"), /\bopacity-100\b/);
    await page.waitForFunction(() => document.querySelector('body > div[role="status"]').textContent === "", null, { timeout: DURATION_MS * 10 });
    assert.match(await region(page).getAttribute("class"), /\binvisible\b/);
  });

  await test("after a client-side page swap the new page's toast works", async () => {
    await page.evaluate(() => window.__navigate("second"));
    await page.getByRole("heading", { name: "second" }).waitFor();
    assert.equal(await regionCount(page), 1, "the previous page's toast region must be gone");
    await page.getByRole("button", { name: "Show second" }).click();
    assert.equal(await region(page).textContent(), "Saved on second");
    assert.deepEqual(consoleProblems, []);
  });
  await page.close();

  console.log("\n=== client-only mount ===\n");
  await test("createRoot mounts the live region on its first commit", async () => {
    const { page: clientPage, consoleProblems: problems } = await openPage("");
    assert.equal(await clientPage.evaluate(() => window.mountClientOnly()), 1);
    await clientPage.getByRole("button", { name: "Show first" }).click();
    assert.equal(await region(clientPage).textContent(), "Saved on first");
    assert.deepEqual(problems, []);
    await clientPage.close();
  });
} finally {
  await browser?.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
