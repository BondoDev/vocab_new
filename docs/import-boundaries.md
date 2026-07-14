# Import boundaries: `import.meta.glob` and path-sensitive data loading

Audited at source commit `f7f91c1e`. Machine-readable companion:
[`scripts/import-boundaries/current/globs.json`](../scripts/import-boundaries/current/globs.json).
Guard script: `npm run test:import-boundaries` (`scripts/test-import-boundaries.mjs`).
Follow-up generated-data-ownership audit at `80e52fe4` corrected the
`public/vocabularyLevels/` finding (see the "corrected" writeup below) and
removed the dead `index.ts`; see [`docs/generated-data.md`](generated-data.md)
for the full ownership map.

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
| `src/data/vocabularyLevels/index.ts` (`fetchVocabularyFile`) | `fetch(`/vocabularyLevels/${ui}/${target}.json`)` | `public/vocabularyLevels/{ui}/{target}.json` | client (browser, on navigation without prerendered/override content) | medium — `public/vocabularyLevels/*.json` is a **required runtime mirror**, not dead data; see corrected writeup below |
| `src/contexts/LanguageContext.tsx` | explicit switch, 7 literal `import()` calls | `src/data/interface/{language}_interface.json` | client | medium — same directory as G1/G3 but hand-maintained in parallel; a new interface file is picked up by the globs but silently missed here unless also added |
| ~~`scripts/cleanup-word-build-artifacts.mjs`~~ | ~~hard-coded `fs.rm`~~ | *(removed 2026-07-15)* | — | resolved — see corrected writeup below |
| `scripts/generate-sitemap.mjs` | `fs.readdir` walk | `src/data/vocabularyLevels/{ui}/` | build-time generator | low |
| `scripts/generate-word-hub-data.mjs` | generator + `fs.readdir` cleanup | `word-hub-pages/`, `word-browse-shards/`, `verbListLookup/` | build-time generator | low — but authoritative for G4/G5/G6 |
| `scripts/prerender.mjs` | `fs.readdir` | `dist/assets/` | build-time | low |
| `workers/word-ssr/publish-shards.mjs` | `fs.readdirSync` recursive walk | `dist/**` → `assets-full/` | build-time (Worker asset publish) | medium — depends on `dist/` already being cleaned by `cleanup-word-build-artifacts.mjs` in the same build |
| `workers/word-ssr/measure-shard-formats.mjs`, `poc/cloudflare-word-renderer/measure-formats.mjs` | `fs.readdirSync` | internal data dirs | obsolete/POC | low |
| `scripts/test-crawler-policy.mjs` | `fs.readdirSync` walk | `workers/word-ssr/src/` | test-only | low — protective |
| `scripts/verify-word-ssr-package.mjs` + 7 other `scripts/test-*.mjs` | `fs.readdirSync`/`fs.readdir` | `dist/`, `public/sitemaps/`, `server-build/` | test/build-verification-only | low |

### The `public/vocabularyLevels/` finding, corrected (2026-07-15 follow-up audit)

The original writeup above (source commit `f7f91c1e`) characterized the
entire `public/vocabularyLevels/` tree as an "orphaned duplicate." A
follow-up generated-data-ownership audit (see `docs/generated-data.md`)
found that characterization was only half right, and split the finding into
two parts with different outcomes:

- **`public/vocabularyLevels/index.ts` (226 lines) was genuinely dead.**
  Nothing in the application imported it — module resolution for
  `from "../data/vocabularyLevels"` always resolves to
  `src/data/vocabularyLevels/index.ts`, never the `public/` copy, because
  `public/` is not part of Vite's module graph. This file has been **removed**.
- **The 49 `{ui}/{target}.json` files under `public/vocabularyLevels/` are
  NOT dead.** `src/data/vocabularyLevels/index.ts`'s `fetchVocabularyFile()`
  performs a live `fetch(`/vocabularyLevels/${ui}/${target}.json`)` call from
  the browser, reached from `VocabularyLevelPage.tsx` whenever a
  vocabulary-level route renders client-side without prerendered/override
  content (e.g. in-app navigation between levels after initial hydration).
  That fetch has no server other than the static file Vite's `publicDir`
  copy places at `dist/vocabularyLevels/{ui}/{target}.json`, and from there
  into `server-build/`, and from there (via `publish-shards.mjs` copying
  `dist/**`) into the Worker's `assets-full/`. **These JSON files must stay
  in `public/vocabularyLevels/` and stay byte-identical to
  `src/data/vocabularyLevels/`** — removing them would break client-side
  navigation to vocabulary-level pages in production.

`scripts/cleanup-word-build-artifacts.mjs`'s two `fs.rm` calls for
`dist/vocabularyLevels/index.ts` and `server-build/vocabularyLevels/index.ts`
are now obsolete (the source `index.ts` no longer exists for Vite to copy)
and have been removed from that script. `npm run test:import-boundaries`
still asserts the two JSON trees stay byte-identical (this remains load-bearing,
not just a drift check), and `scripts/test-generated-data-ownership.mjs` now
additionally asserts `public/vocabularyLevels/index.ts` cannot silently
reappear.

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
4. **`public/vocabularyLevels/`** (related loader, not a glob) — the JSON
   files are a required runtime mirror fetched directly by the browser, not
   an orphaned duplicate; only the accompanying `index.ts` was dead, and it
   has been removed. See corrected writeup above.
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
  `index.ts` alongside the JSON).
- Formalize the "safe export vs. heavy export" split already used correctly
  in `wordBrowseSearchData.ts` (`getWordBrowseSearchShardKey` vs.
  `getWordBrowseSearchData`) as a documented pattern for any future
  Worker-shared module that also needs a glob-backed loader.
- Reconcile G1/G3's glob-based interface loading with
  `LanguageContext.tsx`'s hand-written `import()` switch (L2) — one
  generated source of truth would remove the dual-maintenance risk.
- Consider replacing `src/data/vocabularyLevels/index.ts`'s browser
  `fetch()`-from-`public/` strategy with a bundler-driven approach (e.g. a
  generated per-language JS chunk) so the `public/vocabularyLevels/` JSON
  mirror and its duplication guard are no longer needed at all — see
  `docs/generated-data.md` for the current state.
- `public/seo/level-browse-preview/` (byte-identical duplicate of
  `src/data/seo/level-browse-preview/`, added in the same historical commit
  as the original `public/vocabularyLevels/` duplication) has **no
  discoverable runtime consumer** — no fetch, no import, no glob targets it.
  It looks like the same class of accidental byproduct that
  `public/vocabularyLevels/index.ts` turned out to be, but was **not**
  removed in the 2026-07-15 audit (deliberately out of scope — see
  `docs/generated-data.md`). Flagged here as a high-confidence candidate for
  a dedicated follow-up task.
- Consider a shared alias (e.g. `@data/vocabulary`) for the vocabulary
  directory so G2/G7/G8's three separate relative-path spellings of the same
  target collapse to one stable reference.
