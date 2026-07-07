// STAGING-ONLY. Built by Vite (not Wrangler's own esbuild) specifically because
// WordSeoPage.tsx and its dependencies use import.meta.glob (Vite-only syntax)
// that plain esbuild cannot resolve. Vite statically transforms those globs at
// build time regardless of target, which is why this file is pre-bundled with
// `vite build --ssr` (see build-render-entry.mjs) and then imported by the
// Wrangler-bundled Worker entry (src/index.ts) as an already-bundled module.
//
// Renders the REAL WordSeoPage.tsx component (unmodified) so the resulting DOM
// is byte-for-byte the same shape production's React hydration already
// expects — no hand-written HTML template, no hydration-mismatch risk from a
// structurally different body.
import { renderToReadableStream } from "react-dom/server.browser";
import { StaticRouter } from "react-router-dom/server";
import { WordSeoPage } from "@/app/components/WordSeoPage";
import { SeoProvider, renderSeoTags, type SeoManager } from "@/seo/SeoContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { UiLanguageCode, TargetLanguageSlug } from "@/data/seo/slugs";
import type { ResolvedWordPageData } from "@/data/seo/wordPageData";
import englishInterfaceData from "@/data/interface/english_interface.json";

export interface RenderWordPageParams {
  pathname: string;
  siteOrigin: string;
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId: string;
  browsePage: number;
  // NOTE: at runtime the Worker actually passes an already-compact
  // HydrationWordPageData-shaped object (see src/index.ts), not a full
  // ResolvedWordPageData. WordSeoPage.tsx's normalizeWordPageDataForRender()
  // detects the compact shape (via the `browseWordsTotalCount` key) and uses
  // it as-is without ever touching a full vocabulary record. The prop's
  // declared type in WordSeoPageProps is still `ResolvedWordPageData | null`
  // (production always passes the full shape from entry-server.tsx), so the
  // Worker call site casts through `unknown` — a one-line widening of that
  // prop type to `ResolvedWordPageData | HydrationWordPageData | null` would
  // be the clean production fix, out of scope for this staging-only file.
  initialWordPageData: ResolvedWordPageData;
}

export interface RenderedWordPage {
  appHtml: string;
  headTags: string;
}

function noop() {}

export async function renderWordPage(params: RenderWordPageParams): Promise<RenderedWordPage> {
  const seoManager: SeoManager = { metadata: null };

  const stream = await renderToReadableStream(
    <StaticRouter location={params.pathname}>
      <SeoProvider manager={seoManager} siteOrigin={params.siteOrigin}>
        <LanguageProvider initialUILanguage={params.uiLang} initialTranslationData={englishInterfaceData}>
          <WordSeoPage
            uiLang={params.uiLang}
            targetLanguage={params.targetLanguage}
            wordSlug={params.wordSlug}
            conceptId={params.conceptId}
            browsePage={params.browsePage}
            onStartPractice={noop as unknown as (t: TargetLanguageSlug, l: string) => void}
            initialData={params.initialWordPageData}
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

export { englishInterfaceData };
