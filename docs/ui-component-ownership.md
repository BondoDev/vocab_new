# UI component ownership

`src/app/components/ui/` is a shadcn/ui-style Radix primitive library,
bulk-scaffolded (this repo's `package.json` name is `@figma/my-make-file`,
consistent with a Figma-to-code export that ships the full shadcn component
set regardless of actual usage). There is no `components.json` (shadcn CLI
config) and no barrel/index file — every import is a direct relative path.

Guard: `npm run test:ui-component-ownership`
(`scripts/test-ui-component-ownership.mjs`), chained into
`npm run test:architecture-guards`. It asserts the retained set stays
exactly 9 files, none of the 39 removed files silently reappear, no import
into `ui/` is dangling, and every retained file stays reachable from outside
`components/ui/`.

## Rule

Only add a new file to `src/app/components/ui/` when a real consumer
imports it in the same change — this directory has no design-system
mandate to pre-populate unused primitives. Companion to
[`docs/dependency-ownership.md`](dependency-ownership.md), since most
removed `ui/` files were also the sole consumer of a now-removed npm
package.

To verify whether a `ui/` file is actually used: search `src/` for
`from "[./]+ui/<name>"` (any depth of `../`) — this repo's only alias is
`@/* → ./src/*` and it is **not** used for `ui/` imports anywhere, so a
plain relative-path grep is authoritative. No `import.meta.glob`,
`React.lazy`, or string-keyed component registry touches `components/ui/`
anywhere in this codebase.

## Current consumers (5 files)

| Consumer | Imports from `ui/` |
|---|---|
| `src/app/components/layout/Header.tsx` | `dialog`, `input`, `button`, `dropdown-menu` |
| `src/app/components/dialogs/AccountOnboardingDialog.tsx` | `button`, `dialog`, `input`, `label`, `select` |
| `src/app/pages/VocabularyLevelExam.tsx` | `alert-dialog` |
| `src/features/practice/exercises/DesktopSpecialCharacters.tsx` | `popover` |
| `src/features/practice/exercises/UniversalExerciseInput.tsx` | `utils` (`cn`) |

The profile shell (`UserProfileDashboardPage.tsx`, `UserProfileSidebar.tsx`)
imports **zero** files from `ui/` — it is hand-built markup and SCSS, not
shadcn primitives. This matters because `ui/sidebar.tsx` and `ui/drawer.tsx`
(both removed) share naming with real profile components but have no code
relationship to them.

## Full inventory (48 files)

| File | Status | Notes |
|---|---|---|
| `alert-dialog.tsx` | retained | used by `VocabularyLevelExam.tsx`; also pulls in `button.tsx` |
| `button.tsx` | retained | used by `Header.tsx`, `AccountOnboardingDialog.tsx` |
| `dialog.tsx` | retained | used by `Header.tsx` (auth modal), `AccountOnboardingDialog.tsx` |
| `dropdown-menu.tsx` | retained | used by `Header.tsx` (account menu) |
| `input.tsx` | retained | used by `Header.tsx`, `AccountOnboardingDialog.tsx` |
| `label.tsx` | retained | used by `AccountOnboardingDialog.tsx` |
| `popover.tsx` | retained | used by `DesktopSpecialCharacters.tsx` |
| `select.tsx` | retained | used by `AccountOnboardingDialog.tsx` |
| `utils.ts` | retained | `cn` helper; internal dependency of 38 of the other 47 ui files |
| `accordion.tsx` | removed | no consumer found |
| `alert.tsx` | removed | no consumer found |
| `aspect-ratio.tsx` | removed | no consumer found |
| `avatar.tsx` | removed | the profile sidebar's avatar circle is hand-built, not this component |
| `badge.tsx` | removed | no consumer found |
| `breadcrumb.tsx` | removed | no consumer found |
| `calendar.tsx` | removed | onboarding's birth-date fields use `select.tsx`/`input.tsx`, not this |
| `card.tsx` | removed | no consumer found |
| `carousel.tsx` | removed | no consumer found |
| `chart.tsx` | removed | no consumer found |
| `checkbox.tsx` | removed | no consumer found |
| `collapsible.tsx` | removed | no consumer found |
| `command.tsx` | removed | no consumer found |
| `context-menu.tsx` | removed | no consumer found |
| `drawer.tsx` | removed | **not** the real profile mobile drawer, which is hand-built markup in `UserProfileSidebar.tsx` with zero import from this file |
| `form.tsx` | removed | the onboarding form uses plain `useState`, not this |
| `hover-card.tsx` | removed | no consumer found |
| `input-otp.tsx` | removed | no consumer found |
| `menubar.tsx` | removed | no consumer found |
| `navigation-menu.tsx` | removed | no consumer found |
| `pagination.tsx` | removed | the SEO word-browse pagination component is a separate, unrelated implementation outside `ui/` |
| `progress.tsx` | removed | no consumer found |
| `radio-group.tsx` | removed | no consumer found |
| `resizable.tsx` | removed | no consumer found |
| `scroll-area.tsx` | removed | no consumer found |
| `separator.tsx` | removed | no consumer found |
| `sheet.tsx` | removed | no consumer found |
| `sidebar.tsx` | removed | shares "Sidebar" naming with the real, hand-built `UserProfileSidebar.tsx` but is a completely separate, unimported shadcn app-shell primitive with zero code relationship — do not assume it was earmarked for a profile rebuild |
| `skeleton.tsx` | removed | no consumer found |
| `slider.tsx` | removed | no consumer found |
| `sonner.tsx` | removed | `<Toaster` never rendered, `toast(` never called anywhere |
| `switch.tsx` | removed | no consumer found |
| `table.tsx` | removed | plausible future use for profile statistics, but no current wiring or documented plan |
| `tabs.tsx` | removed | no consumer found |
| `textarea.tsx` | removed | no consumer found |
| `toggle.tsx` | removed | no consumer found |
| `toggle-group.tsx` | removed | no consumer found |
| `tooltip.tsx` | removed | no consumer found |
| `use-mobile.ts` | removed | the app's real mobile-viewport detection (`MobileKeyboard.tsx`, `WordTypingExercise.tsx`) uses its own inline `window.innerWidth`/media-query checks, not this hook |

**Totals: 48 files audited. 9 actively used, retained. 39 unused and
removable, all removed.**
