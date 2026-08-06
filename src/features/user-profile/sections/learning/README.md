# FluentStellar Learning System

## Overview

FluentStellar provides three different learning modes, each designed for a different purpose.

Although they all use the same exercise components, they affect the user's learning progress differently.

| Learning mode | Purpose | Updates learning progress | Tracks active time |
|--------------|---------|---------------------------|---------------------|
| Study New Words | Learn new vocabulary | ✅ Yes | ✅ `study_time_seconds` |
| Review Words | Reinforce previously learned vocabulary | ✅ Yes | ✅ `review_time_seconds` |
| Custom Practice | Free practice without affecting progress | ❌ No | ✅ `custom_practice_time_seconds` only — see "Active-Time Tracking" below |

---

# 1. Study New Words

## Purpose

Study New Words is used to introduce vocabulary that the user has never learned before.

Words are presented in a carefully arranged learning order rather than alphabetically. The order is designed to introduce vocabulary naturally, beginning with the most useful and fundamental concepts.

The number of words presented during a session is determined by the user's daily learning goal.

---

## Queue generation

The queue is built from:

- the arranged vocabulary order;
- the user's target language;
- words that are **not yet present** in `user_word_progress`.

Previously learned words are never selected.

---

## Session flow

Each new word passes through three individual typing exercises.

The exercise components themselves are reused from the general practice system.

Example:

1. Broken Word
2. Half Word
3. Full Word Typing

After all required exercises are completed successfully, the word is considered learned.

---

## Database updates

Completing a word inserts a new row into:

`user_word_progress`

Initial values:

- state = `seen`
- correct_streak = 0
- last_practiced_at = current database time
- next_review_at = approximately 1 day later (±10% random variation)

The same operation also updates:

`user_daily_stats.new_words_completed`
`user_daily_stats.study_time_seconds` (the word's active exercise time — see "Active-Time Tracking" below)

using an atomic database transaction.

Each word can only be inserted once.

Duplicate saves are prevented — and because the time increment lives in the
same atomic transaction as the count increment, a duplicate/retried save
never double-counts either one.

---

## Purpose of the initial "Seen" state

A newly studied word has been introduced but has not yet demonstrated long-term retention.

It must later be reinforced through Review Words before progressing to higher learning states.

---

# 2. Review Words

## Purpose

Review Words reinforces vocabulary that has already been learned.

Unlike traditional spaced repetition systems that schedule exact review dates, FluentStellar uses a hybrid review algorithm combining weighted randomness with maximum waiting-time guarantees.

This produces more natural review sessions while ensuring no word remains forgotten indefinitely.

---

## Review queue

The queue is built only from words stored in:

`user_word_progress`

Only the currently selected target language is considered.

Each session normally contains:

- overdue words
- weighted-random review words

The overdue share is configurable.

---

## Hybrid selection algorithm

Words are selected using three factors.

### 1. Learning state

Lower states receive larger weights.

Example:

Seen > Learning > Familiar > Strong > Mastered

---

### 2. Recent practice

Recently reviewed words become less likely to appear again.

For users with fewer than 100 learned words in the active language, the hard two-hour exclusion is bypassed so newly learned vocabulary can be reviewed immediately.

At 100 or more learned words, the normal cooldown rules apply.

---

### 3. Maximum review interval

Every learning state defines a maximum time a word should remain without review.

Current base intervals:

| State | Maximum interval |
|--------|------------------|
| Seen | 1 day |
| Learning | 3 days |
| Familiar | 10 days |
| Strong | 45 days |
| Mastered | 180 days |

When the deadline expires, the word receives overdue priority until reviewed.

This guarantees that every word eventually returns.

---

## Review session structure

Words are processed in groups of four.

For every complete group:

Word 1

→ one random typing exercise

Word 2

→ one random typing exercise

Word 3

→ one random typing exercise

Word 4

→ one random typing exercise

Then:

→ one random reinforcement exercise using those same four words.

Possible typing exercises:

- Full Word Typing
- Half Word
- Broken Word

Possible reinforcement exercises:

- Connect Words
- Listening

The reinforcement exercise does **not** affect learning progress.

Its purpose is additional exposure only.

---

## Review outcomes

Every reviewed word finishes with exactly one result.

### Correct

Requirements:

- no completed incorrect answer;
- word solved successfully;
- hints are allowed.

Effects:

- increase correct streak;
- promote when threshold reached;
- update review dates.

---

### Incorrect

Requirements:

- at least one completed full-length incorrect answer.

A temporary incomplete answer is **not** considered a mistake.

Example:

Target:

Apple

Typing:

A

Ap

App

Appl

None of these are mistakes.

Typing:

Aplle

Every letter position is filled.

The completed word is wrong.

This is one mistake.

Even if the user later corrects it to:

Apple

the review result remains **incorrect**.

Effects:

- demote one learning state;
- reset correct streak;
- update review dates.

---

### Skipped

Triggered by:

- Skip
- Show Word

Effects:

- learning state unchanged;
- correct streak unchanged;
- review interval restarted.

---

## Learning states

Current progression:

Seen

↓

Learning

↓

Familiar

↓

Strong

↓

Mastered

Promotion thresholds:

Seen → Learning

1 consecutive correct review

Learning → Familiar

2 consecutive correct reviews

Familiar → Strong

3 consecutive correct reviews

Strong → Mastered

4 consecutive correct reviews

Demotion:

Seen → Seen

Learning → Seen

Familiar → Learning

Strong → Familiar

Mastered → Strong

---

## Atomic persistence

Every completed typing exercise immediately updates the database.

Each review generates one unique review event.

This prevents duplicate state changes caused by:

- network retries
- double clicks
- browser refreshes
- repeated RPC calls

Review persistence is fully atomic — including `user_daily_stats.
review_time_seconds`, incremented in the same transaction as `reviews_
completed` and the same idempotency event, so a replayed review event never
double-counts either one. See "Active-Time Tracking" below. Reinforcement
(group) exercises are never timed or persisted — only each word's individual
typing exercise is.

---

# 3. Custom Practice

## Purpose

Custom Practice allows users to freely practise vocabulary without affecting their learning progress.

Users may choose:

- exercise types;
- filters;
- vocabulary subsets.

Custom Practice is intended for experimentation and additional repetition.

---

## Database behaviour

Custom Practice intentionally does **not** update:

- learning state;
- correct streak;
- review deadlines;
- `new_words_completed` / `reviews_completed`;
- spaced repetition progress;
- `user_word_progress` in any way;
- `review_events`.

It behaves exactly like a sandbox for progress purposes.

As of Learning Statistics Phase 1, Custom Practice records exactly one
thing: active time spent per single-word typing exercise (Broken Word, Half
Word, Full Word Typing), written to `user_daily_stats.
custom_practice_time_seconds` through a narrow, dedicated RPC
(`complete_custom_practice_word`) and its own idempotency ledger
(`custom_practice_events` — deliberately not `review_events`, whose schema
describes a state transition Custom Practice must never produce). Four-word
group exercises (Connect Words, Listening) are not timed in this phase. See
"Active-Time Tracking" below.

---

# Active-Time Tracking (Learning Statistics Phase 1)

## Three independent columns

`user_daily_stats` gained two columns alongside the existing
`study_time_seconds`:

| Column | Meaning |
|---|---|
| `study_time_seconds` | Active time from Study New Words only |
| `review_time_seconds` | Active time from Review Words only |
| `custom_practice_time_seconds` | Active time from Custom Practice only |

`total_time_seconds` is **never stored**. It is derived at read time as
`study_time_seconds + review_time_seconds + custom_practice_time_seconds`
(`src/lib/learningTimeStats.ts`). As of this phase, no UI displays any of
these — the data contract exists for a future Statistics page.

## Word-level timing, not per-exercise

Time is measured per completed word, across every exercise that word's mode
requires — not saved after each individual exercise. A Study New Words word
(3 exercises: Broken Word, Half Word, Full Word Typing) contributes one
combined duration. A Review Words word (1 typing exercise) contributes its
own duration; its group/reinforcement exercise is never timed. A Custom
Practice single-word exercise contributes its own duration; four-word group
exercises are not timed in this phase.

## Visible-tab-only, capped, whole-second

The shared timer (`src/data/learning/activeWordTimer.ts`) starts once a word
is fully visible, pauses immediately if the tab is hidden
(`document.visibilityState`), resumes when visible again, and freezes the
instant the word's exercise sequence finishes. Duration is
`floor(activeMilliseconds / 1000)`, capped at `MAX_WORD_TIME_SECONDS` (300)
— one named constant the frontend and every one of the three RPCs
independently enforce. No `setInterval`, no live-updating display, no
localStorage, no mouse/keyboard activity tracking in this phase.

## Idempotency — why a retry never double-counts

Each mode's existing idempotency mechanism is what the time increment rides
on, not a separate check:

- **Study New Words** — `user_word_progress`'s unique
  `(user_id, word_id, target_language)` constraint. A retry's insert
  conflicts and does nothing, so the `if v_inserted` branch that adds
  `p_study_time_seconds` never runs a second time.
- **Review Words** — `review_events.event_id`, now inserted *before*
  `user_word_progress`/`user_daily_stats` are touched (closing a race the
  original write order had — see `supabase/README.md`'s Corrective
  Migration 5). A retried or concurrently-duplicated event id adds
  `p_review_time_seconds` zero additional times.
- **Custom Practice** — its own new `custom_practice_events.event_id`
  ledger, `ON CONFLICT (event_id) DO NOTHING` as the atomic gate.

## Error/retry behavior

On a failed save, the frozen duration and event id (where applicable) are
reused verbatim on retry — the timer is never restarted, the duration is
never recomputed or increased. Study New Words and Review Words keep their
existing blocking save-and-retry UI (word does not advance until the save
succeeds). Custom Practice has no such screen today and this phase does not
add one — its time-save is fire-and-forget and never blocks or errors
visibly; its idempotency ledger is what keeps a lost/duplicated call safe.

## Server-derived learning dates

Learning date attribution is authoritative on the database side. The
Study, Review, and Custom Practice RPC signatures do not accept
`p_stat_date`; they derive one date from Supabase server time and
`user_profiles.timezone`, falling back to UTC when the stored timezone is
null, blank, invalid, or the profile row is missing. The old date-taking
signatures existed only as temporary compatibility wrappers during the
staged rollout and have since been dropped — an older frontend build that
still sends `p_stat_date` now fails outright with `PGRST202` instead of
being silently accepted.

Study stores `user_word_progress.first_studied_stat_date` on the first
successful completion and never changes it on duplicate retries. Review
stores `review_events.stat_date`; Custom Practice stores
`custom_practice_events.stat_date`. Duplicate retries reuse those stored
dates, so a retry after midnight or after a timezone change does not move
an already-successful event to another day. Offline saves count on the
server submission day because no client event date is trusted.

Frontend dashboard reads call `get_current_learning_date()` before filtering
`user_daily_stats`, so Today's Progress, Daily Streak, and Study queue
preparation agree with write attribution. Local device time is no longer
authoritative for learning stats. Historical `user_daily_stats` rows are
unchanged, and the streak completion rule remains
`new_words_completed >= current profile daily_goal`.

# Shared Exercise Components

All three learning modes reuse the same exercise implementations.

No duplicated exercise logic exists.

Current exercise library:

Individual exercises:

- Full Word Typing
- Half Word
- Broken Word

Group exercises:

- Connect Words
- Listening

Different learning modes determine **when** exercises appear and **whether** results affect learning progress.

The exercise components themselves remain shared.

---

# Design Philosophy

The learning system separates three independent goals:

**Study New Words**

Introduce vocabulary in a carefully designed order.

**Review Words**

Strengthen long-term memory through adaptive spaced repetition.

**Custom Practice**

Allow unrestricted practice without influencing learning progress.

Keeping these responsibilities separate makes the learning system easier to understand, easier to maintain, and easier to extend with future learning modes.
