# App Components

## Purpose

`src/app/components/` holds reusable, app-level components whose ownership is
broader than one page family or one product feature: components shared by
unrelated pages/features, dialogs orchestrated centrally by the app shell,
global navigation/chrome, and domain-agnostic UI primitives. It is **not** a
general dumping ground — a component owned by a single page family or a
single feature belongs elsewhere (see "Components, pages, and features").

Placement is decided by **ownership and consumer scope**, not by visual type
or filename. A component that looks like a dialog, or has "Layout" in its
name, does not automatically belong here — see the counter-examples below.

## Current structure

```
src/app/components/
  dialogs/            # app-shell-orchestrated global dialogs
  layout/             # global navigation and application chrome
  ui/                 # domain-agnostic UI primitives (Radix/shadcn-style)
  LanguageSelector.tsx # app-specific component shared by unrelated owners
  Toast.tsx           # generic auto-dismissing confirmation, shared by unrelated owners
```

## Root-level components

A component may live directly under `src/app/components/` when it:

- is app-specific (depends on app context, data, or business logic);
- is reused by multiple unrelated page or feature owners;
- does not fit `dialogs/`, `layout/`, or `ui/`.

**Current example:** `LanguageSelector.tsx` is consumed by the homepage,
account onboarding (`dialogs/AccountOnboardingDialog.tsx`), and the
level-test page family (`src/app/pages/level-test/LevelTestLanguageModal.tsx`)
— three unrelated owners. It is not a generic `ui/` primitive because it
depends on app-specific language context and domain concepts (language
codes, flags, translation strings), not just generic markup.

Do not create `selectors/`, `language/`, `forms/`, or `shared/` for this
single file — one file does not justify a subfolder (see "Creating a new
subfolder").

**Second example:** `Toast.tsx` is a small auto-dismissing confirmation
(hook + portalled component) used by unrelated `src/features/` owners for
local-only "saved"/"selected" feedback. Unlike `LanguageSelector.tsx`, it
has no app-context dependency at all — it would fit the domain-agnostic
criteria for `ui/`, but that folder is a specifically audited
shadcn/Radix-primitive inventory with a guard asserting its exact file set
(see `docs/ui-component-ownership.md`); a hand-built, non-shadcn addition
stays out of that audit and lives at the components root instead.

## dialogs/

`dialogs/` contains only globally orchestrated dialogs that:

- are rendered directly by `App.tsx`;
- are controlled by shared app-level hooks or state;
- are not owned by one page family or feature.

**Current examples:** `AccountOnboardingDialog.tsx` and
`AccountLanguageConfirmDialog.tsx`, both rendered from `App.tsx` and driven
by shared hooks (`useAccountOnboarding`, `useAccountLanguageConfirm`).

**Counter-example:** `LevelTestLanguageModal.tsx` belongs under
[`src/app/pages/level-test/`](../pages/level-test/) because it is owned by
that page family, even though it is visually a modal.

A component does not belong in `dialogs/` merely because it uses a dialog or
modal UI.

## layout/

`layout/` contains global application chrome and navigation used across the
app.

**Current examples:** `Header.tsx`, `ScrollToTopButton.tsx`,
`UILanguageSwitcher.tsx`.

Placement is based on global ownership and breadth of use, not on the word
"Layout" in a filename.

**Counter-example:** `WordPageLayout.tsx` belongs under
[`src/app/pages/word-pages/detail/`](../pages/word-pages/detail/) because it
is owned exclusively by the word-detail page family. Being rendered through
multiple internal rendering paths within that one family is not, by itself,
a reason to treat it as global layout.

## ui/

`ui/` contains domain-agnostic UI primitives and Radix/shadcn-style
wrappers.

Files in `ui/` may import:

- React;
- Radix primitives;
- generic icon libraries;
- styling utilities;
- sibling `ui/` primitives.

Files in `ui/` must **not** import:

- application routes;
- pages;
- features;
- `LanguageContext` or other app-specific contexts;
- vocabulary or SEO data;
- Supabase or business logic;
- product-specific state.

Lowercase filenames (`button.tsx`, `dialog.tsx`, ...) are intentional and
follow the existing primitive-library convention. `utils.ts` belongs to this
layer because it provides the generic `cn` styling helper, used internally
by the other `ui/` files.

Do not add unused primitives speculatively — only add a file here when a
real consumer needs it. See
[`docs/ui-component-ownership.md`](../../../docs/ui-component-ownership.md)
for the detailed primitive inventory and historical audit.

## Components, pages, and features

- Generic design-system primitive → `src/app/components/ui/`
- Global navigation or application chrome → `src/app/components/layout/`
- App-shell-orchestrated global dialog → `src/app/components/dialogs/`
- App-specific component shared by unrelated owners → `src/app/components/`
- Component owned by one page family → `src/app/pages/<family>/`
- Component owned by one product workflow or feature → `src/features/<feature>/`

Edge cases:

- Reuse by two files within the same page family does not make a component
  globally shared — it stays with that page family.
- Reuse by two rendering pipelines of the same page family does not move
  ownership to `src/app/components/`.
- A visually generic modal may still be page- or feature-owned (see
  `LevelTestLanguageModal.tsx` above).
- A filename containing "Layout" does not automatically make the component
  global layout (see `WordPageLayout.tsx` above).
- A component used by several pages that all belong to one feature should
  remain inside that feature, not move here.

## Dependency direction

As an architectural convention (not currently machine-enforced for this
folder):

- pages and features may import app components;
- app components must not import from `src/app/pages/`;
- app components must not import from `src/features/`;
- `ui/` must remain domain-agnostic (see import list above);
- app-specific root, `layout/`, and `dialogs/` components may use shared
  contexts, hooks, `lib/` modules, and `ui/` primitives when appropriate.

## Creating a new subfolder

Create a new subfolder under `src/app/components/` only when:

- at least two files share a clear ownership category;
- the category is materially distinct from `dialogs/`, `layout/`, and `ui/`;
- the folder name communicates specific ownership.

Avoid one-file subfolders unless the boundary is unusually important.
Explicitly avoid vague catch-all names such as `shared/`, `common/`,
`miscellaneous/`, or `overlays/`.

## Placement checklist

1. Is it a generic domain-agnostic primitive? → `ui/`
2. Is it global navigation or app chrome? → `layout/`
3. Is it a dialog rendered and orchestrated by the app shell? → `dialogs/`
4. Is it app-specific and shared by unrelated owners? → components root
5. Is it owned by one page family? → `pages/<family>/`
6. Is it owned by one feature or workflow? → `features/<feature>/`

If ownership is unclear, inspect actual consumers before choosing a folder.

## Anti-patterns

- Placing a component in `layout/` only because its filename contains
  "Layout."
- Placing every modal in `dialogs/`.
- Using `shared/` as a catch-all.
- Creating a subfolder for one file without a real ownership boundary.
- Placing page-owned supporting components in the components root.
- Importing app-specific contexts or business logic into `ui/`.
- Adding unused UI primitives "for completeness."

## Related documentation

- [`docs/architecture.md`](../../../docs/architecture.md) — full repository
  architecture and ownership history.
- [`docs/ui-component-ownership.md`](../../../docs/ui-component-ownership.md)
  — detailed `ui/` primitive inventory and historical audit.
- [`src/features/user-profile/README.md`](../../features/user-profile/README.md)
  — example of a feature-local ownership README.
