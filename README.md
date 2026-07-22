# FluentStellar

A CEFR-structured vocabulary-learning platform built with React 18, Vite,
and TypeScript. Renders as a hybrid of build-time static pages and
on-request Cloudflare Worker SSR, deployed to `www.fluentstellar.com`.

## Getting started

```bash
npm install
npm run dev          # start the Vite dev server
```

## Common commands

```bash
npm run dev                       # local development
npm run build                     # full SSG build: prebuild → client → SSR → prerender
npm run sitemap                   # regenerate the sitemap only
npx tsc --noEmit                  # typecheck
npm run test:architecture-guards  # run all repository-contract guards
```

No unit-test framework is configured; guard scripts under `scripts/tests/**/test-*.mjs`
provide deterministic, file-tree-level regression coverage instead.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full system
overview — rendering paths, ownership map, routing, SEO, data generation,
the Cloudflare Worker, build/deployment flow, and architecture guards.
