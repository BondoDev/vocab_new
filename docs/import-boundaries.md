# Import boundaries: `import.meta.glob` and path-sensitive data loading

Audited at source commit `f7f91c1e`. Machine-readable companion:
[`scripts/import-boundaries/current/globs.json`](../scripts/import-boundaries/current/globs.json).
Guard script: `npm run test:import-boundaries` (`scripts/test-import-boundaries.mjs`).

## Purpose

`import.meta.glob` (and the hand-written `import()` registries and `fs.readdir`
walks that stand in for it in a few places) is **path-sensitive**: the exact
set of files it matches, and whether Vite bundles them eagerly or lazily,
depends on the glob pattern's literal string *and* the location of the file
that calls it. Moving either the consumer file or the target directory during
a future folder reorganization can silently:

- change which files match (too many, too few, or zero);
- flip eager/lazy behavior if the pattern or options are edited along the way;
- pull vocabulary or SEO data into the Cloudflare Worker bundle, which has a
  strict internal 2.5 MB gzip guard well below Cloudflare's 3 MB hard limit
  (see `workers/word-ssr/test-worker-bundle-size.mjs` and
  `scripts/seo-baseline/current/performance.json`).

This document exists so that any future move of a data directory or a
consumer file is a *deliberate, checked* change instead of an accidental one.

## Global rules

- Treat every glob pattern below as an architecture boundary, not an
  implementation detail.
- When moving a consumer file or a target directory, update this document,
  `scripts/import-boundaries/current/globs.json`, and run
  `npm run test:import-boundaries` before anything else.
- Preserve eager/lazy semantics exactly — do not "simplify" a lazy glob to
  eager (or vice versa) as a drive-by change.
- After any change touching a glob's consumer or target directory, rebuild
  and compare the client bundle, SSR bundle, and Worker bundle against
  `scripts/seo-baseline/current/performance.json`.
- Never move `src/data/seo/word-hub-pages/`, `word-browse-shards/`, or
  `src/data/verbListLookup/` without also updating
  `scripts/generate-word-hub-data.mjs` (their generator) in the same change.
- Do not introduce a new broad glob (e.g. `**/*.json`) over a large data
  directory; every existing glob here is scoped to one flat directory with a
  fixed extension.
- Do not add a barrel file that re-exports a glob-backed module — that is
  exactly the shape of the historical incident described under G7 below.
- Run `npm run test:word-worker:production-safety` (Worker bundle-size guard)
  and the SEO baseline comparison
  (`npm run seo-baseline:capture` + `seo-baseline:compare`) after any
  high-risk change.

## Boundary inventory

Full machine-readable detail (options, exact resolved path, naming contract)
is in `scripts/import-boundaries/current/globs.json`. Summary:

| ID | Consumer | Pattern | Runtime | Eager/lazy | Match count | Risk |
|---|---|---|---|---|---:|---|
| G1 | `workers/word-ssr/src/render-entry.tsx` | `../../../src/data/interface/*.json` | Cloudflare Worker | eager | 7 | high — deepest relative path in the repo, eager into Worker bundle |
| G2 | `src/entry-server.tsx` | `./data/vocabulary/*/vocabulary.json` | SSR entry (shared by prerender, Worker-adjacent Node runtime, seo-baseline capture) | lazy | 7 | high — load-bearing shared entry point |
| G3 | `src/entry-server.tsx` | `./data/interface/*.json` | SSR entry | lazy | 7 | high — same consumer as G2 |
| G4 | `src/data/seo/wordHubData.ts` | `./word-hub-pages/*.json` | client + SSR (not Worker) | eager | 7 | safe-but-generated |
| G5 | `src/data/seo/wordBrowseSearchData.ts` | `./word-browse-shards/*.json` | client + SSR + **transitively Worker** via `WordSeoPageView.tsx` | lazy | 42 | high — shared-module boundary, only a test prevents the heavy export from running in the Worker |
| G6 | `src/data/commonVerbList.ts` | `./verbListLookup/*.json` | client + SSR (not Worker) | eager | 7 | safe-but-generated |
| G7 | `src/app/components/WordSeoPage.tsx` | `../../data/vocabulary/*/vocabulary.json` | client-only | lazy | 7 | high — site of the historical Worker bundle-bloat incident |
| G8 | `src/app/components/VocabularyLevelPage.tsx` | `../../data/vocabulary/*/vocabulary.json` | client-only | lazy | 7 | medium |
| G9 | `src/data/seo/levelBrowseWords.ts` | `./level-browse-preview/*.json` | client + SSR | lazy | 42 | medium — hand-authored data, no generator script exists |

All 9 match counts were verified against the real repository tree during this
audit (Phase 4) and are now asserted by `npm run test:import-boundaries`.

## Related path-sensitive loaders

Not `import.meta.glob`, but the same category of path-sensitivity:

| Consumer | Loader type | Target | Runtime | Risk |
|---|---|---|---|---|
| `public/vocabularyLevels/index.ts` | explicit `import()` registry (49 entries) + `new URL(..., import.meta.url)` + Node `fs` fallback | `public/vocabularyLevels/{ui}/{target}.json` | **none — orphaned** | high — dead, byte-identical duplicate of `src/data/vocabularyLevels/`; ships all 49 JSON files into `dist/`/`server-build/` via Vite's `publicDir` copy on every build |
| `src/contexts/LanguageContext.tsx` | explicit switch, 7 literal `import()` calls | `src/data/interface/{language}_interface.json` | client | medium — same directory as G1/G3 but hand-maintained in parallel; a new interface file is picked up by the globs but silently missed here unless also added |
| `scripts/cleanup-word-build-artifacts.mjs` | hard-coded `fs.rm` | `dist/vocabularyLevels/index.ts`, `server-build/vocabularyLevels/index.ts` | build-time | medium — silent workaround for the `public/vocabularyLevels` leak; if that directory moves, this script stops matching anything with no build failure |
| `scripts/generate-sitemap.mjs` | `fs.readdir` walk | `src/data/vocabularyLevels/{ui}/` | build-time generator | low |
| `scripts/generate-word-hub-data.mjs` | generator + `fs.readdir` cleanup | `word-hub-pages/`, `word-browse-shards/`, `verbListLookup/` | build-time generator | low — but authoritative for G4/G5/G6 |
| `scripts/prerender.mjs` | `fs.readdir` | `dist/assets/` | build-time | low |
| `workers/word-ssr/publish-shards.mjs` | `fs.readdirSync` recursive walk | `dist/**` → `assets-full/` | build-time (Worker asset publish) | medium — depends on `dist/` already being cleaned by `cleanup-word-build-artifacts.mjs` in the same build |
| `workers/word-ssr/measure-shard-formats.mjs`, `poc/cloudflare-word-renderer/measure-formats.mjs` | `fs.readdirSync` | internal data dirs | obsolete/POC | low |
| `scripts/test-crawler-policy.mjs` | `fs.readdirSync` walk | `workers/word-ssr/src/` | test-only | low — protective |
| `scripts/verify-word-ssr-package.mjs` + 7 other `scripts/test-*.mjs` | `fs.readdirSync`/`fs.readdir` | `dist/`, `public/sitemaps/`, `server-build/` | test/build-verification-only | low |

### The `public/vocabularyLevels/` finding, in detail

This audit found a full, verified duplicate: `public/vocabularyLevels/`
contains the same 49 `{ui}/{target}.json` files as
`src/data/vocabularyLevels/` (byte-identical, confirmed with `diff -rq`), plus
a 226-line `index.ts` that is a near-duplicate of
`src/data/vocabularyLevels/index.ts` (198 lines — the `public/` copy has an
extra Node `fs.readFileSync`/`eval("require")` SSR fallback branch the `src/`
copy lacks). **Nothing in the application imports `public/vocabularyLevels/`
— it is dead code from the module graph's perspective**, but because it lives
under `public/`, Vite's default `publicDir` behavior copies the entire tree
into `dist/` (and, via the SSR build, into `server-build/`) on every build.
`scripts/cleanup-word-build-artifacts.mjs` already force-deletes the two
copied `index.ts` files after build — a targeted patch for the most visible
symptom (shipping source-like `.ts` as static output) — but the 49 JSON
files are not covered by that cleanup and do ship to production as
publicly-fetchable static files, and from there into the Worker's
`assets-full/` via `publish-shards.mjs` (which copies from `dist/`).

This was out of scope to fix in this audit (no folder moves/renames/deletes
were made), but it is the single highest-value cleanup candidate this audit
surfaced. A new guard (`npm run test:import-boundaries`) now asserts the two
trees stay byte-identical, so if the `src/` copy is updated without updating
`public/`, drift is caught immediately instead of silently shipping stale
data.

## Safe move checklist

### Moving a consumer file (e.g. relocating `WordSeoPage.tsx`)

1. Update the glob's relative path to still resolve to the same target
   directory.
2. Re-run `npm run test:import-boundaries` and confirm exact match counts
   are unchanged.
3. Run TypeScript/build (`npm run build`).
4. Compare client, SSR, and Worker bundle sizes against
   `scripts/seo-baseline/current/performance.json`.
5. Run the SEO/performance baseline comparison
   (`npm run seo-baseline:capture` + `seo-baseline:compare`).

### Moving a matched directory (e.g. relocating `word-browse-shards/`)

1. Update the generator (`scripts/generate-word-hub-data.mjs` for G4/G5/G6).
2. Update every consumer glob pattern in the same change.
3. If a `public/` copy exists for this data (as it does for
   `vocabularyLevels/`), update or remove it in the same change — do not
   leave a stale duplicate behind.
4. Verify no duplicate old copy remains anywhere in the tree.
5. Verify the new path is safe on Cloudflare's Linux build environment
   (case-sensitive filesystem) — this repo's directories and filenames are
   already all-lowercase, but double-check after any rename.
6. Run `npm run test:import-boundaries` and confirm exact match counts.
7. Verify sitemap/prerender counts against the baseline.
8. Verify the Worker bundle remains below the 2.5 MB internal guard
   (`npm run test:word-worker:production-safety`).

## High-risk boundaries

1. **G1** (`render-entry.tsx`'s interface glob) — the deepest relative path
   of any glob in the repo (`../../../`), eager, feeding the Cloudflare
   Worker directly. A consumer move that changes directory depth breaks
   resolution outright (a hard build error, not a silent one — Vite cannot
   resolve a glob pattern that doesn't point at a real directory), but the
   fragility is real.
2. **G5** (`wordBrowseSearchData.ts`) — the module is imported into
   Worker-reachable code (`WordSeoPageView.tsx`), and only
   `workers/word-ssr/test-worker-bundle-size.mjs`'s explicit
   `getWordBrowseSearchData` usage check stands between "safe" and
   "re-introduces the historical bundle-bloat bug." No independent
   match-count guard existed before this audit; one now exists via
   `test:import-boundaries`.
3. **G7** (`WordSeoPage.tsx`'s vocabulary glob) — this is literally the
   glob whose historical leak into the Worker's shared view caused the
   original multi-megabyte bundle regression that
   `test-worker-bundle-size.mjs` was written to prevent (see that file's
   header comment). Any refactor that merges `WordSeoPage.tsx` and
   `WordSeoPageView.tsx`, or that moves this glob into a shared module, must
   not repeat that mistake.
4. **`public/vocabularyLevels/`** (related loader, not a glob) — a fully
   duplicated, orphaned dataset shipped to production purely as a side
   effect of Vite's `publicDir` default. See detailed writeup above.
5. **G2/G3** (`entry-server.tsx`) — not fragile in isolation, but this file
   is a shared, load-bearing SSR entry point consumed by
   `scripts/prerender.mjs`, `server/word-ssr-runtime.mjs`, and
   `scripts/seo-baseline/capture.mjs` by its build output path
   (`server-build/entry-server.js`). Moving it has blast radius well beyond
   its two globs.

## Test coverage matrix

| Glob ID | Match-set guard | Functional coverage | Bundle coverage | Status |
|---|---|---|---|---|
| G1 | `test:import-boundaries` (new) | `test:seo-output` (word pages render with correct `htmlLang`/interface strings) | `test:word-worker:production-safety` (bundle-size) | strong |
| G2 | `test:import-boundaries` (new) | `test:word-seo`, `test:seo-output` (extensive) | indirect via SSR package size in `verify-word-ssr-package.mjs` | strong |
| G3 | `test:import-boundaries` (new) | `test:seo-output` (hreflang/UI-language variants) | indirect | strong |
| G4 | `test:import-boundaries` (new) | `test:word-seo` (source-string check only, not runtime) | none direct | partial |
| G5 | `test:import-boundaries` (new) | `test:word-browse-pagination` | `test:word-worker:production-safety` (the historical-incident guard) | strong |
| G6 | `test:import-boundaries` (new) | `test:word-seo` (source-string check only) | none direct | partial |
| G7 | `test:import-boundaries` (new) | `test:seo-output` (word pages) | `test:word-worker:production-safety` (explicit `WordSeoPageView` check) | strong |
| G8 | `test:import-boundaries` (new) | `test:seo-output`, `test:level-browse-preview` (CEFR pages) | none direct | partial |
| G9 | `test:import-boundaries` (new), plus pre-existing `test:level-browse-preview` (strongest coverage of any glob — exact 42-key match set + content validation) | `test:seo-output` | none direct | strong |

Before this audit, G4, G5, G6, G8 had **no independent match-count guard** —
only source-string assertions in `scripts/test-word-seo-routes.mjs`
confirming the glob *pattern text* is present, which would not fail if the
underlying file set silently gained or lost a file. `test:import-boundaries`
closes that gap for all 9 globs.

## Candidate future improvements

Documented as options, **not implemented** in this audit:

- Replace G4/G6's eager globs with explicit generated registries (the
  generator already knows the exact language list — it could emit an
  `index.ts` alongside the JSON, the same shape as
  `public/vocabularyLevels/index.ts`'s `import()` map, minus that file's dead
  orphaned status).
- Formalize the "safe export vs. heavy export" split already used correctly
  in `wordBrowseSearchData.ts` (`getWordBrowseSearchShardKey` vs.
  `getWordBrowseSearchData`) as a documented pattern for any future
  Worker-shared module that also needs a glob-backed loader.
- Reconcile G1/G3's glob-based interface loading with
  `LanguageContext.tsx`'s hand-written `import()` switch (L2) — one
  generated source of truth would remove the dual-maintenance risk.
- Retire or actually wire up `public/vocabularyLevels/index.ts` — either
  delete the orphaned duplicate (data + index.ts) or prove it's needed and
  document why it must stay outside `src/`.
- Consider a shared alias (e.g. `@data/vocabulary`) for the vocabulary
  directory so G2/G7/G8's three separate relative-path spellings of the same
  target collapse to one stable reference.
