# FluentStellar

FluentStellar is a CEFR-structured vocabulary-learning platform built with
React 18, Vite 6, and TypeScript 5. It combines build-time static generation
with on-request Cloudflare Worker SSR and is available at
[www.fluentstellar.com](https://www.fluentstellar.com).

## Requirements

- Node.js
- npm

The repository does not currently declare a specific supported Node.js version.

## Getting started

```bash
npm install
npm run dev
```

The development server is provided by Vite.

## Main commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local Vite development server. |
| `npm run build` | Build the client and SSR bundles, prerender static routes, and verify the SSR package. |
| `npm run sitemap` | Regenerate the sitemap files. |
| `npx tsc --noEmit` | Run the TypeScript checker without emitting files. |
| `npm run test:architecture-guards` | Run the repository architecture and ownership guards. |

No conventional unit-test framework is configured. Deterministic guard and
regression scripts under `scripts/tests/` provide the primary automated
coverage.

## Architecture

- The React application and shared server-rendering entry points live under
  `src/`.
- `npm run build` generates client assets, an SSR bundle, and prerendered HTML
  for the static route set.
- The Cloudflare Worker under `workers/word-ssr/` renders the larger word-page
  route set on request and serves the generated static assets.
- Repository tooling for builds, generation, checks, and operations lives
  under `scripts/`.

## Documentation

- [Architecture overview](docs/architecture.md)
- [Deployment and production runtime](docs/deployment.md)
- [Dependency ownership](docs/dependency-ownership.md)
- [Scripts and regression tooling](scripts/README.md)
