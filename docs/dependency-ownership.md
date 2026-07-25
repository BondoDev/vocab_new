# Dependency ownership

Guard: `npm run test:dependency-ownership`
(`scripts/tests/architecture/test-dependency-ownership.mjs`), chained into
`npm run test:architecture-guards`. It asserts every direct dependency in
`package.json` is documented below with proven current use, every
previously-removed package stays removed, every retained UI package stays
declared, and no source/CSS file imports a removed package.

## Rule

Every direct dependency in `package.json` must have a proven, current
consumer: a source import, a dynamic `import()`, a script/CLI invocation, a
config reference, an active TypeScript type need, or a peer requirement from
a retained package. Companion to
[`docs/ui-component-ownership.md`](ui-component-ownership.md) for the `src/app/components/ui/`
primitives specifically.

Before **adding** a dependency: confirm no existing retained package already
covers the need, and add its row to the inventory table below in the same
change.

Before **removing** a dependency: confirm zero references across `src/`,
`scripts/`, `workers/`, config files, and CSS (package-name substring
searches over `src/data/**` vocabulary JSON produce false positives — e.g.
the French verb *"sonner"* matches the npm package `sonner`; verify any hit
is actually code before treating it as evidence), then run
`npm explain <package>` to confirm no *retained* package requires it as a
peer or transitive dependency before removing it.

## Full direct-dependency inventory

| Package | Section | Declared version | Evidence of use | Classification |
|---|---|---|---|---|
| @cloudflare/workers-types | devDependencies | ^5.20260724.1 | ambient `types` entry in `workers/word-ssr/tsconfig.json`; Worker runtime/platform type declarations referenced in `workers/word-ssr/src/global.d.ts` | actively used (types) |
| @radix-ui/react-alert-dialog | dependencies | 1.1.6 | `src/app/components/ui/alert-dialog.tsx` | actively used |
| @radix-ui/react-dialog | dependencies | 1.1.6 | `src/app/components/ui/dialog.tsx` | actively used |
| @radix-ui/react-dropdown-menu | dependencies | 2.1.6 | `src/app/components/ui/dropdown-menu.tsx` | actively used |
| @radix-ui/react-label | dependencies | 2.1.2 | `src/app/components/ui/label.tsx` | actively used |
| @radix-ui/react-popover | dependencies | 1.1.6 | `src/app/components/ui/popover.tsx` | actively used |
| @radix-ui/react-select | dependencies | 2.1.6 | `src/app/components/ui/select.tsx` | actively used |
| @radix-ui/react-slot | dependencies | 1.1.2 | `src/app/components/ui/button.tsx` | actively used |
| @tailwindcss/vite | devDependencies | 4.1.12 | `vite.config.ts` plugin | actively used (config) |
| @types/node | devDependencies | ^22.20.1 | TypeScript compilation of Node globals/built-ins (`Buffer`, `node:stream`) in `src/entry-server.tsx` | actively used (types) |
| @types/react | devDependencies | 19.2.13 | TypeScript compilation of all `.tsx` | actively used (types) |
| @types/react-dom | devDependencies | 19.0.4 | TypeScript compilation | actively used (types) |
| @vitejs/plugin-react | devDependencies | 4.7.0 | `vite.config.ts` plugin | actively used (config) |
| class-variance-authority | dependencies | 0.7.1 | `ui/button.tsx`, `ui/select.tsx`, `ui/dropdown-menu.tsx`, `ui/utils.ts` and others | actively used |
| clsx | dependencies | 2.1.1 | `ui/utils.ts` (`cn` helper) | actively used |
| date-fns | dependencies | 3.6.0 | `AccountOnboardingDialog.tsx` and others | actively used |
| fast-xml-parser | dependencies | ^5.9.3 | `scripts/operations/google-index.mjs` (operational script, Search Console indexing) | actively used (script) |
| flag-icons | dependencies | 7.2.1 | `UILanguageSwitcher.tsx`, `LanguageSelector.tsx` and others | actively used |
| googleapis | dependencies | ^173.0.0 | `scripts/operations/google-index.mjs` | actively used (script) |
| lucide-react | dependencies | 0.487.0 | icons throughout `src/app/components/` | actively used |
| motion | dependencies | 12.23.24 | animation usage throughout `src/app/components/` | actively used |
| react | dependencies + peerDependencies | 18.3.1 | core framework | actively used |
| react-dnd | dependencies | 16.0.1 | drag-and-drop exercises | actively used |
| react-dnd-html5-backend | dependencies | 16.0.1 | paired with `react-dnd` | actively used |
| react-dom | dependencies + peerDependencies | 18.3.1 | core framework | actively used |
| react-responsive-masonry | dependencies | 2.7.1 | layout usage in `src/app/components/` | actively used |
| react-router-dom | dependencies | 6.26.2 | routing throughout `src/app/` | actively used |
| sass | devDependencies | ^1.84.0 | `.scss` module compilation (Vite) | actively used (build) |
| tailwind-merge | dependencies | 3.2.0 | `ui/utils.ts` (`cn` helper) | actively used |
| tailwindcss | devDependencies | 4.1.12 | `vite.config.ts` plugin, `src/styles/tailwind.css` | actively used (config+CSS) |
| tw-animate-css | dependencies | 1.3.8 | `src/styles/tailwind.css` `@import` | actively used (CSS) |
| typescript | devDependencies | 5.6.3 | `npx tsc --noEmit`, Vite build | actively used (build) |
| vite | devDependencies | 6.3.5 | build tool, `npm run build`/`dev` | actively used (build) |

**33 direct entries** (23 `dependencies`, 10 `devDependencies`; the
`peerDependencies` block only restates `react`/`react-dom`, already listed).

## Previously removed (2026-07-15) — must not silently reappear

36 packages were proven unused (no source import, no dynamic import, no
script/CLI use, no config use, no CSS use, no active type reference, no
retained package requiring it as a peer) and removed in the 2026-07-15
dependency cleanup, alongside 39 unused `src/app/components/ui/` files (see
[`docs/ui-component-ownership.md`](ui-component-ownership.md)):

| Package | Was the sole dependent of |
|---|---|
| @emotion/react | peerOptional of removed @mui/material |
| @emotion/styled | peerOptional of removed @mui/material |
| @mui/icons-material | — |
| @mui/material | — |
| @popperjs/core | peer of removed react-popper + @mui/material |
| @radix-ui/react-accordion | removed `ui/accordion.tsx` |
| @radix-ui/react-aspect-ratio | removed `ui/aspect-ratio.tsx` |
| @radix-ui/react-avatar | removed `ui/avatar.tsx` |
| @radix-ui/react-checkbox | removed `ui/checkbox.tsx` |
| @radix-ui/react-collapsible | required only by removed react-accordion |
| @radix-ui/react-context-menu | removed `ui/context-menu.tsx` |
| @radix-ui/react-hover-card | removed `ui/hover-card.tsx` |
| @radix-ui/react-menubar | removed `ui/menubar.tsx` |
| @radix-ui/react-navigation-menu | removed `ui/navigation-menu.tsx` |
| @radix-ui/react-progress | removed `ui/progress.tsx` |
| @radix-ui/react-radio-group | removed `ui/radio-group.tsx` |
| @radix-ui/react-scroll-area | removed `ui/scroll-area.tsx` |
| @radix-ui/react-separator | removed `ui/separator.tsx` |
| @radix-ui/react-slider | removed `ui/slider.tsx` |
| @radix-ui/react-switch | removed `ui/switch.tsx` |
| @radix-ui/react-tabs | removed `ui/tabs.tsx` |
| @radix-ui/react-toggle | required only by removed react-toggle-group |
| @radix-ui/react-toggle-group | removed `ui/toggle-group.tsx` |
| @radix-ui/react-tooltip | removed `ui/tooltip.tsx` |
| cmdk | removed `ui/command.tsx` |
| embla-carousel-react | removed `ui/carousel.tsx` |
| input-otp | removed `ui/input-otp.tsx` |
| next-themes | removed `ui/sonner.tsx` (theme detection) |
| react-day-picker | removed `ui/calendar.tsx` |
| react-hook-form | removed `ui/form.tsx` (onboarding form uses plain `useState`) |
| react-popper | — |
| react-resizable-panels | removed `ui/resizable.tsx` |
| react-slick | — (no source reference; `slick-carousel` was never a declared dependency either) |
| recharts | removed `ui/chart.tsx` |
| sonner | removed `ui/sonner.tsx` (`<Toaster`/`toast(` never called anywhere) |
| vaul | removed `ui/drawer.tsx` (the real profile mobile drawer is hand-built, unrelated) |

**Known pre-existing issue, not caused by this list:** `@types/react`
(19.2.13) vs. installed `react` (18.3.1) is a version mismatch — harmless
for now, flag if it ever causes a type error.
