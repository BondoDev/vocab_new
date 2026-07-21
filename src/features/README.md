# Features

## Purpose

`src/features/` contains cohesive, user-facing workflows or domain
capabilities — not a technical grouping like "components" or "utils." A
feature owns everything needed to deliver its workflow end-to-end:

- its entry UI;
- feature-specific components;
- feature-specific exercises or screens;
- feature-specific utilities and policies;
- feature-specific data and styles.

This folder is organized by *what the user is doing*, not by file type.

## Current Features

### `learning-setup`

Owns the pre-practice configuration workflow: level/category/word-type
selection and exercise selection, including its own feature-owned category
configuration.

### `practice`

Owns the practice-session runtime: session orchestration, exercise
implementations, Practice-specific components, and Practice-owned
utilities.

### `user-profile`

Owns the user-facing `/profile` route UI. Authentication, account
lifecycle, and profile data access remain outside this feature, in their
existing `src/app/` and `src/lib/` owners — see
[`user-profile/README.md`](user-profile/README.md) for the detailed split.

## What Qualifies as a Feature

A folder belongs under `src/features/` when it:

- represents a cohesive user-facing workflow or domain capability;
- owns meaningful UI or runtime behavior end-to-end;
- has a stable responsibility broader than one small component;
- can be composed by the application shell without exposing private
  internals.

A folder does **not** qualify merely because it groups files by technical
type (`components/`, `hooks/`, `utils/`) rather than by capability — that
grouping belongs inside a feature, or inside `src/app/`, not as a feature
itself.

A route alone does not automatically qualify as a feature. A reusable
component alone does not automatically qualify as a feature either — both
need the broader, end-to-end ownership described above.

## Ownership Rule

**The narrowest stable owner wins.** A file belongs inside a feature when
that feature owns it and no stronger shared owner exists.

Examples:

- a helper used only by Practice stays under `practice/` even if its
  algorithm looks generic;
- feature-owned data stays beside the feature;
- a component shared only among one feature's screens remains
  feature-owned.

A file should leave a feature only once real consumers establish a
broader owner — never based on hypothetical future reuse.

## Feature Boundaries

Features must not import another feature's private internals.

**Allowed:**

- `App.tsx` composing feature entry points;
- plain props and callbacks passed through app-level composition;
- neutral shared contracts (see below);
- shared contexts (`src/contexts/`);
- shared `lib/`/`data/` infrastructure.

**Not allowed:**

- importing another feature's components, exercises, utils, pages, or
  private data directly;
- reaching through another feature to reuse an implementation detail;
- one feature owning another feature's workflow state.

**Concrete example:** `learning-setup` selects exercise IDs;
`App.tsx` carries the selected state as props; `practice` executes the
selected exercises. Neither feature imports the other.

## Neutral Shared Contracts

`src/exercises/` holds contracts shared by `learning-setup` and
`practice` — canonical exercise IDs (`exerciseIds.ts`) and exercise
presentation/theme mappings (`exerciseTheme.ts`). This folder sits
outside both features intentionally: a contract with more than one
feature consumer cannot be owned by either consumer without creating a
feature-to-feature dependency.

Canonical exercise IDs are persisted (`localStorage`) and used as
translation-key segments, making them a stable contract — do not rename
or reorder them casually; see `exerciseIds.ts`'s own header comment for
the full constraint.

Feature-private exercise implementations still belong under
`practice/exercises/` — the neutral folder holds only the shared
contract, never feature-specific behavior.

## Features versus App

`src/app/` owns application-shell concerns: route composition, app-wide
hooks and lifecycle orchestration, shared app components and dialogs, and
app-level routing/preference policy.

Features expose cohesive workflow entry points that `App.tsx` composes. A
feature should not absorb app-shell ownership merely because `App.tsx`
renders it — see [`../app/hooks/README.md`](../app/hooks/README.md) §2
for the same principle applied to hooks.

## Features versus Pages and Components

- `src/app/pages/` holds route/page composition that is not itself a
  reusable workflow feature.
- `src/app/components/` holds application-shared UI.
- Feature-specific pages and components stay inside the feature that owns
  them.
- A component moves to `src/app/components/` only after it gains real,
  unrelated app-wide consumers — not in anticipation of that.

See [`../app/pages/README.md`](../app/pages/README.md) §"Pages versus
features" and [`../app/components/README.md`](../app/components/README.md)
§"Components, pages, and features" for the full rules this section
summarizes.

## Features versus Shared Infrastructure

The following remain outside feature folders when their ownership is
genuinely broader than one feature:

- `src/contexts/`
- `src/lib/`
- `src/data/`
- `src/seo/`
- `src/utils/`
- app-level utilities and hooks (`src/app/utils/`, `src/app/hooks/`)

Examples: profile data access remains in `src/lib/userProfile.ts`; account
lifecycle remains in app hooks/utils; shared vocabulary datasets remain in
`src/data/`.

## Internal Structure

A feature folder uses only the subfolders justified by its actual
complexity. Valid examples include `components/`, `pages/`, `exercises/`,
`utils/`, `data/`, `styles/` — but not every feature needs every
subfolder, small features should stay flat, one-file subfolders should be
avoided, and internal symmetry across features is not required.

Current evidence: `practice` has multiple internal layers
(`components/`, `exercises/`, `utils/`); `learning-setup` stays mostly
flat; `user-profile` has `pages/`, `components/`, `styles/`. All three
shapes are correct for their own complexity, not for consistency with
each other.

## Public Entry Points

A feature may expose either direct entry files or a minimal `index.ts`
public barrel — the choice should reflect actual import and lazy-loading
needs, not a desire for consistency across features.

- `learning-setup` and `practice` expose direct lazy entry files (no
  barrel).
- `user-profile` uses a minimal barrel exporting only its public page.

Private internal files must not be re-exported without a real external
consumer.

## Placement Checklist

Before adding a file under `src/features/`, ask:

1. Which user-facing workflow owns it?
2. Is it used only by one feature?
3. Is it app-shell logic instead?
4. Is it shared infrastructure?
5. Is it owned by one page or component rather than a full feature?
6. Would placing it here create a feature-to-feature dependency?
7. Does a neutral shared contract already exist for this responsibility?
8. Is a new feature folder truly justified?

## Anti-patterns

- Creating a feature for one small component.
- Grouping files by technology instead of workflow.
- Importing another feature's private files.
- Promoting hypothetical shared code prematurely.
- Using feature folders as general dumping grounds.
- Forcing identical internal structures across all features.
- Creating broad `shared/` folders without multiple real owners.

## Documentation Maintenance

When feature folders or ownership boundaries change, review this README
and the affected feature-specific README. Update documentation only when:

- feature ownership changes;
- public entry points change;
- internal folder responsibilities change;
- dependency rules change;
- links or examples become stale.

Ordinary implementation changes do not require documentation edits.

## Related Documentation

- [`user-profile/README.md`](user-profile/README.md)
- [`../app/pages/README.md`](../app/pages/README.md)
- [`../app/components/README.md`](../app/components/README.md)
- [`../app/hooks/README.md`](../app/hooks/README.md)
- [`../app/utils/README.md`](../app/utils/README.md)
- [`../utils/README.md`](../utils/README.md)
- [`../../docs/architecture.md`](../../docs/architecture.md)
- [`../../docs/import-boundaries.md`](../../docs/import-boundaries.md)
