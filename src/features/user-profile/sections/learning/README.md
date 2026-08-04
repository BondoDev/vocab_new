# FluentStellar Learning System

## Overview

FluentStellar provides three different learning modes, each designed for a different purpose.

Although they all use the same exercise components, they affect the user's learning progress differently.

| Learning mode | Purpose | Updates learning progress |
|--------------|---------|---------------------------|
| Study New Words | Learn new vocabulary | ✅ Yes |
| Review Words | Reinforce previously learned vocabulary | ✅ Yes |
| Custom Practice | Free practice without affecting progress | ❌ No |

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

using an atomic database transaction.

Each word can only be inserted once.

Duplicate saves are prevented.

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

Review persistence is fully atomic.

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
- daily learning statistics;
- spaced repetition progress.

It behaves exactly like a sandbox.

Future versions may store separate practice statistics without affecting structured learning.

---

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
