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

### Manual replacement (2026-08-12) — Settings backend follow-up

The "future Settings flow with a separate contract" this phase deferred is
`update_user_timezone(text)`
(`supabase/migrations/20260812120000_add_update_user_timezone_rpc.sql`) —
a second, separate `SECURITY DEFINER` RPC, not a change to
`initialize_user_timezone` itself. `initialize_user_timezone` keeps its
exact null-only semantics unchanged (still the automatic first-load
initializer `useUserProfileLoad.ts` calls); `update_user_timezone`
unconditionally overwrites `timezone`/`timezone_updated_at` for the
authenticated caller's own row, reuses the same
`pg_catalog.pg_timezone_names` validation and the same
`prevent_direct_user_timezone_write` trigger-bypass flag, and is the RPC
FluentStellar's Settings page now calls for both "Use current timezone" and
the searchable timezone selector's explicit Save action. Neither RPC ever
rewrites historical `user_daily_stats.stat_date` rows — a timezone change
only affects how *future* learning days are computed
(`get_current_learning_date`, Timezone Phase 2 below).

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
- Supabase Edge Functions run entirely outside the browser and are the
  platform's own purpose-built mechanism for exactly this operation.
  **Credential-source migration (2026-08-19)**: the function used to read
  `SUPABASE_SERVICE_ROLE_KEY` (a function secret set via `supabase secrets
  set`) directly. It now reads the `"default"` entry of `SUPABASE_SECRET_KEYS`
  instead — a JSON object of named `sb_secret_...` keys the platform
  auto-injects into every Edge Function's environment automatically,
  regardless of the function's own code. See
  `supabase/functions/delete-account/index.ts`'s `resolveSecretKey()` for
  the parsing/fail-closed logic. The legacy `service_role` key remains
  active on the project (not yet retired — see this migration's own task
  record) but is no longer read by this function.
- Whichever key is in use is only ever a server-side Edge Function secret —
  never a `VITE_`-prefixed variable, so Vite can never inline it into a
  browser bundle (every existing `VITE_SUPABASE_*` variable in this repo is
  the anon key only — confirmed above).

**Platform-level JWT verification (CHANGED — CORS incident, 2026-08-13)**:
`supabase/config.toml` declared `[functions.delete-account]` with
`verify_jwt = true` explicitly, rather than relying on the CLI/platform
default, on the reasoning that it added a second, independent layer in
front of the function's own `adminClient.auth.getUser(token)` check. That
was true, but it also meant Supabase's own gateway required a valid bearer
token on *every* request routed to this function — including the browser's
automatic CORS preflight `OPTIONS` request, which per the Fetch/CORS spec
never carries an `Authorization` header. The gateway rejected the preflight
itself, before this function's own already-correct
`if (req.method === "OPTIONS") return ...` handler ever ran, which the
browser reported as a failed preflight ("It does not have HTTP ok status")
and the frontend saw as a generic network error — Settings' Delete Account
action could never actually reach this function's own logic at all.

`verify_jwt` is now `false` for this function. This does **not** make
account deletion callable without authentication: the function's own
`adminClient.auth.getUser(token)` check (below) is unconditional and was
always independently sufficient on its own — it validates the JWT itself
*and* confirms the backing `auth.users` row still exists, which
platform-level `verify_jwt` alone never did anyway. This is the pattern
Supabase's own documentation recommends for any function that must accept
a real preflighted, `Authorization`-header-bearing browser request while
also performing its own in-function authentication.

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
`SUPABASE_URL` or an unresolvable `SUPABASE_SECRET_KEYS` — see
resolveSecretKey() above) fails closed (500 `server_misconfigured`) rather
than silently falling back to an unprivileged client.

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
server-config check (SUPABASE_URL / SUPABASE_SECRET_KEYS["default"] resolvable) → 500 otherwise
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

```bash
supabase secrets set ACCOUNT_DELETION_ENABLED=true
```

Do not set this during any task that hasn't independently verified all four
items above. This repository's own tests only ever verify the code — never
the live secret's actual deployed value, which is Supabase-project
configuration outside this repository's source control.

**Historical state (2026-08-12 – 2026-08-13, superseded — see the live
verification below):** `ACCOUNT_DELETION_ENABLED` was briefly set to `true`
and account deletion manually verified working end-to-end — at that point
**without** item 2 (genuine reauthentication) being implemented yet; every
earlier Settings phase's own task scope had explicitly forbidden inventing a
frontend-only reauthentication step with no corresponding backend
enforcement, and no backend enforcement existed yet either. That gap was
then closed in a dedicated reauthentication phase (see "Reauthentication"
below) — the delete-account Edge Function now independently enforces a
recent-authentication requirement server-side, and Settings' Delete Account
dialog produces a fresh one for password accounts before calling it. While
that phase was implemented and tested, `ACCOUNT_DELETION_ENABLED` was
deliberately set back to `false` on the live project — re-enabling it (and
re-verifying end-to-end with reauthentication in place) was, at the time
this paragraph was written, a live-deployment step outside this repository
that this repository's own code/tests could not confirm. Item 1 is
satisfied (the "Delete account" UI, typed-`DELETE`-confirmation
`AlertDialog`) and item 4 passes (see
`test-delete-account-function-contract.mjs`'s own current results).

**Actual live state, confirmed (2026-08-14):** A read-only Supabase
CLI/Management API session against the live production project (`supabase
db query --linked`, `supabase functions download`, `supabase secrets
list` — no `db push`, `functions deploy`, `secrets set`, or migration
application) directly confirmed, rather than inferred from this README:

- `ACCOUNT_DELETION_ENABLED` is currently set to the literal string `true`.
  Supabase never exposes a secret's plaintext via the CLI/Management API —
  only a SHA-256 content digest — so this was confirmed by comparing that
  published digest against a locally computed `sha256("true")`, which
  matched exactly (`"True"`/`"FALSE"`/other casings do not); this is the
  strongest available non-mutating evidence of the secret's actual value.
- The deployed `delete-account` Edge Function (`index.ts` and
  `recentAuth.ts`) is byte-for-byte identical to this repository's current
  implementation, downloaded and diffed directly rather than assumed from
  version/timestamp metadata alone — including the 2026-08-14
  `token_refresh`-exclusion correction described in "Reauthentication"
  below.
- Every account-related migration through `20260813140000` is applied in
  production, confirmed by direct schema/function/RLS/grant introspection
  (function `SECURITY DEFINER`/`search_path`/signatures, `user_profiles`
  grants and RLS policy, its seven `CHECK` constraints, and
  `reset_learning_language_progress`'s corrected, alias-qualified function
  body) — not by `supabase migration list`, whose remote-tracking table
  (`supabase_migrations.schema_migrations`) does not exist on this project
  (see "Live cascade verification" below for why migration-file inspection
  alone has never been sufficient here).

**Account deletion is therefore intentionally live in production today,
fully protected by the reauthentication design documented below (including
the `token_refresh` exclusion). No configuration change is currently
required.** This supersedes the 2026-08-13 "set back to `false`" note
above, which described an intermediate state while the reauthentication
phase was still being finished, not the current one. Item 3 (live
FK-cascade re-verification, immediately below) was not part of this
specific check and remains open on its own terms.

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

### Reauthentication — ENFORCED (2026-08-13, corrected 2026-08-14, Google exemption 2026-08-14)

FluentStellar supports exactly two sign-in methods (`src/lib/
supabaseAuth.ts`): email/password (`signInWithPassword`/
`signUpWithPassword`) and Google OAuth via PKCE (`signInWithGoogleOAuth`).
No magic-link or other provider is wired into the frontend, regardless of
what `supabase/config.toml`'s local-dev template enables/disables (that
file is CLI scaffolding for local development, not a record of the live
project's provider configuration).

This section previously listed three options "for a future Settings task,
in increasing order of rigor" — the first (password re-entry, verified via
a fresh sign-in, never a bare claims check) and third (a short-window
`amr`-timestamp check, decoded and verified server-side) are now both
built, together, as one complete design:

- **Server-side enforcement** (`supabase/functions/delete-account/
  recentAuth.ts`, imported by `index.ts`) reads the `amr` (Authentication
  Methods Reference) claim off the caller's own bearer token — the same
  claim this section always named as the correct mechanism — and rejects
  the request (`403 { error: "reauthentication_required" }`) unless a
  QUALIFYING authentication event happened within the last 5 minutes
  (`RECENT_AUTH_WINDOW_SECONDS`). Deliberately `amr`, never `iat`: `iat`
  unconditionally advances on every token refresh, exactly the "weak,
  easily-misleading proxy" this section originally warned against.
  **Correction (2026-08-14):** an earlier version of this check took the
  newest timestamp across *every* `amr` entry, on the mistaken assumption
  that `amr` "only updates on a genuine authentication event." Supabase's
  own JWT Claims Reference documents `token_refresh` as a real, distinct
  `amr` method — written on every silent background token refresh
  (`ensureFreshSupabaseSession`), which never requires the user to
  re-prove anything. Taking the newest timestamp unconditionally let a
  purely passive refresh silently and indefinitely extend the 5-minute
  deletion window. The fix: `RECENT_AUTH_METHODS` is an explicit
  **allow-list** — `{"password", "oauth"}`, FluentStellar's own two
  supported sign-in flows — and every other `amr` entry, `token_refresh`
  included, is skipped when computing recency, however recent its own
  timestamp is. This is enforced independently of the frontend — a direct
  `POST /functions/v1/delete-account` call with an ordinary stale-but-valid
  session (or one kept "alive" purely by silent refreshes) is rejected the
  same way regardless of what UI (if any) made the request.
- **Client-side production of a fresh `amr` entry, for password accounts**
  (`src/lib/accountDeletion.ts`'s `reauthenticateForAccountDeletion`,
  wired into Settings' Delete Account dialog): re-verifies the current
  password through a fresh `signInWithPassword`-equivalent call
  (`reauthenticateWithPassword`) immediately before the delete call. The
  email verified is always the current session's own trusted address —
  never user-editable — and the returned session is adopted only after
  confirming its `user.id` matches the currently authenticated account, so
  credentials for a different account can never authorize deleting this
  one (see `reauthenticateWithPassword`'s own header for why it
  deliberately does not call `signInWithPassword` directly, which would
  adopt a session before that check could run).
- **Google OAuth accounts — exempted from the 5-minute window (product
  policy, 2026-08-14).** Building a provider-specific re-consent/redirect
  flow remains the genuine blocker this section always anticipated
  ("depend[s] on frontend/provider work this task deliberately excludes"),
  so rather than build one, the product decision was to trust a Google
  account's CURRENT, already-verified session outright: Settings' dialog
  has no password field and no in-dialog reauthentication step for these
  accounts (nor any reauthentication warning — see below), and the
  Edge Function itself skips the `amr`-recency check entirely for them.
  This is not "no check at all" — `adminClient.auth.getUser(callerToken)`
  still independently validates the token's signature, expiry, and backing
  user before this exemption is ever consulted, so a Google account
  deleting itself is always acting on a token GoTrue itself just confirmed
  is live, exactly as a password account's stale-but-otherwise-valid
  session would be. `isCurrentSessionGoogleAuthenticated`
  (`recentAuth.ts`) determines eligibility from two independent,
  server-trusted signals that must BOTH agree, never from anything the
  request body supplies:
  1. `app_metadata.provider === "google"` on the `User` object
     `adminClient.auth.getUser(callerToken)` already returned above in the
     same request — GoTrue's own record of the account's provider, never
     decoded from the client's own token.
  2. That SAME token's own `amr` claim contains an actual `"oauth"` entry
     — reflecting how *this specific session* was established, not merely
     the account's historical/linked-provider list. This is the guard
     against an account that has Google linked at some point but whose
     current session was actually established by password: such a session
     fails signal 2 and falls through to the ordinary password-recency
     check (which it will also fail, having no qualifying `amr` entry of
     its own, unless it also has a recent password sign-in). FluentStellar
     never exposes a "link another provider" UI (password and Google are
     two independent, non-linked sign-in flows — `src/lib/
     supabaseAuth.ts`), so in practice signal 2 always agrees with signal
     1; it is still checked, defensively, as the strongest available
     current-session signal. Either signal missing, unexpected, or
     ambiguous fails CLOSED into the stricter password-reauthentication
     path — never fails open into skipping it.
  Password accounts are completely unaffected by this branch:
  `isCurrentSessionGoogleAuthenticated` returns `false` for them by
  construction (`app_metadata.provider` is `"email"`, never `"google"`),
  so they fall through to the unchanged recent-`password`-AMR check above.
  See `scripts/tests/account/test-google-reauth-exemption.mjs` for tests
  against the real algorithm, including the "Google-linked account,
  password-established current session" scenario above.

### Session behavior after deletion

Not independently tested against a live project (no Supabase E2E
infrastructure exists — see the "Profile architecture" section above), but
follows directly from how Supabase Auth resolves a token: an outstanding
refresh token becomes unusable immediately (the user record it would mint a
new access token for no longer exists). An already-issued, not-yet-expired
access token remains signature-valid until its own `exp`, but is
functionally inert — every RLS policy in this schema is `auth.uid() = ...`-
scoped, and the data it could ever have matched no longer exists after the
cascade, so there is nothing left for a stale token to read or write.

### Built (Settings Phase 1 + follow-ups, 2026-08-12 — 2026-08-13)

Everything this section originally deferred now exists: the Settings page,
the Delete Account button, the typed-`DELETE`-confirmation dialog, and the
frontend client wrapper (`deleteAccount()` in `src/lib/accountDeletion.ts`,
`POST /functions/v1/delete-account` with the caller's own bearer token,
matching the pattern in `src/lib/supabaseAuth.ts`, exactly as anticipated).

One deliberate correction to this section's own original suggestion: on a
successful `{ deleted: true }` response, the Settings cleanup handler
(`handleAccountDeleted` in `src/app/App.tsx`) does **NOT** call
`signOutSupabase()`. By the time that callback runs the account no longer
exists server-side, so `signOutSupabase()`'s own `POST /auth/v1/logout`
call would carry an access token whose `sub` claim names a user
`auth.users` no longer has — confirmed live, this makes GoTrue reject it
with `403 "User from sub claim in JWT does not exist"`, a real rejection
for a genuinely deleted account, not a bug to retry past. The fix
(`clearLocalSupabaseSession()`, `src/lib/supabaseAuth.ts`) does only the
local half of sign-out — clearing the stored session and PKCE verifier and
firing the same app-wide session-changed notification — with no network
call at all. Ordinary user-triggered Sign Out is unaffected and still calls
`signOutSupabase()` as originally documented.

Deployment and enablement remain two separate events: this function is
deployed with `--no-verify-jwt` (see "CORS and `verify_jwt`" below) and
`ACCOUNT_DELETION_ENABLED=true` is set on the live project — both
confirmed via manual live testing (timezone change, reset progress, and
account deletion all verified working end-to-end).

### CORS and `verify_jwt` (2026-08-13)

`supabase/config.toml`'s `[functions.delete-account]` originally set
`verify_jwt = true` "with no concrete architectural reason to disable it."
That reason surfaced live: with `verify_jwt = true`, Supabase's own gateway
requires a valid bearer token on *every* request routed to this function,
including the browser's automatic CORS preflight `OPTIONS` request — which
never carries an `Authorization` header. The gateway rejected the preflight
itself, before this function's own already-correct
`if (req.method === "OPTIONS")` handler ever ran, which the browser
reported as a failed preflight and the frontend saw as a generic network
error. `verify_jwt` is now `false` for this function (deployed with
`supabase functions deploy delete-account --no-verify-jwt`). This does
**not** make deletion callable without authentication: the function's own
`adminClient.auth.getUser(token)` check remains unconditional and was
always independently sufficient — it validates the JWT itself and confirms
the backing `auth.users` row still exists, which platform-level
`verify_jwt` alone never did anyway. `CORS_HEADERS`'
`Access-Control-Allow-Headers` was also corrected to include `apikey`
(previously only `authorization, content-type`), matching every header the
real frontend caller (`getAuthHeaders()`, `src/lib/supabaseAuth.ts`)
actually sends.

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

### Activation (2026-08-12) — Settings backend follow-up

All four "Future activation" prerequisites above are now satisfied: the
Settings Phase 1 UI (typed-`RESET`-confirmation dialog, targeting the
caller's active learning language) and its client wiring already exist and
already called this exact RPC (blocked only by the missing grant); this
follow-up re-ran the full security audit above against the function's
actual current source (identity, `search_path`, every `DELETE` predicate,
no dynamic SQL, no `user_profiles`/`auth.users` reference) with no findings,
and then applied exactly the versioned grant this section always
anticipated, as its own migration:
`supabase/migrations/20260812130000_activate_learning_progress_reset_rpc.sql`
— see that file's own header for the audit re-confirmation. No change was
made to `reset_learning_language_progress` itself; the original migration
(`20260808120000_...sql`) is untouched. Cross-user and cross-language
isolation are now also exercised live end-to-end by
`scripts/tests/live/scenarios/progressResetActivated.mjs` (see "Live
Supabase E2E tests" below), superseding the old `progressResetDisabled.mjs`
scenario that only proved the RPC stayed unreachable.

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

## My Lists Phase 1 — user_vocabulary_lists table + narrow create RPC (2026-08-11)

Migration: `20260811130000_add_user_vocabulary_lists.sql`.

"My Lists" lets a signed-in user create their own named vocabulary
collections (e.g. "Travel German", "Difficult Words") to organize words they
want to learn together. A list is organization only — it is explicitly not a
second learning-state system; words continue using the canonical
`user_word_progress` state. Word membership (which concepts belong to which
list) is out of scope for this phase and will be a separate table later,
referencing `user_vocabulary_lists.id`.

New table `public.user_vocabulary_lists` (`id`, `user_id`, `target_language`,
`name`, `created_at`, `updated_at`). Lists are scoped by `target_language`
(the same seven-code allow-list `native_language`/`learning_language`
already validate against) — a list created while German is active belongs to
German and must never surface once the active language changes to Spanish.
No cross-language merge exists.

**Reconciled with an already-existing live table.** `user_vocabulary_lists`
was created manually against the live project before this migration
existed — same columns, plus two existing name `CHECK` constraints
(`user_vocabulary_lists_name_length`, `user_vocabulary_lists_name_not_blank`,
preserved verbatim rather than duplicated under a different name), no
`target_language` constraint yet, and four broad owner-scoped RLS policies
(read/create/update/delete — i.e. direct `INSERT`/`UPDATE`/`DELETE` were
allowed at the time). Every statement in this migration is written to
converge both that live shape and a fresh database (table not created yet)
onto the identical final state below, without ever dropping/recreating the
table or touching an existing row: `CREATE TABLE IF NOT EXISTS` is a full
no-op against the live table; the `target_language` constraint is added via
a guarded `DO` block (checked via `pg_constraint`, with a fail-fast
precondition if any existing row already holds an unsupported value — same
confirm-before-constrain idiom as
`20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql`)
rather than inline in `CREATE TABLE`; the four legacy live policy names are
individually `DROP POLICY IF EXISTS`'d before the single new policy is
created; grants are revoked-then-re-granted explicitly rather than assumed.
Against the live database, this migration performs the exact corrective
tightening (broad policies → RLS-SELECT-only + RPC-only writes) that
`user_word_progress`/`user_daily_stats`/`user_profiles` each needed a
separate later migration for — done here in the same migration that adds
the table, since the table itself is brand new to this codebase's migration
history.

Final state, either path:

- RLS enabled with exactly one policy: ownership-scoped `FOR SELECT`
  (`auth.uid() = user_id`), to `authenticated` only.
- `authenticated` is granted `SELECT` and nothing else; `anon` receives no
  direct privilege at all; `postgres`/`service_role` keep full access.
- The only write path is `public.create_user_vocabulary_list(p_target_language
  text, p_name text)` — `SECURITY DEFINER`, empty `search_path`, every
  referenced object schema-qualified, caller derived exclusively from
  `auth.uid()` (no `p_user_id` parameter exists), mirroring
  `complete_user_profile_onboarding`'s exact shape. `EXECUTE`:
  `postgres`/`authenticated`/`service_role` only, `public`/`anon` explicitly
  revoked.
- List-name validation (non-empty after trim, 80-character max) is enforced
  twice: once in the RPC (a clean, named exception before any `INSERT` is
  attempted) and once as the table's own `CHECK` constraints, so no future
  write path can bypass it. Neither layer silently rewrites or truncates the
  name — the RPC rejects, it never clamps.
- No uniqueness constraint on `name` — the product spec explicitly does not
  require unique list names.

Not built in this migration/phase: any word-membership table, any
update/delete/rename RPC for a list. Untouched by this migration: every
other table, RPC, policy, and grant in this schema, and every existing row
in `user_vocabulary_lists` (no `INSERT`/`UPDATE`/`DELETE` against the table
is ever issued by the migration itself).

## My Lists Phase 2A — duplicate-name protection, rename/delete RPCs, word-membership table (2026-08-11)

Migration: `20260811140000_my_lists_phase2a_duplicate_protection_and_membership.sql`.

**New product rule.** A user may not create two lists with the same name
for the same `target_language`. Duplicate detection is case- and
whitespace-insensitive (`"Travel"` / `"travel"` / `" TRAVEL "` /
`"Travel   "` all collide); the same name is still allowed across
*different* target languages (German "Travel" and Spanish "Travel" can both
exist). Enforced with a unique expression index —
`user_vocabulary_lists_user_language_normalized_name_key` on
`(user_id, target_language, lower(btrim(name)))` — the authoritative,
race-safe defense. `create_user_vocabulary_list` and the new
`rename_user_vocabulary_list` each also run a proactive `EXISTS` check
first, raising `23505` with this schema's own message so the common
non-racing case never needs to parse the index's raw constraint text;
`src/lib/supabaseError.ts` already classifies `23505` as `"conflict"`
globally, so no new error category was needed on the frontend.

**Existing duplicates are never auto-resolved.** The unique index is added
inside a guarded `DO` block that counts colliding
`(user_id, target_language, normalized name)` groups first; if any exist,
the whole migration aborts with a named exception (not merely that one
statement — Supabase's migration runner applies each migration file in a
transaction, so nothing else in this file applies either until the
duplicates are resolved). Detect them with:

```sql
select
  user_id,
  target_language,
  lower(btrim(name)) as normalized_name,
  count(*) as duplicate_count,
  array_agg(id order by created_at) as list_ids,
  array_agg(name order by created_at) as names
from public.user_vocabulary_lists
group by user_id, target_language, lower(btrim(name))
having count(*) > 1
order by duplicate_count desc;
```

Resolve every returned group by renaming or deleting the extra rows
(`update`/`delete ... where id = any(...)`, keeping whichever row you want
to keep) before applying this migration.

**`rename_user_vocabulary_list(p_list_id uuid, p_name text)` /
`delete_user_vocabulary_list(p_list_id uuid)`** mirror
`create_user_vocabulary_list`'s exact shape: `SECURITY DEFINER`, empty
`search_path`, every referenced object schema-qualified, caller derived
exclusively from `auth.uid()` (no `p_user_id` parameter on either).
`EXECUTE`: `postgres`/`authenticated`/`service_role` only, `public`/`anon`
revoked. Rename re-validates ownership (a missing/foreign list simply
matches zero rows, same pattern as `set_word_progress_favorite`), looks up
the list's own `target_language` server-side (never a client parameter),
trims/rejects-blank/caps the name at 80 characters, enforces the same
duplicate rule (excluding the list's own row), and sets
`updated_at = now()` explicitly — no generic trigger. Delete only ever
removes a caller-owned row and never references `user_word_progress` at
all, so a list rename or delete never touches vocabulary/learning
progress.

**Superseded — see "My Lists Corrective Phase — word_id-based membership"
below for the current schema.** The shape described in this subsection
(`word_progress_id`, unique `(list_id, word_progress_id)`) was replaced by
that later migration; it is kept here only as the historical record of how
the table was first built.

**`public.user_vocabulary_list_words`** — the word-membership foundation:
`id`, `list_id` (FK -> `user_vocabulary_lists.id`, `ON DELETE CASCADE`),
`word_progress_id` (FK -> `user_word_progress.id`, `ON DELETE CASCADE`),
`created_at`; unique `(list_id, word_progress_id)`. It says only "this
progress row belongs to this list" — it never duplicates `word_state`,
`target_language`, translation, CEFR level, or word text; all of that
stays owned by `user_word_progress` (state) or `vocabulary.json` (display
data, resolved client-side only when a list's detail rows are actually
rendered, reusing `loadVocabularyProgress.ts` as-is). `target_language` is
deliberately not denormalized onto this table — a row's language is always
resolved by joining through `word_progress_id`. An index on
`word_progress_id` (in addition to the unique constraint's own index,
which already serves `list_id`-only lookups) exists specifically so a
future `user_word_progress` deletion cascades without a sequential scan.

RLS: enabled, one `SELECT` policy scoped via an `EXISTS` join against the
caller's own `user_vocabulary_lists` rows — there is no `user_id` column on
this table itself; ownership is always derived through the list it belongs
to. `authenticated` holds `SELECT` only; `anon` holds nothing. **No
membership-write RPC exists yet** — Phase 2A leaves membership writes
unavailable; Phase 2B's Add/Remove Words RPC will be the only write path
when it ships, matching every other table in this schema. Language safety
for that future write path (a German list must never accept a Spanish
`user_word_progress` row) is a requirement on that RPC's own design, not
something this phase's schema or read layer needs to (or does) assume.

Not built in this migration/phase: any membership-write RPC, any
word-detail/CEFR/translation resolution server-side. Untouched: every other
table/RPC/policy/grant in this schema, and every existing
`user_vocabulary_lists` row (no `INSERT`/`UPDATE`/`DELETE` against it is
ever issued by this migration itself, beyond the guarded read-only
duplicate check).

## My Lists corrective fix — RPC column-reference ambiguity (2026-08-11)

Migration: `20260811150000_fix_my_lists_rpc_column_ambiguity.sql`.

Live bug: `rename_user_vocabulary_list` (and, on inspection,
`create_user_vocabulary_list`) failed with `42702 column reference "user_id"
is ambiguous`. Root cause: both functions declare `RETURNS TABLE (id,
user_id, target_language, name, created_at, updated_at)`, which gives
PL/pgSQL same-named output variables in scope for the whole function body.
Each function's proactive duplicate-name check —
`if exists (select 1 from public.user_vocabulary_lists where user_id = ...
and target_language = ... and lower(btrim(name)) = ...)` (plus `and id <>
p_list_id` in rename's) — referenced those columns bare, inside a genuine
value-expression context, so Postgres couldn't tell the output variable
from the table column. Every other statement in both functions (the
ownership lookup, the `INSERT`/`UPDATE` target lists — neither of which is
an expression PL/pgSQL substitutes into — and every `RETURNING` clause) was
already `uvl.`-qualified and untouched.

`delete_user_vocabulary_list` was inspected for the same pattern and does
**not** have it: it declares `returns void`, not `RETURNS TABLE`, so it has
no `id`/`user_id`/etc. output variables in scope — its own `where id =
p_list_id and user_id = v_user_id` is unambiguous. Left untouched.

Fix: both ambiguous subqueries now alias the table (`as uvl`) and qualify
every column reference — not the `#variable_conflict use_column` pragma,
which would blanket-prefer columns over variables everywhere in the
function rather than naming the one place that needed it.
`CREATE OR REPLACE FUNCTION` with each function's exact existing signature
(`create_user_vocabulary_list(text, text)`,
`rename_user_vocabulary_list(uuid, text)`) — grants are preserved
automatically, no public API change. No table, index, RLS policy, or
membership row is touched.

## My Lists Phase 2B — membership write RPCs (Add/Remove Words) (2026-08-11)

Migration: `20260811160000_my_lists_phase2b_membership_write_rpcs.sql`.

**Superseded — see "My Lists Corrective Phase — word_id-based membership"
below.** Both RPC signatures described in this subsection
(`add_words_to_vocabulary_list(uuid, uuid[])`,
`remove_word_from_vocabulary_list(uuid, uuid)`) were dropped and replaced by
that later migration, along with this phase's "only an already-studied word
can join a list" restriction, which turned out not to be the intended
product. Kept here only as the historical record of how the write RPCs were
first built.

Adds the two write paths `public.user_vocabulary_list_words` has lacked
since Phase 2A created it: adding and removing membership rows. The table
itself, its columns/index/RLS policy/grants are all untouched — this
migration only adds RPCs; `20260811140000...sql` and `20260811150000...sql`
are not modified.

**Batch-only add, no separate single-word RPC.** Only
`add_words_to_vocabulary_list(p_list_id uuid, p_word_progress_ids uuid[])`
exists. The frontend's Add Words picker always operates on an array of
selected `word_progress` ids (even one selection is a one-element array),
so a second, singular-signature RPC would duplicate the exact same
ownership/language-validation/idempotency logic for no caller that
actually needs it — matching the brief's own explicit allowance ("If batch
RPC is implemented, individual add RPC is not mandatory unless useful
elsewhere").

`add_words_to_vocabulary_list`:
- `SECURITY DEFINER`, empty `search_path`, caller derived exclusively from
  `auth.uid()` (no `p_user_id`).
- Validates list ownership first (`42501` if not found/not owned).
- De-duplicates the input array, then validates **every** requested
  `word_progress_id` in one set-based check: must exist, be owned by the
  caller, and match the list's own `target_language`. If even one id fails
  any of those three checks, the whole call aborts (`22023`) with **no
  partial writes** — validation completes before the `INSERT` ever runs,
  and the function body is one implicit transaction regardless.
- Duplicate membership is never an error: the set of already-member ids is
  captured *before* the `INSERT`, which itself uses
  `ON CONFLICT (list_id, word_progress_id) DO NOTHING` (the table's
  existing unique constraint); the `RETURNS TABLE` reports one
  `(word_progress_id, already_added)` row per requested id either way.

`remove_word_from_vocabulary_list(p_list_id uuid, p_word_progress_id uuid)`:
- Same `SECURITY DEFINER`/`auth.uid()` shape. Validates list ownership
  explicitly first (`42501` if not owned) so an authorization problem is
  never silently swallowed; the `DELETE` itself is idempotent — removing
  an already-absent membership affects zero rows and is not an error.

**Neither RPC ever touches `user_word_progress` or `user_daily_stats`** —
`word_state`, `is_favorite`, `last_practiced_at`, `next_review_at`,
`correct_streak`, and every daily-stat column are completely unaffected by
adding or removing a list membership; a membership row only ever means
"this progress row belongs to this list."

**Cross-language enforcement is server-side**, not merely client-side: the
add RPC's set-based validation compares `user_word_progress.target_language`
against the list's own `target_language` for every requested row inside
the RPC itself — a German list can only ever gain German progress rows,
regardless of what the client sends.

**Grants**: both RPCs — `EXECUTE` revoked from `public`/`anon`, granted to
`postgres`/`authenticated`/`service_role` only. `user_vocabulary_list_words`'
own table grants are untouched: `authenticated` still holds `SELECT` only,
no direct `INSERT`/`DELETE` grant — these two RPCs are now the table's only
write path.

## My Lists Corrective Phase — word_id-based membership (2026-08-11)

Migration: `20260811170000_my_lists_corrective_word_id_membership.sql`.

**Core problem this phase fixes.** Phase 2B's membership shape
(`word_progress_id` referencing `user_word_progress.id`) meant a word could
only join a list if the caller already had learning progress for it — Add
Words only ever showed already-studied words, and list cards showed
Learning/Known/Mastered aggregate counts. That is not the intended product:
a list is a neutral vocabulary collection, not an SRS-state container. A
user must be able to add **any** vocabulary word from the active target
language to a list, studied or not — list membership must be completely
independent of `user_word_progress`.

**New membership identity: `word_id`, not `word_progress_id`.**
`public.user_vocabulary_list_words` now stores `word_id text not null` —
the same cross-language concept id `user_word_progress.word_id` already
stores (e.g. `"A1-00193"`; confirmed by reading
`src/data/vocabulary/*/vocabulary.json` — `concept_id` is the shared key
every language's vocabulary file indexes by, and it is this exact string
`user_word_progress.word_id` persists). No second id system was invented.
`word_id` is deliberately **not** a foreign key to `user_word_progress` —
membership must be able to exist with zero progress for that concept, and
vocabulary itself has no database table for it to reference at all
(vocabulary lives in this repository's `vocabulary.json` files, not
Supabase — see "Word validation stays application-owned" below). A
membership row still never duplicates `word_state`, translation,
definition, CEFR level, or `target_language` — those stay owned by
`user_word_progress` (state, when it exists) or `vocabulary.json` (display
data, resolved client-side).

**Migration strategy — every existing membership row is preserved.** This
table went live during Phase 2B testing, so the migration is forward-only
and converts existing rows in place rather than dropping/recreating
anything:

1. Add `word_id text`, nullable at first.
2. Backfill every existing row via its own
   `word_progress_id -> user_word_progress.id -> user_word_progress.word_id`.
3. Verify every row now has a non-blank `word_id` — a guarded `DO` block
   that counts unresolved rows and, if any exist, **aborts the whole
   migration** with a named exception listing the exact affected row ids.
   It never silently drops a membership row to make the later constraint
   fit.
4. Only once step 3 passes does `word_id` become `NOT NULL`.
5. The old `(list_id, word_progress_id)` unique constraint is dropped.
6. The old `word_progress_id -> user_word_progress` foreign key (and its
   now-purposeless supporting index) is dropped.
7. `word_progress_id` itself is dropped.
8. The new authoritative uniqueness constraint,
   `user_vocabulary_list_words_list_word_id_key` on `(list_id, word_id)`,
   is added (guarded by an existence check for safe re-runs).
9. `list_id -> user_vocabulary_lists(id) ON DELETE CASCADE` — untouched
   throughout; a list delete still cascades its memberships exactly as
   before.

None of `20260811130000...sql`, `20260811140000...sql`,
`20260811150000...sql`, or `20260811160000...sql` is edited — every
statement is new, forward-only DDL/RPC-replacement layered on top.

**RPCs replaced, not versioned alongside a compatibility window.**
`add_words_to_vocabulary_list(uuid, uuid[])` and
`remove_word_from_vocabulary_list(uuid, uuid)` both read/wrote the
now-removed `word_progress_id` column, so `CREATE OR REPLACE` could not
simply retarget them — a different parameter list creates a new overload,
it does not replace the old one. Unlike the duration-aware learning-RPC
rollout (Corrective Migrations 5/6 above), this feature has not been
committed or deployed at any point before this migration (an explicit
constraint carried through every phase of My Lists so far), so there is no
live frontend build calling the old signatures to stage a rollout window
for — the old overloads are simply dropped (`DROP FUNCTION IF EXISTS`) in
the same migration that creates their replacements:

- `add_words_to_vocabulary_list(p_list_id uuid, p_word_ids text[])` —
  same `SECURITY DEFINER`/empty-`search_path`/`auth.uid()`-derived-caller/
  no-`p_user_id` shape as its Phase 2B predecessor. Validates list
  ownership first (`42501`), rejects a null/empty array, rejects any
  null/blank entry (`22023`, whole call aborts — no partial writes),
  rejects an entry longer than 64 characters as a defense-in-depth sanity
  cap (real concept ids look like `"A1-00193"`; the exact vocabulary id
  format itself is not, and cannot be, validated at the database layer —
  see "Word validation stays application-owned" below). De-duplicates the
  input, captures already-member ids before the `INSERT`, and uses
  `ON CONFLICT (list_id, word_id) DO NOTHING` so duplicate membership is
  never an error — the `RETURNS TABLE` reports `(word_id, already_added)`
  per requested id either way, exactly like the Phase 2B version did for
  `word_progress_id`. Cross-language enforcement against
  `user_word_progress.target_language` is gone because there is no longer
  a `user_word_progress` row to cross-check against — the app layer
  sources word ids from the list's own `target_language`'s
  `vocabulary.json` in the first place (see "Picker architecture" below),
  and the database has no vocabulary table of its own to validate that
  against either way.
- `remove_word_from_vocabulary_list(p_list_id uuid, p_word_id text)` —
  same ownership-checked, idempotent shape as its predecessor, scoped by
  `(list_id, word_id)` instead of `(list_id, word_progress_id)`.

Neither RPC has ever touched, or now touches, `user_word_progress` or
`user_daily_stats` — adding/removing a list membership still only ever
affects `user_vocabulary_list_words`. Grants: both RPCs — `EXECUTE` revoked
from `public`/`anon`, granted to `postgres`/`authenticated`/`service_role`
only, matching every other narrow write RPC in this schema.
`user_vocabulary_list_words`'s own table grants are untouched:
`authenticated` still holds `SELECT` only, no direct `INSERT`/`DELETE`
grant — these two RPCs remain the table's only write path.

**Word validation stays application-owned.** Vocabulary lives in this
repository's `vocabulary.json` files, not a Supabase table, so the database
genuinely cannot verify a `word_id` refers to a real concept — no
vocabulary table was added to make that possible (that would duplicate a
second copy of vocabulary data the repository already owns as static
files). The RPC validates everything it can actually know (non-null array,
no blank/oversized entries, list ownership); the client sources every
`word_id` it ever sends from the existing vocabulary concept resolver
(`buildVocabularyConceptResolver` in
`src/data/vocabulary/resolveVocabularyWordData.ts`), which already refuses
to resolve a concept id absent from either language's `vocabulary.json`.

**Picker architecture — full vocabulary, not just studied words.** The Add
Words picker (`AddWordsDialog.tsx`) now resolves every concept in the
list's own `target_language`'s `vocabulary.json` that also has a matching
native-language entry (the same "both sides must exist" rule
`buildVocabularyConceptResolver` already enforced), not just concepts with
a `user_word_progress` row — reusing the existing resolver/dynamic-import
architecture (`loadFullVocabularyForLanguagePair` in
`src/features/user-profile/sections/vocabulary/loadFullVocabulary.ts`), no
second vocabulary source. `user_word_progress` rows for the active target
language are cross-referenced afterward, client-side, purely to *decorate*
each row with an optional status (`notStudied`/`learning`/`known`/
`mastered`) — never to gate which words are selectable, and never written
to or created as a side effect of adding a word to a list.

**List cards show a real word count, nothing invented.** With progress no
longer required for membership, Learning/Known/Mastered aggregate counts on
a list card are no longer meaningful (a mostly-unstudied list would show
misleading near-all-zero segments) — cards now show only the list name and
its total membership count (`memberships.filter((m) => m.listId ===
id).length`, computed directly from membership rows, no aggregate
category math). The three-segment progress bar and stat row are removed
from `ListCard.tsx` entirely.

**Language isolation is unchanged in practice.** Lists (and therefore the
picker) already only ever load for the caller's active `target_language`
(`readUserVocabularyLists(session, targetLanguage)`,
`targetLanguage = userProfile.practiceLanguage`) — a list's own
`target_language` is what the picker resolves vocabulary for, not
whichever language happens to be active elsewhere in the app, so a German
list can never be shown Spanish concepts even though today the two always
coincide for a currently-visible list.

**Practice List remains unimplemented.** This migration and its frontend
counterpart only correct the membership model; no Practice List UI, route,
RPC, or exercise-launch behavior exists yet. This correction exists
specifically so a future Practice List can do
`list membership -> resolve vocabulary -> existing Custom Practice
exercises` without ever requiring `user_word_progress` — seeing the
membership rows for a list already resolves independently of progress
today, that future phase only needs to launch Custom Practice against the
resolved word set.

## My Lists corrective-phase fix — word_id RPC column-reference ambiguity (2026-08-11)

Migration: `20260811180000_fix_my_lists_word_id_rpc_ambiguity.sql`.

Live bug, same root-cause class as the earlier "My Lists corrective fix —
RPC column-reference ambiguity" section above (that one fixed
`create_user_vocabulary_list`/`rename_user_vocabulary_list` for
`user_id`): `add_words_to_vocabulary_list` (the word_id-based RPC added by
the corrective phase migration) failed with `42702 column reference
"word_id" is ambiguous`. Root cause: it declares `RETURNS TABLE (word_id
text, already_added boolean)`, giving PL/pgSQL a same-named `word_id`
output variable in scope for the whole function body.

Audited every occurrence of the bare token `word_id` in the prior body: the
`array_agg(uvlw.word_id)`/`uvlw.word_id = any(...)` lookup was already
fully `uvlw.`-qualified (not the bug); the `RETURN QUERY` final select used
the alias `requested_id`, never bare `word_id` (also not the bug); the only
two genuinely bare occurrences were the `INSERT ... (list_id, word_id)`
target column list and the `ON CONFLICT (list_id, word_id)` arbiter column
list — per Postgres's own grammar, an INSERT column list and an arbiter
column list are both parsed as plain column-name lists, never as
`ColumnRef` expression nodes, so PL/pgSQL's variable-substitution hook is
never invoked for either (matching the earlier ambiguity fix's own finding
about INSERT column lists/UPDATE SET targets). The INSERT column list stays
as bare column names (SQL syntax provides no way to alias-qualify it), with
a comment explaining why that's safe; the `ON CONFLICT` arbiter is
rewritten to `ON CONFLICT ON CONSTRAINT
user_vocabulary_list_words_list_word_id_key DO NOTHING` instead — naming
the constraint directly removes every column-name token from that clause,
strictly safer regardless of the arbiter-list theory above and directly
addressing the exact pattern that was suspected.

Beyond the minimal fix, every other derived relation in the function was
also renamed away from anything resembling `word_id` (`unnest(p_word_ids)
as candidate(requested_word_id)`, referenced everywhere as
`candidate.requested_word_id`) so no future edit to this function can
reintroduce this exact collision by accident — per this fix's own "do not
fix only the exact line that currently throws" scope.

`remove_word_from_vocabulary_list` was audited and found already safe: it
declares `returns void`, not `RETURNS TABLE`, so it creates no PL/pgSQL
output variables at all (the same reasoning the earlier ambiguity fix
already applied to `delete_user_vocabulary_list`), and every column
reference in its body was already alias-qualified. Left byte-for-byte
untouched — not even a no-op `CREATE OR REPLACE`.

`CREATE OR REPLACE FUNCTION` with `add_words_to_vocabulary_list`'s exact
existing signature (`uuid, text[]`) — grants are preserved automatically,
no public API change (PostgREST callers, including
`addWordsToVocabularyList` in `src/lib/vocabularyLists.ts`, need no
change). No table, index, RLS policy, or membership row is touched;
`20260811170000_my_lists_corrective_word_id_membership.sql` is not edited.

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
SUPABASE_SECRET_KEY           # that project's sb_secret_... server key — Node test process only, never a VITE_-prefixed variable, never committed
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
- Never touches the `delete-account` Edge Function and never reads or writes
  `ACCOUNT_DELETION_ENABLED` — cleanup uses the Admin API's `deleteUser`
  directly (the same primitive `delete-account` uses internally, just
  invoked here for test teardown).
- `reset_learning_language_progress` IS now reachable by `authenticated`
  (Settings backend follow-up, 2026-08-12 — see that section below) and is
  exercised end-to-end by `scenarios/progressResetActivated.mjs`: seeds real
  progress in two languages for one disposable user and in the reset
  language for the other, resets one user's one language, then
  privileged-verifies every other (user, language) combination in all four
  owned tables is untouched, and that the resetting user's own
  `user_profiles` row (including `learning_language`) is byte-for-byte
  unchanged.

### Not covered here

Account deletion is deliberately **not** exercised end-to-end by this suite
(out of scope for the task that built it) beyond the one safety check above
(a real Auth-user deletion for cleanup). Its own live activation flow
(`ACCOUNT_DELETION_ENABLED=true` against a real deployed Edge Function) is
not tested here.

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
