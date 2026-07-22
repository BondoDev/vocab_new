# Import boundaries: `import.meta.glob` and path-sensitive data loading

Machine-readable companion:
[`scripts/import-boundaries/current/globs.json`](../scripts/import-boundaries/current/globs.json).
Guard script: `npm run test:import-boundaries` (`scripts/tests/architecture/test-import-boundaries.mjs`).
See [`docs/generated-data.md`](generated-data.md) for the full generated/mirrored-data
ownership map (which directory is authoritative, which is a mirror, which
sync command applies) — this document covers only the `import.meta.glob`
path-sensitivity contract layered on top of those directories.

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
- Never move `src/data/seo/wordPages/word-hub-pages/`, `word-browse-shards/`, or
  `src/data/seo/verbLists/common100Verbs/verbListLookup/` without also updating
  `scripts/generation/generate-word-hub-data.mjs` (their generator) in the same change.
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
| G4 | `src/data/seo/wordPages/wordHubData.ts` | `./word-hub-pages/*.json` | client + SSR (not Worker) | eager | 7 | safe-but-generated |
| G5 | `src/data/seo/wordPages/wordBrowseSearchData.ts` | `./word-browse-shards/*.json` | client + SSR + **transitively Worker** via `WordSeoPageView.tsx` | lazy | 42 | high — shared-module boundary, only a test prevents the heavy export from running in the Worker |
| G6 | `src/data/seo/verbLists/common100Verbs/common100VerbList.ts` | `./verbListLookup/*.json` | client + SSR (not Worker) | eager | 7 | safe-but-generated |
| G7 | `src/app/pages/word-pages/detail/WordSeoPage.tsx` | `../../../../data/vocabulary/*/vocabulary.json` | client-only | lazy | 7 | high — site of the historical Worker bundle-bloat incident |
| G8 | `src/app/pages/vocabulary/VocabularyLevelPage.tsx` | `../../../data/vocabulary/*/vocabulary.json` | client-only | lazy | 7 | medium |
| G9 | `src/data/seo/vocabularyLevels/levelBrowseWords.ts` | `./level-browse-preview/*.json` | client + SSR | lazy | 42 | medium — hand-authored data, no generator script exists |

All 9 match counts are asserted by `npm run test:import-boundaries`.

## Related path-sensitive loaders

Not `import.meta.glob`, but the same category of path-sensitivity:

| Consumer | Loader type | Target | Runtime | Risk |
|---|---|---|---|---|
| `src/data/seo/vocabularyLevels/index.ts` (`fetchVocabularyFile`) | `fetch(`/vocabularyLevels/${ui}/${target}.json`)` | `public/vocabularyLevels/{ui}/{target}.json` | client (browser, on navigation without prerendered/override content) | medium — `public/vocabularyLevels/*.json` is a **required runtime mirror**, not dead data; see `docs/generated-data.md` |
| `src/contexts/LanguageContext.tsx` | explicit switch, 7 literal `import()` calls | `src/data/interface/{language}_interface.json` | client | medium — same directory as G1/G3 but hand-maintained in parallel; a new interface file is picked up by the globs but silently missed here unless also added |
| `src/features/learning-setup/LevelCategorySelection.tsx` (`loadVocabularyMetadata`) | explicit switch, 7 literal lazy `import()` calls | `src/data/vocabularyMetadata/{language}.json` | client (browser `useEffect`, runs after mount — not executed during SSR/prerender, so it has no `entry-server.tsx`/Worker exposure) | medium — dual-maintenance risk of the same shape as the `LanguageContext.tsx` row above: adding an 8th UI/practice language requires a new `case` branch here even though the JSON file could be added to `src/data/vocabularyMetadata/` independently; a missing branch returns `null` and silently falls back to `DEFAULT_WORD_TYPES` instead of failing loudly |
| `scripts/generation/generate-sitemap.mjs` | `fs.readdir` walk | `src/data/seo/vocabularyLevels/{ui}/` | build-time generator | low |
| `scripts/generation/generate-sitemap.mjs` (`collectLevelTestRoutes`) | `fs.readFile` | `src/data/seo/levelTests/seo_level_test_content.json` | build-time generator | low |
| `src/data/seo/levelTests/index.ts` | static relative `import` | `./seo_level_test_content.json` | client + SSR | low |
| `src/app/pages/vocabulary/devSeoCefrPreviewData.ts` | static relative `import` | `../../../data/seo/vocabularyLevels/seo-cefr-content.json` | client + SSR — production content for `vocabularyLevel` routes, see `docs/generated-data.md` | low |
| `scripts/generation/generate-word-hub-data.mjs` | generator + `fs.readdir` cleanup | `wordPages/word-hub-pages/`, `wordPages/word-browse-shards/`, `verbLists/common100Verbs/verbListLookup/` | build-time generator | low — but authoritative for G4/G5/G6 |
| `scripts/build/prerender.mjs` | `fs.readdir` | `dist/assets/` | build-time | low |
| `workers/word-ssr/publish-shards.mjs` | `fs.readdirSync` recursive walk | `dist/**` → `assets-full/` | build-time (Worker asset publish) | medium — depends on `dist/` already being cleaned by `scripts/build/cleanup-word-build-artifacts.mjs` in the same build |
| `workers/word-ssr/measure-shard-formats.mjs` | `fs.readdirSync` | internal data dirs | staging-only measurement | low |
| `scripts/test-crawler-policy.mjs` | `fs.readdirSync` walk | `workers/word-ssr/src/` | test-only | low — protective |
| `scripts/build/verify-word-ssr-package.mjs` + 7 other `scripts/test-*.mjs` | `fs.readdirSync`/`fs.readdir` | `dist/`, `public/sitemaps/`, `server-build/` | test/build-verification-only | low |

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

### Moving a matched directory (e.g. relocating `wordPages/word-browse-shards/`)

1. Update the generator (`scripts/generation/generate-word-hub-data.mjs` for G4/G5/G6).
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
   resolution outright (a hard build error, not a silent one), but the
   fragility is real.
2. **G5** (`wordBrowseSearchData.ts`) — the module is imported into
   Worker-reachable code (`WordSeoPageView.tsx`), and only
   `workers/word-ssr/test-worker-bundle-size.mjs`'s explicit
   `getWordBrowseSearchData` usage check stands between "safe" and
   "re-introduces the historical bundle-bloat bug."
3. **G7** (`WordSeoPage.tsx`'s vocabulary glob) — this is literally the
   glob whose historical leak into the Worker's shared view caused the
   original multi-megabyte bundle regression that
   `test-worker-bundle-size.mjs` was written to prevent (see that file's
   header comment). Any refactor that merges `WordSeoPage.tsx` and
   `WordSeoPageView.tsx`, or that moves this glob into a shared module, must
   not repeat that mistake.
4. **`public/vocabularyLevels/`** (related loader, not a glob) — the JSON
   files are a required runtime mirror fetched directly by the browser, not
   an orphaned duplicate. See `docs/generated-data.md`.
5. **G2/G3** (`entry-server.tsx`) — not fragile in isolation, but this file
   is a shared, load-bearing SSR entry point consumed by
   `scripts/build/prerender.mjs`, `server/word-ssr-runtime.mjs`, and
   `scripts/seo-baseline/capture.mjs` by its build output path
   (`server-build/entry-server.js`). Moving it has blast radius well beyond
   its two globs.

## Candidate future improvements

Documented as options, not implemented:

- Replace G4/G6's eager globs with explicit generated registries (the
  generator already knows the exact language list — it could emit an
  `index.ts` alongside the JSON).
- Formalize the "safe export vs. heavy export" split already used correctly
  in `wordBrowseSearchData.ts` (`getWordBrowseSearchShardKey` vs.
  `getWordBrowseSearchData`) as a documented pattern for any future
  Worker-shared module that also needs a glob-backed loader.
- Reconcile G1/G3's glob-based interface loading with
  `LanguageContext.tsx`'s hand-written `import()` switch with one generated
  source of truth to remove the dual-maintenance risk.
- Consider replacing `src/data/seo/vocabularyLevels/index.ts`'s browser
  `fetch()`-from-`public/` strategy with a bundler-driven approach (e.g. a
  generated per-language JS chunk) so the `public/vocabularyLevels/` JSON
  mirror and its duplication guard are no longer needed at all.
- Consider a shared alias (e.g. `@data/vocabulary`) for the vocabulary
  directory so G2/G7/G8's three separate relative-path spellings of the same
  target collapse to one stable reference.
