# Generated-data ownership

Audited 2026-07-15, source commit `80e52fe4`; updated same day (guidelines/
folder cleanup) to add `src/data/seo/levelTests/seo_level_test_content.json` and
`src/data/seo/vocabularyLevels/seo-cefr-content.json`, both relocated from `guidelines/`
(which is human-guidance-only — see [`docs/architecture.md`](architecture.md)).
Updated 2026-07-25 (Phase 6 of the vocabulary-level legacy cleanup):
`public/vocabularyLevels/`, its synchronization script, and its package
scripts were removed as unconsumed generated infrastructure.
Companion to [`docs/import-boundaries.md`](import-boundaries.md) (which
guards the *shape* `import.meta.glob` and related loaders depend on). This
document instead answers, for every generated or `src`/`public`-duplicated
data directory in the repo: who owns it, who writes it, who reads it, and
what happens if it's moved or deleted.

Guard script: `npm run test:generated-data-ownership`
(`scripts/tests/architecture/test-generated-data-ownership.mjs`), wired into
`npm run test:architecture-guards`.

## Ownership matrix

| Directory | Classification | Source of truth | Producer | Consumers | Committed? | Risk |
|---|---|---|---|---|---|---|
| `src/data/seo/vocabularyLevels/` | handwritten source | itself | manual (no generator) | `scripts/generation/generate-sitemap.mjs` (CEFR route enumeration, via `getAllLocalizedVocabularyRoutes()` — the 49-file matrix itself is no longer read for this; see resolved finding below) | yes | low — pending a later phase auditing whether the 49-file matrix still has any consumer at all |
| `src/data/seo/levelTests/seo_level_test_content.json` | handwritten source (moved from `guidelines/` 2026-07-15) | itself | manual (no generator) | `src/data/seo/levelTests/index.ts`, `scripts/generation/generate-sitemap.mjs` (`collectLevelTestRoutes`), transitively `LevelTestSeoPage.tsx`, `src/seo/levelTests/levelTestMetadata.ts` (via the `src/seo/metadata.ts` facade), `src/entry-server.tsx` (SSR/prerender) | yes | low |
| `src/data/seo/vocabularyLevels/seo-cefr-content.json` | handwritten source (moved from `guidelines/` 2026-07-15) | itself | manual (no generator) | `src/app/pages/vocabulary/devSeoCefrPreviewData.ts` — see corrected finding below; despite the module's "dev preview" name, this is production content for every `vocabularyLevel` route | yes | medium — see split-content finding below |
| ~~`public/vocabularyLevels/*.json` (49 files)~~ | *(removed Phase 6, 2026-07-25)* | — | — | none — the browser-fetch consumer was removed in an earlier phase, confirmed dead, and the mirror deleted | — | resolved |
| ~~`public/vocabularyLevels/index.ts`~~ | *(removed 2026-07-15)* | — | — | none — confirmed dead, no import anywhere | — | resolved |
| `src/data/seo/wordPages/word-hub-pages/` | generated committed source | `src/data/vocabulary/{lang}/vocabulary.json` | `scripts/generation/generate-word-hub-data.mjs` | client + SSR (`wordHubData.ts`, eager glob G4); not the Worker | yes | low |
| `src/data/seo/wordPages/word-browse-shards/` | generated committed source | same vocabulary.json | `scripts/generation/generate-word-hub-data.mjs` | client + SSR + **transitively Worker-reachable** (G5); guarded by Worker bundle-size test | yes | medium |
| `src/data/seo/vocabularyLevels/level-browse-preview/` | generated committed source, **no generator exists** | itself (hand-authored/one-time-generated) | none found | client + SSR (`levelBrowseWords.ts`, lazy glob G9) | yes | medium — must be hand-edited until a generator is written |
| ~~`public/seo/level-browse-preview/`~~ | *(removed 2026-07-15; obsolete duplicate)* | `src/data/seo/vocabularyLevels/level-browse-preview/` remains authoritative | manual copy, added in the same historical commit as the `public/vocabularyLevels/` duplication | none found — no fetch, import, glob, sitemap, SSR, Worker, or service-worker consumer required the public URL | no | resolved |
| `src/data/seo/verbLists/common100Verbs/verbListLookup/` | generated committed source | `common100Verbs/list_of_100_most_used_verb.json` + vocabulary.json | `scripts/generation/generate-word-hub-data.mjs` | client + SSR (`common100VerbList.ts`, eager glob G6); not the Worker | yes | low |
| `public/sitemaps/` | generated build output (committed) | word route manifest + verb registry + vocabulary data | `scripts/generation/generate-sitemap.mjs` (`npm run sitemap`) | search engines only; test-only in-repo consumers | yes | low |
| `workers/word-ssr/data/full-corpus/` | generated build output | vocabulary + word-route-manifest + slugs | `workers/word-ssr/generation/generate-full-corpus.mjs` (Cloudflare remote build) | `workers/word-ssr/generation/publish-shards.mjs` | **no** (gitignored) | medium — build-pipeline coupling, see remote-build note |
| `workers/word-ssr/assets-full/` | Worker Static Asset directory | `dist/**` + `data/full-corpus/` | `workers/word-ssr/generation/publish-shards.mjs` (Cloudflare remote build) | **Worker runtime** — bound in both `wrangler.full.toml` and `wrangler.production.toml` | **no** (gitignored) | medium — build-pipeline coupling, see remote-build note |
| `workers/word-ssr/worker-dist-full/` | generated build output | `workers/word-ssr/src/index.full.ts` | `vite build --ssr` step of `build-worker-full.mjs` (Cloudflare remote build) | **Worker runtime** — `main` field in both `wrangler.full.toml` and `wrangler.production.toml` | **no** (gitignored) | medium — build-pipeline coupling, see remote-build note |
| `workers/word-ssr/data/client-assets.full.json` | generated build output (tracked snapshot) | `dist/index.html` (script/style/preconnect/favicon tags emitted by the client build) | `workers/word-ssr/generation/publish-shards.mjs` | **Worker runtime** — read by `workers/word-ssr/src/index.full.ts` to build the `<head>`/`<script>` tags of every Worker-rendered word page | yes | medium — never hand-edit; no automated staleness check currently exists against `dist/index.html` |
| `workers/word-ssr/data/publish-manifest.json` | generated build bookkeeping (tracked) | itself (prior publish run's checksums) | `workers/word-ssr/generation/publish-shards.mjs` (both producer and reader — incremental-publish checksum ledger) | none — build bookkeeping only, not application source data, not read by the Worker runtime | yes | low — never hand-edit |
| `workers/word-ssr/data/full-corpus-census.json` | diagnostic snapshot (tracked) | itself (point-in-time report) | `workers/word-ssr/diagnostics/census-full-corpus.mjs` (manual, developer-run) | none found — diagnostic-only, not consumed by production runtime or any script | yes | low — never hand-edit |
| `workers/word-ssr/data/sharding-measurement.json` | diagnostic snapshot (tracked) | itself (point-in-time report) | `workers/word-ssr/diagnostics/measure-shard-formats.mjs` (manual, developer-run) | none found — diagnostic-only, not consumed by production runtime or any script | yes | low — never hand-edit |
| `dist/` | generated build output | `vite build` | `npm run build` | intermediate; feeds `server-build/` cleanup and `assets-full/` publish | no (gitignored) | low, ephemeral |
| `server-build/` | generated build output | `vite build --ssr` | `npm run build` | `scripts/build/prerender.mjs`, `scripts/build/verify-word-ssr-package.mjs` | no (gitignored) | low, ephemeral |

## `src/data/seo/vocabularyLevels/` vs `public/vocabularyLevels/` — resolved finding

**Update (Phase 6, 2026-07-25): `public/vocabularyLevels/` has been deleted,
along with its synchronization script and package scripts.** The finding
below explains why the mirror was originally required and how it was kept in
sync; all of that is now historical. Once the browser-fetch consumer
(`fetchVocabularyFile`, in the removed synchronous loader) was deleted in an
earlier phase, the mirror had no remaining consumer, and sitemap route
enumeration was migrated off the `{ui}/{target}.json` matrix in the same
cleanup (see `getAllLocalizedVocabularyRoutes()` above). `scripts/generation/sync-vocabulary-levels.mjs`
and the `sync:vocabulary-levels`/`check:vocabulary-levels-sync` package
scripts were deleted in the same change; `prebuild` no longer runs a
mirror-sync check. `src/data/seo/vocabularyLevels/{ui}/{target}.json` (the 49
source files) were intentionally **not** deleted in this phase — see the
"Regeneration commands" and "Deletion rules" sections below for their
current status.

**`src/data/seo/vocabularyLevels/` is no longer authoritative for anything
rendered on production `vocabularyLevel` routes (updated: legacy fallback
pipeline removal).** It previously was, via `src/seo/vocabularyLevels/vocabularyMetadata.ts`
(re-exported through the `src/seo/metadata.ts` compatibility facade), which
read it directly for every vocabulary-level route's `<head>` title/description/canonical
as a fallback for when `App.tsx`'s `"vocabularyLevel"` branch found no matching
`src/data/seo/vocabularyLevels/seo-cefr-content.json` entry. Because that file has
full 7×7×6 coverage — an invariant an exhaustive guard (`test:vocabulary-level-coverage`)
now enforces — that fallback was never actually reachable in production. The
routing fallback, the component-level loader, and `vocabularyMetadata.ts` itself
have since all been removed. Both the visible page body and `<head>` metadata for
every vocabulary-level route now come exclusively from `seo-cefr-content.json`,
via `findSeoCefrPreviewItem()` (`src/app/pages/vocabulary/devSeoCefrPreviewData.ts`)
and `DevSeoCefrPlaceholderPage`. The "dev preview"/"placeholder" naming of that
module and component remains misleading about their actual production role —
not renamed as part of this cleanup (out of scope). `src/data/seo/vocabularyLevels/`
(the `{ui}/{target}.json` matrix) remains only as the source
`scripts/generation/generate-sitemap.mjs` reads to enumerate CEFR sitemap routes —
deferred to a later phase.

**`public/vocabularyLevels/*.json` was a required runtime mirror, not dead
duplication — until the fetch consumer was removed.** `src/data/seo/vocabularyLevels/index.ts`'s
client-side loader (`fetchVocabularyFile`) used to perform
`fetch(`/vocabularyLevels/${ui}/${target}.json`)` from the browser whenever
`VocabularyLevelPage.tsx` rendered without prerendered/override content
(client-side navigation between vocabulary-level pages after initial
hydration). That URL was only servable because Vite's `publicDir` default
copied `public/vocabularyLevels/` into `dist/` (and, via the SSR build, into
`server-build/`), and from there `workers/word-ssr/generation/publish-shards.mjs`
copied it into the Worker's `assets-full/`. `VocabularyLevelPage.tsx` no
longer performs this fetch (it now requires `contentOverride`/`seoMetadataOverride`
as props instead), so the mirror had no remaining consumer and was deleted in
Phase 6. While it existed, all 49 JSON files were kept verified
byte-identical to `src/data/seo/vocabularyLevels/` (SHA-256, per-file).

**`public/vocabularyLevels/index.ts` (226 lines) was dead and has been
removed.** It was a self-contained loader module (explicit `import()`
registry + `new URL(..., import.meta.url)` + Node `fs` fallback) added in the
same commit (`06691d18`, "Load SEO vocabulary JSON files on demand") that
introduced the `fetch()`-based client loading strategy in
`src/data/seo/vocabularyLevels/index.ts`. Nothing ever imported it — Vite's
`publicDir` mechanism only needed the JSON files to exist at a stable URL,
not the accompanying `.ts` file, which appears to have been an incidental
byproduct of copying the whole source directory into `public/` rather than a
deliberate addition. Removing it also made
`scripts/build/cleanup-word-build-artifacts.mjs`'s two `fs.rm` calls (which force-deleted
the copied `dist/vocabularyLevels/index.ts` and
`server-build/vocabularyLevels/index.ts` post-build) obsolete; those calls
have been removed from that script.

**Synchronization was deterministic but explicit, not automatic (2026-07-15
follow-up; removed Phase 6).** `scripts/generation/sync-vocabulary-levels.mjs`
derived the expected 7×7 UI-language × target-language matrix from the same
authoritative registry (`SUPPORTED_UI_LANGUAGES` / `SUPPORTED_TARGET_LANGUAGES`
in `src/data/seo/shared/slugs.ts`), validated every source file, copied bytes
exactly into `public/vocabularyLevels/`, removed stale public files, and
verified SHA-256 byte-identity of all 49 pairs afterward — via two commands,
`npm run sync:vocabulary-levels` (write) and `npm run check:vocabulary-levels-sync`
(read-only check, previously run by `prebuild` and `test:generated-data-ownership`).
Both commands and the script itself were deleted in Phase 6, once the mirror
they maintained had no remaining consumer.

## `public/seo/level-browse-preview/` — resolved obsolete duplicate

`src/data/seo/vocabularyLevels/level-browse-preview/` is authoritative. It contains 42
committed JSON files, one for every supported target-language x CEFR-level
combination. No generator is currently known, so manual content preservation
is required until a generator exists. The active loader is
`src/data/seo/vocabularyLevels/levelBrowseWords.ts`, which uses the lazy G9
`import.meta.glob("./level-browse-preview/*.json")` source-tree import.

The former `public/seo/level-browse-preview/` tree was removed on
2026-07-15. It was byte-identical to the source tree, but no client, SSR,
prerender, Worker, sitemap, service-worker, build-script, or documented
public API consumer required the public URL. Direct static reachability was
only an artifact of Vite copying `public/**` into build output; there is no
direct public fetch contract for these files.

## Worker generated directories are Cloudflare remote-build outputs

`workers/word-ssr/config/wrangler.production.toml` (the `fluentstellar-production`
config) points `main` at `worker-dist-full/index.full.js` and `[assets]
directory` at `assets-full` — both fully gitignored and never stored in Git.
As of the Cloudflare Workers Builds connection made after 2026-07-14, these
directories are regenerated during Cloudflare's remote build
(`npm run build && npm run build:word-worker:full`) before every deploy, not
produced by a developer's local machine. `.github/workflows/` does not exist
in this repo because the build/deploy pipeline runs inside Cloudflare's own
Workers Builds infrastructure, not GitHub Actions.

The residual risk is **build-pipeline coupling, not missing generation**: a
deploy that ran without the full `npm run build:word-worker:full` step would
fail outright or ship stale/missing `assets-full/`/`worker-dist-full/`
content, so correctness depends on Cloudflare's configured build command
continuing to match `docs/deployment.md`. As of this audit, that build
command is confirmed connected and running correctly. This document does not
change or reconfigure that Cloudflare setting — see `docs/deployment.md` for
the authoritative deployment-flow description, which has been updated to
match.

Previously, several files in this pipeline (including
`workers/word-ssr/generation/generate-full-corpus.mjs` and
`workers/word-ssr/build/build-worker-full.mjs`) carried header comments
calling this pipeline "STAGING-ONLY," even though `wrangler.production.toml`
uses the identical `assets-full`/`worker-dist-full` outputs for production.
That terminology was corrected (Phase 12A, comments only, no behavior
change) across the production-path build, generation, runtime, and
bundle-size-test files; the manual diagnostics under
`workers/word-ssr/diagnostics/` were left as-is, since their staging/local
context is accurate.

## Regeneration commands

| Directory | Command |
|---|---|
| `src/data/seo/wordPages/word-hub-pages/`, `src/data/seo/wordPages/word-browse-shards/`, `src/data/seo/verbLists/common100Verbs/verbListLookup/` | `npm run generate:word-hub-data` |
| `public/sitemaps/` | `npm run sitemap` |
| `workers/word-ssr/data/full-corpus/`, `assets-full/`, `worker-dist-full/`, `workers/word-ssr/data/client-assets.full.json`, `workers/word-ssr/data/publish-manifest.json` | `npm run build:word-worker:full` |
| `dist/`, `server-build/` | `npm run build` |
| `workers/word-ssr/data/full-corpus-census.json` | `node workers/word-ssr/diagnostics/census-full-corpus.mjs` (manual, no package script) |
| `workers/word-ssr/data/sharding-measurement.json` | `node workers/word-ssr/diagnostics/measure-shard-formats.mjs` (manual, no package script; requires `data/full-corpus/` already generated) |
| `src/data/seo/vocabularyLevels/` content, `src/data/seo/vocabularyLevels/level-browse-preview/`, `src/data/seo/levelTests/seo_level_test_content.json`, `src/data/seo/vocabularyLevels/seo-cefr-content.json` | none — hand-maintained, no generator |

## Manual-edit policy

- **Allowed and expected:** `src/data/seo/vocabularyLevels/`,
  `src/data/seo/vocabularyLevels/level-browse-preview/`,
  `src/data/seo/levelTests/seo_level_test_content.json`,
  `src/data/seo/vocabularyLevels/seo-cefr-content.json` (no generator exists for any of these).
- **Not allowed — will be overwritten:** `src/data/seo/wordPages/word-hub-pages/`,
  `src/data/seo/wordPages/word-browse-shards/`, `src/data/seo/verbLists/common100Verbs/verbListLookup/`,
  `public/sitemaps/`, `workers/word-ssr/data/client-assets.full.json`,
  `workers/word-ssr/data/publish-manifest.json`,
  `workers/word-ssr/data/full-corpus-census.json`,
  `workers/word-ssr/data/sharding-measurement.json`, and everything under
  `workers/word-ssr/data/full-corpus/`, `assets-full/`, `worker-dist-full/`,
  `dist/`, `server-build/`.
  The four tracked `workers/word-ssr/data/*.json` files listed above are
  generated snapshots (build bookkeeping and diagnostic reports), distinct
  both from the gitignored `full-corpus/`/`assets-full/`/`worker-dist-full/`
  build output in the same area and from hand-maintained source data
  elsewhere in the repo (e.g. `src/data/vocabulary/`,
  `src/data/seo/vocabularyLevels/`) — no automated freshness check currently
  runs against any of the four.

## Drift detection

- `npm run test:import-boundaries` — asserts the exact match-set/eager-lazy
  contract for every `import.meta.glob` boundary (G1–G9) documented in
  `docs/import-boundaries.md`.
- `npm run test:generated-data-ownership` — asserts the removed
  `public/vocabularyLevels/` mirror, the dead `public/vocabularyLevels/index.ts`,
  the sync script, and its package scripts cannot silently reappear; the
  removed `public/seo/level-browse-preview/` mirror cannot silently reappear;
  no raw TypeScript exists under `public/`; `src/data/seo/vocabularyLevels/`
  matches the expected UI-language × target-language matrix with valid,
  non-duplicate JSON; the listed generated source directories exist and are
  committed; and the listed Worker build-output directories stay gitignored
  and untracked.
- `npm run test:level-browse-preview-completeness` (via
  `test:level-browse-preview`) — asserts the exact 42-key match set for
  `src/data/seo/vocabularyLevels/level-browse-preview/*.json`.
- `workers/word-ssr/tests/test-worker-bundle-size.mjs` — asserts
  `word-browse-shards`' heavy export never reaches the Worker bundle.

## Safe-move rules

Moving any directory in the matrix above requires updating its producer
script (if any) and every consumer glob/import/fetch path in the **same**
change, then re-running `npm run test:import-boundaries` and
`npm run test:generated-data-ownership` before anything else. If a `public/`
mirror exists for the data being moved, update or intentionally retire the
mirror in the same change — do not leave a stale duplicate behind. See
`docs/import-boundaries.md`'s "Safe move checklist" for the full procedure.

## Deletion rules

- Never delete a directory in this matrix without first proving, via source
  search **and** built-output inspection, that no client/SSR/Worker/public
  consumer depends on it (see the `public/vocabularyLevels/` finding above
  for why source search alone is insufficient — the fetch-by-URL consumer
  would not show up as an "import").
- Generated build-output directories (`dist/`, `server-build/`,
  `workers/word-ssr/assets-full/`, `worker-dist-full/`, `data/full-corpus/`)
  are always safe to delete locally — they regenerate from their producer
  command — but must never be committed.
