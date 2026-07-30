# Learning Data

## Purpose

`src/data/learning/` owns shared runtime data for structured learning flows:
ordered word plans, daily study sequencing, and other data that decides what a
learner should study next.

This is product learning data, not SEO content, profile UI, or practice-session
implementation detail. It belongs under `src/data/` so profile, practice,
learning setup, and future scheduling code can consume one shared source of
truth without importing from another feature's private folder.

## Current Files

- `vocabulary_aranged.json` - hand-authored ordered vocabulary list. Each entry
  has:
  - `id`: the stable 1-based learning-order position.
  - `concept_id`: the vocabulary concept ID to study at that position.

## Ownership Rules

- Keep shared learning-plan datasets in this folder.
- Do not place SEO page content here; use `src/data/seo/` for SEO-owned data.
- Do not place profile-only UI copy or components here; use
  `src/features/user-profile/` or interface translations as appropriate.
- Do not place practice-only runtime state here unless it is also a shared
  learning-system contract.
- Treat `concept_id` values as references into the canonical vocabulary data
  under `src/data/vocabulary/`.
- Preserve order intentionally. Reordering entries changes the learner's study
  path and should be reviewed as a behavioral change.

## Editing Policy

The current JSON is hand-authored. If a generator is introduced later, document
the source inputs and generation command here before replacing manual edits.
