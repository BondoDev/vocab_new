// Regression coverage for LanguageProvider's UI-language selection
// (src/contexts/LanguageContext.tsx):
//
// - The latest setUILanguage() call wins regardless of the order in which
//   translation files finish loading, including when the newest selection is
//   already cached and needs no load at all.
// - A stale load still populates the translation cache without switching or
//   persisting the language.
// - The context value and setUILanguage keep their identity across renders
//   that do not change language state.
//
// Source-executed, like test-react-hook-remediation.mjs: the provider's real
// source runs against a minimal deterministic Hook runtime, and every dynamic
// `import()` of a translation file is rewritten to a deferred loader so the
// test controls resolution order. This is not mounted React; the opt-in
// browser mode of test-react-hook-remediation.mjs is the mounted-React check.
//
// Run: node scripts/tests/runtime/test-language-selection-race.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateModule, parseComponent, ts } from "../../lib/component-contract.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const providerSource = read("src/contexts/LanguageContext.tsx");
const { isSupportedUiLanguage } = evaluateModule(read("src/data/seo/shared/slugs.ts"));

const TRANSLATIONS = {
  en: { greeting: "Hello", nav: { home: "Home" } },
  fr: { greeting: "Bonjour" },
  de: { greeting: "Hallo" },
  it: { greeting: "Ciao" },
  pt: { greeting: "Olá" },
};
const FILE_TO_LANGUAGE = { english: "en", french: "fr", german: "de", italian: "it", portuguese: "pt" };

// Replaces `import(specifier)` with `__dynamicImport(specifier)` before the
// CommonJS transform would turn it into a synchronous require().
const rewriteDynamicImports = (context) => (sourceFile) => {
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      return context.factory.createCallExpression(
        context.factory.createIdentifier("__dynamicImport"),
        undefined,
        ts.visitNodes(node.arguments, visit),
      );
    }
    return ts.visitEachChild(node, visit, context);
  };
  return ts.visitNode(sourceFile, visit);
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
    transformers: { before: [rewriteDynamicImports] },
  }).outputText;
}

const compiledProvider = compile(providerSource);
const sameDeps = (previous, next) =>
  previous?.length === next.length && next.every((value, index) => Object.is(value, previous[index]));
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Hooks are matched by call order, state updates re-render on a microtask
// (batched, like React event/promise updates), and effects run after each
// render only when their dependencies changed.
function createHookRuntime() {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let renderScheduled = false;
  let mounted = null;
  let output = null;

  function render() {
    cursor = 0;
    pendingEffects = [];
    output = mounted.component(mounted.props);
    for (const runEffect of pendingEffects) runEffect();
  }
  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    queueMicrotask(() => {
      renderScheduled = false;
      render();
    });
  }

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === "function" ? initial() : initial };
        slot.set = (next) => {
          const value = typeof next === "function" ? next(slot.value) : next;
          if (Object.is(value, slot.value)) return;
          slot.value = value;
          scheduleRender();
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && sameDeps(previous.deps, deps)) return previous.value;
      slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) {
      return hooks.useMemo(() => callback, deps);
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && deps && sameDeps(previous.deps, deps)) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
  };

  return {
    hooks,
    mount(component, props) {
      mounted = { component, props };
      render();
    },
    rerender() {
      render();
    },
    get value() {
      return output.props.value;
    },
  };
}

function setup({ storedLanguage = null, documentLang = "en", providerProps } = {}) {
  const storage = new Map(storedLanguage ? [["uiLanguage", storedLanguage]] : []);
  const window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  const document = { documentElement: { lang: documentLang } };
  const pendingLoads = [];
  const runtime = createHookRuntime();
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };

  const exports = {};
  new Function(
    "React", "createContext", "useCallback", "useContext", "useEffect", "useMemo", "useRef", "useState",
    "isSupportedUiLanguage", "readEmbeddedJson", "window", "document", "__dynamicImport", "exports",
    compiledProvider,
  )(
    React, () => ({ Provider: "LanguageContext.Provider" }), runtime.hooks.useCallback, () => undefined,
    runtime.hooks.useEffect, runtime.hooks.useMemo, runtime.hooks.useRef, runtime.hooks.useState,
    isSupportedUiLanguage, () => null, window, document,
    (specifier) => new Promise((resolve) => pendingLoads.push({ specifier, resolve })),
    exports,
  );

  runtime.mount(exports.LanguageProvider, providerProps ?? {
    initialUILanguage: "en",
    initialTranslationData: TRANSLATIONS.en,
    children: null,
  });

  return {
    runtime,
    exports,
    storage,
    document,
    pendingLanguages: () => pendingLoads.map(({ specifier }) => languageOf(specifier)),
    async finishLoad(language) {
      const index = pendingLoads.findIndex(({ specifier }) => languageOf(specifier) === language);
      assert.ok(index >= 0, `expected a pending ${language} translation load`);
      const [load] = pendingLoads.splice(index, 1);
      load.resolve({ default: TRANSLATIONS[language] });
      await settle();
    },
  };
}

function languageOf(specifier) {
  const match = /\/(\w+)_interface\.json$/.exec(specifier);
  assert.ok(match, `unexpected dynamic import ${specifier}`);
  return FILE_TO_LANGUAGE[match[1]];
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓  ${name}`);
}

await test("out-of-order loads: the latest selection wins and is the one persisted", async () => {
  const app = setup();
  app.runtime.value.setUILanguage("fr");
  app.runtime.value.setUILanguage("de");
  assert.deepEqual(app.pendingLanguages(), ["fr", "de"]);

  await app.finishLoad("de");
  assert.equal(app.runtime.value.uiLanguage, "de");
  assert.equal(app.runtime.value.t("greeting"), "Hallo");
  assert.equal(app.storage.get("uiLanguage"), "de");

  await app.finishLoad("fr");
  assert.equal(app.runtime.value.uiLanguage, "de", "a stale load must not switch the language back");
  assert.equal(app.storage.get("uiLanguage"), "de", "a stale load must not persist its language");
  assert.equal(app.document.documentElement.lang, "de");

  // The stale load still cached French, so selecting it needs no new load.
  app.runtime.value.setUILanguage("fr");
  await settle();
  assert.deepEqual(app.pendingLanguages(), []);
  assert.equal(app.runtime.value.uiLanguage, "fr");
  assert.equal(app.runtime.value.t("greeting"), "Bonjour");
  assert.equal(app.storage.get("uiLanguage"), "fr");
});

await test("a cached newest selection invalidates an earlier pending load", async () => {
  const app = setup();
  app.runtime.value.setUILanguage("it");
  app.runtime.value.setUILanguage("en");
  await settle();
  assert.equal(app.runtime.value.uiLanguage, "en");
  assert.equal(app.storage.get("uiLanguage"), "en");

  await app.finishLoad("it");
  assert.equal(app.runtime.value.uiLanguage, "en");
  assert.equal(app.storage.get("uiLanguage"), "en");
  assert.equal(app.runtime.value.t("greeting"), "Hello");
});

await test("rapid repeated selections of one language resolve to that language", async () => {
  const app = setup();
  app.runtime.value.setUILanguage("pt");
  app.runtime.value.setUILanguage("pt");
  await app.finishLoad("pt");
  await app.finishLoad("pt");
  assert.equal(app.runtime.value.uiLanguage, "pt");
  assert.equal(app.storage.get("uiLanguage"), "pt");
  assert.equal(app.document.documentElement.lang, "pt");
  assert.equal(app.runtime.value.t("greeting"), "Olá");
});

await test("translation lookup fallbacks are unchanged", async () => {
  const app = setup();
  assert.equal(app.runtime.value.t("nav.home"), "Home");
  assert.equal(app.runtime.value.t("missing.key"), "missing.key");
});

await test("context value and setUILanguage are referentially stable", async () => {
  const app = setup();
  const first = app.runtime.value;
  app.runtime.rerender();
  assert.equal(app.runtime.value, first, "an unrelated render must reuse the context value");
  assert.equal(app.runtime.value.setUILanguage, first.setUILanguage);
  assert.equal(app.runtime.value.t, first.t);

  app.runtime.value.setUILanguage("fr");
  await app.finishLoad("fr");
  const afterLoad = app.runtime.value;
  assert.notEqual(afterLoad, first, "a language change must publish a new value");

  // Switching between cached languages leaves the cache, and so the
  // setter's identity, unchanged.
  afterLoad.setUILanguage("en");
  await settle();
  assert.equal(app.runtime.value.uiLanguage, "en");
  assert.equal(app.runtime.value.setUILanguage, afterLoad.setUILanguage);
});

await test("initial language guards accept only supported UI languages", async () => {
  const app = setup({
    storedLanguage: "de",
    documentLang: "zz",
    providerProps: { children: null },
  });
  assert.equal(app.runtime.value.uiLanguage, "de", "unsupported <html lang> falls through to storage");
  await settle();
  assert.deepEqual(app.pendingLanguages(), ["de"], "the uncached initial language is loaded");
  await app.finishLoad("de");
  assert.equal(app.runtime.value.t("greeting"), "Hallo");

  const fromDocument = setup({ storedLanguage: "de", documentLang: " IT ", providerProps: { children: null } });
  assert.equal(fromDocument.runtime.value.uiLanguage, "it");

  assert.equal(setup({ storedLanguage: "xx" }).exports.readStoredUiLanguage(), null);
  assert.equal(setup({ storedLanguage: "ru" }).exports.readStoredUiLanguage(), "ru");
});

console.log(`\n${passed} language-selection checks passed`);
