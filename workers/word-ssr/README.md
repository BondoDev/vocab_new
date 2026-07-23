# `workers/word-ssr/` — Cloudflare word-page Worker ownership

## Purpose

This folder owns the Cloudflare Worker system that renders individual word
SEO pages at request time — the Worker's runtime source, build
orchestration, generated-data pipeline, deployment configuration,
diagnostics, tests, and Worker-specific documentation all live here as one
unit.

Word pages are served through Worker SSR, not build-time prerendering,
because their scale (one page per vocabulary word × UI language) makes full
prerendering impractical. For the full repository architecture — how this
Worker fits alongside prerendering, routing, and SEO rendering — see
[`docs/architecture.md`](../../docs/architecture.md). This document does not
repeat that context; it only covers ownership and placement within this
folder.

## What belongs here

- The deployed Worker runtime entry point and its helpers
- Worker-specific Vite build configuration
- Wrangler configuration for durable, supported deployment or
  local-preview targets
- Scripts that generate or publish Worker-owned shards and Static Assets
- Worker-owned generated manifests and diagnostic snapshots
- Manual Worker diagnostics
- Automated Worker safety tests
- Detailed Worker-local documentation (route ownership, storage design,
  etc.)

## What does not belong here

- General React application code
- Generic SSR handlers used outside this Worker (e.g. `server/word-ssr-*.mjs`,
  which is a separate, generic Node SSR runtime unrelated to this Cloudflare
  Worker despite the similar naming)
- Shared SEO metadata builders (`src/seo/`)
- Source vocabulary datasets (`src/data/vocabulary/`)
- General repository build utilities
- Shared compiler/code-generation helpers with multiple consumers
  (e.g. `scripts/lib/compileTs.mjs`)
- Unrelated Cloudflare scripts
- Generic tests whose primary owner is not the Worker
- Repository-wide documentation

**Decision rule:** a file belongs under `workers/word-ssr/` only when the
Cloudflare word-page Worker is its **primary owner**. Being imported or
executed during the Worker build is not enough — if the file is shared
across other repository systems (application rendering, generic SEO
metadata, build tooling used outside this Worker), it belongs at its
shared location instead, even if this Worker also depends on it.

## Internal structure

### `build/`

Owns Worker build orchestration and Worker-specific bundler configuration
(`build-worker-full.mjs`, `vite.worker.config.mjs`).

New files belong here only when they:

- orchestrate Worker compilation or packaging;
- configure the Worker bundle;
- control the order of Worker build steps.

Do not place shard or data generators here — that's `generation/`.

### `config/`

Owns Wrangler configuration for durable, supported deployment or
local-preview targets.

- `wrangler.production.toml` owns production deployment.
- `wrangler.full.toml` supports staging/local-preview use (local
  `wrangler dev`, and an optional remote `workers.dev` preview if
  explicitly deployed).
- The presence of `wrangler.full.toml` does not prove a remote staging
  Worker is currently deployed — manual Cloudflare verification has
  confirmed only `fluentstellar-production` currently exists.

New files belong here only when they represent a genuine supported
environment. Do not add temporary experiments or one-off local configs.

### `data/`

Owns Worker-generated manifests, tracked snapshots, reports, and the
gitignored full-corpus shard output. Only generated output belongs here.

Do not place:

- source vocabulary JSON;
- hand-maintained application data;
- SEO route source data;
- general repository datasets.

### `diagnostics/`

Owns manual investigative tools: census, measurement, parity comparison,
and local runtime investigation.

A script belongs here when it is manually run and is not an automated
build or deployment gate. If a tool becomes a deterministic automated
regression check wired to a package script, it conceptually belongs in
`tests/` instead.

### `docs/`

Owns detailed Worker-specific documentation too specialized for this root
README (currently `route-ownership.md`). General repository architecture
or deployment documentation stays under the top-level `docs/`.

### `generation/`

Owns build-time scripts that transform repository source data or
top-level build output into Worker-specific shards, manifests, or Static
Assets. Preserve the distinction between:

- **generating** raw full-corpus data (`generate-full-corpus.mjs`);
- **publishing/assembling** deployable Worker assets from that data plus
  the top-level client build (`publish-shards.mjs`).

### `src/`

Owns executable code included in the deployed Worker runtime
(`index.full.ts`, `render-entry.tsx`, `runtime-config.mjs`,
`shard-store.ts`).

New files belong here only when they execute in the Worker's request
lifecycle. Do not place build, generation, diagnostics, or test code
here.

### `tests/`

Owns deterministic automated tests and guards whose primary subject is
the Worker runtime, bundle, configuration, or production safety.

A new test should:

- have a clear pass/fail contract;
- exit non-zero on failure;
- normally be reachable through a root `npm run` command;
- use the existing thin-wrapper pattern under `scripts/tests/worker/`
  where appropriate (the current tests are re-exported by
  `scripts/tests/worker/test-word-worker-runtime.mjs` and
  `scripts/tests/worker/test-word-worker-bundle-size.mjs`).

### Worker root

The root stays documentation-only. The normal root-level file is this
`README.md`. Do not add executable files at the root merely for
convenience when an existing owned subfolder applies.

## Placement guide for new files

| Proposed file or capability | Correct location | Reason |
|---|---|---|
| Runtime request helper used only by the Worker fetch handler | `src/` | Executes inside the deployed Worker |
| New shard generator | `generation/` | Produces Worker-owned build-time data |
| Vite Worker build configuration | `build/` | Controls Worker compilation or packaging |
| Manual response-parity tool | `diagnostics/` | Developer-run investigation, not an automated gate |
| Automated cache-header regression test | `tests/` | Deterministic Worker behavior test |
| Tracked generated census snapshot | `data/` | Generated Worker-owned output |
| New durable Wrangler environment config | `config/` | Supported deployment/local-preview target |
| Detailed storage-backend design note | `docs/` | Worker-specific documentation too detailed for the README |
| Generic SEO metadata builder | Outside this folder, usually `src/seo/` | Shared application SEO behavior |
| Source vocabulary JSON | Outside this folder, under `src/data/vocabulary/` | Repository source data, not Worker output |
| Shared compiler helper | Outside this folder, usually `scripts/lib/` | Multi-consumer repository infrastructure |

A new subfolder may be added only when multiple files share a durable,
clearly named responsibility — not for a single ambiguous helper, and
never to recreate a second or parallel Worker pipeline.

## Production pipeline

```text
npm run build
  ↓
npm run build:word-worker:full
  1. generation/generate-full-corpus.mjs
  2. generation/publish-shards.mjs
  3. Vite SSR bundle of src/index.full.ts
  ↓
workers/word-ssr/assets-full/
workers/word-ssr/worker-dist-full/
  ↓
Cloudflare Workers Builds
  ↓
config/wrangler.production.toml
  ↓
https://www.fluentstellar.com
```

- `npm run build` creates the top-level client and SSR outputs this
  Worker's publish step depends on.
- `generate-full-corpus.mjs` builds the raw shard tree from repository
  vocabulary and route data.
- `publish-shards.mjs` assembles the Worker's Static Assets directory
  from that shard tree plus the top-level client build.
- Vite produces the Worker script bundle.
- Cloudflare Workers Builds runs both `npm` commands remotely on push to
  `master`, and Wrangler deploys using `config/wrangler.production.toml`.

This is the minimal mental model only. Cloudflare setup, WAF, rollback,
route, and domain details are covered in
[`docs/deployment.md`](../../docs/deployment.md) — link there rather than
re-deriving them here.

Manual diagnostics (see [Commands and tooling](#commands-and-tooling))
are intentionally not part of this pipeline — they are not build or
deployment gates.

## Generated data

| Path | Tracked? | Purpose | Manual editing |
|---|---|---|---|
| `data/client-assets.full.json` | Yes | Client-asset manifest consumed by the Worker build/runtime bundle | Never hand-edit |
| `data/publish-manifest.json` | Yes | Incremental-publish checksum ledger | Never hand-edit |
| `data/full-corpus-census.json` | Yes | Diagnostic corpus census snapshot | Never hand-edit |
| `data/sharding-measurement.json` | Yes | Diagnostic sharding measurement snapshot | Never hand-edit |
| `data/full-corpus/` | No, gitignored | Raw generated full-corpus shard tree | Never commit |
| `assets-full/` | No, gitignored | Assembled Worker Static Assets directory | Never commit |
| `worker-dist-full/` | No, gitignored | Compiled Worker bundle | Never commit |

The tracked JSON files under `data/` are generated outputs, not
hand-maintained source files — they are produced by scripts in
`generation/`/`diagnostics/`, not authored directly.

For the authoritative full ownership matrix, producers/consumers, and
regeneration rules, see
[`docs/generated-data.md`](../../docs/generated-data.md).

## Dependency direction

- Worker runtime code may import the application rendering and data
  contracts needed to render word pages.
- Worker generation code may read repository vocabulary and SEO route
  data.
- Worker publishing code may consume top-level build output such as
  `dist/`.
- Shared repository utilities with multiple consumers should remain
  outside `workers/word-ssr/`, even when this Worker is one of their
  consumers.
- Application code must not depend on Worker build, generation,
  diagnostics, tests, or generated-output internals.
- Production runtime must not depend on diagnostics or tests.
- Diagnostics and tests may consume Worker runtime/build artifacts.
- Worker-generated artifacts must not become source-of-truth inputs for
  unrelated application systems.

**Enforcement is uneven — do not assume every rule above is automated:**

- `render-entry.tsx` not importing the client `WordSeoPage` wrapper is
  directly asserted by `tests/test-worker-bundle-size.mjs`.
- Generated output directories staying gitignored/untracked is asserted
  by `test:generated-data-ownership`.
- The vocabulary corpus not reaching the Worker bundle is asserted by
  `tests/test-worker-bundle-size.mjs`'s chunk/size checks.
- Most of the remaining rules above (what generation/publishing code may
  read, that application code stays independent of Worker internals,
  that shared utilities stay outside this folder) are **conventions
  preserved through review, not automated checks.**

`render-entry.tsx`'s interface-data import is a fragile, deep glob
boundary (documented as G1, "high risk") — see
[`docs/import-boundaries.md`](../../docs/import-boundaries.md) for the
full boundary inventory rather than reproducing it here.

## Public Worker routes

Most Worker-intercepted routes are covered in
[`docs/route-ownership.md`](docs/route-ownership.md). One route needs a
standing callout here because its retention status isn't obvious from the
route table alone:

- **`/staging-assets/browse-shard/<language>/<level>.json`**
  (`handleBrowseSearchShardRequest` in `src/index.full.ts`) — a public
  JSON route that exposes the same generated browse-shard data the Worker
  also uses internally for word-page SSR (browse pagination,
  related/discovery word resolution). Current client-side browse search
  uses a separate bundled implementation
  (`src/data/seo/wordPages/word-browse-shards/`, loaded via
  `wordBrowseSearchData.ts`) and does not call this route. No current
  in-repository HTTP consumer of it is known. It is retained pending
  production request-usage evidence — **do not remove or rename it
  without first checking operational traffic and compatibility risk.**
  See [`docs/route-ownership.md`](docs/route-ownership.md) for the full
  route table and detail.

## Commands and tooling

### Supported package commands

- `npm run build:word-worker:full` — the production build: generates the
  full-corpus shard data, publishes Worker Static Assets, and bundles the
  Worker script.
- `npm run test:word-worker:production-safety` — chains the three checks
  below.
- `npm run test:word-worker:runtime` — unit tests for
  `src/runtime-config.mjs`'s production/staging env resolution.
- `npm run test:word-worker:bundle-size` — asserts the compiled Worker
  bundle stays within the gzip budget and contains no vocabulary/staging
  leaks.
- `npm run test:crawler-policy` — asserts `wrangler.production.toml`
  invariants and `robots.txt` sync (not Worker-folder-local, but tightly
  coupled to this Worker's production safety).

### Manual diagnostics and local verification

These have no `npm run` wrapper — they are internal tools, not supported
entry points, and are **not deployment gates**:

- `npx wrangler dev --config workers/word-ssr/config/wrangler.full.toml --local`
  — runs the Worker locally in staging mode for manual verification.
- `node workers/word-ssr/diagnostics/census-full-corpus.mjs` — reports
  corpus size/route statistics.
- `node workers/word-ssr/diagnostics/measure-shard-formats.mjs` —
  compares sharding strategies; requires `data/full-corpus/` to already
  be generated.
- `node workers/word-ssr/diagnostics/run-parity-check.mjs` — compares a
  running Worker against production SSR output; targets a local
  `wrangler dev` instance (`http://127.0.0.1:8787`) by default.
- `node scripts/tests/worker/verify-production-worker-local.mjs` — loads
  the compiled Worker bundle and asset directory locally; requires
  `worker-dist-full/` and `assets-full/` to already be built.

## Architectural invariants

- There is one surviving full-corpus Worker pipeline — **automated**
  (`scripts/tests/architecture/test-legacy-poc-ownership.mjs` asserts the
  deleted sample-pipeline paths stay absent and the surviving pipeline
  paths stay present). Do not create a second sample or parallel
  pipeline.
- `src/index.full.ts` is the deployed runtime entry — **configuration-enforced**
  via `main` in `wrangler.production.toml`.
- `config/wrangler.production.toml` owns production deployment —
  **partially guarded** (`test:crawler-policy` asserts its Worker name,
  `[assets]` block, and key safety flags).
- `config/wrangler.full.toml` supports staging/local-preview behavior but
  does not imply a live remote deployment — **documented only**;
  deployment liveness is an external Cloudflare-dashboard fact, not
  derivable from the repository.
- Workers Static Assets is the active asset/data backend — **documented
  only**.
- Generated output directories remain gitignored — **automated**
  (`test:generated-data-ownership`).
- Tracked generated JSON files under `data/` are not hand-edited —
  **documented only**.
- The complete vocabulary corpus must not be bundled into the Worker
  script — **automated** (`tests/test-worker-bundle-size.mjs`).
- Diagnostics are not deployment gates unless explicitly wired as such —
  **documented/true by omission** (no script currently wires any
  `diagnostics/` file into build or deploy).
- Source vocabulary data does not belong under Worker `data/` —
  **documented only**.
- Shared utilities do not move into this folder merely because the
  Worker consumes them — **conventional/review-enforced**.
- New deployment configs must represent durable supported environments,
  not experiments — **documented only**.
- The Worker root remains documentation-only unless a durable
  architectural reason requires otherwise — **documented only**.

## Checklist for adding a new Worker-owned file or capability

1. Identify the file's primary owner.
2. Confirm it is specific to the Cloudflare word-page Worker.
3. Choose the correct responsibility: runtime, build, config, data,
   generation, diagnostics, tests, or docs.
4. Do not put executable files at the Worker root for convenience.
5. Do not place source vocabulary or general SEO data under Worker
   `data/`.
6. Keep shared multi-consumer utilities outside the Worker folder.
7. Decide whether the new file creates generated output.
8. Update `docs/generated-data.md` and the ignore/ownership guards when
   adding generated artifacts.
9. Add a root package command and thin wrapper (`scripts/tests/worker/`)
   when creating a supported automated test or build entry point.
10. Update architecture or deployment documentation only when the
    durable system contract changes.
11. Preserve import/glob boundaries when moving or adding runtime files.
12. Do not create a parallel Worker pipeline.
13. Run only the focused verification relevant to the new
    responsibility.

## See also

- [`docs/architecture.md`](../../docs/architecture.md) — full repository
  architecture and ownership map
- [`docs/deployment.md`](../../docs/deployment.md) — authoritative
  Cloudflare production/deployment record
- [`docs/generated-data.md`](../../docs/generated-data.md) — full
  generated-data ownership matrix and regeneration rules
- [`docs/import-boundaries.md`](../../docs/import-boundaries.md) —
  `import.meta.glob` path-sensitivity contract
- [`docs/route-ownership.md`](docs/route-ownership.md) — the detailed
  asset-versus-Worker route ownership reference, verified against a
  local `wrangler dev` instance
