# Generated-data ownership

Audited 2026-07-15, source commit `80e52fe4`. Companion to
[`docs/import-boundaries.md`](import-boundaries.md) (which guards the *shape*
`import.meta.glob` and related loaders depend on). This document instead
answers, for every generated or `src`/`public`-duplicated data directory in
the repo: who owns it, who writes it, who reads it, and what happens if it's
moved or deleted.

Guard script: `npm run test:generated-data-ownership`
(`scripts/test-generated-data-ownership.mjs`), wired into
`npm run test:architecture-guards`.

## Ownership matrix

| Directory | Classification | Source of truth | Producer | Consumers | Committed? | Risk |
|---|---|---|---|---|---|---|
| `src/data/vocabularyLevels/` | handwritten source | itself | manual (no generator) | client (SSR sync load), SSR (`fs` read), `src/seo/metadata.ts`, `VocabularyLevelPage.tsx`, `scripts/generate-sitemap.mjs` | yes | low |
| `public/vocabularyLevels/*.json` (49 files) | **public runtime asset — required mirror, not a duplicate** | `src/data/vocabularyLevels/` (must stay byte-identical) | `npm run sync:vocabulary-levels` (`scripts/sync-vocabulary-levels.mjs`), run explicitly by the developer | browser `fetch()` from `src/data/vocabularyLevels/index.ts`; ships into `dist/`, `server-build/`, Worker `assets-full/` | yes | low — deterministic sync script plus a read-only `--check` mode wired into `test:generated-data-ownership` |
| ~~`public/vocabularyLevels/index.ts`~~ | *(removed 2026-07-15)* | — | — | none — confirmed dead, no import anywhere | — | resolved |
| `src/data/seo/word-hub-pages/` | generated committed source | `src/data/vocabulary/{lang}/vocabulary.json` | `scripts/generate-word-hub-data.mjs` | client + SSR (`wordHubData.ts`, eager glob G4); not the Worker | yes | low |
| `src/data/seo/word-browse-shards/` | generated committed source | same vocabulary.json | `scripts/generate-word-hub-data.mjs` | client + SSR + **transitively Worker-reachable** (G5); guarded by Worker bundle-size test | yes | medium |
| `src/data/seo/level-browse-preview/` | generated committed source, **no generator exists** | itself (hand-authored/one-time-generated) | none found | client + SSR (`levelBrowseWords.ts`, lazy glob G9) | yes | medium — must be hand-edited until a generator is written |
| ~~`public/seo/level-browse-preview/`~~ | *(removed 2026-07-15; obsolete duplicate)* | `src/data/seo/level-browse-preview/` remains authoritative | manual copy, added in the same historical commit as the `public/vocabularyLevels/` duplication | none found — no fetch, import, glob, sitemap, SSR, Worker, or service-worker consumer required the public URL | no | resolved |
| `src/data/verbListLookup/` | generated committed source | `list_of_100_most_used_verb.json` + vocabulary.json | `scripts/generate-word-hub-data.mjs` | client + SSR (`commonVerbList.ts`, eager glob G6); not the Worker | yes | low |
| `public/sitemaps/` | generated build output (committed) | word route manifest + verb registry + vocabulary data | `scripts/generate-sitemap.mjs` (`npm run sitemap`) | search engines only; test-only in-repo consumers | yes | low |
| `workers/word-ssr/data/full-corpus/` | generated build output | vocabulary + word-route-manifest + slugs | `workers/word-ssr/generate-full-corpus.mjs` (Cloudflare remote build) | `workers/word-ssr/publish-shards.mjs` | **no** (gitignored) | medium — build-pipeline coupling, see remote-build note |
| `workers/word-ssr/assets-full/` | Worker Static Asset directory | `dist/**` + `data/full-corpus/` | `workers/word-ssr/publish-shards.mjs` (Cloudflare remote build) | **Worker runtime** — bound in both `wrangler.full.toml` and `wrangler.production.toml` | **no** (gitignored) | medium — build-pipeline coupling, see remote-build note |
| `workers/word-ssr/worker-dist-full/` | generated build output | `workers/word-ssr/src/index.full.ts` | `vite build --ssr` step of `build-worker-full.mjs` (Cloudflare remote build) | **Worker runtime** — `main` field in both `wrangler.full.toml` and `wrangler.production.toml` | **no** (gitignored) | medium — build-pipeline coupling, see remote-build note |
| `dist/` | generated build output | `vite build` | `npm run build` | intermediate; feeds `server-build/` cleanup and `assets-full/` publish | no (gitignored) | low, ephemeral |
| `server-build/` | generated build output | `vite build --ssr` | `npm run build` | `scripts/prerender.mjs`, `scripts/verify-word-ssr-package.mjs` | no (gitignored) | low, ephemeral |

## `src/data/vocabularyLevels/` vs `public/vocabularyLevels/` — resolved finding

**`src/data/vocabularyLevels/` is authoritative.** It is the only copy any
application module imports (`src/seo/metadata.ts`, `VocabularyLevelPage.tsx`,
dev preview tooling), the only copy `scripts/generate-sitemap.mjs` reads to
enumerate sitemap routes, and the only copy the SSR sync loader reads from
disk (`path.resolve(process.cwd(), "src", "data", "vocabularyLevels", ...)`).

**`public/vocabularyLevels/*.json` is a required runtime mirror, not dead
duplication.** `src/data/vocabularyLevels/index.ts`'s client-side loader
(`fetchVocabularyFile`) performs `fetch(`/vocabularyLevels/${ui}/${target}.json`)`
from the browser whenever `VocabularyLevelPage.tsx` renders without
prerendered/override content (client-side navigation between vocabulary-level
pages after initial hydration). That URL is only servable because Vite's
`publicDir` default copies `public/vocabularyLevels/` into `dist/` (and, via
the SSR build, into `server-build/`), and from there
`workers/word-ssr/publish-shards.mjs` copies it into the Worker's
`assets-full/`. **Deleting `public/vocabularyLevels/*.json` would break
production client-side rendering of vocabulary-level pages.** All 49 JSON
files were verified byte-identical to `src/data/vocabularyLevels/` (SHA-256,
per-file); this identity is now guarded by `npm run test:import-boundaries`.

**`public/vocabularyLevels/index.ts` (226 lines) was dead and has been
removed.** It was a self-contained loader module (explicit `import()`
registry + `new URL(..., import.meta.url)` + Node `fs` fallback) added in the
same commit (`06691d18`, "Load SEO vocabulary JSON files on demand") that
introduced the `fetch()`-based client loading strategy in
`src/data/vocabularyLevels/index.ts`. Nothing ever imported it — Vite's
`publicDir` mechanism only needed the JSON files to exist at a stable URL,
not the accompanying `.ts` file, which appears to have been an incidental
byproduct of copying the whole source directory into `public/` rather than a
deliberate addition. Removing it also made
`scripts/cleanup-word-build-artifacts.mjs`'s two `fs.rm` calls (which force-deleted
the copied `dist/vocabularyLevels/index.ts` and
`server-build/vocabularyLevels/index.ts` post-build) obsolete; those calls
have been removed from that script.

**Synchronization is deterministic but explicit, not automatic (2026-07-15
follow-up).** `scripts/sync-vocabulary-levels.mjs` derives the expected
7×7 UI-language × target-language matrix from the same authoritative
registry (`SUPPORTED_UI_LANGUAGES` / `SUPPORTED_TARGET_LANGUAGES` in
`src/data/seo/slugs.ts`) already used by `test:generated-data-ownership`,
validates every source file (JSON parses, no unexpected/hidden/`.ts`/`.js`
files, no unexpected nested directories, no duplicate logical key), then
copies bytes exactly into `public/vocabularyLevels/`, removes stale public
files/directories that no longer exist in source, and verifies SHA-256
byte-identity of all 49 pairs afterward. It never touches
`src/data/vocabularyLevels/`.

Two commands:

- `npm run sync:vocabulary-levels` — writes `public/vocabularyLevels/` to
  match `src/data/vocabularyLevels/` (copies missing/changed files, removes
  stale ones). Idempotent — running it twice with no source changes performs
  zero writes.
- `npm run check:vocabulary-levels-sync` — the same validation and diff,
  read-only, exits non-zero on any drift. This is what
  `npm run prebuild` and `npm run test:generated-data-ownership` run; neither
  mutates tracked files.

**Build policy: explicit synchronization plus prebuild verification, not
automatic prebuild mutation.** Both trees are committed to git, so a build
step that silently rewrote `public/vocabularyLevels/*.json` would produce
uncommitted tracked changes a developer (or Cloudflare's remote build) could
miss. Instead, `prebuild` runs `check:vocabulary-levels-sync` first (before
`generate:word-hub-data` and `sitemap`) and fails loudly if the mirror has
drifted, so a stale public mirror can never be deployed silently. Developers
who edit `src/data/vocabularyLevels/` must run
`npm run sync:vocabulary-levels` and commit the resulting
`public/vocabularyLevels/*.json` changes in the same change as the source
edit — the same "update both" requirement as before, just with a script
instead of a manual copy.

## `public/seo/level-browse-preview/` — resolved obsolete duplicate

`src/data/seo/level-browse-preview/` is authoritative. It contains 42
committed JSON files, one for every supported target-language x CEFR-level
combination. No generator is currently known, so manual content preservation
is required until a generator exists. The active loader is
`src/data/seo/levelBrowseWords.ts`, which uses the lazy G9
`import.meta.glob("./level-browse-preview/*.json")` source-tree import.

The former `public/seo/level-browse-preview/` tree was removed on
2026-07-15. It was byte-identical to the source tree, but no client, SSR,
prerender, Worker, sitemap, service-worker, build-script, or documented
public API consumer required the public URL. Direct static reachability was
only an artifact of Vite copying `public/**` into build output; there is no
direct public fetch contract for these files.

## Worker generated directories are Cloudflare remote-build outputs

`workers/word-ssr/wrangler.production.toml` (the `fluentstellar-production`
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

Separately, `workers/word-ssr/generate-full-corpus.mjs` and
`workers/word-ssr/build-worker-full.mjs` both carry header comments calling
this pipeline "STAGING-ONLY," but `wrangler.production.toml` uses the
identical `assets-full`/`worker-dist-full` outputs for production. That
comment appears stale relative to current usage — also flagged for
visibility, not changed here.

## Regeneration commands

| Directory | Command |
|---|---|
| `src/data/seo/word-hub-pages/`, `src/data/seo/word-browse-shards/`, `src/data/verbListLookup/` | `npm run generate:word-hub-data` |
| `public/sitemaps/` | `npm run sitemap` |
| `workers/word-ssr/data/full-corpus/`, `assets-full/`, `worker-dist-full/` | `npm run build:word-worker:full` |
| `dist/`, `server-build/` | `npm run build` |
| `src/data/vocabularyLevels/` content, `src/data/seo/level-browse-preview/` | none — hand-maintained, no generator |
| `public/vocabularyLevels/*.json` (mirror only, from source content) | `npm run sync:vocabulary-levels` (`scripts/sync-vocabulary-levels.mjs`) |

## Manual-edit policy

- **Allowed and expected:** `src/data/vocabularyLevels/`,
  `src/data/seo/level-browse-preview/` (no generator exists for either).
- **Allowed but must be mirrored:** `public/vocabularyLevels/*.json` — after
  editing `src/data/vocabularyLevels/`, run `npm run sync:vocabulary-levels`
  and commit both trees together, or `npm run prebuild` (via
  `check:vocabulary-levels-sync`) and `test:import-boundaries` will fail.
  Never hand-edit files under `public/vocabularyLevels/` directly — the sync
  script treats them as a disposable mirror and will overwrite or remove them.
- **Not allowed — will be overwritten:** `src/data/seo/word-hub-pages/`,
  `src/data/seo/word-browse-shards/`, `src/data/verbListLookup/`,
  `public/sitemaps/`, and everything under `workers/word-ssr/data/full-corpus/`,
  `assets-full/`, `worker-dist-full/`, `dist/`, `server-build/`.

## Drift detection

- `npm run check:vocabulary-levels-sync` — read-only; asserts
  `public/vocabularyLevels/*.json` is byte-identical to and has the same
  49-file matrix as `src/data/vocabularyLevels/*.json`. Runs first in
  `npm run prebuild`, before `generate:word-hub-data` and `sitemap`, so a
  stale public mirror fails the build loudly instead of deploying silently.
- `npm run test:import-boundaries` — asserts `public/vocabularyLevels/*.json`
  stays byte-identical to `src/data/vocabularyLevels/*.json`, and asserts the
  exact match-set/eager-lazy contract for every `import.meta.glob` boundary
  (G1–G9) documented in `docs/import-boundaries.md`.
- `npm run test:generated-data-ownership` — asserts the dead
  `public/vocabularyLevels/index.ts` cannot silently reappear, the removed
  `public/seo/level-browse-preview/` mirror cannot silently reappear, no raw
  TypeScript exists under `public/`, `src/data/vocabularyLevels/` matches the
  expected UI-language × target-language matrix with valid, non-duplicate
  JSON, `scripts/sync-vocabulary-levels.mjs` exists and its `--check` mode
  passes, the `sync:vocabulary-levels`/`check:vocabulary-levels-sync` package
  scripts are wired up, the listed generated source directories exist and are
  committed, and the listed Worker build-output directories stay gitignored
  and untracked.
- `npm run test:level-browse-preview-completeness` (via
  `test:level-browse-preview`) — asserts the exact 42-key match set for
  `src/data/seo/level-browse-preview/*.json`.
- `workers/word-ssr/test-worker-bundle-size.mjs` — asserts
  `word-browse-shards`' heavy export never reaches the Worker bundle.

## Safe-move rules

Moving any directory in the matrix above requires updating its producer
script (if any) and every consumer glob/import/fetch path in the **same**
change, then re-running `npm run test:import-boundaries` and
`npm run test:generated-data-ownership` before anything else. If a `public/`
mirror exists for the data being moved (as it does for `vocabularyLevels/`),
update or intentionally retire the mirror in the same change — do not leave
a stale duplicate behind. See `docs/import-boundaries.md`'s "Safe move
checklist" for the full procedure.

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
