// Focused regression coverage for mobile immersive learning sessions.
//
// Behavioral: imports the real src/app/utils/immersiveSession.ts via Node's
// TypeScript stripping and drives it with stubbed window/document globals
// (phone vs desktop, Fullscreen API present/absent/rejecting, standalone PWA,
// user-initiated exit, frame swaps, StrictMode-style and rapid remounts, and
// visual-viewport tracking). Source-text checks guard the viewport-locked
// shell CSS (scroll lock scoped to the immersive class, one session
// scroller) and the .practice-main clip that was the root cause of blank
// scrollable space below the card. Source-text: confirms all three learning
// modes are wrapped in ImmersiveSessionFrame and request fullscreen from their
// Start/Begin click handlers, and that App drops fullscreen off-session.
//
// Simulated environments only: this cannot prove real Android/iOS browser
// behavior, which needs device verification.
//
// Run: node --experimental-strip-types scripts/tests/runtime/test-immersive-session.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");

// ---- browser stubs -------------------------------------------------------

const env = {
  coarsePointer: true,
  screen: { width: 390, height: 844 },
  standalone: false,
  fullscreenMode: "resolve", // "resolve" | "reject" | "none"
};
const calls = { request: [], exit: 0 };

function createDocument() {
  const classes = new Set();
  const listeners = new Map();
  let viewportContent = "width=device-width, initial-scale=1";
  const viewport = {
    getAttribute: () => viewportContent,
    setAttribute: (_name, value) => {
      viewportContent = value;
    },
  };
  const doc = {
    fullscreenElement: null,
    activeElement: null,
    documentElement: {
      style: {
        props: new Map(),
        setProperty(name, value) {
          this.props.set(name, value);
        },
        removeProperty(name) {
          this.props.delete(name);
        },
      },
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
      },
    },
    querySelector: (selector) => (selector === 'meta[name="viewport"]' ? viewport : null),
    addEventListener: (type, fn) => listeners.set(`${type}`, fn),
    removeEventListener: (type) => listeners.delete(`${type}`),
    dispatch: (type) => listeners.get(type)?.(),
    hasListener: (type) => listeners.has(type),
    get viewportContent() {
      return viewportContent;
    },
  };
  Object.defineProperty(doc, "fullscreenEnabled", { get: () => env.fullscreenMode !== "none" });
  Object.defineProperty(doc.documentElement, "requestFullscreen", {
    get: () =>
      env.fullscreenMode === "none"
        ? undefined
        : (options) => {
            calls.request.push(options);
            if (env.fullscreenMode === "reject") return Promise.reject(new TypeError("denied"));
            doc.fullscreenElement = doc.documentElement;
            return Promise.resolve();
          },
  });
  doc.exitFullscreen = () => {
    calls.exit += 1;
    doc.fullscreenElement = null;
    return Promise.resolve();
  };
  return doc;
}

const doc = createDocument();
globalThis.document = doc;
// visualViewport + requestAnimationFrame stubs (rAF runs on a macrotask).
const visualViewport = {
  height: 780,
  offsetTop: 0,
  listeners: new Map(),
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  },
  fire(type) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  },
  count() {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  },
};
globalThis.window = {
  visualViewport,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  get screen() {
    return env.screen;
  },
  matchMedia: (query) => ({
    matches:
      (query === "(pointer: coarse)" && env.coarsePointer) ||
      (query === "(display-mode: standalone)" && env.standalone),
  }),
};

const immersive = await import("../../../src/app/utils/immersiveSession.ts");
const {
  IMMERSIVE_MEASURED_CLASS,
  IMMERSIVE_SESSION_CLASS,
  activateImmersiveSession,
  exitSessionFullscreen,
  isImmersiveSessionDevice,
  isSessionFullscreenOwned,
  requestSessionFullscreen,
} = immersive;

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 5));
const hasClass = () => doc.documentElement.classList.contains(IMMERSIVE_SESSION_CLASS);
function reset(overrides = {}) {
  exitSessionFullscreen();
  doc.fullscreenElement = null;
  calls.request = [];
  calls.exit = 0;
  Object.assign(env, {
    coarsePointer: true,
    screen: { width: 390, height: 844 },
    standalone: false,
    fullscreenMode: "resolve",
    ...overrides,
  });
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

console.log("\n=== immersive session controller (simulated browsers) ===\n");

await test("phone detection: coarse pointer + short side < 600 in both orientations", () => {
  reset();
  assert.equal(isImmersiveSessionDevice(), true);
  env.screen = { width: 844, height: 390 };
  assert.equal(isImmersiveSessionDevice(), true);
  env.screen = { width: 820, height: 1180 }; // tablet
  assert.equal(isImmersiveSessionDevice(), false);
  env.screen = { width: 390, height: 844 };
  env.coarsePointer = false; // narrow desktop window
  assert.equal(isImmersiveSessionDevice(), false);
});

await test("desktop: no fullscreen request and no immersive class", async () => {
  reset({ coarsePointer: false, screen: { width: 1440, height: 900 } });
  assert.equal(await requestSessionFullscreen(), false);
  assert.equal(calls.request.length, 0);
  const release = activateImmersiveSession();
  assert.equal(hasClass(), false);
  release();
  await nextTask();
});

await test("Android-like phone: enters fullscreen with navigationUI hide", async () => {
  reset();
  assert.equal(await requestSessionFullscreen(), true);
  assert.deepEqual(calls.request, [{ navigationUI: "hide" }]);
  assert.equal(isSessionFullscreenOwned(), true);
});

await test("no repeated request while already fullscreen", async () => {
  reset();
  await requestSessionFullscreen();
  assert.equal(await requestSessionFullscreen(), false);
  assert.equal(calls.request.length, 1);
});

await test("rejected request resolves false and never throws", async () => {
  reset({ fullscreenMode: "reject" });
  assert.equal(await requestSessionFullscreen(), false);
  assert.equal(isSessionFullscreenOwned(), false);
});

await test("iPhone-like (no element fullscreen): layout fallback still applies", async () => {
  reset({ fullscreenMode: "none" });
  assert.equal(await requestSessionFullscreen(), false);
  const release = activateImmersiveSession();
  assert.equal(hasClass(), true);
  assert.match(doc.viewportContent, /viewport-fit=cover/);
  release();
  await nextTask();
  assert.equal(hasClass(), false);
  assert.equal(doc.viewportContent, "width=device-width, initial-scale=1");
});

await test("installed standalone PWA: no fullscreen request", async () => {
  reset({ standalone: true });
  assert.equal(await requestSessionFullscreen(), false);
  assert.equal(calls.request.length, 0);
});

await test("frame swap in one commit (loading -> session) keeps fullscreen and class", async () => {
  reset();
  await requestSessionFullscreen();
  const releaseFirst = activateImmersiveSession();
  releaseFirst();
  const releaseSecond = activateImmersiveSession();
  await nextTask();
  assert.equal(hasClass(), true);
  assert.equal(calls.exit, 0);
  assert.notEqual(doc.fullscreenElement, null);
  releaseSecond();
  await nextTask();
});

await test("leaving the session restores layout and exits owned fullscreen once", async () => {
  reset();
  await requestSessionFullscreen();
  const release = activateImmersiveSession();
  release();
  release(); // idempotent
  await nextTask();
  assert.equal(calls.exit, 1);
  assert.equal(doc.fullscreenElement, null);
  assert.equal(hasClass(), false);
  assert.equal(doc.hasListener("fullscreenchange"), false);
});

await test("user exits fullscreen: ownership dropped, no re-request, no exit call later", async () => {
  reset();
  await requestSessionFullscreen();
  const release = activateImmersiveSession();
  doc.fullscreenElement = null;
  doc.dispatch("fullscreenchange");
  assert.equal(isSessionFullscreenOwned(), false);
  assert.equal(hasClass(), true, "session layout stays immersive");
  release();
  await nextTask();
  assert.equal(calls.exit, 0);
  assert.equal(calls.request.length, 1);
});

await test("fullscreen entered by something else is never exited by a session", async () => {
  reset();
  doc.fullscreenElement = doc.documentElement;
  const release = activateImmersiveSession();
  release();
  await nextTask();
  assert.equal(calls.exit, 0);
});

const styleProps = () => doc.documentElement.style.props;

await test("visual viewport is mirrored into CSS vars while a session is active", async () => {
  reset();
  visualViewport.height = 780;
  visualViewport.offsetTop = 0;
  const release = activateImmersiveSession();
  await nextTask();
  assert.equal(styleProps().get("--immersive-viewport-height"), "780px");
  assert.equal(styleProps().get("--immersive-viewport-top"), "0px");
  assert.equal(doc.documentElement.classList.contains(IMMERSIVE_MEASURED_CLASS), true);
  // Keyboard opens (visual viewport shrinks), iOS pans it.
  visualViewport.height = 420.4;
  visualViewport.offsetTop = 37;
  visualViewport.fire("resize");
  visualViewport.fire("scroll");
  await nextTask();
  assert.equal(styleProps().get("--immersive-viewport-height"), "420px");
  assert.equal(styleProps().get("--immersive-viewport-top"), "37px");
  release();
  await nextTask();
});

await test("session exit removes scroll-lock class, measured class, vars, and listeners", async () => {
  reset();
  const release = activateImmersiveSession();
  await nextTask();
  release();
  await nextTask();
  assert.equal(hasClass(), false);
  assert.equal(doc.documentElement.classList.contains(IMMERSIVE_MEASURED_CLASS), false);
  assert.equal(styleProps().size, 0);
  assert.equal(visualViewport.count(), 0);
});

await test("StrictMode mount/unmount/mount keeps one set of listeners", async () => {
  reset();
  const first = activateImmersiveSession();
  first(); // StrictMode's simulated unmount
  const second = activateImmersiveSession(); // and remount, same tick
  await nextTask();
  assert.equal(hasClass(), true);
  assert.equal(visualViewport.count(), 2, "one resize + one scroll listener");
  second();
  await nextTask();
  assert.equal(hasClass(), false);
  assert.equal(visualViewport.count(), 0);
});

await test("rapid session mounting/unmounting settles with nothing leaked", async () => {
  reset();
  await requestSessionFullscreen();
  for (let i = 0; i < 25; i++) {
    const release = activateImmersiveSession();
    if (i % 3 === 0) await nextTask();
    release();
  }
  await nextTask();
  assert.equal(hasClass(), false);
  assert.equal(styleProps().size, 0);
  assert.equal(visualViewport.count(), 0);
  assert.equal(doc.hasListener("fullscreenchange"), false);
  assert.equal(doc.fullscreenElement, null, "owned fullscreen released with the last session");
});

await test("keyboard resize reveals the focused field; plain viewport scroll does not", async () => {
  reset();
  let revealed = 0;
  doc.activeElement = {
    matches: () => true,
    closest: () => ({}),
    scrollIntoView: () => {
      revealed += 1;
    },
  };
  const release = activateImmersiveSession();
  await nextTask();
  revealed = 0;
  visualViewport.fire("scroll");
  await nextTask();
  assert.equal(revealed, 0);
  visualViewport.fire("resize");
  await nextTask();
  assert.equal(revealed, 1);
  doc.activeElement = null;
  release();
  await nextTask();
});

console.log("\n=== viewport-locked shell CSS (source contract) ===\n");

const shellCss = read("src/app/components/layout/styles/immersive-session.scss");
const exercisesCss = read("src/features/practice/styles/exercises.scss");

await test("scroll lock (html/body/#root overflow hidden) is scoped to html.immersive-session", () => {
  const lockBlock = shellCss.slice(shellCss.indexOf("html.immersive-session {"));
  assert.match(lockBlock, /&,\s*body,\s*#root \{[\s\S]*?overflow: hidden;/);
  // Outside a session the frame is layout-transparent.
  assert.match(shellCss, /^\.immersive-session-frame \{\s*display: contents;/m);
});

await test("shell is fixed to the viewport and its single child is the vertical scroller", () => {
  assert.match(shellCss, /\.immersive-session-frame \{[\s\S]*?position: fixed;[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/);
  assert.match(shellCss, /> \* \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(shellCss, /height: var\(--immersive-viewport-height\)/);
  assert.match(shellCss, /\.immersive-session-header \{\s*position: sticky;/);
});

await test("safe-area padding is applied once, on the shell only", () => {
  const matches = shellCss.match(/env\(safe-area-inset-top/g) ?? [];
  assert.equal(matches.length, 1);
});

await test("root cause guard: .practice-main clips its decorative overflow on both axes", () => {
  const block = exercisesCss.slice(exercisesCss.indexOf(".practice-main {"), exercisesCss.indexOf(".practice-main::before"));
  assert.match(block, /overflow: clip;/);
  assert.doesNotMatch(block, /overflow-y: visible/);
});

console.log("\n=== learning-mode wiring (source contract) ===\n");

const app = read("src/app/App.tsx");
const studyPrep = read("src/features/study-new-words/NewWordStudyPreparation.tsx");
const reviewPrep = read("src/features/review-words/ReviewWordsPreparation.tsx");

await test("all three sessions render inside ImmersiveSessionFrame", () => {
  assert.match(app, /<ImmersiveSessionFrame>\s*<Suspense[\s\S]*?<VocabularyPractice/);
  assert.match(studyPrep, /<ImmersiveSessionFrame>\s*<NewWordStudySession/);
  assert.match(reviewPrep, /<ImmersiveSessionFrame>\s*<ReviewSession/);
});

await test("fullscreen is requested synchronously from each Start/Begin handler", () => {
  assert.match(studyPrep, /onBeginSession=\{\(\) => \{[\s\S]*?requestSessionFullscreen\(\);\s*setIsSessionActive\(true\);/);
  assert.match(reviewPrep, /onBeginReview=\{\(\) => \{[\s\S]*?requestSessionFullscreen\(\);\s*setIsSessionActive\(true\);/);
  const continueHandler = app.slice(app.indexOf("const handleContinueToPractice"));
  assert.match(continueHandler.slice(0, 900), /requestSessionFullscreen\(\)/);
  const listHandler = app.slice(app.indexOf("const handleStartPracticeList"));
  assert.match(listHandler.slice(0, 400), /requestSessionFullscreen\(\)/);
});

await test("all three session headers opt into the shared sticky header", () => {
  assert.match(read("src/features/practice/components/SessionHeader.tsx"), /immersive-session-header/);
  assert.match(read("src/features/study-new-words/NewWordStudySession.tsx"), /new-word-study-session-header immersive-session-header/);
});

await test("App exits session fullscreen on non-session routes", () => {
  assert.match(
    app,
    /resolvedPage !== "practice" &&\s*resolvedPage !== "newWordStudy" &&\s*resolvedPage !== "reviewWords"\s*\) \{\s*exitSessionFullscreen\(\);/,
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
