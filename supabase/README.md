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
   them. Closed for `review_events` by Corrective Migration 4, below; still
   open for `user_profiles`, `user_word_progress`, and `user_daily_stats`.

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
   `birth_day`, `last_active_at`) are `NOT NULL` in PostgreSQL, while the
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

## What happens next

Corrective changes are separate, individually-reviewed follow-up migrations
— never folded into the baseline above. See the numbered list at the bottom
of the migration file itself for the current proposed order.

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
