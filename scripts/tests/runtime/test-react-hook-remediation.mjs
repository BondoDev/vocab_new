import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { effectCalls, evaluate, evaluateInitializer, parseComponent, ts } from "../../lib/component-contract.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const cefrSource = read("src/app/pages/vocabulary/DevSeoCefrPlaceholderPage.tsx");
const keyboardSource = read("src/features/practice/exercises/MobileKeyboard.tsx");
const fixture = {
  uiLanguage: "en", targetLanguage: "french", targetLanguageDisplayName: "French", level: "a1",
  content: { title: "French vocabulary", wordCount: { value: 100 }, metaDescription: "Practice French" },
};

function compile(source) {
  let localSource = source;
  for (const statement of [...parseComponent(source).statements].reverse()) {
    if (ts.isImportDeclaration(statement)) {
      localSource = localSource.slice(0, statement.pos) + localSource.slice(statement.end);
    }
  }
  return ts.transpileModule(localSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
}

function loadModule(compiled, bindings) {
  const exports = {};
  new Function(...Object.keys(bindings), "exports", compiled)(...Object.values(bindings), exports);
  return exports;
}

// Only external page/data boundaries are substituted; the component's resolution,
// metadata composition, labels, JSX props, and Hook calls execute from its source.
function cefrBindings(React, item) {
  return {
    React, useMemo: React.useMemo,
    VocabularyLevelPage: (props) => React.createElement("article", { "data-page": JSON.stringify(props) }, props.heroTitleOverride),
    DEV_CEFR_PREVIEW_PATH: "/test/en/french-a1-vocabulary-practice",
    normalizeTargetLanguage: (language) => language,
    findSeoCefrPreviewItem: (params) => params.level === item.level ? item : null,
    getSeoCefrPreviewItems: () => [item],
    buildLocalizedVocabularyPath: (ui, language, level) => `/${ui}/${language}-${level}-vocabulary-practice`,
    buildVocabularyFaqSection: (...args) => ({ items: args }),
    buildVocabularyJsonLdGraph: (params) => params,
  };
}

const compiledCefr = compile(cefrSource);
const compiledKeyboard = compile(keyboardSource);
const hookCounts = new Map();
let currentCount = 0;
const virtualReact = {
  useMemo: (calculate) => { currentCount++; return calculate(); },
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
};
const { DevSeoCefrPlaceholderPage } = loadModule(compiledCefr, cefrBindings(virtualReact, fixture));
function render(element) {
  if (typeof element.type !== "function") return element;
  currentCount = 0;
  const next = element.type(element.props);
  if (hookCounts.has(element.type)) assert.equal(currentCount, hookCounts.get(element.type), "Hook count must remain stable per component");
  hookCounts.set(element.type, currentCount);
  return render(next);
}
const startPractice = () => {};
const browsePreview = { marker: "initial browse data" };
const pageProps = { onStartPractice: startPractice, initialBrowsePreview: browsePreview, pathPrefix: "" };
const renderPage = (props) => render(virtualReact.createElement(DevSeoCefrPlaceholderPage, { ...pageProps, ...props }));
assert.equal(renderPage({}).type, "div");
const resolved = renderPage({ routeParams: { level: "a1" } });
assert.equal(resolved.type, "article");
const forwarded = JSON.parse(resolved.props["data-page"]);
assert.equal(forwarded.heroTitleOverride, "French vocabulary - Mastering 100 French words");
assert.equal(forwarded.browseLanguageNameOverride, "French");
assert.equal(forwarded.faqLanguageNameOverride, "French");
assert.equal(forwarded.seoMetadataOverride.canonical, "https://www.fluentstellar.com/en/french-a1-vocabulary-practice");
assert.deepEqual(forwarded.seoMetadataOverride.alternates, [
  { hreflang: "en", href: "https://www.fluentstellar.com/en/french-a1-vocabulary-practice" },
  { hreflang: "x-default", href: "https://www.fluentstellar.com/en/french-a1-vocabulary-practice" },
]);
assert.equal(forwarded.seoMetadataOverride.title, fixture.content.title);
assert.equal(forwarded.seoMetadataOverride.description, fixture.content.metaDescription);
assert.deepEqual(forwarded.contentOverride.levelContent, fixture.content);
assert.deepEqual(forwarded.initialBrowsePreview, browsePreview);
assert.equal(forwarded.seoMetadataOverride.jsonLd.faqItems[1], "French");
assert.equal(renderPage({ routeParams: { level: "invalid" } }).type, "div");
assert.equal(renderPage({ item: fixture, routeParams: { level: "invalid" } }).type, "article", "explicit content takes precedence");
assert.equal(renderPage({ item: null }).type, "div");

const callbackCache = new Map();
const sameDeps = (previous, next) => previous?.length === next.length && next.every((value, index) => Object.is(value, previous[index]));
function callback(name, bindings) {
  return evaluateInitializer(keyboardSource, name, {
    ...bindings,
    useCallback: (next, deps) => {
      const previous = callbackCache.get(name);
      if (previous && sameDeps(previous.deps, deps)) return previous.value;
      callbackCache.set(name, { deps, value: next });
      return next;
    },
  });
}
const listeners = new Map();
let registrations = 0;
const fakeDocument = {
  addEventListener: (type, handler, capture) => {
    assert.equal(capture, true);
    assert.ok(!listeners.has(type), `duplicate ${type} listener`);
    listeners.set(type, handler);
    registrations++;
  },
  removeEventListener: (type, handler, capture) => {
    assert.equal(capture, true);
    assert.equal(listeners.get(type), handler);
    listeners.delete(type);
  },
};
const popupEffect = effectCalls(keyboardSource).find((call) => call.arguments[0].getText().includes('addEventListener("pointermove"'));
assert.ok(popupEffect, "long-press document listener effect exists");
let previousDeps;
let cleanup;
let closed = 0;
const setLongPressPopup = () => { closed++; };
const setActivePopupIndex = () => {};
const setIsShiftActive = () => {};
const longPressPopup = { options: ["e", "é", "ß"] };
function updateKeyboard(props) {
  const toUpperWithLanguage = callback("toUpperWithLanguage", props);
  const closeLongPressPopup = callback("closeLongPressPopup", { setLongPressPopup, setActivePopupIndex });
  const applyTextKey = callback("applyTextKey", { ...props, toUpperWithLanguage, setIsShiftActive });
  const handleLongPressSelect = callback("handleLongPressSelect", { applyTextKey, closeLongPressPopup });
  const bindings = {
    activePopupIndex: props.activePopupIndex ?? 1, longPressPopup,
    closeLongPressPopup, handleLongPressSelect, setActivePopupIndex,
    popupRef: { current: null }, document: fakeDocument,
  };
  const deps = evaluate(popupEffect.arguments[1], bindings);
  if (!sameDeps(previousDeps, deps)) {
    cleanup?.();
    cleanup = evaluate(popupEffect.arguments[0], bindings)();
    previousDeps = deps;
  }
}
const changes = [];
const onChange = (value) => changes.push(value);
const props = { value: "a", onChange, language: "fr", disabled: false, isShiftActive: false };
updateKeyboard(props);
updateKeyboard({ ...props });
assert.equal(registrations, 3, "unchanged callback inputs must not rebind document listeners");
updateKeyboard({ ...props, value: "ab" });
listeners.get("pointerup")();
assert.deepEqual(changes, ["abé"], "open popup must append to the latest value, not its opening value");
const replacementChanges = [];
updateKeyboard({ ...props, value: "latest", onChange: (value) => replacementChanges.push(value) });
listeners.get("pointerup")();
assert.deepEqual(replacementChanges, ["latesté"], "open popup must use the latest onChange callback");
updateKeyboard({ ...props, disabled: true });
listeners.get("pointerup")();
assert.deepEqual(changes, ["abé"], "disabling an open popup must prevent insertion");
updateKeyboard({ ...props, language: "de", isShiftActive: true, activePopupIndex: 2 });
listeners.get("pointerup")();
assert.deepEqual(changes, ["abé", "aẞ"], "latest shift/language must preserve sharp-S handling");
assert.equal(closed, 4);
cleanup();
assert.equal(listeners.size, 0, "unmount cleanup removes every document listener");
console.log("PASS: CEFR transitions and keyboard callback/listener regressions (offline)");

async function browserScenarios(environment, cefrCode, keyboardCode, layoutsCode, item, makeBindings) {
  const { React, ReactDOM, document, PointerEvent } = environment;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const load = (code, bindings) => {
    const exports = {};
    new Function(...Object.keys(bindings), "exports", code)(...Object.values(bindings), exports);
    return exports;
  };
  const errors = [];
  const originalError = environment.console.error;
  environment.console.error = (...args) => { errors.push(args.join(" ")); originalError(...args); };
  const page = load(cefrCode, makeBindings(React, item)).DevSeoCefrPlaceholderPage;
  const root = ReactDOM.createRoot(document.getElementById("root"));
  const draw = (component, props) => ReactDOM.flushSync(() => root.render(React.createElement(component, props)));
  const pageProps = { onStartPractice: () => {}, pathPrefix: "" };
  draw(page, pageProps);
  check(document.getElementById("root").textContent.includes("Invalid preview page"), "initial unresolved fallback");
  draw(page, { ...pageProps, routeParams: { level: "a1" } });
  check(document.querySelector("article")?.textContent.includes("Mastering 100 French words"), "resolved content mounts");
  draw(page, { ...pageProps, routeParams: { level: "invalid" } });
  check(!document.querySelector("article") && document.getElementById("root").textContent.includes("Invalid preview page"), "unresolved fallback returns");

  const layouts = load(layoutsCode, {});
  const keyboard = load(keyboardCode, {
    React, ...React, ...layouts, createPortal: ReactDOM.createPortal,
    useLanguage: () => ({ t: (key) => key }),
  }).MobileKeyboard;
  const received = [];
  let props = { language: "fr", value: "a", onChange: (value) => received.push(`old:${value}`) };
  const wait = () => new Promise((resolve) => environment.setTimeout(resolve, 350));
  const open = async () => {
    const key = [...document.querySelectorAll("button")].find((button) => button.textContent === "e");
    check(key, "French e key exists");
    key.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    await wait();
    check(document.querySelector(".mobile-keyboard-v2__popup"), "long-press opens popup");
    const option = [...document.querySelectorAll("[data-kb-popup-option-index]")].find((node) => node.textContent === "é");
    check(option, "accent option exists");
    const rect = option.getBoundingClientRect();
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
    await wait();
  };
  draw(keyboard, props);
  await open();
  props = { ...props, value: "ab", onChange: (value) => received.push(`new:${value}`) };
  draw(keyboard, props);
  check(document.querySelector(".mobile-keyboard-v2__popup"), "prop update leaves popup open");
  document.dispatchEvent(new PointerEvent("pointerup"));
  await wait();
  check(JSON.stringify(received) === JSON.stringify(["new:abé"]), `latest value/callback: ${JSON.stringify(received)}`);
  check(!document.querySelector(".mobile-keyboard-v2__popup"), "selection closes popup");
  await open();
  draw(keyboard, { ...props, disabled: true });
  document.dispatchEvent(new PointerEvent("pointerup"));
  await wait();
  check(received.length === 1, "disabled popup cannot insert");
  ReactDOM.flushSync(() => root.unmount());
  document.dispatchEvent(new PointerEvent("pointerup"));
  check(received.length === 1, "no insertion after unmount");
  check(errors.length === 0, `React errors: ${errors.join("; ")}`);
  return "PASS: mounted React CEFR transitions and open-popup value/callback/disabled updates";
}

if (process.argv.includes("--browser")) {
  const candidates = [process.env.BROWSER_EXECUTABLE,
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium", "/usr/bin/google-chrome"];
  const browser = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  assert.ok(browser, "Chrome/Edge is required for --browser; set BROWSER_EXECUTABLE if necessary");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "fluentstellar-hook-browser-"));
  try {
    const libraries = ["react/umd/react.development.js", "react-dom/umd/react-dom.development.js"]
      .map((name) => `<script>${read(`node_modules/${name}`)}</script>`).join("\n");
    const args = [compiledCefr, compiledKeyboard, compile(read("src/features/practice/exercises/layouts.ts")), fixture]
      .map((value) => JSON.stringify(value)).join(",");
    const code = `(${browserScenarios})(window,${args},${cefrBindings}).then(result => {
      document.getElementById('result').textContent = result;
    }).catch(error => { document.getElementById('result').textContent = 'FAIL: ' + error.stack; });`;
    const html = `<meta charset="utf-8"><style>.mobile-keyboard-v2__popup{position:fixed;top:100px!important;left:10px!important;display:flex;z-index:5;background:white}.mobile-keyboard-v2__popup-option{padding:15px}</style>
      <div id="root"></div><pre id="result">PENDING</pre>${libraries}<script>${code.replaceAll("</script", "<\\/script")}</script>`;
    const htmlPath = path.join(scratch, "test.html");
    fs.writeFileSync(htmlPath, html);
    const result = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking",
      `--user-data-dir=${path.join(scratch, "profile")}`, "--virtual-time-budget=8000", "--dump-dom", pathToFileURL(htmlPath).href],
    { encoding: "utf8", windowsHide: true, timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
    assert.ifError(result.error);
    const message = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    assert.equal(result.status, 0, result.stderr.slice(-1000));
    assert.ok(message?.startsWith("PASS:"), message ?? result.stderr.slice(-1000));
    console.log(message);
  } finally {
    assert.equal(path.dirname(path.resolve(scratch)), path.resolve(os.tmpdir()));
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
