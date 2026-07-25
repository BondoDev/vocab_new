# `scripts/` — build, generation, verification, and repository tooling

## Purpose

This folder owns repository-side executable tooling and script-owned
workflow data: everything that operates *on* the repository or *on* its
build/deploy pipeline, rather than code that runs as part of the shipped
application. It answers *"what repository operation, verification,
generation, or maintenance workflow does this file implement?"*

File extension does not determine ownership. `scripts/` contains
`.mjs`, `.json`, and one `.py` file; the responsibility of the code —
not its extension — decides where it belongs.

Distinguish `scripts/` from:

- **`src/`** — the application/runtime implementation that ships to
  browsers and gets server-rendered. `scripts/` may *read* or *compile*
  `src/` modules for generation and verification, but never the reverse.
- **`workers/`** — the Cloudflare Worker's own runtime implementation.
  `scripts/` may build, package, or locally verify Worker artifacts, but
  does not contain Worker request-handling logic itself.
- **`server/`** — Node-side SSR runtime code consumed by the dev/prod
  server path. `scripts/` may exercise it for tests, but does not
  implement it.
- **`docs/`** — project-wide prose documentation (architecture,
  deployment, ownership audits). `scripts/` contains code and
  script-owned data, not general narrative documentation.
- **`public/`, `dist/`, `server-build/`** — generated production
  assets. `scripts/` contains the tooling that *produces or verifies*
  these outputs, not the outputs themselves.

## What belongs here

- Production build and prerender entry points (`build/`)
- Generated-data synchronization and generation scripts (`generation/`)
- Architecture guards and focused regression tests (`tests/`)
- SEO baseline capture/comparison tooling and its fixtures
  (`seo-baseline/`)
- Reusable script-side helpers imported by multiple scripts (`lib/`)
- Manual operational tools that interact with external or production
  systems (`operations/`)
- Performance benchmarks (`word-render-benchmark/`)
- Script-owned tracked workflow data consumed by generation/build
  scripts, such as the sitemap lastmod ledger (`data/`)
- Script-owned local operational state that a tool reads/writes across
  runs, kept gitignored rather than committed (`operations/state/`)
- Human-maintained architectural record/snapshot files that document
  import-boundary or baseline expectations for review, even though no
  script parses them (`import-boundaries/`, `seo-baseline/current/`)

## What does not belong here

- React/application runtime code — belongs in `src/`
- Reusable browser/runtime business logic consumed by the shipped app —
  belongs in `src/`
- Worker implementation code — belongs in `workers/`
- Server SSR implementation code — belongs in `server/`
- Project-wide prose documentation whose owner is `docs/` — a script's
  own usage comment stays with the script, but architecture narratives,
  audits, and ownership write-ups belong in `docs/`
- Generated production assets (`dist/`, `server-build/`, built Worker
  bundles) — `scripts/` produces and verifies them, it does not store
  them
- Temporary ad hoc files with no continuing operational purpose
- One-off debugging scripts kept "just in case" with no current
  build, generation, test, or operational role
- **Files placed directly under `scripts/`** — every file must live in
  a named subfolder. There is no root-level catch-all.

**Decision rule:** if a file's job is to operate on this repository, its
build pipeline, its generated data, or its Worker/SSR artifacts — and it
is not itself the thing being shipped to users — it belongs somewhere
under `scripts/`. If it *is* the thing being shipped (or a runtime
dependency of it), it belongs in `src/`, `workers/`, or `server/`
instead.

## Internal structure

```
scripts/
  build/                  production build, prerender, and package-verification entry points
  data/                   script-owned tracked workflow data
  generation/             data/sitemap generators and synchronizers
  import-boundaries/
    current/              human-maintained import-boundary record
  lib/                    reusable helpers (not entry points)
  operations/             manual operational tools
    state/                gitignored tool-owned local state
  seo-baseline/           SEO snapshot capture/compare tooling
    current/              checked-in reference snapshots
      routes/
  tests/                  regression tests and architecture guards, by category
    account/
    architecture/
    practice/
    prerender/
    routing/
    runtime/
    seo/
    ssr/
    worker/
  word-render-benchmark/  performance benchmarking tools
```

- **`build/`** — entry points invoked by `npm run build` and its Worker
  counterpart: prerendering the SSG output, cleaning stray build
  artifacts, packaging the full-corpus Worker bundle, and verifying the
  Node SSR package is complete. These are pipeline steps, not tests,
  even though one of them (`verify-word-ssr-package.mjs`) is also
  wired to a `test:*` npm script.
- **`data/`** — tracked JSON data that generation scripts read and
  write under an explicit, owner-controlled policy (currently the
  sitemap `<lastmod>` ledger). This is script-owned workflow data, not
  application/domain data — it never ships to the browser.
- **`generation/`** — scripts that generate or synchronize tracked
  project data: the sitemap, word-hub/browse-shard/verb-list data, and
  (as the one non-Node exception) brand-asset regeneration from a
  source master image. The former vocabulary-level public-mirror
  synchronizer was deleted once its mirror (`public/vocabularyLevels/`)
  had no remaining consumer — see [`docs/generated-data.md`](../docs/generated-data.md).
- **`import-boundaries/current/`** — a human-maintained JSON record
  documenting `import.meta.glob` patterns and other path-sensitive
  loaders across the repository, used as a review reference alongside
  `docs/import-boundaries.md`. It is not read by any script.
- **`lib/`** — helpers imported by multiple other scripts (the shared
  TypeScript-compile helper, route-manifest/verb-list loaders, the
  lastmod-ledger helper). Nothing under `lib/` is invoked directly by
  `npm run` or `node scripts/...` — it exists to be imported.
- **`operations/`** — manual tools that talk to external/production
  systems on an operator's request (currently: submitting URLs to the
  Google Indexing API). Never wired into `prebuild`, `build`, or any
  automated pipeline.
- **`operations/state/`** — local, gitignored state a manual operations
  tool reads and writes across invocations (e.g. indexing progress).
  This is tool-owned runtime state, not source data, and is never
  committed.
- **`seo-baseline/`** — the SEO snapshot capture/compare workflow: a
  shared fixture registry, a capture tool, and a comparison tool, used
  to freeze and diff SEO-observable output across code or rendering
  changes.
- **`seo-baseline/current/`** — checked-in reference artifacts (a
  capture manifest, a performance snapshot, and route-level SEO
  snapshots) produced by the capture tool and committed as the current
  baseline for comparison. These are generated snapshots, not source
  code — treat their contents as frozen output, not something to
  hand-edit.
- **`word-render-benchmark/`** — read-only performance benchmarking for
  the word-page render pipeline (and a Worker cold-start variant). These
  scripts assert nothing and never fail the process; they exist to
  produce comparable timing numbers, not to gate correctness.
- **`tests/`** — regression tests and architecture guards, each a
  deterministic, dependency-free Node script that asserts one contract
  and exits non-zero on failure. Divided into categories by what they
  guard, not by which npm script happens to invoke them:

  - **`account/`** — signed-in-profile / account-state language sync
    contracts.
  - **`architecture/`** — repository-wide contracts and source-structure
    guards: import boundaries, generated-data ownership, dependency
    ownership, UI-component ownership, legacy/POC removal, credential
    and agent-folder hygiene, and the self-check that keeps
    `docs/architecture.md` wired to reality. These guard the repository
    itself, not a specific feature or page family.
  - **`practice/`** — practice-route and exercise-identifier contracts
    specific to the practice/exercise feature.
  - **`prerender/`** — parity between build-time prerendered output and
    a fresh request-time `render()` call, for the same route.
  - **`routing/`** — route resolution, route-manifest/pagination
    contracts, interactive-route/profile-shell wiring, and the
    pre-hydration `<html lang>` init script.
  - **`runtime/`** — hydration-payload regression coverage (an
    automated test), plus manual browser-runtime validators that drive
    a real headless browser against a live word page. The validators
    are diagnostics an operator runs by hand, not part of any automated
    suite — see [Entry points, helpers, and data](#entry-points-helpers-and-data).
  - **`seo/`** — metadata, JSON-LD/schema, canonical/hreflang, sitemap,
    and other SEO-output regression checks against built (`dist/`) or
    source content.
  - **`ssr/`** — server-rendering HTTP behavior: status codes, headers,
    redirects, and response shape for the on-demand SSR request path.
  - **`worker/`** — Worker configuration and policy (crawler/robots
    policy, runtime config, bundle size), plus a manual local
    verification tool that exercises a built Worker artifact without
    deploying it. As with `runtime/`, the manual verifier is not an
    automated test — see the same section below.

## Entry points, helpers, and data

Files under `scripts/` fall into distinct roles:

- **Executable entry points** — scripts meant to be run directly
  (`node scripts/<path>/<file>.mjs`), whether from an npm script, the
  build pipeline, or by hand.
- **Imported helpers** — files that export functions for other scripts
  to use and are never run directly (everything under `lib/`, plus
  `seo-baseline/fixtures.mjs` and `word-render-benchmark/wordRenderBreakdown.mjs`).
- **npm commands** — the subset of entry points exposed through
  `package.json` for build, generation, CI-style, or routine developer
  use.
- **Manual tools without npm commands** — entry points that exist and
  are run deliberately by an operator, but are intentionally *not*
  wired into `package.json` because routine/automated execution is
  wrong for them: the two browser-runtime validators
  (`tests/runtime/validate-worker-browser.mjs`,
  `tests/runtime/validate-staging-browser.mjs`) and the local
  production-Worker verifier (`tests/worker/verify-production-worker-local.mjs`).
  Their ownership (runtime/Worker validation) is why they live under
  `tests/runtime/` and `tests/worker/` rather than a separate manual-only
  folder — but they are not automated tests, and nothing should assume
  they run in CI.
- **Tracked baseline/data files** — checked-in JSON that is either
  generated-and-committed output for review (`seo-baseline/current/`,
  `import-boundaries/current/globs.json`) or owner-controlled workflow
  data a generator reads (`data/sitemap-lastmod-ledger.json`).
- **Gitignored operational state** — local state a manual tool persists
  across runs (`operations/state/`). Never committed, never a source of
  truth for anything else.

**Absence of an npm command does not imply a file is obsolete.** A
shared helper, a manual validator, or a benchmark sub-entry point can be
fully live and load-bearing without ever appearing in `package.json`.

**`scripts/lib/` should contain importable helpers only** — no file
under `lib/` should be an operational entry point invoked directly by an
npm script or a human. If a helper grows a "run me directly" mode, that
mode belongs in the folder matching what it *does* (a test, a
generator, a build step), not in `lib/`.

## Dependency direction

- Scripts may import application/domain modules from `src/` (typically
  compiled on the fly via `scripts/lib/compileTs.mjs`) when needed for
  generation or verification. This is expected and common.
- `src/`, `workers/`, and `server/` must never import anything from
  `scripts/` as a runtime dependency — `scripts/` is tooling, not a
  shipped dependency.
- `scripts/tests/**` and other entry-point folders may import
  `scripts/lib/` helpers.
- `scripts/lib/` must not depend on any individual test or entry-point
  file — helpers stay generic and are consumed downward, never upward.
- Tracked data/snapshot files (`data/`, `import-boundaries/current/`,
  `seo-baseline/current/`) are consumed *by* generators and review
  workflows; they must never themselves "import" or invoke executable
  tooling.
- Manual validators (`tests/runtime/validate-*`,
  `tests/worker/verify-production-worker-local.mjs`) may import sibling
  validation helpers (e.g. `validate-staging-browser.mjs` importing
  `validate-worker-browser.mjs` for its side effects) but should stay
  outside routine build/test composites unless a deliberate, separate
  decision promotes one to automated status.

These directions currently hold throughout `scripts/` but are, like the
equivalent rule in [`src/seo/README.md`](../src/seo/README.md), **not
enforced by an automated lint/boundary rule** unless stated otherwise
above (`test:import-boundaries` enforces the `import.meta.glob`-specific
contracts recorded in `import-boundaries/current/globs.json`'s
counterpart doc, not this general dependency direction). Treat the rest
as conventions to preserve by inspection and review.

## npm command and execution policy

- Routine entry points — anything that's part of the production build,
  a tracked data generator, or a regression/architecture test meant to
  run automatically — should normally be exposed through `package.json`
  so they're discoverable and runnable the same way every time.
- Manual diagnostics (browser validators, the local Worker verifier, the
  operations indexing tool) do not need an npm command merely to exist.
  Their value is in being run deliberately, by hand, with explicit
  inputs — adding them to `package.json` would not make them safer to
  run routinely.
- Production build and generation steps invoke scripts by their stable
  nested path (e.g. `node scripts/build/prerender.mjs`), not by a
  root-level shortcut — there is no root-level `scripts/` shortcut to
  use.
- Composite npm commands (`test:architecture-guards`, `test:seo-output`,
  `test:feature-contracts`, `test:word-worker:production-safety`,
  `prebuild`) should invoke other **named npm scripts**
  (`npm run -s test:foo`) rather than duplicating a `node scripts/...`
  path inline, so a script's location can change without touching every
  composite that depends on it. `test:feature-contracts` follows this
  rule out of necessity, not just convention: its three members
  (`test:practice-route-sync`, `test:account-language-sync`,
  `test:exercise-id-contract`) each require the `--experimental-strip-types`
  Node flag baked into their own script string, and calling them by
  named script (rather than inlining their `node` command) is what
  preserves that flag.
- Adding a script to `prebuild`, `build`, or any CI-style composite is
  an architectural decision — it changes what runs on every build or
  guard invocation — not a convenience edit. Treat it with the same
  care as changing the composite's ordering.

## Naming conventions

- `test-*.mjs` — regression tests and architecture guards under
  `tests/**`.
- `generate-*.mjs` / `sync-*.mjs` — generation and synchronization
  scripts under `generation/`.
- `validate-*` / `verify-*` — validation and verification tools,
  whether automated (`build/verify-word-ssr-package.mjs`) or manual
  (`tests/runtime/validate-worker-browser.mjs`,
  `tests/worker/verify-production-worker-local.mjs`).
- `benchmark-*` — benchmark entry points under `word-render-benchmark/`.
- Descriptive, verb-first or noun-phrase names for helpers under `lib/`
  (`compileTs.mjs`, `load-word-route-manifest.mjs`,
  `sitemap-lastmod.mjs`) — no `test-`/`generate-`/`validate-` prefix,
  since they are not entry points.

Follow the existing convention for a file's role; don't invent a new
prefix where one of the above already fits.

## Examples

| File | Why it belongs there |
|---|---|
| `build/prerender.mjs` | Build-time entry point that SSGs every prerender route into `dist/` — part of the production build pipeline |
| `generation/generate-sitemap.mjs` | Generates tracked sitemap output from vocabulary/route data — a generation entry point |
| `tests/architecture/test-import-boundaries.mjs` | Guards a repository-wide contract (`import.meta.glob` shape), not a single feature — an architecture guard |
| `tests/seo/test-seo-core-routes.mjs` | Regression-checks robots/route-policy SEO output — an SEO test |
| `tests/routing/test-word-browse-pagination.mjs` | Freezes route-resolution/pagination behavior for word browse pages — a routing test |
| `tests/runtime/test-word-hydration.mjs` | Checks the hydration-payload shape sent to the browser — a runtime/hydration test |
| `tests/ssr/test-word-ssr-http.mjs` | Exercises the on-demand SSR HTTP request path end-to-end — an SSR test |
| `tests/prerender/test-prerender-parity.mjs` | Compares prerendered output against a fresh runtime `render()` call — a prerender-parity test |
| `tests/worker/test-word-worker-runtime.mjs` | Guards Worker runtime configuration behavior — a Worker test |
| `lib/compileTs.mjs` | Exports a `.ts`→CommonJS compile helper imported by many scripts — a shared helper, not an entry point |
| `operations/google-index.mjs` | Manual, operator-run tool that calls an external API (Google Indexing) — operational tooling |
| `seo-baseline/capture.mjs` | Captures a comparable SEO snapshot for later diffing — baseline tooling |
| `word-render-benchmark/benchmark-word-render.mjs` | Measures render-pipeline timing; asserts nothing, never fails — a benchmark |
| `data/sitemap-lastmod-ledger.json` | Tracked, owner-controlled data a generator reads to resolve `<lastmod>` values — script-owned workflow data |

## Checklist for adding a new script

1. Is this persistent repository tooling, or only temporary/ad hoc
   debugging? If temporary, it probably doesn't belong under version
   control at all.
2. Is it build, generation, test, operation, benchmark, helper, or
   workflow data? Pick the folder that matches that role.
3. Which existing owner folder matches its primary responsibility —
   `build/`, `generation/`, `lib/`, `operations/`, `seo-baseline/`,
   `word-render-benchmark/`, or `tests/`?
4. If it's a test, which `tests/<category>/` owns the behavior being
   guarded — not which feature happens to trigger the bug?
5. Does it need a `package.json` command? (Routine/automated use: yes.
   Manual diagnostic: not necessarily.)
6. Should it be part of a composite command (`test:architecture-guards`,
   `test:seo-output`, `test:feature-contracts`, `prebuild`, `build`)?
   Treat this as an architectural decision, not a convenience edit.
7. Is it safe for routine CI/build execution, or does it need a real
   browser, a live/staging URL, or a built Worker artifact that makes
   it manual-only?
8. Does it generate tracked output, temporary/scratch output, or
   gitignored operational state? Make sure the destination matches that
   classification.
9. Are its repository-root calculations and relative imports correct
   for its actual folder depth — independent of where a *future* move
   might place it?
10. Does any documentation (`docs/architecture.md`,
    `docs/import-boundaries.md`, `docs/generated-data.md`) or
    architecture guard need updating to reflect the new file?
11. Is it being placed directly under `scripts/`? If yes, stop — choose
    a subfolder instead. There is no root-level catch-all.

## See also

- [`../docs/architecture.md`](../docs/architecture.md) — full repository
  architecture reference, including the build pipeline and the complete
  `test:architecture-guards` chain
- [`../docs/generated-data.md`](../docs/generated-data.md) — ownership
  and regeneration policy for the tracked/generated data these scripts
  produce and consume
- [`../docs/import-boundaries.md`](../docs/import-boundaries.md) — the
  prose counterpart to `import-boundaries/current/globs.json`
