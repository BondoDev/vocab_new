# Legacy Cloudflare word-renderer POC removal

Audited and removed 2026-07-15, starting commit `663abf6e` (branch `master`,
clean tree).

Guard: `npm run test:legacy-poc-ownership`
(`scripts/test-legacy-poc-ownership.mjs`), chained into
`npm run test:architecture-guards`.

## What was deleted

`poc/cloudflare-word-renderer/` — an early Cloudflare Worker word-rendering
prototype (renderer, template, record generation, format-comparison
benchmarks, parity/performance/redirect check scripts, and a small sample
data corpus). 98 tracked files plus a gitignored `.compiled/` build cache.

## Why it was obsolete

The prototype had no active production, build, test, or CI dependency:

- No `package.json` script (root or nested) invoked anything under
  `poc/`. The directory had no manifest or lockfile of its own — the only
  `package.json` present was inside the gitignored `.compiled/` cache
  (`{ "type": "commonjs" }`, a Vite/TS compile artifact, not a real project).
- No workspace entry, CI workflow (none exist in this repo), or Wrangler
  configuration referenced it.
- The only tracked references were three lines that already labeled it
  historical: [`docs/import-boundaries.md`](import-boundaries.md) and
  [`scripts/import-boundaries/current/globs.json`](../scripts/import-boundaries/current/globs.json)
  both tagged its `measure-formats.mjs` loader entry `obsolete/POC`, and
  `.gitignore` ignored its local build cache. A comment in
  `workers/word-ssr/measure-shard-formats.mjs` noted it extended the
  prototype's measurement methodology — updated to describe the lineage
  without naming the now-deleted path.

## How production superseded it

`workers/word-ssr/` is the current production Worker: SSR rendering
(`src/render-entry.tsx`, `src/index.full.ts`), real corpus generation
(`generate-full-corpus.mjs`), shard publishing (`publish-shards.mjs`),
and its own production-safety test suite (`test:word-worker:production-safety`)
all supersede what the prototype explored. The prototype's
`measure-formats.mjs` format comparison was the ancestor of
`workers/word-ssr/measure-shard-formats.mjs`, which remains as a
staging-only measurement script, unaffected by this removal.

## Active production Worker

`workers/word-ssr/` — built via `npm run build` and
`npm run build:word-worker:full`, deployed via Cloudflare Workers Builds
triggered from `master`.

## Files removed outside the POC tree

None. No external file existed solely to build, test, measure, or document
the prototype.

## Stale references updated

- `.gitignore` — removed the `poc/cloudflare-word-renderer/.compiled/` entry.
- `docs/import-boundaries.md` — dropped the POC half of the L8 loader table
  row; the remaining `workers/word-ssr/measure-shard-formats.mjs` entry is
  now labeled `staging-only measurement` instead of `obsolete/POC`.
- `scripts/import-boundaries/current/globs.json` — same L8 entry, POC
  consumer removed.
- `workers/word-ssr/measure-shard-formats.mjs` — header comment reworded to
  drop the dead path reference (no behavior change).

## Validation performed

- Repo-wide search for `cloudflare-word-renderer` / `word-renderer` before
  and after deletion.
- `npm run test:legacy-poc-ownership` (new guard, 7 checks, passing).
- See the task's final report for the full architecture-guard, TypeScript,
  build, Worker, and SEO regression results run alongside this removal.

## Recovering the historical code

Git history retains the full prototype. To inspect or restore it:

```bash
git log --diff-filter=D --summary -- poc/cloudflare-word-renderer/
git show <commit-before-deletion>:poc/cloudflare-word-renderer/renderer.mjs
```

No archived copy is kept in the working tree — this document plus Git
history is the record.
