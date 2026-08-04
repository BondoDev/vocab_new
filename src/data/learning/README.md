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
  intervals, now populated for all five states (seen/learning/familiar/
  strong/mastered — 1/3/10/45/180 days). Documents (and is unit-tested
  against) the same "base interval + one-time ±10% jitter" formula two SQL
  functions apply when they set `next_review_at`, each computed from the
  database's own clock: `complete_new_word_study` (Study New Words — always
  writes "seen") and `complete_word_review` (Review Words Phase 3 — can
  write any of the five states). Both are SQL and cannot import TypeScript,
  so if either this map or the jitter fraction changes, update the matching
  SQL by hand.
- `reviewOutcomeTransition.ts` - pure outcome-mapping
  (`determineReviewOutcome`) and state-transition (`computeReviewStateTransition`)
  logic for Review Words Phase 3, mirroring the `complete_word_review` SQL
  function's promotion thresholds/demotion map/streak rules exactly. The
  database recalculates from its own locked row and remains authoritative;
  this module exists so the same rules are unit-testable without one. Only a
  type-only `WordState` import.
- `reviewQueueConfig.ts` - centralized, single-module configuration for the
  Review Words hybrid *selection* engine (Phase 1): session size default,
  per-state weighted-random weights, per-state overdue-urgency multipliers,
  the overdue session share target, the recent-practice cooldown
  thresholds/factors, the deadline-approach factor shape, and
  `REVIEW_SMALL_LIBRARY_WORD_COUNT_THRESHOLD` (100) — below this many total
  learned words, the two-hour "just practiced" cooldown tier is bypassed
  entirely so a learner reviewing right after an early Study New Words
  session isn't met with an empty queue. Base review intervals live solely
  in `wordReviewSchedule.ts` now (the write-side phase that actually needed
  them arrived) — import from there instead of keeping a second copy here.
  Import-free apart from a type-only `WordState` import.
- `reviewQueueWeights.ts` - two focused, reusable, injectable-random helpers:
  `weightedSampleWithoutReplacement` (Efraimidis-Spirakis weighted sampling
  without replacement) and `shuffleWithRandomFn` (Fisher-Yates with an
  injected random source, unlike `src/utils/shuffleArray.ts`). Zero imports.
  Also reused by `src/features/review-words/reviewSessionPlan.ts` (Phase 2)
  for its own typing/group exercise randomization — a generic shuffle
  helper, not the queue-selection algorithm itself.
- `reviewQueue.ts` - the pure hybrid review-queue selection engine
  (`selectReviewQueue`) plus a resolver-injected orchestration layer
  (`selectReviewQueueWithResolution`) that backfills selections whose
  vocabulary concept fails to resolve. Never recalculates `next_review_at` —
  it only reads the already-persisted deadline. Never imports Supabase,
  React, routing, or vocabulary data; see the module's own header comment for
  the full algorithm (overdue-priority formula, recency cooldown,
  deadline-approach factor, overdue/random pool composition, small-library
  cooldown bypass). Selection and persistence remain separate concerns —
  Review Words Phase 3 (`complete_word_review`) never touches this file.

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
