# Supabase

## Purpose

This folder brings the FluentStellar learning system's live Supabase schema
under version control. Before this existed, the schema, RLS policies, and
the two learning RPCs (`complete_new_word_study`, `complete_word_review`)
lived only in the Supabase dashboard — unreviewed, undiffable, and with no
record of who changed what.

## Current state: catalog-confirmed baseline

`migrations/20260804192152_baseline_existing_learning_system_schema.sql` is
an as-is snapshot of the live schema, assembled from a read-only
database-security audit (catalog queries run directly against the live
project's `pg_attribute`/`pg_class`/`pg_constraint`/`pg_policies`/`pg_proc`
— via `format_type()`, `pg_get_expr()`, `pg_get_functiondef()`, and
`aclexplode()` — not `information_schema`, and not a live `supabase db
pull`, since no database password or CLI access token was available in the
environment that produced it). It deliberately does not fix anything it
describes.

**Everything in the migration is [CATALOG-CONFIRMED]** — exact column
types/nullability/defaults, exact constraint names, exact RLS policy text,
exact RPC bodies, and exact table/function grants (including `PUBLIC` vs.
named roles and `WITH GRANT OPTION`, via direct ACL introspection). Both
RPCs' `EXECUTE` grants are confirmed: `complete_new_word_study` and
`complete_word_review` both grant `EXECUTE` to `postgres`/`anon`/
`authenticated`/`service_role`, none `WITH GRANT OPTION`.

**Postgres version:** 17, confirmed (also independently corroborated by the
`MAINTAIN` privilege appearing in this project's grants — that privilege
didn't exist before Postgres 17).

### Confirmed grant facts

- **All four tables** (`user_profiles`, `user_word_progress`,
  `user_daily_stats`, `review_events`) grant the *full* privilege set —
  `INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`
  — to **all four roles**: `postgres`, `anon`, `authenticated`, and
  `service_role`. None are `WITH GRANT OPTION`. This is broader than "some
  broad privileges" — it's the complete standard table-privilege set,
  including several (`TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`) the
  application never uses at all.
- **This means RLS is the *only* thing protecting any of these tables.**
  The grant layer itself provides zero independent defense in depth — for
  `review_events` specifically, the only reason `anon`/`authenticated`
  can't touch it directly is that RLS is enabled with zero policies. If a
  single permissive policy were ever added to that table without equal
  care, the grants underneath are already wide open to receive it.
- No column-level grants exist anywhere on any of the four tables —
  confirmed via `aclexplode(pg_attribute.attacl)` returning zero rows.
  Every grant is table-wide.
- Both RPCs' `EXECUTE` grants: confirmed — `complete_new_word_study` and
  `complete_word_review` both grant to `postgres`/`anon`/`authenticated`/
  `service_role`, none `WITH GRANT OPTION`.

### Known imperfections this baseline intentionally preserves

Do not "fix" these by editing the baseline migration. They are documented
here so the next migration can address them deliberately, one at a time:

1. **`user_word_progress` and `user_daily_stats` RLS is ownership-only,**
   and the grant layer gives `authenticated` every privilege needed to
   exploit that. `FOR ALL USING (auth.uid() = user_id) WITH CHECK
   (auth.uid() = user_id)` restricts *whose* row can be touched, not
   *which columns or values*. An authenticated user can bypass both RPCs
   and `PATCH` their own `word_state`, `correct_streak`, `next_review_at`,
   or daily counters directly — self-data-integrity risk, not a cross-user
   privacy issue (every table's cross-user isolation was separately
   confirmed safe).
2. **No non-negative `CHECK` constraints** on `user_word_progress.
   correct_streak` or `user_daily_stats`'s three counter columns.
3. **`review_events.user_id` has no foreign key**, and
   `review_events.word_progress_id`'s foreign key has no specified
   `ON DELETE` behavior (defaults to `NO ACTION`).
4. **`anon` holds `EXECUTE`** on both RPCs unnecessarily — both already
   reject unauthenticated callers internally, so this is an extra,
   unneeded privilege layer rather than a live gap.
5. **Excessive table-level grants across the board** (see above) —
   `TRUNCATE`/`REFERENCES`/`TRIGGER`/`MAINTAIN` granted to `anon`/
   `authenticated` on all four tables with no application need for any of
   them. Closed for `user_word_progress`/`user_daily_stats` by Corrective
   Migration 1, for `review_events` by Corrective Migration 4, and for
   `user_profiles` by Profile Phase 1, below — no table in this baseline
   still carries this imperfection as of Profile Phase 1.

### Promotion thresholds — confirmed intentional, not a bug

`complete_word_review` implements `seen→learning: 1`, `learning→familiar: 2`,
`familiar→strong: 3`, `strong→mastered: 4` consecutive correct reviews,
matching `src/data/learning/reviewOutcomeTransition.ts` exactly. This is the
correct, deliberate, cross-layer-consistent design — captured as-is.

### Two things surfaced by this audit that are genuinely open questions

Neither is a schema defect by itself — both need a short follow-up outside
this baseline task:

1. **`user_profiles.is_new_user`** (`boolean not null default true`) exists
   and is not read or written anywhere in the frontend TypeScript reviewed
   across this audit. Purpose/ownership unknown.
2. Some live `user_profiles` columns (`nickname`, `native_language`,
   `learning_language`, `current_level`, `user_age`, `birth_month`,
   `birth_day`) are `NOT NULL` in PostgreSQL, while the
   corresponding frontend read types (`UserProfilesRow` in
   `src/lib/userProfile.ts`) may permit `null`. This baseline preserves the
   live schema as deployed and does not resolve that application/schema
   contract question — whether it has any practical effect depends on the
   account-onboarding write path, which is out of scope for this baseline
   and was not audited here.

## Corrective Migration 2 — non-negative constraints, anon RPC EXECUTE revoked

`migrations/20260805130000_add_learning_non_negative_constraints_and_revoke_anon_rpc.sql`
closes two more items from the baseline's imperfection list (items 2 and 4
above):

- Adds four explicitly-named, single-column, immediately-validated `CHECK
  (... >= 0)` constraints: `user_word_progress_correct_streak_non_negative`,
  `user_daily_stats_new_words_completed_non_negative`,
  `user_daily_stats_reviews_completed_non_negative`, and
  `user_daily_stats_study_time_seconds_non_negative`. Before this migration
  is applied, run the two read-only validation queries in the migration
  file's own header comment in the Supabase SQL Editor to confirm zero
  violating rows exist — required because the tables already held live data
  at the time this migration was written.
- Revokes `anon`'s `EXECUTE` grant on `complete_new_word_study(text, text,
  date)` and `complete_word_review(uuid, uuid, text, date)`. Both RPCs
  already reject an unauthenticated caller internally, so this only removes
  an unnecessary privilege layer — `authenticated`/`service_role`/`postgres`
  keep `EXECUTE`, and neither RPC's body changes.

Still open, deliberately out of scope for this migration too: item 3,
`review_events.user_id`'s missing foreign key and
`review_events.word_progress_id`'s unspecified `ON DELETE` behavior — closed
by Corrective Migration 3, below.

## Corrective Migration 3 — review_events referential integrity

`migrations/20260805150000_add_review_events_referential_integrity.sql`
closes the last remaining baseline imperfection (item 3 above / the
baseline's own item 6):

- Adds a new, explicitly named foreign key,
  `review_events_user_id_fkey` (`review_events.user_id` ->
  `auth.users.id`, `ON DELETE CASCADE`) — no foreign key existed on this
  column before.
- Drops and re-adds `review_events.word_progress_id`'s existing foreign key
  as `review_events_word_progress_id_fkey` (`review_events.word_progress_id`
  -> `user_word_progress.id`), now with an explicit name and
  `ON DELETE CASCADE` in place of the prior unnamed, `NO ACTION` default.

Product decision behind `CASCADE`: `review_events` is `complete_word_review`'s
own idempotency ledger (its replay-guard lookup by `event_id` +
`user_id`) and is not read anywhere else in the frontend, so review history
has no reason to outlive the user or progress row it belongs to. Before this
migration is applied, run the read-only validation queries in the migration
file's own header comment in the Supabase SQL Editor to confirm zero
orphaned/mismatched `review_events` rows exist, and to confirm the live name
of the existing `word_progress_id` foreign key matches
`review_events_word_progress_id_fkey` before the `DROP CONSTRAINT` runs.

With this migration applied, every baseline `PROPOSED NEXT MIGRATIONS` item
except item 3 (`review_events`' excessive `anon`/`authenticated` table
grants) is closed — item 3 is closed next, by Corrective Migration 4.

## Corrective Migration 4 — review_events client privileges revoked

`migrations/20260805170000_revoke_review_events_client_privileges.sql`
closes the baseline's last remaining `PROPOSED NEXT MIGRATIONS` item (item 3
/ this README's "Known imperfections" item 5, scoped to `review_events`):

- Revokes every table privilege (`INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
  REFERENCES, TRIGGER, MAINTAIN`) on `public.review_events` from `anon`.
- Revokes the same full privilege set on `public.review_events` from
  `authenticated`.
- `postgres` and `service_role` keep every privilege they already held —
  neither is touched by this migration.

No application behavior changes: `review_events` is written only by
`complete_word_review`, which is `SECURITY DEFINER` and therefore writes as
its owner (`postgres`) regardless of the calling role's own table grants.
No frontend code selects, inserts, updates, or deletes `review_events`
directly. RLS was already enabled on `review_events` with zero policies
(baseline migration), so `anon`/`authenticated` could not actually touch
this table before this migration either — this migration removes the
now-redundant grant layer underneath that RLS lockdown, per this README's
own "grant-level defense in depth" note above. No policy is added. No
read-only validation queries are required before applying it — it changes
role privileges only, no rows and no constraints.

With this migration applied, every baseline `PROPOSED NEXT MIGRATIONS` item
is closed, except the broader (all-four-table) excessive-grants cleanup
tracked as this README's "Known imperfections" item 5 for `user_profiles`,
`user_word_progress`, and `user_daily_stats`.

## Corrective Migration 5 — learning-mode active-time tracking

`migrations/20260805190000_add_learning_mode_time_tracking.sql` adds
per-learning-mode active-time statistics (Learning Statistics Phase 1):

- **Reconciles two live-only objects.** `review_time_seconds` and
  `custom_practice_time_seconds` (both `integer not null default 0`) plus
  their non-negative `CHECK` constraints were added directly to the live
  `user_daily_stats` table outside of any migration. This migration brings
  the repository in line with the live schema using catalog-guarded,
  idempotent DDL: `ADD COLUMN IF NOT EXISTS` for the columns, and a `DO $$
  ... $$` block per constraint that checks `pg_constraint`/
  `pg_get_constraintdef` first and only adds the constraint if it's
  genuinely missing — an existing same-named constraint with an unexpected
  definition makes the migration fail loudly (`RAISE EXCEPTION`) rather than
  being silently accepted. Both statements are no-ops on the live database
  and real DDL on a fresh database built from this repository's migrations
  alone.
- **`study_time_seconds`** already existed (baseline + Corrective Migration
  2's non-negative constraint) and is untouched in shape — only its RPC's
  signature changes (below).
- **total_time_seconds is never stored.** Every reader derives it as
  `study_time_seconds + review_time_seconds + custom_practice_time_seconds`
  at read time — see `src/lib/learningTimeStats.ts`.
- **Duration-aware RPC signatures, added alongside the existing ones** (see
  "Legacy RPC cleanup" below for the rollout/removal plan):
  - `complete_new_word_study(text, text, date, integer)` — adds
    `p_study_time_seconds`, validated `0-300`, added to `study_time_seconds`
    only on the same first-completion branch that already gates
    `new_words_completed`. A retry of an already-completed word increments
    neither.
  - `complete_word_review(uuid, uuid, text, date, integer)` — adds
    `p_review_time_seconds`, validated `0-300`, added to
    `review_time_seconds` only (never `study_time_seconds`). Also
    **reorders** the write sequence versus the existing 4-arg function: the
    `review_events` row is now `INSERT`ed (`ON CONFLICT (event_id) DO
    NOTHING`) *before* `user_word_progress`/`user_daily_stats` are touched,
    closing a latent TOCTOU race in the original ordering where two truly
    concurrent requests with the same `event_id` could both pass the
    "not found" replay check and both apply the transition before either
    committed. State thresholds/demotion rules/streak logic/deadline math
    are byte-identical to the existing function — only the write order and
    the new duration parameter changed.
  - `complete_custom_practice_word(uuid, text, date, integer)` — new, no
    legacy predecessor. See "Custom Practice ledger" below.
- **Custom Practice ledger: `public.custom_practice_events`.** Custom
  Practice never wrote to Supabase before this migration. `review_events` is
  deliberately **not** reused for it: several of its columns
  (`previous_state`/`new_state`/`previous_correct_streak`/
  `new_correct_streak`/`promoted`/`demoted`/`word_progress_id` — the last one
  `NOT NULL`) describe a spaced-repetition state transition Custom Practice
  must never produce and has no row to point at. The new table is minimal —
  `event_id` primary key (the sole idempotency gate, exactly like
  `review_events.event_id`), `user_id`, `target_language`, one duration
  column (bounded `0-300`), `created_at`. RLS enabled with zero policies and
  no `anon`/`authenticated` table grants — the same lockdown shape
  `review_events` has today (post Corrective Migration 4) — so
  `complete_custom_practice_word` (`SECURITY DEFINER`) is the only write
  path. The RPC never touches `user_word_progress`, never inserts into
  `review_events`, never increments `new_words_completed`/
  `reviews_completed` — only `custom_practice_time_seconds`, gated by
  whether its own `ON CONFLICT (event_id) DO NOTHING` insert actually
  affected a row.
- **Grants on every new signature**: `postgres`/`authenticated`/
  `service_role` EXECUTE; `anon` explicitly excluded (matching both existing
  RPCs' already-corrected state, Corrective Migration 2) — `PUBLIC`'s default
  implicit grant on function creation is revoked first, then re-granted only
  to the three roles above.

### Legacy RPC cleanup (required follow-up, not part of this migration)

This migration is intentionally **additive-only** for
`complete_new_word_study`/`complete_word_review`: their pre-existing 3-arg /
4-arg signatures are *not* dropped, only redefined as thin wrappers that
delegate to the new duration-aware signature with `0` seconds
(`select * from public.complete_new_word_study(p_word_id, p_target_language,
p_stat_date, 0)`, and the equivalent for `complete_word_review`) — no
duplicated business logic in either wrapper. This is a deliberate staged
rollout, because a Supabase migration deploy and a Cloudflare frontend
deploy are not atomic with each other:

| Stage | Supabase | Frontend | Behavior |
|---|---|---|---|
| 1 (this migration) | New + legacy signatures both live | Old build still calls legacy 3-/4-arg signatures | Legacy calls succeed, record 0 seconds |
| 2 | Unchanged | New build calls the duration-aware signatures | Real durations recorded |
| 3 (future cleanup migration) | Legacy 3-arg/4-arg signatures dropped | New build only (verified live) | — |

**Do not drop the legacy signatures in the same deployment as stage 2** — do
so only in a separate, later migration, once the new frontend build is
deployed and confirmed to be the only thing calling these RPCs (e.g. no
Cloudflare rollback path still points at the previous build). Custom
Practice has no legacy signature at all — `complete_custom_practice_word` was
introduced directly in its final form.

**Stage 3 status: migration prepared (Corrective Migration 6, below), not
yet confirmed safe to apply.** See that section for the exact gate.

## Corrective Migration 6 — legacy learning RPC signatures dropped

`migrations/20260805200000_drop_legacy_learning_rpc_signatures.sql` is stage
3 of the rollout table above: it drops exactly the two now-obsolete legacy
signatures —

- `complete_new_word_study(text, text, date)` — **removed**
- `complete_word_review(uuid, uuid, text, date)` — **removed**

using `DROP FUNCTION IF EXISTS`, no `CASCADE`. Nothing else changes: the
duration-aware signatures
(`complete_new_word_study(text, text, date, integer)`,
`complete_word_review(uuid, uuid, text, date, integer)`) and
`complete_custom_practice_word(uuid, text, date, integer)` are untouched —
`DROP FUNCTION` targets one exact signature, never a same-named function
with a different parameter list. No table, column, constraint, index,
policy, or grant on any remaining function is touched.

**Compatibility phase is now complete on paper** — the rollout table above
no longer has an open stage once this migration is applied — **but
application itself is gated**, not automatic just because this file exists.
Do not apply this migration until all of the following are independently
confirmed live (not just merged to `master` in git):

1. the duration-aware frontend build is the one actually deployed and
   serving production traffic on Cloudflare;
2. a live Study New Words smoke test passes;
3. a live Review Words smoke test passes;
4. a live Custom Practice smoke test passes;
5. no rollback to a pre-duration-aware Cloudflare deployment is expected or
   queued.

**After this migration is applied, an older Cloudflare build must never be
redeployed/rolled back to.** Such a build calls the now-dropped 3-arg/4-arg
signatures; PostgREST will return `PGRST202` ("could not find the
function") for every Study New Words / Review Words save attempt from that
build — it would not silently record 0 seconds the way it did during the
Corrective Migration 5 compatibility window, it would fail outright.

## Timezone Phase 1 - profile timezone foundation

`migrations/20260806120000_add_user_timezone_foundation.sql` adds optional
per-user IANA timezone storage without changing learning attribution yet:

- Adds `user_profiles.timezone text null` and
  `user_profiles.timezone_updated_at timestamptz null`. Neither column has a
  default, and the migration does not backfill or rewrite existing profile
  rows.
- Adds `initialize_user_timezone(text)`, a narrow `SECURITY DEFINER` RPC with
  an empty `search_path`. It requires `auth.uid()`, trims and validates the
  supplied value against `pg_catalog.pg_timezone_names`, and updates only the
  caller's existing profile row.
- Automatic initialization writes only when `user_profiles.timezone is null`.
  If another tab or earlier request already stored a timezone, the RPC returns
  the stored value and does not overwrite it. Manual replacement is deferred
  to a future Settings flow with a separate contract.
- Adds a trigger guard that blocks direct `INSERT`/`UPDATE` changes to
  `timezone` and `timezone_updated_at` through the broad legacy profile table
  grants. The initialization RPC sets a transaction-local flag before its own
  scoped update.

This phase deliberately did **not** change
`complete_new_word_study`, `complete_word_review`, or
`complete_custom_practice_word`: they still accepted client-provided
`p_stat_date`. Server-derived `stat_date`, streak-rule changes, Settings UI,
and any historical `user_daily_stats` treatment were deferred to later
phases.

## Timezone Phase 2 - server-derived learning dates

`migrations/20260806150000_add_server_derived_learning_dates.sql` stops
trusting client-provided learning dates for new frontend builds:

- Adds `resolve_authenticated_learning_date()`, a private
  `SECURITY DEFINER` helper with an empty `search_path`. It requires
  `auth.uid()`, reads `public.user_profiles.timezone`, accepts only values
  present in `pg_catalog.pg_timezone_names`, falls back to `UTC` when the
  profile row/timezone is missing, blank, or invalid, and returns
  `(statement_timestamp() at time zone resolved_timezone)::date`.
- Adds `get_current_learning_date()`, an authenticated-only RPC that exposes
  the same date to frontend read paths. It has no user-controlled date input.
- Adds no-`p_stat_date` primary signatures for Study, Review, and Custom
  Practice. These derive `v_stat_date` once per call and use it for
  `user_daily_stats` attribution.
- Kept the existing date-taking signatures as temporary compatibility
  wrappers. They ignored `p_stat_date` completely and delegated to the new
  server-derived implementations. See "Timezone Phase 2 cleanup" below for
  their removal.
- Adds `user_word_progress.first_studied_stat_date date null`, set only on
  the first successful Study completion. Duplicate Study saves do not change
  it and do not increment another date. Existing progress rows remain null.
- Adds nullable `review_events.stat_date` and
  `custom_practice_events.stat_date`. New events populate these from the
  server-derived date; historical ledger rows are not backfilled.
- Duplicate Review and Custom Practice retries reuse the originally stored
  event `stat_date`, so a retry after midnight or after a timezone change
  does not move the event to a new day. Offline requests count on the server
  submission day because no client event date is trusted.
- No historical `user_daily_stats` rows are rewritten, no Settings UI is
  added, and the streak completion rule at this point was still
  `new_words_completed >= current profile daily_goal` applied uniformly to
  every row — see "Streak Phase 1" below for why that was a bug and how it
  was fixed.

## Timezone Phase 2 cleanup — server-date compatibility wrappers removed

`migrations/20260806180000_remove_server_date_compatibility_wrappers.sql`
drops the three now-obsolete Timezone Phase 2 wrapper signatures —

- `complete_new_word_study(text, text, date, integer)` — **removed**
- `complete_word_review(uuid, uuid, text, date, integer)` — **removed**
- `complete_custom_practice_word(uuid, text, date, integer)` — **removed**

using `DROP FUNCTION IF EXISTS`, no `CASCADE`. Nothing else changes: the
active no-`p_stat_date` signatures
(`complete_new_word_study(text, text, integer)`,
`complete_word_review(uuid, uuid, text, integer)`,
`complete_custom_practice_word(uuid, text, integer)`),
`get_current_learning_date()`, and `resolve_authenticated_learning_date()`
are untouched — `DROP FUNCTION` targets one exact signature, never a
same-named function with a different parameter list. No table, column,
constraint, index, policy, or grant on any remaining function is touched,
and no data is rewritten.

The frontend that ships alongside this migration sends no `p_stat_date` on
any Study, Review, or Custom Practice save — confirmed by a repo-wide guard
in `scripts/tests/learning/test-remove-server-date-compatibility-wrappers-migration-contract.mjs`.
No rollback to a pre-Timezone-Phase-2 frontend build is planned. **After
this migration is applied, an older build that still sends `p_stat_date`
can no longer save Study New Words, Review Words, or Custom Practice
progress at all** — PostgREST returns `PGRST202` ("could not find the
function") for its calls instead of the graceful ignored-parameter behavior
the wrappers previously provided. Historical `user_daily_stats` rows and
`review_events`/`custom_practice_events` ledger rows (including rows with a
`null` `stat_date` predating Timezone Phase 2) are unaffected.

## Streak Phase 1 — historical daily-goal snapshots

`migrations/20260806190000_add_daily_goal_snapshot_and_update_rpc.sql` fixes
a real accuracy bug in the Daily Streak card: `computeDailyStreakSummary`
(`src/data/learning/dailyStreak.ts`) had always compared *every*
`user_daily_stats` row — today's and every past day's alike — against the
*current* `user_profiles.daily_goal`. Raising or lowering today's goal
therefore silently changed whether past days counted as "complete," even
though nothing about those rows themselves had changed.

- Adds `user_daily_stats.daily_goal integer null`, a per-row goal snapshot,
  with a named `user_daily_stats_daily_goal_allowed_values_check` CHECK
  (`daily_goal is null or daily_goal in (10, 15, 20, 30, 50)`) — the exact
  five supported presets, not a numeric range: an in-range-but-unsupported
  value like `25` or `199` is rejected exactly like `0` or `999`. No
  default, no backfill — every row that existed before this migration keeps
  `daily_goal = null` permanently; nothing rewrites a historical row, ever.
- Adds a matching named CHECK on `user_profiles.daily_goal`
  (`user_profiles_daily_goal_allowed_values_check`, `in (10, 15, 20, 30, 50)`),
  guarded by an explicit precondition check that raises a clear, named
  exception instead of silently normalizing or generically failing if any
  existing profile already holds a value outside that exact set. The
  frontend's `DailyGoalSelector` has only ever offered `10/15/20/30/50`, so
  this is a defense-in-depth constraint, not expected to reject any real
  row.
- `complete_new_word_study`, `complete_word_review`, and
  `complete_custom_practice_word` are recreated with identical behavior
  (authentication, ownership, validation, server-derived `stat_date`,
  timing, counters, state transitions, deadlines, idempotency, concurrency,
  original event-date replay, `SECURITY DEFINER`, empty `search_path`, and
  the named `user_daily_stats_language_date_unique` conflict target are all
  unchanged) — their INSERT branches now additionally stamp `daily_goal`
  from the caller's current profile (`coalesce(profile daily_goal, 15)`,
  validated against the exact `10, 15, 20, 30, 50` preset set) onto a
  brand-new row. Their `ON CONFLICT DO UPDATE`
  branches deliberately do **not** touch `daily_goal` — once a row exists,
  only `update_daily_goal` may change its stored goal, and only for today's
  row. Review and Custom Practice can both still create today's row first
  (and stamp its goal) without that row ever counting toward a streak —
  streak completion still depends solely on `new_words_completed`, which
  only Study ever increments.
- Adds `update_daily_goal(p_daily_goal integer)`, a narrow
  `SECURITY DEFINER` RPC with an empty `search_path`. It requires
  `auth.uid()`, rejects a null goal or any value outside the exact
  `10, 15, 20, 30, 50` preset set with SQLSTATE `22023`,
  fails clearly if no `user_profiles` row exists for the caller, resolves
  today's date once via `resolve_authenticated_learning_date()`, updates
  `user_profiles.daily_goal`/`updated_at`, and updates `daily_goal` on every
  `user_daily_stats` row the caller owns for that exact date — across every
  `target_language`, since the goal is profile-wide, never per-language.
  Previous dates are never matched by its `WHERE stat_date = ...` clause.
  Grants exclude `anon`/`public`; `authenticated`/`postgres`/`service_role`
  can execute it. Two racing calls are plain last-write-wins — no table-wide
  lock is introduced.
- `DailyGoalSelector` now calls `update_daily_goal` (via
  `src/lib/userProfile.ts`'s `updateDailyGoal`) instead of the broad
  `writeSupabaseUserProfile` upsert every other profile-save flow still
  uses — it sends only `p_daily_goal`, not the whole cached profile.
  Onboarding and the account language-confirm save are unchanged and still
  use the broad upsert; this phase does not touch either.
- The streak read/compute path (`readDailyStreakStats` in
  `src/lib/newWordProgress.ts`, `computeDailyStreakSummary` in
  `src/data/learning/dailyStreak.ts`) selects each row's own `daily_goal`
  and originally resolved the goal a row is judged against as
  `row.dailyGoal ?? currentProfileDailyGoal` — a stored value always won;
  the *current* profile goal was the fallback for a legacy (pre-Streak-
  Phase-1) row with no stored snapshot. **This fallback shape was corrected
  after initial rollout — see "Streak Phase 1 corrective fix" below for the
  fixed-constant replacement actually in place today.** `TodayProgressCard`
  needed no change either way: `update_daily_goal` keeps today's row's
  snapshot and the live profile value in sync in the same transaction, so
  they never disagree for "today," and `TodayProgressCard` (unlike
  `DailyStreakCard`) legitimately still reads the live `dailyGoal` prop for
  that reason.
- Net effect on existing accounts at the time this phase first shipped:
  nothing changed on the day it shipped — every existing row had
  `daily_goal = null` and kept comparing against the current profile goal
  exactly as before. See the corrective fix below for why that mattered in
  practice and how it was resolved.

## Streak Phase 1 corrective fix — legacy fallback frozen to a constant

Streak Phase 1 above closed the bug for any row with a stored snapshot, but
left one gap: a legacy row (`daily_goal IS NULL`) still resolved against
`currentProfileDailyGoal` — the *live*, mutable `user_profiles.daily_goal`
— so changing today's goal could still silently change whether an old,
already-earned day read as "complete." Because Streak Phase 1 shipped with
no backfill, effectively every row written before that migration is a
legacy row, so this gap reproduced the exact symptom the migration was
meant to fix, for essentially all pre-existing history.

- `src/data/learning/dailyStreak.ts` now resolves a row's goal as
  `row.dailyGoal ?? LEGACY_DAILY_GOAL`, a **fixed, exported constant** —
  never the live profile goal. `computeDailyStreakSummary` no longer takes
  a current-goal parameter at all, so there is no path, today or in the
  future, by which the profile goal can reach historical completion again;
  the removal is enforced at the type/signature level, not just by
  convention.
- `DailyStreakCard.tsx` no longer accepts or reads a `dailyGoal` prop —
  `LearningSection.tsx` no longer passes one to it. `TodayProgressCard`
  (a different component, showing *today's* live progress) is unaffected
  and keeps reading the live profile goal, correctly.
- **`LEGACY_DAILY_GOAL` is `10`, the minimum of the five supported daily-goal
  presets (10/15/20/30/50) — not `15`, the `user_profiles.daily_goal` table
  default.** An initial version of this fix used `15`, matching the table
  default; that was itself wrong, discovered against real production
  history: rows exist where the user confirms they completed their actual
  goal (e.g. exactly 10 new words on a `daily_goal IS NULL` legacy row) that
  a `15` fallback would misclassify as failed, silently erasing an earned
  streak day — the same class of bug this whole corrective fix exists to
  eliminate, just moved from "the live profile goal" to "a fixed but
  wrong constant." `10` avoids that specific failure mode (no legacy row
  can ever be wrongly marked failed merely for meeting the lowest goal any
  account could have had), at the cost of the opposite, milder risk:
  over-crediting a legacy row whose real goal was actually higher than 10.
  Both directions are unavoidable — the original per-day goal for these
  rows was never recorded and cannot be reconstructed either way; `10` is
  the least-wrong fixed approximation available, not a claim of exact
  accuracy. New rows (written by any of the three learning RPCs, after
  Streak Phase 1) always carry their own exact stamped goal and never use
  this fallback at all.
- No migration, schema change, or data backfill was part of this fix — it
  is a pure frontend (and test/documentation) change. No production
  `user_daily_stats` or `user_profiles` row was read, rewritten, or
  otherwise touched, and none will be: the exact historical goal for a
  legacy row is unrecoverable, so this fix does not attempt to guess it
  per-row, only to pick a single fixed, documented, non-live default.

### Calendar day-status model (green/red/neutral)

The Daily Streak card's weekly strip renders one of four states per day —
`src/data/learning/dailyStreak.ts`'s `DailyStreakDayStatus` is the single
source of truth both the streak-count math and `DailyStreakCard.tsx`'s
rendering derive from, so the two can never disagree about what a given day
means:

- **`completed`** (green, `--success`) — `new_words_completed` met the
  day's effective goal. Applies to today and any past date alike.
- **`failed`** (red, the shared `--destructive` theme token) — a *past*
  date whose effective goal was not met, **including a past date with no
  `user_daily_stats` row at all**. A missing row is not treated as
  "unknown" — no recorded goal completion on a day that has already ended
  is exactly a day the goal wasn't met. Nothing is inserted into the
  database to represent this; the calendar still only ever generates seven
  displayed dates client-side and classifies whichever of them have no
  matching row.
- **`inProgress`** (neutral) — today, before its goal is met. Never colored
  as failed: the day isn't over, so there's still time. Matches the
  existing "today incomplete doesn't break an intact streak through
  yesterday" streak-count rule — this is that same principle applied to
  the calendar's own coloring.
- **`future`** (neutral) — any date later than today. Always neutral,
  regardless of whether a row could theoretically exist for it (it can't).

Every accessible label (`Completed` / `Goal not completed` / `In progress`
/ `Future date`, translated across all 7 locales) is attached via each day
list item's `aria-label`, independent of color — the distinction is never
color-only.

## Profile Phase 1 — narrow onboarding/language-change RPCs, user_profiles write restriction

`migrations/20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql`
closes the one remaining item from this README's "Known imperfections" list
that no earlier corrective migration had touched: `user_profiles` itself.
Every other learning table (`user_word_progress`/`user_daily_stats`,
Corrective Migration 1; `review_events`, Corrective Migration 4) had already
moved to narrow, ownership-checked `SECURITY DEFINER` RPC writes with
`authenticated` reduced to `SELECT` only — `user_profiles` still granted
`authenticated`/`anon` the full standard privilege set, with a single
ownership-scoped `FOR ALL` RLS policy as the only backstop, and the
frontend's broad `writeSupabaseUserProfile` upsert (a direct
`POST /rest/v1/user_profiles` re-sending the entire cached profile object)
was still the only write path for onboarding and the account-language-confirm
popup.

- **Two new narrow RPCs**, matching `update_daily_goal`/
  `initialize_user_timezone`'s existing shape exactly (`SECURITY DEFINER`,
  `SET search_path TO ''`, `auth.uid()`-derived caller, `authenticated`-only
  `EXECUTE`, `anon`/`PUBLIC` excluded):
  - `complete_user_profile_onboarding(p_nickname, p_native_language,
    p_learning_language, p_current_level, p_user_age, p_birth_month,
    p_birth_day)` — the only path that may set onboarding fields or
    `onboarding_completed` (always `true`, never a parameter). A single
    atomic `INSERT ... ON CONFLICT (id) DO UPDATE` handles both a missing
    profile row (new row gets the table's own `daily_goal` default of `15`,
    a `null` timezone, and its `created_at` default — none of those three
    columns is ever named in the INSERT column list) and an existing one
    (the `DO UPDATE SET` list never names `daily_goal`/`timezone`/
    `timezone_updated_at`/`created_at`/`is_new_user` either, so a
    resubmission structurally cannot touch any of them). `updated_at` is
    stamped from the function's own server-side `now()` on either branch.
    `last_active_at` was later removed by Profile Phase 2 below.
  - `update_user_profile_languages(p_native_language, p_learning_language)`
    — the only path that may change `native_language`/`learning_language`
    after onboarding. Updates only those two columns plus `updated_at`;
    rejects a caller with no existing profile row (`SQLSTATE P0002`, matching
    `update_daily_goal`'s identical precedent) instead of implicitly creating
    an incomplete one.
- **Seven new precondition-guarded `CHECK` constraints** on `user_profiles`,
  mirroring `src/lib/userProfile.ts`'s own frontend normalizers exactly:
  `native_language`/`learning_language` (the seven supported codes),
  `current_level` (`A1`-`C2`), `user_age` (`10`-`100`), `birth_month`
  (`1`-`12`), `birth_day` (`1`-`31`), and `nickname` (non-empty after trim,
  at most 40 characters — deliberately **not** reproducing the frontend's
  Unicode "starts with a letter" rule, which stays frontend-only; see the
  migration's own header for why). Each constraint is guarded by a `DO`
  block that counts violating existing rows and raises a named exception
  before adding the constraint, the same confirm-before-constrain pattern
  Streak Phase 1 used for `user_profiles_daily_goal_allowed_values_check`.
  The existing `daily_goal` `CHECK` is untouched.
- **`user_profiles` RLS and grants tightened to match the other three
  tables**: the old ownership-scoped `FOR ALL` policy
  (`"Users can manage their profiles"`) is replaced with a named
  ownership-scoped `FOR SELECT` policy (`"Users can view their own
  profile"`) — every write now goes through a `SECURITY DEFINER` RPC that
  bypasses RLS as its owner (`postgres`) regardless. `authenticated` is
  revoked down to `SELECT` only; `anon` loses every direct privilege on the
  table. `postgres`/`service_role` are untouched.
- **Frontend**: `writeSupabaseUserProfile` and its `toSupabaseProfilePatch`
  payload builder are removed from `src/lib/userProfile.ts` entirely — no
  file in `src/` constructs a direct `user_profiles` table mutation anymore.
  `useAccountOnboarding.ts` calls `completeUserProfileOnboarding`;
  `useAccountLanguageConfirm.ts` (via `accountLanguageSave.ts`, whose
  injected-write parameter was renamed from `writeSupabaseUserProfile` to
  `writeLanguagesToSupabase` to stop naming a function that no longer
  exists) calls `updateUserProfileLanguages`. Both RPCs' responses are
  strictly parsed by dedicated modules
  (`src/lib/userProfileOnboarding.ts`, `src/lib/userProfileLanguages.ts`)
  following `dailyGoalUpdate.ts`/`userProfileTimezone.ts`'s existing
  parse-and-throw-`unexpected_response` precedent — never silently coerced.
- **`normalizeDailyGoal`** (`src/lib/userProfile.ts`) now delegates to
  `dailyGoalUpdate.ts`'s `isSupportedDailyGoalValue` instead of its own
  looser `1`-`999` range check, so the frontend's fallback behavior for a
  malformed/legacy stored `daily_goal` matches the database's exact-preset
  `CHECK` and `update_daily_goal`'s own validation exactly.
- **Not applied.** Like every migration in this repository, this one ships
  prepared and reviewed only. See the migration file's own header for its
  full preflight-query list, rollback considerations, and the explicit
  "not applied" statement, and this repository's Profile Phase 1 task report
  for the same confirmation.

## Profile Phase 2 - unused last_active_at removal

`migrations/20260807130000_drop_unused_user_profiles_last_active_at.sql`
removes the unused `user_profiles.last_active_at` column. Repository evidence
showed no frontend runtime read/write, no RPC return value, no repo-owned
analytics/admin/automation dependency, and no product behavior that consumed
a general "last active" profile timestamp. The only active writer was
`complete_user_profile_onboarding`, where Profile Phase 1 had stamped it
incidentally alongside `updated_at`.

The migration replaces `complete_user_profile_onboarding` with the same
signature, return shape, validation, `SECURITY DEFINER`/empty `search_path`,
auth checks, and grants, but its `INSERT` and `ON CONFLICT DO UPDATE` lists
no longer name `last_active_at`. It then drops the column. `updated_at`
remains the server-owned profile mutation timestamp.

## What happens next

Corrective changes are separate, individually-reviewed follow-up migrations
— never folded into the baseline above. See the numbered list at the bottom
of the migration file itself for the current proposed order. With
Corrective Migration 6 applied, the learning-mode-time-tracking rollout
begun in Corrective Migration 5 is fully complete.

## Working with this folder going forward

- Make schema changes as new files under `migrations/`, named
  `<timestamp>_<description>.sql` — never by editing a migration that's
  already been applied anywhere.
- Avoid editing tables, policies, functions, or grants directly in the
  Supabase dashboard. If a dashboard edit is unavoidable (an incident fix,
  for example), capture it in a matching migration file immediately
  afterward rather than letting the dashboard and this folder drift apart.
- `config.toml`'s `major_version = 17` is now confirmed correct (see
  above), not just the CLI's own template default.
