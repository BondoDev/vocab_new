# Practice

## Purpose

`practice/` owns the runtime vocabulary practice session — the workflow
that runs once a user has configured what to practice.

It owns:

- session orchestration;
- exercise execution;
- Practice-specific presentation;
- Practice-specific utilities;
- exercise-family shared components.

It does not own:

- the application shell;
- the learning-setup workflow;
- account lifecycle;
- shared vocabulary/metadata datasets;
- SEO;
- generic, repository-wide infrastructure.

## Current Structure

```
practice/
  VocabularyPractice.tsx
  components/
  exercises/
  utils/
```

- `VocabularyPractice.tsx` — the feature entry, coordinating one full
  session.
- `components/` — Practice-specific presentation for the session shell
  (header, loading, empty state, results).
- `exercises/` — exercise implementations and exercise-family shared UI.
- `utils/` — Practice-owned transformations, helpers, and session
  policies.

This README does not enumerate every file in these folders — see the
file itself for exact current contents.

## Feature Entry

`VocabularyPractice.tsx` is the feature's entry component and is
responsible for coordinating an entire practice session, at a high
level:

- selecting and rendering the active exercise;
- managing session state (progress, current word, completion);
- coordinating session statistics;
- orchestrating Practice-owned helpers (`components/`, `exercises/`,
  `utils/`).

This README documents its ownership scope, not its implementation —
read the file itself for behavior detail.

## Components

`components/` contains Practice-specific presentation components that
support the session UI (session header/chrome, loading state, empty
state, results summary). They are not generic application UI: they are
shaped around Practice's own session data and copy, with a single
consumer (`VocabularyPractice.tsx`) each today.

A component here should move to `src/app/components/` only if a real,
unrelated, application-wide consumer appears — not in anticipation of
one.

## Exercises

`exercises/` contains two kinds of files:

- individual exercise implementations, each owning its own behavior and
  private to Practice;
- exercise-family shared UI — e.g. a shared answer-input component,
  keyboard support, and layout/sizing helpers used across more than one
  exercise.

Shared exercise-family components remain in this folder rather than
moving to `src/app/components/` because they are owned collectively by
Practice's exercises, not by the application at large — their props,
data shapes, and behavior are exercise-specific, and they have no
consumer outside `practice/exercises/`.

Exercise implementations themselves are private to Practice and are not
imported from anywhere outside this folder.

## Utilities

`utils/` contains Practice-owned transformations, helper logic, and
session policies (e.g. randomizing exercise/word order, formatting text
for display, and session-scoped repeat/queue policy).

Ownership rule: a utility remains here for as long as Practice is its
only real owner. A generic-looking algorithm is not automatically
shared code — promotion out of `practice/utils/` requires an actual
consumer outside Practice, not the appearance of reusability.

## Shared Contracts

Practice depends on neutral shared contracts rather than owning them.

`src/exercises/` holds the canonical exercise identifiers and the shared
exercise presentation/theme mappings that both `learning-setup` and
`practice` depend on. These live outside Practice intentionally: a
contract consumed by more than one feature cannot be owned by either
consumer without creating a feature-to-feature dependency.

Practice owns exercise *implementations*; it does not own the shared
exercise-identifier contract itself.

## Relationship with Learning Setup

- `learning-setup` selects configuration (level, category, word types,
  which exercises are enabled).
- `App.tsx` composes both workflows and transfers the selection as
  plain state/props.
- `practice` executes the configured session.

Practice must not import `learning-setup` internals. `learning-setup`
must not import Practice internals. The two communicate only through
`App.tsx`-carried state and the neutral shared contracts in
`src/exercises/`.

## Relationship with App

`App.tsx` owns route composition, navigation, and application lifecycle.
Practice owns only the session workflow. `App.tsx` composes Practice as
a lazily-loaded route target; Practice does not own, and must not
absorb, application-shell responsibility merely because `App.tsx`
renders it.

## Internal Ownership Rules

- Exercise-specific helpers belong beside the exercise(s) that use them,
  under `exercises/`.
- Practice-wide helpers belong under `utils/`.
- Practice presentation belongs under `components/`.
- Feature-private logic stays inside `practice/` rather than moving out
  "for reuse."
- Do not move a file merely because it appears reusable — ownership
  follows real consumers, not the shape of the code.

## Internal Structure

Practice currently justifies its internal folders (`components/`,
`exercises/`, `utils/`) because it has meaningful internal layers with
distinct responsibilities. Future contributors should:

- preserve this cohesion rather than fragmenting it further;
- avoid unnecessary nesting;
- avoid one-file subfolders;
- avoid grouping by technology alone — any new subfolder needs a real
  ownership boundary, not just a shared file type.

## Dependency Rules

Practice may depend on:

- shared contexts (`src/contexts/`);
- shared data (`src/data/`);
- shared lib (`src/lib/`);
- the neutral shared contracts in `src/exercises/`;
- app-shared UI primitives where appropriate (e.g. `src/app/components/ui/`).

Practice should not depend on:

- another feature's private files;
- page-specific logic (`src/app/pages/`);
- unrelated app workflows.

## Placement Checklist

Before adding a file under `practice/`, ask:

- Is Practice the narrowest stable owner?
- Is it shared only inside Practice?
- Does another feature need it today (not hypothetically)?
- Is it really application-wide?
- Is it exercise-specific, or session-wide?

## Anti-patterns

- Promoting a utility out of Practice because it "looks generic."
- Importing another feature's implementation directly.
- Moving exercise-family helpers into `src/app/components/` without a
  real app-wide consumer.
- Creating shared folders without multiple real owners.
- Breaking cohesive session orchestration into arbitrary modules for
  their own sake.

## Documentation Maintenance

Review this README when:

- Practice's ownership scope changes;
- internal folder responsibilities change;
- the feature's public entry changes;
- dependency rules change.

Routine implementation changes do not require documentation edits.

## Related Documentation

- [`../README.md`](../README.md)
- [`../user-profile/README.md`](../user-profile/README.md)
- [`../../app/components/README.md`](../../app/components/README.md)
- [`../../app/pages/README.md`](../../app/pages/README.md)
- [`../../app/hooks/README.md`](../../app/hooks/README.md)
- [`../../app/utils/README.md`](../../app/utils/README.md)
- [`../../utils/README.md`](../../utils/README.md)
- [`../../../docs/architecture.md`](../../../docs/architecture.md)
- [`../../../docs/import-boundaries.md`](../../../docs/import-boundaries.md)
