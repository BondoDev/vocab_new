# UI component ownership audit

Audited 2026-07-15, starting commit `ead3d51e` (branch `master`, clean tree).
Scope: `src/app/components/ui/` (48 files) — a shadcn/ui-style primitive
library, bulk-scaffolded (this repo's `package.json` name is
`@figma/my-make-file`, consistent with a Figma-to-code export that ships
the full shadcn component set regardless of actual usage). No
`components.json` (shadcn CLI config), no README, and no prior
documentation anywhere in this repo (`docs/`, `CLAUDE.md`,
`docs/import-boundaries.md`, `docs/generated-data.md`) designates this
folder as a deliberately maintained design-system surface.

Guard: `npm run test:ui-component-ownership`
(`scripts/test-ui-component-ownership.mjs`), chained into
`npm run test:architecture-guards`.

## Directories inspected

- `src/app/components/ui/` (the audited folder, 48 files)
- `src/app/components/` (all consumers, including `exercises/`,
  `practice/`, `user-profile/`)
- `src/contexts/`, `src/lib/`, `src/data/`, `src/keyboards/`
- `src/main.tsx`, `src/entry-client.tsx`, `src/entry-server.tsx`
- `workers/word-ssr/src/` (Worker SSR entry — zero references)
- `scripts/` (build/test tooling — zero references)
- `docs/` (zero references to `components/ui`)
- `tsconfig.json`, `vite.config.ts`, `package.json` (alias/build config)

No `components.json`, no `*.test.tsx`/`*.stories.tsx` files exist in this
repo's own source tree (only inside `node_modules`, irrelevant).

## Import-analysis methodology

1. **Alias configuration** (`tsconfig.json`): only alias is `@/* → ./src/*`.
   Searched the entire `src/` tree for `@/app/components/ui` and
   `@/components/ui` — **zero matches**. This codebase does not use the
   alias for UI-primitive imports anywhere; all real usage is via relative
   paths (`./ui/x`, `../ui/x`, etc.).
2. **Relative-import sweep**: searched all of `src/` for
   `from "[./]+ui/<name>"` (any depth of `../`) to find every file outside
   `src/app/components/ui/` that imports from it. Found exactly 5 consumer
   files (below).
3. **Internal cross-references**: searched inside
   `src/app/components/ui/` for `from "./<name>"` to map every ui-file→
   ui-file dependency edge, then computed the transitive closure from the
   5 external entry points.
4. **Dynamic/glob/lazy references**: searched the whole `src/` tree for
   `import.meta.glob`, `React.lazy`, and `import(` referencing `ui/` —
   **zero matches**. All `import.meta.glob` usage in this repo is scoped to
   `src/data/**` (vocabulary/SEO JSON), documented in
   `docs/import-boundaries.md`; none targets `components/ui`.
5. **Direct-package bypass check**: for every non-Radix package a shadcn
   wrapper commonly wraps (`recharts`, `embla-carousel-react`, `cmdk`,
   `react-day-picker`, `vaul`, `react-resizable-panels`, `react-hook-form`,
   `sonner`, `next-themes`), searched all of `src/` for direct imports
   outside the wrapper file, and for `toast(`/`<Toaster` usage specifically.
   In every case, the **only** repository usage is inside the corresponding
   `ui/*.tsx` wrapper — no application code calls these packages directly.
6. **Tests/tooling**: no `*.test.*`/`*.stories.*` files exist in this
   repo's `src/`. `scripts/` and `workers/word-ssr/src/` contain zero
   references to `components/ui`.
7. **Profile-shell check** (safety-critical, see [§ Profile safety](#profile-safety-confirmation)):
   `UserProfileDashboardPage.tsx` and `UserProfileSidebar.tsx` import zero
   files from `ui/` — the profile shell is built from plain HTML elements,
   `lucide-react` icons, and dedicated SCSS, not shadcn primitives.
8. **CSS/asset exclusivity**: no `.css`/`.scss` files exist under
   `src/app/components/ui/`; every component is styled with inline
   Tailwind utility classes. No component-exclusive assets exist to clean
   up.
9. **Barrel exports**: no `index.ts`/`index.tsx` exists in
   `src/app/components/ui/`. There is no re-export surface to update.

### Limitations

- TypeScript's own unused-file detection was **not** relied upon as the
  sole evidence (per this audit's own constraint) — reachability was
  computed independently via the import-graph sweep above, then
  corroborated by a post-deletion `npm run build` (which fails loudly on
  any unresolved import) and `git diff --check`.
- String-based component registries (a runtime map like
  `{ button: Button }` used to look up components by name) are the one
  reachability pattern grep-based analysis cannot fully rule out on
  principle. None were found in this codebase (no such registry pattern
  exists anywhere for `components/ui`), but this is a structural
  limitation of the method, noted for completeness.
- Runtime/browser manual verification is separately reported in the main
  task report, not in this document — this document only covers static
  reachability evidence.

## The 5 real consumer files and what they import

| Consumer | Imports from `ui/` |
|---|---|
| `src/app/components/Header.tsx` | `dialog`, `input`, `button`, `dropdown-menu` |
| `src/app/components/AccountOnboardingDialog.tsx` | `button`, `dialog`, `input`, `label`, `select` |
| `src/app/components/VocabularyLevelExam.tsx` | `alert-dialog` |
| `src/app/components/exercises/DesktopSpecialCharacters.tsx` | `popover` |
| `src/app/components/exercises/UniversalExerciseInput.tsx` | `utils` (`cn`) |

Transitive closure through internal `ui/`→`ui/` imports (e.g.
`alert-dialog.tsx` needs `button.tsx`'s `buttonVariants`; every wrapper
needs `utils.ts`'s `cn`) adds **no new files** — every internal dependency
of these 9 files is already inside the used set.

## Full inventory (48 files)

| File | Exported symbols | Evidence of use | Classification | Action | Notes |
|---|---|---|---|---|---|
| `alert-dialog.tsx` | `AlertDialog*` (11 symbols) | Direct import in `VocabularyLevelExam.tsx` (exit-confirmation dialog) | actively used | retain | also pulls in `button.tsx` (`buttonVariants`) |
| `button.tsx` | `Button`, `buttonVariants` | Direct import in `Header.tsx`, `AccountOnboardingDialog.tsx` | actively used | retain | |
| `dialog.tsx` | `Dialog*` (10 symbols) | Direct import in `Header.tsx` (auth modal), `AccountOnboardingDialog.tsx` (onboarding modal) | actively used | retain | |
| `dropdown-menu.tsx` | `DropdownMenu*` (15 symbols) | Direct import in `Header.tsx` (account menu) | actively used | retain | |
| `input.tsx` | `Input` | Direct import in `Header.tsx`, `AccountOnboardingDialog.tsx` | actively used | retain | |
| `label.tsx` | `Label` | Direct import in `AccountOnboardingDialog.tsx` | actively used | retain | |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor` | Direct import in `DesktopSpecialCharacters.tsx` (desktop accent-character helper) | actively used | retain | |
| `select.tsx` | `Select*` (9 symbols) | Direct import in `AccountOnboardingDialog.tsx` (level/birth-month selects) | actively used | retain | |
| `utils.ts` | `cn` | Direct import in `UniversalExerciseInput.tsx`; internal import in 38 of the other 47 ui files | actively used | retain | load-bearing internal helper |
| `accordion.tsx` | `Accordion*` (4) | none found (static, dynamic, test, or tooling) | unused and removable | **removed** | no reachable import from any entry point |
| `alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription` | none found | unused and removable | **removed** | |
| `aspect-ratio.tsx` | `AspectRatio` | none found; only external import is `@radix-ui/react-aspect-ratio` | unused and removable | **removed** | |
| `avatar.tsx` | `Avatar*` (3) | none found; note profile sidebar's own avatar circle is hand-built, not this component | unused and removable | **removed** | |
| `badge.tsx` | `Badge`, `badgeVariants` | none found | unused and removable | **removed** | |
| `breadcrumb.tsx` | `Breadcrumb*` (7) | none found | unused and removable | **removed** | |
| `calendar.tsx` | `Calendar` | none found; onboarding's birth-month/day fields use `select.tsx`/`input.tsx`, not this | unused and removable | **removed** | only consumer of `react-day-picker` |
| `card.tsx` | `Card*` (7) | none found | unused and removable | **removed** | |
| `carousel.tsx` | `Carousel*`, `CarouselApi` (6) | none found; only consumer of `embla-carousel-react` | unused and removable | **removed** | |
| `chart.tsx` | `Chart*` (6), `ChartConfig` | none found; only consumer of `recharts` in `src/` | unused and removable | **removed** | |
| `checkbox.tsx` | `Checkbox` | none found | unused and removable | **removed** | |
| `collapsible.tsx` | `Collapsible*` (3) | none found | unused and removable | **removed** | |
| `command.tsx` | `Command*` (9) | none found; only consumer of `cmdk` | unused and removable | **removed** | |
| `context-menu.tsx` | `ContextMenu*` (15+) | none found | unused and removable | **removed** | |
| `drawer.tsx` | `Drawer*` (10) | none found; only consumer of `vaul` — **not** the same as the real profile mobile drawer, which is hand-built markup in `UserProfileSidebar.tsx` with zero import from this file | unused and removable | **removed** | see [§ Profile safety](#profile-safety-confirmation) |
| `form.tsx` | `Form`, `useFormField`, `FormItem`, etc. (8) | none found; only consumer of `react-hook-form` | unused and removable | **removed** | onboarding form in `AccountOnboardingDialog.tsx` uses plain `useState`, not this |
| `hover-card.tsx` | `HoverCard*` (3) | none found | unused and removable | **removed** | |
| `input-otp.tsx` | `InputOTP*` (4) | none found; only consumer of npm package `input-otp` | unused and removable | **removed** | |
| `menubar.tsx` | `Menubar*` (15+) | none found | unused and removable | **removed** | |
| `navigation-menu.tsx` | `NavigationMenu*` (8), `navigationMenuTriggerStyle` | none found | unused and removable | **removed** | |
| `pagination.tsx` | `Pagination*` (7) | none found; SEO word-browse pagination (`test:word-browse-pagination`) is a separate, unrelated implementation outside `ui/` | unused and removable | **removed** | verified this is not the SEO pagination component |
| `progress.tsx` | `Progress` | none found | unused and removable | **removed** | |
| `radio-group.tsx` | `RadioGroup`, `RadioGroupItem` | none found | unused and removable | **removed** | |
| `resizable.tsx` | `Resizable*` (3) | none found; only consumer of `react-resizable-panels` | unused and removable | **removed** | |
| `scroll-area.tsx` | `ScrollArea`, `ScrollBar` | none found | unused and removable | **removed** | |
| `separator.tsx` | `Separator` | none found; only internal consumer was `sidebar.tsx` (also removed) | unused and removable | **removed** | |
| `sheet.tsx` | `Sheet*` (8) | none found | unused and removable | **removed** | |
| `sidebar.tsx` | `Sidebar*` (15+) | none found | unused and removable | **removed** | **name-adjacent risk**: shares "Sidebar" naming with the real, hand-built `UserProfileSidebar.tsx`, but is a completely separate, unimported shadcn app-shell primitive (`SidebarProvider`/`SidebarTrigger`/etc.) with zero code relationship. No comment, doc, or commit references it as earmarked for the profile rebuild. See [§ Profile safety](#profile-safety-confirmation) and [§ Residual risks](#residual-risks-flagged-for-review) in the final report. |
| `skeleton.tsx` | `Skeleton` | none found; only internal consumer was `sidebar.tsx` (also removed) | unused and removable | **removed** | |
| `slider.tsx` | `Slider` | none found | unused and removable | **removed** | |
| `sonner.tsx` | `Toaster` | none found; `<Toaster` never rendered anywhere, `toast(` never called anywhere; only consumer of `sonner` and `next-themes` packages in `src/` | unused and removable | **removed** | |
| `switch.tsx` | `Switch` | none found | unused and removable | **removed** | |
| `table.tsx` | `Table*` (8) | none found | unused and removable | **removed** | plausible future use for profile statistics, but no current wiring or documented plan — see safety-principles note below |
| `tabs.tsx` | `Tabs*` (4) | none found | unused and removable | **removed** | |
| `textarea.tsx` | `Textarea` | none found | unused and removable | **removed** | |
| `toggle.tsx` | `Toggle`, `toggleVariants` | none found; only internal consumer was `toggle-group.tsx` (also removed) | unused and removable | **removed** | |
| `toggle-group.tsx` | `ToggleGroup`, `ToggleGroupItem` | none found | unused and removable | **removed** | |
| `tooltip.tsx` | `Tooltip*` (4) | none found | unused and removable | **removed** | |
| `use-mobile.ts` | `useIsMobile` | none found; only internal consumer was `sidebar.tsx` (also removed). Note: the real mobile-viewport detection used by the app (`MobileKeyboard.tsx`, `WordTypingExercise.tsx`) uses its own inline `window.innerWidth`/media-query checks, not this hook | unused and removable | **removed** | |

**Totals: 48 files audited. 9 actively used, retained. 39 unused and
removable, all removed.** No file was classified "test-only",
"dynamically loaded", "design-system retained", "unfinished-feature
retained", or "unclear—retain" — every one of the 39 had complete,
unambiguous absence-of-use evidence across every reachability channel
checked in the methodology above, and none had any profile-shell,
unfinished-feature, or documented-retention wiring.

## Design-system provenance (Phase 5)

All 39 removed files are generated shadcn/ui boilerplate with the
following shared characteristics, none of which support retention:

- No `components.json` — this repo has no shadcn CLI wiring, so nothing
  expects these files to exist at these exact paths for regeneration
  tooling to find.
- No CSS or utility code outside `ui/` references any of them.
- No test, story, or tooling script references any of them.
- Regeneration is trivial and lossless if ever needed later: shadcn
  primitives are copy-paste boilerplate over stable Radix
  packages/npm packages already resolvable in this repo's dependency tree
  (or via `npx shadcn add <name>` against the same Radix version
  already used by the 9 retained files, if the CLI is ever adopted).

This is "generated boilerplate with no current consumer," not "a
deliberate reusable design-system asset" — there is no documentation,
comment, or configuration anywhere in the repository asserting the latter.

## Profile safety confirmation

- `src/app/components/user-profile/UserProfileDashboardPage.tsx` and
  `UserProfileSidebar.tsx` import **zero** files from `src/app/components/ui/`
  (confirmed by direct read and by the relative-import sweep in this
  audit). Removing any of the 39 files has **no effect** on the profile
  shell's code path.
- The profile page's real mobile drawer (`UserProfileSidebar.tsx`'s
  `isDrawerOpen` state + hand-written `<div>`/CSS markup) is entirely
  independent of `ui/drawer.tsx` (the removed `vaul`-based wrapper) and
  `ui/sidebar.tsx` (the removed shadcn app-shell primitive). Neither
  removal touches the profile's real drawer implementation.
- No auth guard was added to or removed from `/profile` as part of this
  cleanup — this task did not touch `src/app/App.tsx`'s routing logic at
  all.
- Profile page render output, hardcoded sidebar, and empty main content
  are unaffected — verified no import chain connects them to any deleted
  file.
