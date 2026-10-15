# FluentStellar

FluentStellar is a CEFR-structured vocabulary-learning platform built with
React 18, Vite 6, and TypeScript 5. It combines build-time static generation
with on-request Cloudflare Worker SSR and is available at
[www.fluentstellar.com](https://www.fluentstellar.com).

## Requirements

- Node.js
- npm

The repository does not declare a Node.js `engines` range. The lint tooling
requires Node.js `^20.19.0 || ^22.13.0 || >=24`; CI uses Node.js 22.

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
| `npm run lint` | Report correctness, unused-declaration, and React Hooks findings without modifying files. |
| `npm run test:architecture-guards` | Run the repository architecture and ownership guards. |

No conventional unit-test framework is configured. Deterministic guard and
regression scripts under `scripts/tests/` provide the primary automated
coverage.

## Linting

`eslint.config.mjs` covers application, Vite configuration, Node SSR/tooling,
Cloudflare Worker, and Supabase Edge Function code with separate runtime globals.
Generated outputs are excluded. It uses ESLint's recommended programming-error
rules, TypeScript-compatible core-rule overrides, unused-declaration warnings,
and the two traditional React Hooks rules. It does not enable formatting,
import sorting, React Compiler rules, or strict type-style presets.

Hooks-order violations and core programming errors are errors; unused declarations
and exhaustive-deps findings are warnings. Underscore-prefixed parameters/caught
errors and omitted rest properties follow the documented unused-rule exceptions;
ordinary unused variables remain visible. Empty catch blocks are allowed for
intentional cleanup/error isolation. Existing inline suppressions are preserved
and unused suppressions are reported. TypeScript, rather than ESLint's JavaScript
`no-undef` rule, owns undefined-name checking in TypeScript files.

The account-intro storage test explicitly installs a fake `window`; only that
test receives the additional global. Source-contract tests intentionally match
literal indentation, so `no-regex-spaces` is disabled only for those test scripts.
Regex literals may contain intentional Unicode/BOM matching characters; irregular
whitespace in executable code is still checked. `no-var`, `prefer-const`,
`prefer-rest-params`, `prefer-spread`, and `no-useless-escape` are disabled to
avoid declaration-style and regex-spelling churn. No other existing findings
are silently baselined or suppressed.

Run `npm run lint` without `--fix`. A nonzero exit reports outstanding lint errors,
not an invitation to rewrite application code automatically. Review Hooks effects
especially carefully: changing dependency arrays can change authentication,
fetching, and modal lifecycles. This setup does not add linting to CI or change
the existing regression suite.

The initial findings, categorized by severity and file, are recorded in
[`docs/eslint-baseline.md`](docs/eslint-baseline.md). They remain visible to
`npm run lint`; the setup does not automatically fix or suppress that baseline.

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
