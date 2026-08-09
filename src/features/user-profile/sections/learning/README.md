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
authoritative for learning stats.

As of Phase 1 of the profile-section data optimization, the single frontend
owner of that call is no longer `LearningSection.tsx` — it is
`useProfileSharedProgressData` (`src/features/user-profile/sections/
useProfileSharedProgressData.ts`), called exactly once from
`UserProfileDashboardPage`, the common parent of the Learning, Vocabulary,
and Progress sections. That hook calls `getCurrentLearningDate()` (waiting
for auth/profile readiness, refetching on an authenticated-user change, a
`user_profiles.timezone` change, or an explicit retry after a failure —
never on a practice-language change, since the date itself does not depend
on the target language) and exposes the result as two values —
`todayISO: string | null` and
`todayISOStatus: "loading" | "ready" | "unavailable" | "error"` — threaded
down as props through every section that needs them. `LearningSection`
passes them straight through to `TodayProgressCard` and `DailyStreakCard`
exactly as before; neither card, nor any section, calls
`getCurrentLearningDate()` itself. Because `UserProfileDashboardPage`
itself never unmounts while switching the active section, switching
Learning -> Vocabulary -> Progress -> Learning causes no additional date
requests for an unchanged (user, timezone) context — only the previously
inactive section's own remaining reads (its own `user_daily_stats` fetch)
run again.

The same hook is also the single owner of the signed-in user's
active-target-language `user_word_progress` rows (`readUserWordProgress`),
previously fetched separately by the Vocabulary section, Milestones, and
Vocabulary Growth. It exposes those as `wordProgressRows` +
`wordProgressStatus` (the same four-value status union), reset whenever the
active target language changes (these rows are language-scoped) as well as
on an authenticated-user change. `completeNewWordStudy`/`completeWordReview`
(`src/lib/newWordProgress.ts`) each call `notifyWordProgressChanged()`
(`src/lib/sharedProgressInvalidation.ts`) once their write succeeds — the
narrow invalidation/refetch mechanism this hook subscribes to, so a real
learning/review mutation refreshes the shared rows without depending on
`UserProfileDashboardPage` happening to unmount/remount across a route
change. A background refresh (a retry, a timezone change, or an
invalidation ping) for an *unchanged* context never regresses an
already-loaded `todayISO`/`wordProgressRows` value back to a loading/error
state — it keeps serving the last good value until the new one arrives, so
dependent counters never visually reset to zero; only a genuine first-load
failure for that context surfaces `"error"`.

`todayISOStatus`/`wordProgressStatus` exist specifically so a genuine RPC
failure is never indistinguishable from "no session" on the consuming
side. A failed date fetch is a shared-dependency failure: `LearningSection`
shows the one Retry banner (`isDateError`/`onRetryLearningDate`), and each
card enters its own `{ status: "blocked" }` load state — never fetching its
own statistics, and never presenting a "0 completed" / empty-stats result
as though it were successfully loaded data. Both cards render `"blocked"`
identically to their normal `"loading"` state (the same skeleton
placeholder), so there is no second, card-level error message. A
legitimately signed-out/no-session visitor (`todayISOStatus ===
"unavailable"`) is unaffected by this and keeps the pre-existing "ready,
0/empty" fallback, since that state is expected and not a failure. A
failed statistics read (as opposed to a failed shared-date/word-progress
fetch) remains section-specific, unchanged from before. A successful
daily-goal save still bumps `streakRefreshToken` to refetch
`DailyStreakCard`'s stored rows, but never causes a second
`getCurrentLearningDate()` call — the authoritative date does not change
when the goal changes.

## Streak Phase 1 — per-row daily-goal snapshots

`user_daily_stats.daily_goal` (nullable, added by
`supabase/migrations/20260806190000_add_daily_goal_snapshot_and_update_rpc.sql`)
is a per-day snapshot of the goal that was active when that row was
created — **not** a live mirror of the profile setting. Study, Review, and
Custom Practice all stamp it from the caller's current profile goal
(`coalesce(profile daily_goal, 15)`) the moment they create a new day's row,
whichever of the three happens first; only `new_words_completed` from Study
ever feeds streak completion, so Reviews and Custom Practice still never
complete a streak day on their own even though they can create — and stamp
the goal on — that day's row.

Today's snapshot changes live when the user changes today's goal: the
narrow `update_daily_goal` RPC updates `user_profiles.daily_goal` and every
`user_daily_stats` row the caller owns for the server-derived current date
(every `target_language`, in the same transaction). Previous dates are
never touched by that RPC or by anything else — once a day is no longer
"today," its stored snapshot is frozen for good.

The streak calculation (`src/data/learning/dailyStreak.ts`) resolves the
goal a row is judged against as `row.dailyGoal ?? LEGACY_DAILY_GOAL`: a
stored snapshot always wins; a legacy row written before this migration,
which permanently has `daily_goal = null`, falls back to a **fixed
constant** (`LEGACY_DAILY_GOAL`, `10` — the minimum of the five supported
presets, not the table's `15` default; see "Streak Phase 1 corrective fix"
below for why) — never to the live profile goal. `computeDailyStreakSummary`
takes no current-goal parameter at all, so nothing about the live
`user_profiles.daily_goal` can reach historical completion. **No historical
backfill was performed**, and none is planned, because there is no
trustworthy record of what the goal actually was on any day before this
snapshot existed — the fixed fallback is a deliberately approximate,
permanently stable stand-in, not an attempted reconstruction.
`streak_completed` remains a derived, not stored, value — computed fresh
from `new_words_completed` and the resolved goal on every read, same as
before this phase.

`DailyGoalSelector` now saves through the narrow `update_daily_goal` RPC
(via `src/lib/userProfile.ts`'s `updateDailyGoal`) instead of the broad
profile upsert every other profile-save flow used at the time this phase
shipped — it sends only the new goal, not the whole cached profile.
(Onboarding and language-confirm later moved onto their own narrow RPCs too,
in Profile Phase 1 — see `supabase/README.md` — so no profile-save flow uses
the broad upsert anymore; it no longer exists.) Manual timezone Settings
remains a separate, unfinished feature (see "Timezone Phase 1" in
`supabase/README.md`) — this phase does not touch it.

### Streak Phase 1 corrective fix — legacy fallback frozen to a constant

The fallback above originally read `row.dailyGoal ?? currentProfileDailyGoal`
— the *live*, mutable profile goal — so a legacy row's completion could
still change whenever the user changed today's goal. Because Streak Phase 1
shipped with no backfill, essentially every pre-existing row was (and,
absent a backfill, remains) a legacy row, so this reproduced the exact
historical-recalculation symptom the migration was meant to fix, for nearly
all real accounts.

The fix hard-codes the fallback to the exported `LEGACY_DAILY_GOAL`
constant and removes the current-goal parameter from
`computeDailyStreakSummary` entirely — enforced by the function's signature
(`(stats, todayISO)`, two parameters), not just by convention.
`DailyStreakCard.tsx` correspondingly no longer accepts or reads a
`dailyGoal` prop, and `LearningSection.tsx` no longer passes one to it.
`TodayProgressCard` is a separate component showing *today's* live
progress and is unaffected — it still reads the live profile goal, and
correctly should. This corrective fix is frontend/test/documentation only:
no migration, schema change, or production data backfill was involved, and
no `user_daily_stats`/`user_profiles` row was read or touched to make it.

**`LEGACY_DAILY_GOAL` is `10`, not `15`.** The first version of this fix
used `15` (matching `user_profiles.daily_goal`'s own table default), which
turned out to be its own, smaller version of the same bug: real production
history has legacy (`daily_goal IS NULL`) rows the user confirms they
actually completed — e.g. exactly 10 new words on a day they met a real
goal of 10 — that a `15` fallback would wrongly read as failed, erasing an
earned streak day. `10`, the minimum of the five supported presets, is the
only fixed value that can never wrongly fail a legacy row for meeting the
lowest goal any account could have had. It is still only an approximation
— a legacy row whose real goal was actually higher than 10 will be
over-credited — but the original per-day goal for these rows was never
recorded and cannot be reconstructed in either direction; `10` is the
least-wrong fixed choice available, not a claim of exact historical
accuracy.

**Calendar day-status model.** `DailyStreakDayStatus` (`"completed" |
"failed" | "inProgress" | "future"`, exported from `dailyStreak.ts`) is the
single classification both the streak-count math and
`DailyStreakCard.tsx`'s weekly-strip rendering derive from:

- `completed` — met its effective goal; renders green (`--success`).
- `failed` — a *past* date that didn't meet its effective goal, **including
  a past date with no `user_daily_stats` row at all** (a missing row is
  itself a failed day, not an unknown one); renders red (the shared
  `--destructive` theme token). Nothing is written to the database to
  produce this — the calendar still only generates seven dates client-side
  and classifies whichever have no matching row.
- `inProgress` — today, before its goal is met; neutral, never red, because
  the day isn't over.
- `future` — any date after today; always neutral.

Every day also carries an accessible label (`Completed` / `Goal not
completed` / `In progress` / `Future date`, localized in all 7 interface
files) via its list item's `aria-label` — the distinction is never
color-only.

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
