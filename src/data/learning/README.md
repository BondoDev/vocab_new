# Learning Data

## Purpose

`src/data/learning/` owns shared runtime data and pure learning-plan logic for
structured learning flows: ordered word plans, daily study sequencing, and
other data-driven decisions about what a learner should study next.

This is product learning data, not SEO content, profile UI, or practice-session
implementation detail. It belongs under `src/data/` so profile, practice,
learning setup, and future scheduling code can consume one shared source of
truth without importing from another feature's private folder.

## Current Files

- `vocabulary_aranged.json` - hand-authored ordered vocabulary list. Each entry
  has:
  - `id`: the stable 1-based learning-order position.
  - `concept_id`: the vocabulary concept ID to study at that position.
- `newWordStudyQueue.ts` - import-free queue-selection logic for Study New
  Words. It parses and normalizes the arranged vocabulary source, filters
  already-studied concepts, applies the daily target, and returns resolved queue
  metadata. It stays here because it is pure learning-plan logic over shared
  data, not React UI or a feature-private component.
- `localStudyDate.ts` - small local-calendar date helper used by learning
  progress reads until the app has a broader user-timezone system. This is
  runtime support logic rather than a dataset; keep it narrow and revisit its
  owner if additional non-learning consumers appear.
- `wordReviewSchedule.ts` - import-free review-deadline calculation
  (`computeNextReviewAt`) and centralized per-word-state base review
  intervals. Documents (and is unit-tested against) the same "base interval +
  one-time jitter" formula the `complete_new_word_study` database function
  applies when it sets `next_review_at` on insert — the two must be kept in
  sync by hand, since the RPC cannot import TypeScript. A future Review Words
  phase should read `BASE_REVIEW_INTERVAL_MS_BY_STATE` from here instead of
  hardcoding its own per-state intervals.

## Ownership Rules

- Keep shared learning-plan datasets in this folder.
- Keep pure, import-free learning-plan selection logic here when it operates on
  shared learning data and must stay usable by scripts/tests without React,
  Supabase, or feature internals.
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
