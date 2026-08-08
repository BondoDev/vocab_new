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
- `activeWordTimer.ts` - Learning Statistics Phase 1's shared, testable
  active-time timer (`createActiveWordTimer`), used by all three learning
  modes (Study New Words, Review Words, Custom Practice) to measure exactly
  one word's active exercise time. Monotonic clock only (`performance.now()`
  by default, injectable), no `setInterval`, no React state, no
  localStorage, no mouse/keyboard tracking — the only external signal it
  reacts to is `document.visibilityState` (pauses immediately when hidden,
  resumes when visible again), via an injectable document-like target so it
  stays usable in tests/SSR. One instance per session component, reset+
  started per word, `freeze()`d once the word's exercise sequence finishes
  (idempotent — a save retry gets back the exact same cached duration, never
  recomputed). Exports `MAX_WORD_TIME_SECONDS` (300) and
  `isValidWordTimeSeconds`, the same bound/shape both the frontend
  (`src/lib/newWordProgress.ts`, `src/lib/customPracticeProgress.ts`) and the
  database (`complete_new_word_study`/`complete_word_review`/
  `complete_custom_practice_word`) independently validate — see
  `supabase/README.md`'s Corrective Migration 5 section. Zero imports.

- `milestones.ts` - the centralized milestone system (Phase 1): the
  ascending, hand-authored per-track target lists (Vocabulary/Mastery/
  Reviews/Consistency) and the pure `evaluateMilestoneTrack`/
  `evaluateAllMilestoneTracks` engine that turns already-computed metrics
  (learned/mastered word counts, total reviews, current streak days) into
  per-track progress — current value, next/previous milestone, clamped
  progress ratio, and track-complete state. Import-free, no translated
  labels (those live in the interface JSON files, keyed by each
  milestone's stable `id`). No persistence, no unlock history, no
  notifications yet — see this module's own header for what Phase 2 would
  add.
- `milestoneStreak.ts` - pure current-streak computation for the Milestones
  Consistency track (`computeMilestoneStreak`), distinct from
  `dailyStreak.ts`'s goal-based Daily Streak card streak: a day here
  qualifies from any recorded activity (`new_words_completed > 0` OR
  `reviews_completed > 0`), not from meeting a daily goal. Only imports
  `addDaysISO` from `dailyStreak.ts`.
- `vocabularyGrowth.ts` - pure history-reconstruction/aggregation engine
  for the Progress page's "Vocabulary Growth" chart
  (`computeVocabularyGrowthHistory`, `filterVocabularyGrowthByRange`,
  `applyCurrentDayOverride`, `resolveWordCreatedDateISO`). Reuses
  `vocabularyCategory.ts`'s own `mapWordStateToVocabularyCategory` — no new
  state model. Wired to real Supabase data via
  `src/features/user-profile/sections/progress/loadVocabularyGrowthHistory.ts`,
  which calls the narrow `read_vocabulary_growth_events` RPC
  (`supabase/migrations/20260808130000_add_vocabulary_growth_events_rpc.sql`)
  — `review_events` itself stays exactly as locked down as before (RLS
  enabled, zero policies, no client table grant); this RPC is the smallest
  fix that exposes a caller's own transition history without reopening
  that table broadly. Operates entirely on already-resolved YYYY-MM-DD
  dates (the RPC resolves `stat_date`/`last_practiced_at` server-side; the
  loader resolves `user_word_progress.first_studied_stat_date`/`created_at`
  client-side via `resolveWordCreatedDateISO`) — see this module's own file
  header for the full data-model finding and
  `scripts/tests/learning/test-vocabulary-growth.mjs` for coverage. Only
  imports `mapWordStateToVocabularyCategory` from `vocabularyCategory.ts`
  and `addDaysISO` from `dailyStreak.ts`.

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
