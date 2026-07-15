# Dependency ownership audit

Audited 2026-07-15, starting commit `165f0486` (branch `master`, clean tree,
Node v22.16.0, npm 10.3.0). Follow-up to the UI-component cleanup documented
in [`docs/ui-component-audit.md`](ui-component-audit.md) (39 unused
`src/app/components/ui/` files removed, 9 retained).

Guard: `npm run test:dependency-ownership`
(`scripts/test-dependency-ownership.mjs`), chained into
`npm run test:architecture-guards`.

## Methodology

For every direct dependency in `package.json` (`dependencies` +
`devDependencies`; no `optionalDependencies` or `peerDependencies` other than
the declared `react`/`react-dom` peer block exist in this repo):

1. Repo-wide search across `src/`, `scripts/`, `workers/`, `poc/`, root-level
   `*.js`/`*.mjs` operational scripts, all config files, and all
   `*.css`/`*.scss` files — for bare imports, subpath imports (e.g.
   `@mui/material/Button`), `require()`, dynamic `import()`, and CSS
   `@import`/`url()`.
2. Cross-checked against `docs/ui-component-audit.md`'s per-file package
   mapping (it already identifies which npm package each of the 39 removed
   UI files was the sole consumer of).
3. `npm explain <package>` for every removal candidate, to find any peer or
   transitive requirement from a *retained* package before removing it.
4. Config inspection: `vite.config.ts`, `tsconfig.json`, `index.html` — no
   PostCSS/Tailwind/ESLint/Babel/Wrangler config files exist beyond what's
   already covered by `docs/import-boundaries.md`.
5. `npm audit`/`npm ls --depth=0` for pre-existing warnings (none) and the
   installed tree shape.

### Limitations

- Package-name substring search over `src/data/**` JSON vocabulary content
  produces false positives (e.g. the French verb *"sonner"* — "to ring" —
  matches the npm package `sonner`). Every such match was individually
  opened and confirmed to be vocabulary content, not code, before being
  excluded as evidence.
- `CLAUDE.md`'s "UI libraries" prose line still names `recharts`, `sonner`,
  `React Hook Form` from before the UI cleanup — treated as stale
  documentation, not evidence of use (not corrected here; out of scope).
- No ESLint/Prettier/Babel config exists in this repo to inspect (confirmed
  absent, not skipped).
- Static grep cannot rule out a *runtime string-keyed component registry*;
  none was found anywhere in this codebase (same conclusion the UI audit
  reached), but this is a structural limit of the method, noted for
  completeness.

## Full direct-dependency inventory

| Package | Section | Declared version | Evidence of use | Classification |
|---|---|---|---|---|
| @emotion/react | dependencies | 11.14.0 | none in src/scripts/workers/config/CSS; only peer of @mui/material | unused and removable |
| @emotion/styled | dependencies | 11.14.1 | none; only peerOptional of @mui/material/@mui/system | unused and removable |
| @mui/icons-material | dependencies | 7.3.5 | none | unused and removable |
| @mui/material | dependencies | 7.3.5 | none | unused and removable |
| @popperjs/core | dependencies | 2.11.8 | none; only peer of react-popper and @mui/material | unused and removable |
| @radix-ui/react-accordion | dependencies | 1.2.3 | none | unused and removable |
| @radix-ui/react-alert-dialog | dependencies | 1.1.6 | `src/app/components/ui/alert-dialog.tsx` | actively used |
| @radix-ui/react-aspect-ratio | dependencies | 1.1.2 | none | unused and removable |
| @radix-ui/react-avatar | dependencies | 1.1.3 | none | unused and removable |
| @radix-ui/react-checkbox | dependencies | 1.1.4 | none | unused and removable |
| @radix-ui/react-collapsible | dependencies | 1.1.3 | none (only transitively required by react-accordion, also removed) | unused and removable |
| @radix-ui/react-context-menu | dependencies | 2.2.6 | none | unused and removable |
| @radix-ui/react-dialog | dependencies | 1.1.6 | `src/app/components/ui/dialog.tsx` | actively used |
| @radix-ui/react-dropdown-menu | dependencies | 2.1.6 | `src/app/components/ui/dropdown-menu.tsx` | actively used |
| @radix-ui/react-hover-card | dependencies | 1.1.6 | none | unused and removable |
| @radix-ui/react-label | dependencies | 2.1.2 | `src/app/components/ui/label.tsx` | actively used |
| @radix-ui/react-menubar | dependencies | 1.1.6 | none | unused and removable |
| @radix-ui/react-navigation-menu | dependencies | 1.2.5 | none | unused and removable |
| @radix-ui/react-popover | dependencies | 1.1.6 | `src/app/components/ui/popover.tsx` | actively used |
| @radix-ui/react-progress | dependencies | 1.1.2 | none | unused and removable |
| @radix-ui/react-radio-group | dependencies | 1.2.3 | none | unused and removable |
| @radix-ui/react-scroll-area | dependencies | 1.2.3 | none | unused and removable |
| @radix-ui/react-select | dependencies | 2.1.6 | `src/app/components/ui/select.tsx` | actively used |
| @radix-ui/react-separator | dependencies | 1.1.2 | none | unused and removable |
| @radix-ui/react-slider | dependencies | 1.2.3 | none | unused and removable |
| @radix-ui/react-slot | dependencies | 1.1.2 | `src/app/components/ui/button.tsx` | actively used |
| @radix-ui/react-switch | dependencies | 1.1.3 | none | unused and removable |
| @radix-ui/react-tabs | dependencies | 1.1.3 | none | unused and removable |
| @radix-ui/react-toggle | dependencies | 1.1.2 | none (only transitively required by react-toggle-group, also removed) | unused and removable |
| @radix-ui/react-toggle-group | dependencies | 1.1.2 | none | unused and removable |
| @radix-ui/react-tooltip | dependencies | 1.1.8 | none | unused and removable |
| @tailwindcss/vite | devDependencies | 4.1.12 | `vite.config.ts` plugin | actively used (config) |
| @types/node | devDependencies | ^22.20.1 | TypeScript compilation of Node globals/built-ins (`process`, `Buffer`, `node:fs`, `node:path`, `node:stream`) in `src/entry-server.tsx` and `src/data/vocabularyLevels/index.ts`; added 2026-07-15 fixing the 19 pre-existing `tsc` errors | actively used (types) |
| @types/react | devDependencies | 19.2.13 | TypeScript compilation of all `.tsx` | actively used (types) |
| @types/react-dom | devDependencies | 19.0.4 | TypeScript compilation | actively used (types) |
| @vitejs/plugin-react | devDependencies | 4.7.0 | `vite.config.ts` plugin | actively used (config) |
| class-variance-authority | dependencies | 0.7.1 | `ui/button.tsx`, `ui/select.tsx`, `ui/dropdown-menu.tsx`, `ui/utils.ts` and others | actively used |
| clsx | dependencies | 2.1.1 | `ui/utils.ts` (`cn` helper) | actively used |
| cmdk | dependencies | 1.1.1 | none; was sole dep of removed `ui/command.tsx` | unused and removable |
| date-fns | dependencies | 3.6.0 | `AccountOnboardingDialog.tsx` and others | actively used |
| embla-carousel-react | dependencies | 8.6.0 | none; was sole dep of removed `ui/carousel.tsx` | unused and removable |
| fast-xml-parser | dependencies | ^5.9.3 | `scripts/operations/google-index.mjs` (operational script, Search Console indexing) | actively used (script) |
| flag-icons | dependencies | 7.2.1 | `UILanguageSwitcher.tsx`, `LanguageSelector.tsx` and others | actively used |
| googleapis | dependencies | ^173.0.0 | `scripts/operations/google-index.mjs` | actively used (script) |
| input-otp | dependencies | 1.4.2 | none; was sole dep of removed `ui/input-otp.tsx` | unused and removable |
| lucide-react | dependencies | 0.487.0 | icons throughout `src/app/components/` | actively used |
| motion | dependencies | 12.23.24 | animation usage throughout `src/app/components/` | actively used |
| next-themes | dependencies | 0.4.6 | none; was only used by removed `ui/sonner.tsx` for theme detection | unused and removable |
| react | dependencies + peerDependencies | 18.3.1 | core framework | actively used |
| react-day-picker | dependencies | 8.10.1 | none; was sole dep of removed `ui/calendar.tsx` | unused and removable |
| react-dnd | dependencies | 16.0.1 | drag-and-drop exercises | actively used |
| react-dnd-html5-backend | dependencies | 16.0.1 | paired with `react-dnd` | actively used |
| react-dom | dependencies + peerDependencies | 18.3.1 | core framework | actively used |
| react-hook-form | dependencies | 7.55.0 | none; was sole dep of removed `ui/form.tsx` (onboarding form uses plain `useState`) | unused and removable |
| react-popper | dependencies | 2.3.0 | none | unused and removable |
| react-resizable-panels | dependencies | 2.1.7 | none; was sole dep of removed `ui/resizable.tsx` | unused and removable |
| react-responsive-masonry | dependencies | 2.7.1 | layout usage in `src/app/components/` | actively used |
| react-router-dom | dependencies | 6.26.2 | routing throughout `src/app/` | actively used |
| react-slick | dependencies | 0.31.0 | none anywhere in `src/`/config/CSS | unused and removable |
| recharts | dependencies | 2.15.2 | none; was sole dep of removed `ui/chart.tsx` | unused and removable |
| sass | devDependencies | ^1.84.0 | `.scss` module compilation (Vite) | actively used (build) |
| sonner | dependencies | 2.0.3 | none; was sole dep of removed `ui/sonner.tsx` (`<Toaster`/`toast(` never called anywhere) | unused and removable |
| tailwind-merge | dependencies | 3.2.0 | `ui/utils.ts` (`cn` helper) | actively used |
| tailwindcss | devDependencies | 4.1.12 | `vite.config.ts` plugin, `src/styles/tailwind.css` | actively used (config+CSS) |
| tw-animate-css | dependencies | 1.3.8 | `src/styles/tailwind.css` `@import` | actively used (CSS) |
| typescript | devDependencies | 5.6.3 | `npx tsc --noEmit`, Vite build | actively used (build) |
| vaul | dependencies | 1.1.2 | none; was sole dep of removed `ui/drawer.tsx` (real profile mobile drawer is hand-built, unrelated) | unused and removable |
| vite | devDependencies | 6.3.5 | build tool, `npm run build`/`dev` | actively used (build) |

67 total direct entries (59 `dependencies`, 8 `devDependencies`; the
`peerDependencies` block only restates `react`/`react-dom`, already listed).
After removal: 31 total direct entries (23 `dependencies`, 8 `devDependencies`).

**Post-audit addition (2026-07-15, TypeScript error fix):** `@types/node`
was added as a devDependency to resolve pre-existing `tsc --noEmit` errors —
missing Node ambient types (`process`, `Buffer`, `node:fs`, `node:path`,
`node:stream`, `NodeRequire`) in `src/entry-server.tsx` and
`src/data/vocabularyLevels/index.ts`. This brings the total to **32 direct
entries (23 `dependencies`, 9 `devDependencies`)**.

## Removal candidates — condition checklist

All 36 packages below satisfy every condition in the task's removability
checklist: no source import, no dynamic import, no script/CLI use, no
config use, no CSS use, no active type reference, no retained package
requires it as a peer, no Worker/SSR/build consumer, no operational-script
consumer.

| Package | Source imports | Script use | Config use | CSS use | Peer requirement | Safe to remove? |
|---|---:|---:|---:|---:|---:|---|
| @radix-ui/react-accordion | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-aspect-ratio | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-avatar | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-checkbox | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-collapsible | 0 | 0 | 0 | 0 | required only by react-accordion (also removed) | yes |
| @radix-ui/react-context-menu | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-hover-card | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-menubar | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-navigation-menu | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-progress | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-radio-group | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-scroll-area | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-separator | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-slider | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-switch | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-tabs | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-toggle | 0 | 0 | 0 | 0 | required only by react-toggle-group (also removed) | yes |
| @radix-ui/react-toggle-group | 0 | 0 | 0 | 0 | none | yes |
| @radix-ui/react-tooltip | 0 | 0 | 0 | 0 | none | yes |
| recharts | 0 | 0 | 0 | 0 | none | yes |
| embla-carousel-react | 0 | 0 | 0 | 0 | none | yes |
| cmdk | 0 | 0 | 0 | 0 | none | yes |
| react-day-picker | 0 | 0 | 0 | 0 | none | yes |
| vaul | 0 | 0 | 0 | 0 | none | yes |
| react-hook-form | 0 | 0 | 0 | 0 | none | yes |
| sonner | 0 | 0 | 0 | 0 | none | yes |
| next-themes | 0 | 0 | 0 | 0 | none | yes |
| input-otp | 0 | 0 | 0 | 0 | none | yes |
| react-resizable-panels | 0 | 0 | 0 | 0 | none | yes |
| @mui/material | 0 | 0 | 0 | 0 | required by @mui/icons-material (also removed) | yes |
| @mui/icons-material | 0 | 0 | 0 | 0 | none | yes |
| @emotion/react | 0 | 0 | 0 | 0 | required only by @emotion/styled (also removed) | yes |
| @emotion/styled | 0 | 0 | 0 | 0 | peerOptional of @mui/material (also removed) | yes |
| @popperjs/core | 0 | 0 | 0 | 0 | peer of react-popper + @mui/material (both also removed) | yes |
| react-popper | 0 | 0 | 0 | 0 | none | yes |
| react-slick | 0 | 0 | 0 | 0 | none (`slick-carousel` was never a declared dependency) | yes |

`slick-carousel` was checked and confirmed **never a direct dependency** in
this repository (not present in `package.json` at any point inspected) — no
removal action needed for it.

## Peer-dependency analysis

- `@radix-ui/react-collapsible` and `@radix-ui/react-toggle` each have one
  transitive requirer (`react-accordion`, `react-toggle-group`
  respectively) — both requirers are also in the removal set, so removing
  the pair together leaves no dangling peer requirement.
- `@popperjs/core` is a peer of both `react-popper` and `@mui/material`;
  both are removed in the same batch.
- `@emotion/react`/`@emotion/styled` are `peerOptional` requirements of
  `@mui/material`/`@mui/system`/`@mui/styled-engine`; all removed together.
- No retained package (the 7 retained Radix primitives, `react-dnd`,
  `react-router-dom`, etc.) has any peer or transitive requirement on any
  package in the removal set — confirmed via `npm explain <package>` for
  every candidate.

## Type-dependency analysis

- `@types/react`/`@types/react-dom` are required for all `.tsx`
  compilation and are unrelated to any removed package.
- No removed package has a separate `@types/*` package declared in this
  repo (all either ship their own types or aren't type-relevant to removal).
- `@types/react` (19.2.13) vs. installed `react` (18.3.1) is a **pre-existing
  version mismatch**, unrelated to this cleanup — not touched here (see
  final report's residual risks).

## CSS-only, CLI-only, config-only, peer-only findings

- **CSS-only dependencies:** none found. `tw-animate-css` and `tailwindcss`
  are CSS-relevant but also config-registered; no package is imported
  *exclusively* via CSS with no other reference.
- **CLI-only dependencies:** none among the removal set. Retained
  `vite`/`typescript`/`sass`/`@vitejs/plugin-react`/`@tailwindcss/vite` are
  CLI/build-tool dependencies, all genuinely invoked by `npm run build`/`dev`
  or `npx tsc`.
- **Config-only dependencies:** `@tailwindcss/vite`, `@vitejs/plugin-react`
  (both registered in `vite.config.ts`).
- **Type-only dependencies:** `@types/react`, `@types/react-dom`.
- **Peer-only dependencies:** none retained solely as a peer — the only
  peer relationships found (`@popperjs/core`, `@emotion/*`) are peers of
  packages also being removed.

## Package-lock impact (recorded after removal — see final report §B/§D)

See the task's final report for exact before/after package-lock byte size,
lockfile entry counts, and orphaned-transitive-package totals.

## Test results

See the task's final report §K for `test:dependency-ownership`,
`test:ui-component-ownership`, `test:interactive-contracts`,
`test:architecture-guards`, `npm run build`, and SEO/Worker regression
results.
