// Vite config used to pre-bundle the Worker's SSR entry for both production
// and local staging/preview builds.
// noExternal forces Vite to inline npm dependencies (react, react-dom,
// react-router-dom, lucide-react) into the output instead of leaving them as
// bare specifiers Node would resolve from node_modules — Workers has no
// node_modules resolution at runtime. The import.meta.glob-derived lazy
// chunks (vocabulary/*, interface/*, word-browse-shards/*) are unaffected by
// this setting and remain separate files, which is what keeps the deployed
// Worker script small (see bundle-size findings in the final report).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Modules whose top-level side effects are client-only (see treeshake below).
const WORKER_SIDE_EFFECT_FREE_MODULES = [
  "/src/data/seo/listPages/verbLists/conjugated100Verbs/conjugated100VerbFormsData.ts",
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite's default publicDir behavior copies the repo's public/ directory
  // (favicon.png, robots.txt, sitemap.xml, sitemaps/*.xml, seo/, etc.) into
  // whatever outDir this build targets. That's correct for the CLIENT build
  // (those files belong in dist/, served as static assets) but wrong for
  // this SSR-only build: none of that content is ever read by
  // render-entry.tsx, yet it was being uploaded as part of the WORKER
  // SCRIPT bundle (favicon.png alone added ~1.47MB gzip; the 8 word
  // sitemap XML files added another ~630KB gzip) — see the bundle-size
  // migration report's "root cause" section. Disabling it here has zero
  // effect on what's actually served: assets-full/ (built by
  // publish-shards.mjs from ../../dist/, which DOES get publicDir copied
  // into it via the normal client build) already contains all of this
  // content under the Worker's separate Static Assets binding.
  publicDir: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "..", "..", "..", "src"),
    },
  },
  ssr: {
    noExternal: true,
  },
  build: {
    rollupOptions: {
      // Caps how many module files Rollup reads at once. Rollup 4 defaults
      // to 1000 in flight; with noExternal above, this build loads every
      // module behind lucide-react's barrel export (~3.5k icon files) before
      // tree-shaking. On Cloudflare Workers Builds (Linux, per-process
      // open-file limit) that burst, plus the descriptors the CommonJS
      // resolver opens alongside it, failed with `EMFILE: too many open
      // files`. Windows has no comparable per-process limit, so local builds
      // never reproduced it. 20 is Rollup 3's former default; it only bounds
      // concurrency and does not change the bundle output.
      maxParallelFileOps: 20,
      treeshake: {
        // conjugated100VerbFormsData.ts runs a top-level fail-fast check over
        // its lazy import.meta.glob's keys. That side effect alone keeps the
        // glob object — and its seven per-language import() thunks — alive,
        // so Rollup emitted ~2.5MB of conjugation JSON chunks into this build
        // even though no Worker code path uses any of the module's exports
        // (the Worker reaches it only through the verbLists barrel). Treating
        // it as side-effect-free HERE lets Rollup drop it whenever none of
        // its exports are used. Scoped to the Worker build only: the client
        // and prerender builds keep the startup check, and if Worker code
        // ever does use an export, Rollup includes the module as usual.
        moduleSideEffects: (id) => !WORKER_SIDE_EFFECT_FREE_MODULES.some((suffix) => id.replace(/\\/g, "/").endsWith(suffix)),
      },
    },
  },
  define: {
    // React's CJS-interop shims (e.g. react/jsx-runtime's production/dev
    // split) reference process.env.NODE_ENV at module scope. Workers has no
    // `process` global at all (unlike Node), so this must be statically
    // replaced at build time — once it's a literal, esbuild/Rollup dead-code
    // -eliminate the unreached branch and no runtime `process` reference
    // remains. This avoids needing the nodejs_compat compatibility flag.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
