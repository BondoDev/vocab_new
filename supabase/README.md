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
   across this audit. Purpose/ownership unknown. Later removed — see
   Profile Phase 3 below.
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
  `writeSupabaseUserProfile` upsert every other profile-save flow used at
  the time this phase shipped — it sends only `p_daily_goal`, not the whole
  cached profile. Onboarding and the account language-confirm save are
  unchanged by *this* phase and still used the broad upsert as of Streak
  Phase 1 — Profile Phase 1 below is what later moved both onto their own
  narrow RPCs and removed `writeSupabaseUserProfile` entirely.
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

## Profile Phase 3 - unused is_new_user removal

`migrations/20260807140000_drop_unused_user_profiles_is_new_user.sql`
removes the unused `user_profiles.is_new_user` column
(`boolean not null default true`). Repository evidence showed nothing ever
changes it away from its default — no RPC, trigger, or direct write sets
`is_new_user = false` or references it at all — no frontend runtime
read/write, and no repo-owned analytics/admin/automation dependency.
`shouldOpenAccountOnboarding` (`src/app/utils/accountProfile.ts`) already
decides onboarding entirely from profile-row presence and required-field
completeness (`isUserProfileComplete`, not the raw `onboarding_completed`
column — see the Profile Audit's `onboarding_completed` semantics section
below), so removal does not touch onboarding behavior.

No current SQL function references `is_new_user` in its body, `INSERT`/`SET`
column list, or `RETURNS TABLE` shape, so this migration only drops the
column — no RPC needed replacing.

## Profile Audit — `onboarding_completed` semantics (2026-08-07)

Audited on request, distinct from the `is_new_user`/`last_active_at`
removals above: `onboarding_completed` (`boolean not null default false`)
is **kept, not removed**. Current semantics are a hybrid invariant, already
implemented rather than newly designed:

- **The only writer is `complete_user_profile_onboarding`.** It always sets
  `onboarding_completed = true` (a literal, never a parameter) and only
  after validating all seven required fields (`nickname`, both languages,
  `current_level`, `user_age`, `birth_month`, `birth_day`). Nothing sets it
  back to `false` — no other RPC, trigger, or direct write touches this
  column at all (`authenticated` has had no direct table write access since
  Profile Phase 1 above).
- **So going forward, `onboarding_completed = true` implies the required
  fields were valid at write time**, and — because no RPC can null or
  invalidate those fields afterward (`update_user_profile_languages`
  requires a valid language pair; `update_daily_goal`/
  `initialize_user_timezone` never touch onboarding fields) — stays implied
  for the row's lifetime under any app-driven path. Rows written before
  Profile Phase 1's `CHECK` constraints/RPC restriction existed (i.e.
  through the old broad `writeSupabaseUserProfile` upsert) are the only
  way this invariant could be violated historically; no backfill has been
  needed or run because of the next point.
- **`normalizeUserProfile` (`src/app/utils/accountProfileCompleteness.ts`)
  re-derives the client-facing `onboardingCompleted` as `raw flag AND all
  seven fields present`** on every read (Supabase row, `localStorage`
  cache, or RPC response), independent of the frontend/DB constraint
  history above. A row with `onboarding_completed = true` but incomplete
  fields — however it arose — is never surfaced to the app as complete.
- **The onboarding-reopen decision itself
  (`shouldOpenAccountOnboarding`) does not read the flag at all** — it
  opens onboarding whenever no Supabase profile row exists yet, or
  `isUserProfileComplete` finds a required field missing/invalid,
  recomputed directly from the fields rather than trusting
  `onboarding_completed`. This means the flag and the UI's decision are
  independently derived, and — because of the invariant above — always
  agree in practice; `scripts/tests/account/test-profile-load-and-onboarding.mjs`
  pins both the agreement and the (structurally unreachable today, but
  handled safely either way) disagreement cases explicitly.

Net effect: `onboarding_completed` is not currently read anywhere to gate
behavior, but it is not dead weight either — it is the database's own
explicit "onboarding was completed" event, held consistent with the
required fields by construction. Removing it would be a schema
simplification with no behavior change today, not a bug fix; if desired,
treat it as its own follow-up migration (touching the RPC's `RETURNS
TABLE` shape, `readSupabaseUserProfile`'s `select=` list,
`normalizeUserProfile`, and every contract test enumerated by this
audit — `test-restrict-user-profiles-writes-migration-contract.mjs`,
`test-profile-load-and-onboarding.mjs`, `test-user-profile-onboarding-response.mjs`,
`test-account-language-sync.mjs`, `test-daily-goal-snapshot-migration-contract.mjs`,
`test-timezone-initialization.mjs`, and
`test-user-timezone-foundation-migration-contract.mjs`), not this audit.

## Profile architecture — current state summary (2026-08-08)

The sections above (Profile Phase 1–3, the timezone/streak phases, the
`onboarding_completed` audit) are the historical record of how
`user_profiles` reached its current shape. This section is a consolidated,
current-state reference — it doesn't repeat their reasoning, only their
conclusions. Everything below reflects the migrations as authored in this
folder and is enforced by this repo's static contract tests
(`test:architecture-guards`, `test:feature-contracts`); there is no live
Supabase E2E suite (see `docs/architecture.md`), so nothing here claims to
be independently confirmed against a running production database beyond
what the original baseline audit's `[CATALOG-CONFIRMED]` catalog queries
already established.

**Reads.** `useUserProfileLoad` (`src/app/hooks/useUserProfileLoad.ts`),
mounted once from `src/app/App.tsx`, is the frontend's one authenticated
`user_profiles` SELECT path (`readSupabaseUserProfile` in
`src/lib/userProfile.ts`). Every profile/learning/vocabulary dashboard
component consumes the loaded `userProfile` via props/state threaded down
from there rather than fetching its own copy — guarded by
`test:learning-profile-data-flow` and `test:vocabulary-profile-data-flow`
(`docs/architecture.md`'s guard table). The SELECT itself is owner-scoped
(`"Users can view their own profile"`, `auth.uid() = id`); `anon` holds no
privilege on the table at all.

**Writes are RPC-only.** `authenticated` has no direct INSERT/UPDATE/DELETE
on `user_profiles` (revoked in Profile Phase 1); every mutation goes
through one of four narrow RPCs, each `SECURITY DEFINER` with an empty
`search_path`, each deriving the caller from `auth.uid()` rather than
accepting a user id, each owning a disjoint column set:

| RPC | Owns | Never touches |
|---|---|---|
| `complete_user_profile_onboarding` | `nickname`, `native_language`, `learning_language`, `current_level`, `user_age`, `birth_month`, `birth_day`, `onboarding_completed` (always `true`) | `daily_goal`, `timezone`, `timezone_updated_at`, `created_at` |
| `update_user_profile_languages` | `native_language`, `learning_language` | everything else — rejects a caller with no existing row instead of creating one |
| `update_daily_goal` | `daily_goal`, plus today's `user_daily_stats.daily_goal` snapshot(s) | onboarding fields, timezone |
| `initialize_user_timezone` | `timezone`, `timezone_updated_at` — only while `timezone is null` | onboarding fields, `daily_goal` |

None of the four needs `user_profiles` table-level write grants — each
executes as its owner (`postgres`) regardless of the calling role, which is
why `authenticated`'s own table grant can be `SELECT`-only.

**`updated_at`** is the server-owned timestamp of the row's most recent
mutation, stamped by whichever RPC wrote last. The frontend never
generates its own value for it (`normalizeTimestamp`/`normalizeUserProfile`
in `src/lib/userProfile.ts` / `src/app/utils/accountProfileCompleteness.ts`
only ever pass through a string already present, never `Date.now()` or
similar). Not every RPC returns a fresh one, though:
`complete_user_profile_onboarding` and `update_user_profile_languages` both
do, so the client's cached value is current after those calls, but
`update_daily_goal`'s `RETURNS TABLE` (`daily_goal`, `stat_date`,
`updated_daily_stats_rows`) does not, even though its SQL body bumps
`user_profiles.updated_at` server-side. In that case
`DailyGoalSelector.tsx` spreads the existing in-memory profile and
overwrites only `dailyGoal`, so the client's cached `updatedAt` is left at
the previous known authoritative server value rather than a fabricated
browser timestamp — it is simply stale by one write until the next full
profile load.

**`onboarding_completed`** — DB-owned explicit completion-event marker, not
itself the UI's onboarding-reopen source of truth; see "Profile Audit —
`onboarding_completed` semantics" above for the full analysis.

**Removed fields.** `last_active_at` (Profile Phase 2) and `is_new_user`
(Profile Phase 3) no longer exist as columns — both are historical only,
not open questions.

**Validation** mirrors the frontend normalizers exactly: `native_language`/
`learning_language` in the 7 supported UI language codes; `current_level`
in `A1`–`C2`; `user_age` `10`–`100`; `birth_month` `1`–`12`; `birth_day`
`1`–`31`; `nickname` non-empty after trim, ≤40 characters; `daily_goal` in
`10, 15, 20, 30, 50` (Profile Phase 1's seven `CHECK` constraints plus the
pre-existing `daily_goal` preset check). `timezone` is validated at the RPC
level against `pg_catalog.pg_timezone_names`, not by a table `CHECK`.

**Not part of this architecture** — future work, not documented as done
here: manual timezone correction (a Settings page), cross-tab
synchronization, learning-progress reset (its backend primitive exists —
see "Learning Progress Reset" below — but stays unreachable from any
session, by design), and the Statistics page. (Account deletion's backend
primitive now exists — see "Account Deletion" below — but it has no
frontend UI yet, so it isn't part of *this* summary either.) A live
Supabase E2E test suite now exists — see "Live Supabase E2E tests" below —
covering this profile architecture plus authentication, the learning RPCs,
and RLS/grant behavior against a real deployed project; it is opt-in and
separate from this repository's static contract tests.

## Account Deletion — backend primitive (2026-08-08)

Audited on request: whether deleting the Supabase Auth user safely removes
all user-owned data, and if so, where a secure server-side deletion
operation should live. No Settings UI was built — this section documents
the backend-only capability now in place for future Settings integration.

### User-data ownership map

Every table that stores per-user data, confirmed by reading every migration
in this folder (`grep create table` across `supabase/migrations/` returns
exactly these five):

| Table | User FK | References | `ON DELETE` | Safe on account deletion? |
|---|---|---|---|---|
| `user_profiles` | `id` | `auth.users(id)` | `CASCADE` (baseline) | Yes |
| `user_word_progress` | `user_id` | `auth.users(id)` | `CASCADE` (baseline) | Yes |
| `user_daily_stats` | `user_id` | `auth.users(id)` | `CASCADE` (baseline) | Yes |
| `review_events` | `user_id` | `auth.users(id)` | `CASCADE` (Corrective Migration 3 — **no FK existed at all before this**) | Yes, as of Corrective Migration 3 |
| `review_events` | `word_progress_id` | `user_word_progress(id)` | `CASCADE` (Corrective Migration 3 — was `NO ACTION` before) | Yes, as of Corrective Migration 3 |
| `custom_practice_events` | `user_id` | `auth.users(id)` | `CASCADE` (Corrective Migration 5) | Yes |

All six foreign keys are direct or one-hop-transitive references to
`auth.users(id)`; none are "no FK, manually-tracked id" (`review_events.user_id`
was exactly that gap until Corrective Migration 3 closed it — see that
migration's own header for the product decision and the read-only
validation queries it required first). No table stores a user identifier
without a foreign key today. `is_favorite` is a column on
`user_word_progress`, not a separate favorites table — there is no sixth
user-owned table hiding there.

**Caveat carried over from every other section of this README**: these
foreign keys are correct *as authored in this repository's migrations*.
Like every migration here, Corrective Migration 3 in particular ships
prepared and reviewed, not automatically applied — see its own header and
this README's Corrective Migration 3 section. **Before this Edge Function
is ever deployed for real use, confirm live (e.g. the same
`pg_constraint`/`pg_get_constraintdef` catalog-query approach the baseline
audit used) that `review_events.user_id` actually has its foreign key and
that `review_events.word_progress_id` is actually `ON DELETE CASCADE` and
not the pre-Corrective-Migration-3 `NO ACTION`.** If Corrective Migration 3
were not yet live, deleting a user with existing review history would
either fail outright (word_progress_id still `NO ACTION`, blocking the
cascade) or leave orphaned `review_events` rows behind (user_id had no FK
at all) — this is the one gap that would matter.

### Non-table dependencies

- **Storage**: `supabase/config.toml`'s `[storage]` block is the unmodified
  Supabase CLI template (buckets commented out, no bucket ever configured).
  No code in `src/` calls any Supabase Storage API
  (`.storage.from(...)`/`getPublicUrl`/`createSignedUrl` — none found
  repo-wide). Nothing to clean up here.
- **Edge Functions**: none existed before this task (`supabase/functions/`
  did not exist). `delete-account` (below) is the first.
- **Triggers**: the only trigger in the schema,
  `prevent_direct_user_timezone_write` on `user_profiles`
  (Timezone Phase 1), fires `before insert or update` only — never `delete`
  — so it cannot interfere with the row being removed by cascade.
- **Scheduled jobs**: no `pg_cron`/`cron.schedule` usage anywhere in
  `supabase/migrations/`.
- **Analytics/notification tables**: none exist in this schema — Google
  Analytics (`VITE_GA_MEASUREMENT_ID`) is a client-side script tag, not a
  Supabase table, and out of scope for a database deletion primitive.
- **External IDs stored in repository-owned systems**: none found — no
  repo-owned table stores a third-party subscription/billing/CRM id keyed
  to a user.
- **`service_role` key**: not present anywhere in this repository today —
  no `.env`/`.env.example` entry, no Cloudflare Worker binding
  (`docs/deployment.md` lists only `VITE_GA_MEASUREMENT_ID`/
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`SITE_ORIGIN`/`SITE_URL` on
  the production Worker), no `@supabase/supabase-js` dependency in
  `package.json` (the frontend calls Auth/PostgREST REST endpoints
  directly — `src/lib/supabaseAuth.ts` — with only the anon key). Deleting
  `auth.users` alone is therefore sufficient for every repository-owned
  system; nothing else in this repo needs to be told about a deletion
  separately.

### Why deletion runs as a Supabase Edge Function

`supabase/functions/delete-account/index.ts` — the only place in this
repository's architecture appropriate for a `service_role`-holding
operation:

- The Cloudflare Worker (`workers/word-ssr/`) is a public, unauthenticated
  word-page SSR renderer with a hard bundle-size budget
  (`docs/architecture.md`) and no session-handling code of any kind — it
  was deliberately not used, to avoid mixing a privileged secret and a
  security-sensitive operation into an unrelated, tightly-constrained
  production Worker.
  There is no other Cloudflare Worker or server route anywhere in this
  repository (`docs/deployment.md`: Cloudflare serves static assets plus
  this one Worker; the SPA itself ships no server code of its own).
- Supabase Edge Functions run entirely outside the browser, can hold
  `SUPABASE_SERVICE_ROLE_KEY` as a function secret (`supabase secrets set`),
  and are the platform's own purpose-built mechanism for exactly this
  operation.
- The `service_role` key is set only as an Edge Function secret — never a
  `VITE_`-prefixed variable, so Vite can never inline it into a browser
  bundle (every existing `VITE_SUPABASE_*` variable in this repo is the
  anon key only — confirmed above).

**Platform-level JWT verification**: `supabase/config.toml` declares
`[functions.delete-account]` with `verify_jwt = true` explicitly, rather
than relying on the CLI/platform default. This means Supabase's own gateway
rejects a request with a missing/invalid/expired bearer token before it
ever reaches the function — a second, independent layer in front of the
function's own `adminClient.auth.getUser(token)` check, not a replacement
for it (only the in-function check also confirms the user still *exists*,
which platform-level verification alone does not). No concrete
architectural reason exists to disable it, so it stays on.

**Identity**: the function derives the caller exclusively from their own
bearer token (`adminClient.auth.getUser(token)`), which both validates the
JWT and confirms the backing `auth.users` row still exists. It never reads
`user_id`/`target_user_id`/`email` from the request — there is no such
parameter anywhere in the function, the same shape every narrow RPC in this
repository already uses (`complete_user_profile_onboarding`,
`update_user_profile_languages`, `update_daily_goal`,
`initialize_user_timezone` — none accept a caller-supplied id either).
Missing/malformed/expired/already-deleted-user tokens are all rejected the
same way (401 `unauthenticated`); a misconfigured deployment (missing
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) fails closed (500
`server_misconfigured`) rather than silently falling back to an
unprivileged client.

**Cascade**: the function performs exactly one call,
`adminClient.auth.admin.deleteUser(callerId)` — no manual per-table
deletes. Every user-owned table's cascade (above) does the rest,
transactionally, as part of that single `DELETE FROM auth.users` statement.
Foreign-key cascade actions execute under the privileged connection
Supabase Auth itself uses, not through PostgREST/`authenticated`'s own
grants — so the SELECT-only/RPC-only write restrictions this repo's other
migrations added to these tables (Profile Phase 1, Corrective Migration 1)
have no bearing on whether the cascade succeeds.

**Failure behavior**: a failed `deleteUser` call returns 502
`delete_failed`, never a false 200. Because there is no manual multi-step
deletion (cascade only), there is no partially-deleted state to leave
behind on failure — Postgres either commits the whole cascade or rolls it
all back.

**Idempotency**: a retried call after a successful deletion resends the
same, now-stale access token. `getUser(token)` looks the user up by id on
every call and correctly reports "not found" for an already-deleted
account — the retry is rejected as `unauthenticated`, the same as any other
invalid token, never treated as a special case.

### Production deployment gate — `ACCOUNT_DELETION_ENABLED`

Everything above makes the *code* safe; this gate is what makes *deploying*
it safe before genuine reauthentication exists. A second server-side Edge
Function secret, `ACCOUNT_DELETION_ENABLED`, must equal the exact string
`"true"` or the function refuses to delete anything:

```text
request
  ↓
method check (POST only) → 405 otherwise
  ↓
server-config check (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY present) → 500 otherwise
  ↓
bearer-token check → 401 otherwise
  ↓
identity resolved via adminClient.auth.getUser(token) → 401 otherwise
  ↓
ACCOUNT_DELETION_ENABLED !== "true" → 403 { "error": "account_deletion_disabled" }
  ↓
adminClient.auth.admin.deleteUser(callerId)
```

- **Read only from `Deno.env.get("ACCOUNT_DELETION_ENABLED")`** — never from
  the request (no header/body/query lookup of that name anywhere in the
  function), so nothing a caller sends can influence it.
- **Exact-match, not truthy**: the comparison is
  `ACCOUNT_DELETION_ENABLED !== "true"`, with no `.toLowerCase()`/`.trim()`/
  `Boolean()` coercion. A missing secret (`undefined`), `"false"`, `"True"`,
  `"TRUE"`, `" true"`, `"1"` — every one of these fails the same exact
  comparison and disables deletion identically. Exactly one spelling
  enables it.
- **Checked after identity, before the delete call**: an unauthenticated
  caller gets a plain 401 and learns nothing about whether deletion is
  enabled; a fully-authenticated caller hitting a disabled deployment gets
  exactly `{ "error": "account_deletion_disabled" }` and a `403` — no
  reason, no configuration value, nothing else.
- **This is what makes it safe to commit, push, and deploy today.** With
  the secret unset (or explicitly `"false"`) in the deployed project, the
  function is live and fully reachable, but structurally cannot delete
  anyone — every authenticated call reaches the gate and stops there.

### Deployment procedure

Two distinct, non-overlapping states — do not conflate "deployed" with
"enabled":

**Production now.** Deploy `delete-account` (`supabase functions deploy
delete-account`) with `ACCOUNT_DELETION_ENABLED` either left unset or set
explicitly to `false`:

```bash
supabase secrets set ACCOUNT_DELETION_ENABLED=false
```

Result: the function is live at `/functions/v1/delete-account`, fully
reachable, correctly authenticates callers — and cannot delete a single
account. Every authenticated request reaches the gate in the previous
section and stops there with `403 account_deletion_disabled`. This is the
state this task prepares; it does not flip the flag.

**Future Settings launch.** Only after all of the following exist and are
verified, in order:

1. a real Settings "Delete account" UI with an explicit confirmation step;
2. genuine reauthentication (password re-entry or provider-specific
   equivalent — see "Reauthentication" below), tested end-to-end;
3. the live cascade check immediately below, re-run and confirmed clean on
   the actual production database (not inferred from migration files);
4. `node scripts/tests/account/test-delete-account-function-contract.mjs`
   passing.

Only then:

```bash
supabase secrets set ACCOUNT_DELETION_ENABLED=true
```

Do not set this during any task that hasn't independently verified all four
items above. Until it is set, "deployed" and "enabled" are different
states, and this repository's own tests only ever verify the code — never
the live secret's actual deployed value, which is Supabase-project
configuration outside this repository's source control.

### Live cascade verification (must be run against the live project)

The FK audit in this section's ownership map is correct *as authored in
this repository's migrations*, exactly like every other schema claim in
this README (see the baseline migration's own confidence notes). It is
**not** independently confirmed against the live production database from
this environment — no database password or CLI access token is available
here (the same constraint the baseline migration's own header documents).
Migration files describe intent, not deployed state — `supabase/README.md`
itself says as much for every other migration ("ships prepared and
reviewed, not automatically applied").

Run this in the Supabase SQL Editor (or `psql`) against the live project
before ever setting `ACCOUNT_DELETION_ENABLED=true`:

```sql
select
  tbl.relname as table_name,
  col.attname as column_name,
  ref_ns.nspname as references_schema,
  ref.relname as references_table,
  case c.confdeltype
    when 'c' then 'CASCADE'
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else c.confdeltype::text
  end as on_delete
from pg_constraint c
join pg_class tbl on tbl.oid = c.conrelid
join pg_namespace tbl_ns on tbl_ns.oid = tbl.relnamespace
join pg_class ref on ref.oid = c.confrelid
join pg_namespace ref_ns on ref_ns.oid = ref.relnamespace
join pg_attribute col on col.attrelid = c.conrelid and col.attnum = c.conkey[1]
where c.contype = 'f'
  and tbl_ns.nspname = 'public'
  and tbl.relname in (
    'user_profiles', 'user_word_progress', 'user_daily_stats',
    'review_events', 'custom_practice_events'
  )
order by tbl.relname, col.attname;
```

Expected result — exactly these six rows, every `on_delete` reading
`CASCADE`:

| table_name | column_name | references_schema | references_table | on_delete |
|---|---|---|---|---|
| `custom_practice_events` | `user_id` | `auth` | `users` | `CASCADE` |
| `review_events` | `user_id` | `auth` | `users` | `CASCADE` |
| `review_events` | `word_progress_id` | `public` | `user_word_progress` | `CASCADE` |
| `user_daily_stats` | `user_id` | `auth` | `users` | `CASCADE` |
| `user_profiles` | `id` | `auth` | `users` | `CASCADE` |
| `user_word_progress` | `user_id` | `auth` | `users` | `CASCADE` |

Any row missing, any `on_delete` other than `CASCADE`, or any extra
`public`-schema foreign key referencing `auth.users`/`user_word_progress`
not in this list means the live schema has drifted from what this
repository's migrations describe — **do not enable deletion** until the
gap is closed (either by applying the missing migration or by reconciling
this table with the actual live state) and this query is re-run clean.

### Reauthentication — deliberately not enforced yet

FluentStellar currently supports exactly two sign-in methods
(`src/lib/supabaseAuth.ts`): email/password (`signInWithPassword`/
`signUpWithPassword`) and Google OAuth via PKCE (`signInWithGoogleOAuth`).
No magic-link or other provider is wired into the frontend, regardless of
what `supabase/config.toml`'s local-dev template enables/disables (that
file is CLI scaffolding for local development, not a record of the live
project's provider configuration).

A Supabase-issued JWT does carry enough metadata in principle to back a
"recently authenticated" check server-side (an `amr` claim with a
timestamp per authentication factor). This function does not implement
one: nothing in this repository decodes or validates JWT claims anywhere
today, and a bare session-age check is a weak, easily-misleading proxy for
actual reauthentication — a long-lived session kept alive by silent token
refreshes can look "old" without the user ever re-proving their password,
while a genuinely fresh sign-in and a bare page reload can look
identical. Building a check like that now, with no UI that would ever force
a fresh sign-in immediately before calling this function, would be the
"weak pseudo-reauthentication mechanism" this task was explicitly told not
to invent.

Options for a future Settings task, in increasing order of rigor:
password users could be prompted to re-enter their password immediately
before the delete call (verified via a fresh `signInWithPassword`, not a
claims check); Google OAuth users would need a provider-specific
equivalent (re-consent / re-authorization), since there is no password to
re-check; or the function could require a session whose `amr` timestamp is
within a short window, decoded and verified server-side, as a
weaker-but-still-real fallback. All three depend on frontend/provider work
this task deliberately excludes. Until one exists, this function stays
**authenticated-only** (any currently-valid session may call it) and is not
wired into any frontend code path.

### Session behavior after deletion

Not independently tested against a live project (no Supabase E2E
infrastructure exists — see the "Profile architecture" section above), but
follows directly from how Supabase Auth resolves a token: an outstanding
refresh token becomes unusable immediately (the user record it would mint a
new access token for no longer exists). An already-issued, not-yet-expired
access token remains signature-valid until its own `exp`, but is
functionally inert — every RLS policy in this schema is `auth.uid() = ...`-
scoped, and the data it could ever have matched no longer exists after the
cascade, so there is nothing left for a stale token to read or write. A
future Settings UI should still call `signOutSupabase()` immediately after
a successful `{ deleted: true }` response — not because the token is
exploitable, but to clear `localStorage` and in-memory app state
proactively rather than leaving a dead session sitting around until natural
expiry.

### Deliberately not built in this task

No Settings page, delete-account button, confirmation modal, password
input, or success screen — see this section's own scope exclusions. No
frontend client wrapper was added either: every existing narrow RPC caller
in `src/lib/userProfile.ts` exists because something in the app already
calls it, and this repo has an established pattern of removing exactly this
kind of unused code once it's identified (`is_new_user`/`last_active_at`
above) — adding an unused `deleteAccount()` wrapper now would immediately
be exactly that kind of dead code. A future Settings task should add the
client call (`POST /functions/v1/delete-account` with the caller's own
bearer token, matching the pattern in `src/lib/supabaseAuth.ts`) alongside
the UI that actually uses it, then call `signOutSupabase()` on success and
redirect away from any authenticated route.

The function is now safe to commit, push, and deploy — deployment and
enablement are deliberately two separate events, gated by
`ACCOUNT_DELETION_ENABLED` above. Do not describe this feature as
production-ready until every item in "Deployment procedure"'s Future
Settings launch checklist exists and has been verified; a deployed function
with deletion disabled is infrastructure in place, not a shipped feature.

## Learning Progress Reset — backend primitive (2026-08-08)

Audited on request: a backend primitive for "reset all learning progress,
history, statistics, and achievements for one specific learning language
belonging to the authenticated user," for a future Settings page that will
list the caller's studied languages with a **Reset progress** button next to
each one. No Settings UI was built — this section documents the
backend-only capability now in place, the same shape the Account Deletion
section above documents for its own primitive.

### Per-language data map

Every table that stores per-user learning data, confirmed against the same
`grep create table` sweep the Account Deletion audit above used (still
exactly five user-owned tables — no new table exists):

| Table | User ownership | Language discriminator | What it stores | Reset deletes it? |
|---|---|---|---|---|
| `user_word_progress` | `user_id` | `target_language` (direct column) | Word state (seen/learning/familiar/strong/mastered), correct streak, `is_favorite`, last-practiced/next-review timestamps — one row per (user, word, language) | Yes |
| `user_daily_stats` | `user_id` | `target_language` (direct column) | Per-day new-words/reviews/study-time/review-time/custom-practice-time counters, plus a `daily_goal` snapshot — the Daily Streak card's only data source | Yes |
| `review_events` | `user_id` (no FK before Corrective Migration 3 — see caveat below) | `target_language` (direct column, mirrors its parent `user_word_progress` row exactly — confirmed in `complete_word_review`'s own `INSERT`) | Immutable review-history ledger: previous/new state, previous/new streak, promoted/demoted flags, result | Yes |
| `custom_practice_events` | `user_id` (FK, `on delete cascade`) | `target_language` (direct column) | Custom Practice's own idempotency ledger + time-tracking, entirely independent of `user_word_progress` | Yes |
| `user_profiles` | `id` | none (single active `learning_language`, not a per-language table) | Account identity, native language, onboarding fields, `daily_goal`, timezone, and the single currently-active `learning_language` | No — see "Active-language behavior" below |

All four progress tables have a **direct** `target_language` column — none
of this reset's scoping depends on tracing an indirect relationship through
a parent row, unlike the account-deletion audit's own caveat about
`review_events.word_progress_id`. `is_favorite` is confirmed still a column
on `user_word_progress`, not a separate table (same confirmation the
Account Deletion audit made) — deleting a language's `user_word_progress`
rows deletes that language's favorite state too, which is what "all data …
deleted" requires (verified against `src/lib/newWordProgress.ts`'s favorite
read/write paths, both scoped by `target_language`).

### Achievements

`grep`-confirmed: no `achievement`/`milestone` table exists in any migration
in this folder, and no occurrence of "achievement" or "milestone" (any
case) exists anywhere in this repository's TypeScript source
(`src/**/*.{ts,tsx}`). Achievements are **not implemented** — not persisted,
not derived, not present in profile metadata. There is therefore nothing
beyond the four tables above for this primitive to reset today; a real
achievement system, if ever built, would need its own audit and its own
addition to this reset's scope. This task does not invent one.

### Exact reset semantics

Deletes, scoped to `(auth.uid(), p_target_language)` only:

- `user_word_progress` rows for that language — word state, streak,
  last-practiced/next-review timestamps, and favorite flags.
- `user_daily_stats` rows for that language — daily new-word/review/
  study-time counters and the daily-goal snapshot. Because the Daily Streak
  card (`src/data/learning/dailyStreak.ts`) computes current/best streak
  entirely from these rows (no separate streak table exists — same
  conclusion the Account Deletion audit's ownership map already implies),
  deleting them returns that language's streak display to empty without a
  separate "reset streak" step.
- `review_events` rows for that language — the full review-history ledger.
- `custom_practice_events` rows for that language — Custom Practice's
  history and time-tracking ledger.

Preserved, untouched by this function:

- the account/auth identity itself (`auth.users` is never referenced by
  this function's executable code);
- `user_profiles` in its entirety, including `native_language` and the
  currently-active `learning_language` (see "Active-language behavior");
- every other studied language's rows in all four tables above — every
  `DELETE` is scoped by `target_language`, never by `user_id` alone
  (contract-tested, see below).

### Language identity

Validated against the exact same seven-code allow-list
`user_profiles.native_language`/`learning_language` were constrained to in
Profile Phase 1 (`user_profiles_native_language_allowed_values_check`/
`user_profiles_learning_language_allowed_values_check`, both
`in ('en','es','fr','pt','it','de','ru')`):
`SUPPORTED_LANGUAGE_CODES` in `src/lib/userProfileOnboarding.ts` is the same
list on the frontend side. None of the four progress tables have ever had
a CHECK constraint on their own `target_language` column (confirmed absent
by grepping every migration file for `target_language` alongside
`check`/`in (`) — every row was still written by frontend code that only
ever supplies one of these seven codes, so this validation is not narrower
than what the data already conforms to; it is what rejects "unsupported
language codes" as required. The caller identity comes exclusively from
`auth.uid()` — there is no `p_user_id`/`p_target_user_id` parameter
anywhere in the function's signature, the same shape every narrow RPC in
this repository already uses.

### Backend architecture: a Postgres RPC, not an Edge Function

Unlike account deletion, which needs `auth.admin.deleteUser` (an Auth Admin
API call, requiring `service_role` and therefore an Edge Function),
resetting learning progress touches only tables already in Postgres, and
`auth.uid()` is directly available inside an ordinary `SECURITY DEFINER`
PL/pgSQL function — no Admin API, no `service_role` key, no Edge Function
runtime needed at all. A single function body already executes atomically;
wrapping it in an Edge Function would add a network hop and a second place
to keep the identity/validation contract in sync, for no transactional or
security benefit. This matches the task's own stated preference: "a narrow
authenticated PostgreSQL RPC … optionally invoked directly by the future
client."

`public.reset_learning_language_progress(p_target_language text)`
(`supabase/migrations/20260808120000_add_learning_language_progress_reset_rpc.sql`):

- `SECURITY DEFINER`, `SET search_path TO ''`, `EXECUTE` granted to
  `postgres`/`service_role` only — `anon`, `authenticated`, and `PUBLIC` are
  all explicitly revoked. This is a deliberate departure from every other
  narrow RPC in this schema (which all grant `authenticated` `EXECUTE`) —
  see "Deployment safety" below for why `authenticated` is withheld here.
- Derives the caller exclusively from `auth.uid()`.
- Rejects a null/unsupported `p_target_language` before touching a single
  row. There is no runtime deployment-gate check inside the function body at
  all — see "Deployment safety" below.

### Transaction and cascade behavior

The four `DELETE` statements run inside one PL/pgSQL function body, which
executes as a single atomic unit — they either all commit or (on any
earlier error, e.g. identity/language validation raising) none of them do.
There is no multi-step client-driven sequence, so nothing partially reset
is ever observable, mirroring account deletion's own single-`DELETE`
atomicity guarantee.

**Deletion order deliberately does not rely on FK cascade.** `review_events`
and `custom_practice_events` are deleted FIRST, by their own direct
`(user_id, target_language)` columns — never by relying on
`review_events.word_progress_id`'s cascade — so the later
`user_word_progress` delete can never hit a foreign-key violation
regardless of whether Corrective Migration 3
(`review_events.word_progress_id` `ON DELETE CASCADE`) is actually live.
This is a meaningful difference from the account-deletion primitive, which
*does* structurally require that cascade to be live and documents a
mandatory pre-enablement live-catalog check for exactly that reason (see
"Live cascade verification" above) — **this reset primitive needs no
equivalent live-catalog check before enabling**, because it never depends
on any FK's `ON DELETE` behavior in the first place. `user_daily_stats` is
deleted last; nothing else references it.

### Active-language behavior

`user_profiles.learning_language` (the single currently-active language) is
never read or written by this function — confirmed by the migration
containing no reference to `user_profiles` at all. Resetting the language a
user is currently configured to learn is not special-cased because it
doesn't need to be: `NewWordStudyPreparation.tsx` and every other
learning-queue entry point read progress by
`(auth.uid(), practiceLanguage)` (`practiceLanguage` being
`learning_language`), and the vocabulary catalog itself
(`src/data/vocabulary/...`) is static content with no dependency on any
`user_word_progress` row. After a reset, the next queue build for that
language simply finds zero owned rows and behaves exactly as it already
does for a brand-new learner of that language — resetting German removes
German progress; the user may remain configured to learn German, now with
zero progress, exactly as this task's own product semantics specify.

### Favorites

Confirmed (`src/lib/newWordProgress.ts`): `is_favorite` is read/written only
as a column on `user_word_progress`, scoped by `target_language` on every
query. There is no separate favorites table and no language-independent
favorite state to preserve — deleting a language's `user_word_progress`
rows correctly clears that language's favorites along with everything else,
matching "all data and progress for that language should be deleted."

### Review/event ledgers

Both `review_events` and `custom_practice_events` carry their own direct
`target_language` column (confirmed in the baseline and Corrective
Migration 5 table definitions) — this function deletes from both directly
by `(user_id, target_language)`, never by relying on any FK cascade from
`user_word_progress` (see "Transaction and cascade behavior" above). Every
`DELETE` statement in this function names both `user_id` and
`target_language` in its `WHERE` clause — contract-tested (see below) to
guarantee no statement is ever scoped by `user_id` alone, which is what
prevents another language's events from ever being deleted accidentally.

### Daily stats and streaks

`user_daily_stats` is keyed by `(user_id, target_language, stat_date)`
(`user_daily_stats_language_date_unique`, baseline migration) — confirmed
already covered above. Resetting a language deletes every historical
`stat_date` row for that language only; since the Daily Streak card derives
current/best streak and the calendar day-status model entirely from these
rows (`computeDailyStreakSummary`, `src/data/learning/dailyStreak.ts`), both
return to empty for that language specifically. Other languages' rows are
untouched — the `target_language` predicate on every `DELETE` guarantees
this the same way it does for the ledgers above.

### Idempotency

Every `DELETE` is a plain predicate match with no existence precondition —
a language with zero rows in a given table simply deletes zero rows there,
with no error path. A repeated call, or a call for a language the caller
never studied, succeeds identically every time:

```json
{
  "reset": true,
  "target_language": "de",
  "word_progress_deleted": 0,
  "daily_stats_deleted": 0,
  "review_events_deleted": 0,
  "custom_practice_events_deleted": 0
}
```

Row counts are included (the response is still narrow — four integers and
two echoed/fixed fields, nothing about row contents) because they are
useful, stable, and cheap (`GET DIAGNOSTICS ... = ROW_COUNT` after each
`DELETE`, no extra query).

### Validation

Rejected inside the function body, in this order:

1. no authenticated caller (`auth.uid()` null) — `errcode 28000`.
2. null/empty `p_target_language` — `errcode 22023`.
3. `p_target_language` outside the seven-code allow-list — `errcode 22023`.

There is no fourth, deployment-gate rejection inside the function anymore —
see "Deployment safety" below. In production today, no caller reaches any
of the three checks above in the first place: PostgreSQL itself rejects the
call at the privilege layer (`errcode 42501`, "permission denied for
function reset_learning_language_progress") before the function is ever
invoked, because neither `anon` nor `authenticated` holds `EXECUTE` on it.
Only `postgres`/`service_role` — which never reach this function through
PostgREST/a browser session — can actually get as far as checks 1-3.

A language the caller has never studied is **not** treated as a not-found
error — it succeeds idempotently with every count at zero, per this task's
own stated preference and matching this function's general idempotency
model.

### Deployment safety — PostgreSQL `EXECUTE` privilege, not a runtime flag

**This section supersedes an earlier revision of this migration**, which
gated the destructive path behind a runtime check inside the function body
— a Postgres configuration parameter, `app.learning_progress_reset_enabled`,
read with `current_setting(..., true)`, set out-of-band with
`alter database postgres set app.learning_progress_reset_enabled = 'true';`.
That design has been **removed entirely** (no `current_setting(...)` call
and no `app.learning_progress_reset_enabled` reference remain anywhere in
the migration's executable code — contract-tested, see below) and replaced
with PostgreSQL's own `EXECUTE` privilege system, for two concrete reasons:

- **No out-of-band step to forget or lose track of.** The old gate depended
  on a manually-run `alter database` statement that lives outside this
  repository's version control entirely — this README could describe the
  intended live state but never verify it actually matched. `GRANT`/`REVOKE`
  statements are ordinary SQL, so the entire gate is now expressed as
  migration file content, reviewable and diffable like everything else in
  `supabase/migrations/`.
- **Enforced earlier, by a layer that cannot be bypassed by a future edit to
  this function.** A runtime flag only rejects a call after PostgREST has
  already authenticated the caller, routed the request, and invoked the
  function — refusal was a choice the function body made for itself, which
  means a future edit to that body could in principle get the check wrong.
  `EXECUTE` privilege is checked by PostgreSQL itself, before the function
  is invoked at all — there is no code path inside
  `reset_learning_language_progress`, now or after any future change to it,
  that runs before that check or could accidentally skip it.

Section 2 of the migration (`supabase/migrations/
20260808120000_add_learning_language_progress_reset_rpc.sql`) revokes
`EXECUTE` from `PUBLIC`, `anon`, **and `authenticated`**, and grants it only
to `postgres`/`service_role`:

```sql
revoke execute on function public.reset_learning_language_progress(text) from public;
revoke execute on function public.reset_learning_language_progress(text) from anon;
revoke execute on function public.reset_learning_language_progress(text) from authenticated;
grant execute on function public.reset_learning_language_progress(text) to postgres;
grant execute on function public.reset_learning_language_progress(text) to service_role;
-- Deliberately no `grant execute ... to authenticated;` in this migration.
```

```text
browser session (always anon or authenticated via PostgREST)
  ↓
PostgreSQL checks EXECUTE privilege on reset_learning_language_progress
  ↓
neither anon nor authenticated holds it
  ↓
"permission denied for function reset_learning_language_progress" (errcode 42501)
  — the function body never runs; auth.uid() is never evaluated;
    p_target_language is never validated; no table is ever touched.
```

**This is what makes it safe to commit, push, and deploy today.** Once this
migration is applied to the live project, the function exists, is fully
defined, and is fully deployed — but it is unreachable from any real
browser session, because neither role a browser session can ever hold
(`anon` or `authenticated`) has been granted `EXECUTE`. No further
out-of-band step is required to keep it disabled; the migration itself, as
written, already leaves it disabled.

### Future activation

Only after all of the following exist and are verified:

1. a real Settings "Reset progress" UI, listing the caller's studied
   languages;
2. an explicit destructive confirmation step before the call is ever made;
3. the client wiring that calls this RPC and handles its response (see
   "Deliberately not built" below);
4. `node scripts/tests/learning/test-learning-progress-reset-migration-contract.mjs`
   passing.

should production ever receive:

```sql
grant execute on function public.reset_learning_language_progress(text)
to authenticated;
```

**As its own new, separately reviewed, versioned migration file** — not an
ad-hoc SQL command run by hand against the live project. This is the
repository-tracked equivalent of flipping `ACCOUNT_DELETION_ENABLED=true`
for the account-deletion primitive, except here the activation step itself
lives in `supabase/migrations/` history rather than in project-level
secrets/config outside this repository's source control — the exact moment
this destructive capability became reachable from the browser is then a
reviewable, revertable commit like any other schema change, not a
config-panel toggle this README can only describe and never verify. Do not
add this grant during any task that hasn't independently verified all four
items above.

### Reauthentication

Not added, for the same reasoning the Account Deletion section above
already documents for its own primitive: nothing in this repository
decodes/validates JWT claims today, and there is no UI that would ever
force a fresh sign-in immediately before calling this function. Resetting
one language's progress is also meaningfully less destructive than deleting
the account itself — no data outside the selected language is touched, and
the account, every other language's history, and the account's own
identity all survive untouched. This function is authenticated-only,
matching every other narrow RPC in this schema. Revisit only if a future
Settings task finds a concrete product reason to require it.

### Live prerequisites before enabling

Unlike account deletion, this primitive has **no live-catalog cascade check
to run** before activation — see "Transaction and cascade behavior" above:
every delete is scoped by explicit predicates, never by relying on any
table's `ON DELETE` behavior, so its correctness does not depend on which
corrective migrations happen to be live. The only live prerequisite is the
migration itself
(`20260808120000_add_learning_language_progress_reset_rpc.sql`) actually
being applied to the live project before the future activation migration
("Future activation" above) is ever applied on top of it.

### Client invalidation requirements (future Settings integration)

Confirmed no persisted client-side cache of progress data exists to worry
about: the only `localStorage` entries this codebase writes for a signed-in
learner are the cached `UserProfile` object (`src/lib/userProfile.ts` —
account-identity/profile fields only, no progress/stats) and UI navigation
preferences (`app.yourLanguage`/`app.selectedLevel`/etc.,
`src/app/App.tsx`/`useStoredAppPreferences.ts` — which language pair and
CEFR level are currently selected for browsing, not learning-progress data
itself). Every word-progress/daily-stat/streak read in this codebase goes
live to Supabase's REST API on each load (`src/lib/newWordProgress.ts`) —
there is no offline queue or cached learning-progress snapshot that could
resurrect deleted state after a successful reset. This is not a blocker.

What a future Settings integration must still do after a successful
`{ reset: true, ... }` response, purely so the UI reflects the reset
immediately instead of on next full reload:

- refetch (or clear in-memory) any already-loaded word queue, review queue,
  or Daily Streak data for the reset language;
- refetch the studied-language list itself if the Settings page derives it
  from distinct `target_language` values (a language with zero remaining
  rows should disappear from — or zero out on — that list);
- leave `user_profiles`/`learning_language` state completely alone — this
  reset does not change it, so no profile refetch is required on account of
  this call specifically.

No cross-tab sync, confirmation modal, or Reset Progress button is built in
this task — see "Deliberately not built" below.

### Deliberately not built in this task

No Settings page, studied-language list, Reset Progress button, or
confirmation modal. No frontend client wrapper was added either — the same
reasoning the Account Deletion section gives for not adding an unused
`deleteAccount()` wrapper applies here: nothing in the frontend calls this
RPC yet, and adding a wrapper now would be exactly the kind of unused code
this repository has an established pattern of removing once identified. A
future Settings task should call
`POST /rest/v1/rpc/reset_learning_language_progress` (or the
`@supabase/supabase-js` RPC helper, once/if this repository adopts it) with
`{ p_target_language: "de" }` and the caller's own session, behind an
explicit destructive confirmation step:

```text
Settings
→ studied-language list
→ Reset progress
→ explicit destructive confirmation
→ call reset_learning_language_progress for that language
→ clear/refetch local learning state for that language (see above)
→ show zero progress for that language
```

The migration is now safe to commit, push, and deploy exactly as written —
applying this migration and granting `authenticated` `EXECUTE` are
deliberately two separate events, the latter a future, separately
versioned migration (see "Future activation" above), not a step this task
performs. Do not describe this feature as production-ready until a
Settings UI with an explicit confirmation step exists, the client wiring
calls this RPC, and the future activation migration has been applied.

## Vocabulary Growth — narrow read-only RPC (2026-08-08)

Migration: `20260808130000_add_vocabulary_growth_events_rpc.sql`.

The Progress page's "Vocabulary Growth" chart reconstructs historical
Learning/Known/Mastered counts over time. `user_word_progress` alone only
stores each word's *current* state, so accurate reconstruction needs
`review_events`' own `previous_state -> new_state` transition history (see
`src/data/learning/vocabularyGrowth.ts`'s pure reconstruction engine).

`review_events` has RLS enabled with **zero policies** for any role
(baseline migration) and every direct table privilege was explicitly
revoked from `anon`/`authenticated`
(`20260805170000_revoke_review_events_client_privileges.sql`) — at the time,
correctly, since nothing needed to read it. That lockdown is **not**
reopened here. Instead this migration adds one narrow, purpose-built RPC,
`public.read_vocabulary_growth_events(p_target_language text, p_since_date
date default null)`, mirroring `get_current_learning_date`'s exact
security shape:

- `SECURITY DEFINER`, `search_path = ''`, every object schema-qualified.
- Caller derived exclusively from `auth.uid()` — no `p_user_id`/
  `p_target_user_id` parameter exists.
- `p_target_language` required, validated against the same seven-code
  allow-list `native_language`/`learning_language` already use.
- `p_since_date` optional (default `null` = no lower bound) — deliberately
  never forces a bound, so the UI's "All time" range can never be silently
  truncated by a caller that forgets to pass one; the frontend loader
  always requests the unbounded history once and filters 7/30/90-day
  ranges locally.
- Returns exactly four columns: `word_progress_id`, `previous_state`,
  `new_state`, `event_date` — no `event_id`, no `user_id`, no
  `result`/streak/`promoted`/`demoted` columns, no other user's rows.
- Read only (a single `select`) — no insert/update/delete anywhere in the
  function body.
- `EXECUTE`: revoked from `public`/`anon` (explicitly), granted to
  `postgres`/`authenticated`/`service_role` — the same three-role set every
  other client-facing learning RPC in this schema already carries.

`review_events`' own RLS (still zero policies) and table grants (`anon`/
`authenticated` still hold none) are completely untouched — the RPC reads
through them as `postgres` (its own owner), exactly like `complete_word_review`
already writes through them today.

**Timestamp column, verified against the live schema before writing this** —
`review_events` has no `reviewed_at` column. Its two authoritative "when"
columns (confirmed from `complete_word_review`'s own current `INSERT` list,
`20260806190000_add_daily_goal_snapshot_and_update_rpc.sql`) are `stat_date
date` (nullable — the server-derived learning date, added by
`20260806150000_add_server_derived_learning_dates.sql`, populated on every
row written since, `null` on older rows since that migration does not
backfill) and `last_practiced_at timestamptz` (always present). The RPC
resolves these server-side via
`coalesce(stat_date, (last_practiced_at at time zone 'utc')::date)` into one
always-non-null `event_date`, so the TypeScript reconstruction engine never
needs to know about the fallback. `user_word_progress.first_studied_stat_date`
has the identical nullable-legacy shape for word-creation dates, resolved
client-side by `vocabularyGrowth.ts`'s own `resolveWordCreatedDateISO`
(that table is already directly readable by its owner, so no RPC was
needed for it).

## Study Activity Phase 1 — new_word_study_time_seconds + study_time_seconds repurposed as total (2026-08-11)

Migration: `20260811120000_add_new_word_study_time_and_repurpose_total.sql`.

The Dashboard's "Study Activity" card was reworked from a quantity chart
(new words + reviews) into a time chart (active minutes/hours per learning
mode, stacked by day). That surfaced a naming problem corrective migration 5
left behind: `user_daily_stats.study_time_seconds` reads like a total, but
has — since the baseline migration — only ever been written by
`complete_new_word_study`, i.e. it has only ever meant "Study New Words
active time," never a genuine per-day total. `review_time_seconds`/
`custom_practice_time_seconds` were always correctly mode-specific.

This migration:

- Adds `new_word_study_time_seconds integer not null default 0` (CHECK
  `>= 0`, same guarded-named-constraint idiom as corrective migration 5) —
  the mode-specific column `study_time_seconds` should have been from the
  start.
- One-time backfills every existing row:
  `new_word_study_time_seconds := study_time_seconds` (the old value, i.e.
  exactly what it already meant), then
  `study_time_seconds := study_time_seconds + review_time_seconds +
  custom_practice_time_seconds` (turning it into the true total). This is a
  **truthful reclassification, not a fabrication** — every row already has
  full per-mode fidelity, because mode-tracking has been the only write path
  since corrective migration 5 shipped. No "Uncategorized" bucket exists
  anywhere in this schema or the Dashboard UI as a result.
- Redefines `complete_new_word_study`, `complete_word_review`, and
  `complete_custom_practice_word` with **identical signatures** to their
  current (`20260806190000`) versions — grants are preserved automatically
  by `CREATE OR REPLACE`, and no frontend call site changes at all. Each now
  increments its own mode column **and** `study_time_seconds` (the total)
  atomically, in the same upsert, so the invariant
  `study_time_seconds = new_word_study_time_seconds + review_time_seconds +
  custom_practice_time_seconds` holds for every row written from this point
  forward, entirely server-side.

The backfill `UPDATE` is a one-time data migration (guarded with `where
new_word_study_time_seconds = 0` as a best-effort re-run safety net), not
idempotent DDL — like every migration in this repository, it is written to
run exactly once via the standard Supabase migration runner, not to be
manually re-executed against an already-migrated database.

## Live Supabase E2E tests (2026-08-08)

`scripts/tests/live/` is a real, opt-in end-to-end suite that exercises a
deployed Supabase project over the network — authentication, the four
narrow `user_profiles` RPCs, the three learning RPCs, RLS ownership, direct-
write rejection, and the disabled state of `reset_learning_language_progress`.
It complements, and does not replace, this repository's static migration/
source-text contract tests (`test:feature-contracts`,
`test:architecture-guards`): those catch repository regressions instantly
with no network access; this suite is the only thing in the repository that
can catch an *unapplied* migration, a grant/RLS mismatch between a migration
file and the live database, an Auth integration problem, or RPC response
drift — none of which a static test reading `.sql` files can ever detect.

### Running it

```bash
npm run test:supabase-live
```

Required environment variables (the run fails immediately, with a clear
message, if any are missing — never a silent skip or a faked result):

```text
SUPABASE_URL                 # the target project's REST URL, e.g. https://xxxx.supabase.co
SUPABASE_ANON_KEY             # that project's anon public API key
SUPABASE_SERVICE_ROLE_KEY     # that project's service_role key — Node test process only, never a VITE_-prefixed variable, never committed
```

Optional:

```text
SUPABASE_LIVE_TEST_TIMEOUT_MS  # per-request timeout in ms (default 15000)
```

These are deliberately **not** read from `VITE_SUPABASE_URL`/
`VITE_SUPABASE_ANON_KEY` (this repository's existing `.env` convention) even
though the values may end up identical — this repository has no staging
project, so `VITE_SUPABASE_URL` is presumably the production project, and an
automatic fallback would let a forgotten `SUPABASE_URL` silently point a
destructive test suite at production. Set the three variables above
explicitly, either exported in your shell or in a local, gitignored
`.env.supabase-live` file (already covered by this repository's `.env.*`
`.gitignore` pattern) — `npm run test:supabase-live` loads that file
automatically via Node's `--env-file-if-exists` if it's present, and does
nothing if it's absent.

**Run this only against the Supabase project you intend to test.** The
suite creates and deletes real Auth users and writes real rows. This
repository has no staging/test Supabase project today — if you ever add
one, prefer it over production for this suite.

### What it does

- Creates two disposable, admin-created, pre-confirmed Auth users (`A` and
  `B`) per run — never an existing personal account, never a shared
  long-lived fixture account. Pre-confirmed (`email_confirm: true` via the
  Admin API) because the suite cannot assume the live project's
  email-confirmation setting; see `scripts/tests/live/lib/disposableUser.mjs`
  for why.
- Signs in as both normally (password grant, anon key) and runs every
  scenario scoped to their own data only.
- Feeds live RPC responses through the real frontend parser functions
  (`src/lib/userProfileOnboarding.ts`, `userProfileLanguages.ts`,
  `dailyGoalUpdate.ts`, `userProfileTimezone.ts`,
  `learningDateValidation.ts`) wherever those parsers don't transitively
  depend on `src/lib/supabaseAuth.ts` (which needs a Vite build to resolve
  `import.meta.env` and cannot be imported from a bare Node process) — see
  `scripts/tests/live/scenarios/learningRpcs.mjs`'s header for the one
  place (the three learning RPCs' own unexported parsers) where this
  suite re-asserts the same field/type contract directly instead.
- Deletes both Auth users at the end (`try`/`finally`, runs even on
  failure), exercising the live FK-cascade architecture documented in
  "Account Deletion" below, then privileged-verifies (service role) that no
  rows remain in `user_profiles`, `user_word_progress`, `user_daily_stats`,
  `review_events`, or `custom_practice_events` for either user. If cleanup
  itself fails, the run exits non-zero and prints the disposable user's id
  and email for manual removal — it never fails silently.
- Never touches the `delete-account` Edge Function, never reads or writes
  `ACCOUNT_DELETION_ENABLED`, and never grants `authenticated` `EXECUTE` on
  `reset_learning_language_progress` — cleanup uses the Admin API's
  `deleteUser` directly (the same primitive `delete-account` uses
  internally, just invoked here for test teardown), and the reset-RPC
  scenario only ever calls it as an ordinary `authenticated` session to
  confirm it is still rejected.

### Not covered here

Account deletion and learning-progress reset are deliberately **not**
exercised end-to-end by this suite (out of scope for the task that built
it) beyond the two safety checks above (a real Auth-user deletion for
cleanup, and confirming the reset RPC stays unreachable). Neither backend
primitive's own live activation flow is tested.

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
