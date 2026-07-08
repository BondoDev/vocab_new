// STAGING-ONLY. Built by Vite (not Wrangler's own esbuild) specifically
// because App.tsx/WordSeoPage.tsx-adjacent code uses import.meta.glob
// (Vite-only syntax) that plain esbuild cannot resolve. Vite statically
// transforms those globs at build time regardless of target, which is why
// this file is pre-bundled with `vite build --ssr` (see build-worker.mjs /
// build-worker-full.mjs) and then imported by the Wrangler-bundled Worker
// entry (src/index.ts / src/index.full.ts) as an already-bundled module.
//
// Renders `WordSeoPageView` — the shared, server-safe presentational
// component extracted from `WordSeoPage.tsx` specifically so this SSR path
// never imports either of that file's two heavy/client-only data loaders
// (the full-vocabulary fallback glob, and the browse-search-shard loader).
// See `src/app/components/WordSeoPageView.tsx`'s header comment and the
// project's bundle-size migration report for the full rationale — the
// short version: those two loaders are what pulled 7 multi-megabyte
// vocabulary-*.js chunks into this Worker's upload, none of which this SSR
// path (which always receives fully-resolved compact data already) ever
// actually needs to invoke.
//
// The DOM this produces is byte-for-byte the same shape production's React
// hydration already expects, because it's the exact same component
// (`WordSeoPageView`) `WordSeoPage.tsx` renders on the client/production
// SSR path — no hand-written HTML template, no hydration-mismatch risk from
// a structurally different body.
//
// Phase 8 note (full shell + hydration): a full-App-shell version of this
// file (rendering <App ssrRouteOverride={{page:"wordPage", ...}}> instead
// of WordSeoPageView directly, so Header/nav/language-switcher come from
// the same component tree as production) was built and tested against the
// full corpus. It reproduced the exact SEO-critical content correctly, but
// pulled in App.tsx's other lazy-loaded routes (VocabularyLevelPage per
// language×level, WordSeoHubPage, etc.) as additional Vite code-split
// chunks, and one such chunk's name collided with how Wrangler's
// `no_bundle` mode detects "additional modules" ("Uncaught TypeError:
// Incorrect type for map entry 'a1': the provided value is not of type
// 'function or ExportedHandler'" — workerd interpreting a chunk as a
// second Worker service). This is a real Wrangler/Vite chunk-naming
// incompatibility, not a rendering-correctness problem, and needs either
// Vite manualChunks naming rules or wrangler.toml `rules`/
// `find_additional_modules` config to resolve properly — out of scope to
// debug further within this task. Reverted to the proven WordSeoPageView-
// only render here; see the final report's "Shell and hydration
// integration" section for the full writeup and the follow-up
// recommendation.
import { renderToReadableStream } from "react-dom/server.browser";
import { StaticRouter } from "react-router-dom/server";
import { WordSeoPageView } from "@/app/components/WordSeoPageView";
import { SeoProvider, renderSeoTags, type SeoManager } from "@/seo/SeoContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { UiLanguageCode, TargetLanguageSlug } from "@/data/seo/slugs";
import type { HydrationWordPageData } from "@/data/seo/wordPageData";

// Eager, per-UI-language interface JSON (7 files, ~15-22KB each — see the
// final report's "Shell and hydration integration" section for why eager,
// not lazy). Mirrors production's own src/entry-server.tsx
// loadInterfaceData(), which loads exactly one of these seven files per
// request; here all seven are inlined at build time since Wrangler's
// `no_bundle` mode does not reliably resolve runtime dynamic-import()
// targets in this Worker (a second instance of the same class of issue
// documented for the reverted full-App-shell attempt above — confirmed by
// reproducing "Error: No such module ... .js" when this was a lazy glob).
// Eager import.meta.glob compiles to plain static imports Vite inlines
// directly into index.full.js, so there is no runtime dynamic import() to
// fail — unlike levelBrowseWords.ts's eager vocabulary-glob (a real,
// separately-tracked architecture problem: that glob pulls in the FULL
// multi-megabyte vocabulary dataset per language), these are ~120KB total
// across all 7 languages, immaterial to bundle size.
const interfaceModules = import.meta.glob("../../../src/data/interface/*.json", { eager: true }) as Record<
  string,
  { default: unknown }
>;
const UI_LANG_TO_INTERFACE_FILE: Record<string, string> = {
  en: "english",
  es: "spanish",
  fr: "french",
  de: "german",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

function loadInterfaceData(uiLang: UiLanguageCode): unknown {
  const fileName = UI_LANG_TO_INTERFACE_FILE[uiLang] ?? "english";
  const modulePath = `../../../src/data/interface/${fileName}_interface.json`;
  const module = interfaceModules[modulePath] ?? interfaceModules["../../../src/data/interface/english_interface.json"];
  return module.default;
}

export interface RenderWordPageParams {
  pathname: string;
  siteOrigin: string;
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId: string;
  browsePage: number;
  // The Worker always builds this compact shape directly (see
  // generate-full-corpus.mjs / src/index.full.ts) — no dual-shape
  // normalization needed here, unlike the old WordSeoPage-based render path.
  initialWordPageData: HydrationWordPageData;
}

export interface RenderedWordPage {
  appHtml: string;
  headTags: string;
}

function noop() {}

export async function renderWordPage(params: RenderWordPageParams): Promise<RenderedWordPage> {
  const seoManager: SeoManager = { metadata: null };
  const initialTranslationData = loadInterfaceData(params.uiLang);

  const stream = await renderToReadableStream(
    <StaticRouter location={params.pathname}>
      <SeoProvider manager={seoManager} siteOrigin={params.siteOrigin}>
        <LanguageProvider initialUILanguage={params.uiLang} initialTranslationData={initialTranslationData}>
          <WordSeoPageView
            uiLang={params.uiLang}
            targetLanguage={params.targetLanguage}
            wordSlug={params.wordSlug}
            conceptId={params.conceptId}
            browsePage={params.browsePage}
            onStartPractice={noop as unknown as (t: TargetLanguageSlug, l: string) => void}
            pageData={params.initialWordPageData}
          />
        </LanguageProvider>
      </SeoProvider>
    </StaticRouter>,
  );
  await stream.allReady;
  const appHtml = await new Response(stream).text();

  // Mirrors src/entry-server.tsx's render(): read whatever SEOHead set on the
  // manager during the render, then produce the exact same head-tag markup
  // via the real, unmodified renderSeoTags() (src/seo/SeoContext.tsx) — pure,
  // no React/DOM dependency, safe to call after the stream completes.
  const headTags = seoManager.metadata ? renderSeoTags(seoManager.metadata) : "";

  return { appHtml, headTags };
}
