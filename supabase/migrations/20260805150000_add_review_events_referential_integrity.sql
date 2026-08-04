-- ============================================================================
-- CORRECTIVE MIGRATION 3 — review_events referential integrity: add the
-- missing user_id foreign key, replace word_progress_id's foreign key with
-- an explicitly named ON DELETE CASCADE version
-- ============================================================================
--
-- Closes the last remaining item from the baseline migration's PROPOSED NEXT
-- MIGRATIONS list (item 6), left explicitly out of scope by both prior
-- corrective migrations
-- (20260805100000_restrict_learning_writes_and_add_favorite_rpc.sql,
-- 20260805130000_add_learning_non_negative_constraints_and_revoke_anon_rpc.sql):
--
--   6. Resolve review_events.word_progress_id's ON DELETE behavior and add a
--      foreign key on review_events.user_id — AFTER a product decision on
--      whether review history should survive its parent progress row being
--      deleted.
--
-- PRODUCT DECISION (this migration): review history does NOT need to survive
-- either its owning user or its parent user_word_progress row being deleted.
-- review_events exists solely as complete_word_review's own idempotency
-- ledger (the RPC's "select * into v_existing from public.review_events
-- where event_id = p_event_id and user_id = v_user_id" replay-guard — see
-- the baseline migration) and is not read anywhere else in the frontend
-- ("review_events" appears in src/ only in a comment in
-- src/lib/newWordProgress.ts describing this exact idempotency behavior; no
-- code selects from it, displays it, or exports it). A user_word_progress
-- row is only ever deleted by the auth.users row that owns it being deleted
-- (ON DELETE CASCADE from user_word_progress.user_id -> auth.users.id,
-- baseline migration) or by set_word_progress_favorite is not a delete path.
-- No account-deletion or progress-reset feature exists anywhere in this
-- repository as of this migration (grepped for deleteUser/admin.deleteUser/
-- delete-account/reset-progress across src/ and scripts/ — no matches other
-- than unrelated word-page content strings), so today ON DELETE CASCADE here
-- is only reachable via a direct auth.users deletion (e.g. Supabase Auth
-- admin action), not any existing product flow. CASCADE is still the
-- correct, forward-looking behavior: it is the only option that keeps
-- review_events.user_id and review_events.word_progress_id from ever
-- silently pointing at nothing.
--
-- DATA COMPATIBILITY — like corrective migration 2, this depends on
-- read-only validation queries run manually in the Supabase SQL Editor
-- BEFORE this migration is applied (see supabase/README.md's Corrective
-- Migration 3 section for the confirmation this migration depends on):
--
--   -- (a) review_events rows whose user_id has no matching auth.users row.
--   select count(*) as orphaned_user_id_rows
--   from public.review_events re
--   where not exists (
--     select 1 from auth.users u where u.id = re.user_id
--   );
--
--   -- (b) review_events rows whose word_progress_id has no matching
--   -- user_word_progress row. Expected to already be zero — the existing
--   -- (unnamed-by-us, NO ACTION) foreign key already enforces this — but
--   -- confirmed explicitly here rather than assumed.
--   select count(*) as orphaned_word_progress_id_rows
--   from public.review_events re
--   where not exists (
--     select 1 from public.user_word_progress uwp where uwp.id = re.word_progress_id
--   );
--
--   -- (c) review_events rows whose user_id does not match the owner of the
--   -- user_word_progress row they reference — confirms complete_word_review
--   -- never records an event under a caller who doesn't own the target
--   -- progress row (the RPC's own "for update ... where id = p_word_progress_id
--   -- and user_id = v_user_id" ownership check makes this structurally
--   -- impossible for any row written by the RPC; this query confirms no
--   -- other write path has ever produced one).
--   select count(*) as mismatched_owner_rows
--   from public.review_events re
--   join public.user_word_progress uwp on uwp.id = re.word_progress_id
--   where re.user_id <> uwp.user_id;
--
--   -- (d) the *actual* live name of word_progress_id's existing foreign key
--   -- constraint, to confirm it matches the name this migration's DROP
--   -- CONSTRAINT below assumes (review_events_word_progress_id_fkey — the
--   -- deterministic Postgres default for an inline, unnamed
--   -- "references public.user_word_progress (id)" column constraint, per
--   -- the baseline migration's table definition). If this query returns a
--   -- different name, that name must be substituted into section 2 below
--   -- before applying.
--   select conname
--   from pg_constraint c
--   join pg_class t on t.oid = c.conrelid
--   join pg_namespace n on n.oid = t.relnamespace
--   where n.nspname = 'public'
--     and t.relname = 'review_events'
--     and c.contype = 'f';
--
-- This migration must not be applied until (a), (b), and (c) above are
-- confirmed to return zero, and (d) is confirmed to return
-- review_events_word_progress_id_fkey.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Add the missing foreign key: review_events.user_id -> auth.users.id
-- ----------------------------------------------------------------------------
-- No foreign key exists on this column today (baseline migration,
-- [CATALOG-CONFIRMED absence]). Named explicitly, matching the naming shape
-- of every other user_id -> auth.users(id) foreign key already in this
-- schema (user_profiles.id, user_word_progress.user_id,
-- user_daily_stats.user_id — all ON DELETE CASCADE, baseline migration).

alter table public.review_events
  add constraint review_events_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;


-- ----------------------------------------------------------------------------
-- 2. Replace word_progress_id's foreign key with an explicitly named
--    ON DELETE CASCADE version
-- ----------------------------------------------------------------------------
-- The existing foreign key (baseline migration: "word_progress_id uuid not
-- null references public.user_word_progress (id)") carries no specified
-- ON DELETE behavior, which defaults to NO ACTION — deleting a
-- user_word_progress row currently fails outright if any review_events row
-- still references it. Dropped and re-added here, same referenced table/
-- column, now with ON DELETE CASCADE and an explicit constraint name so its
-- name no longer depends on Postgres's default-naming convention.
--
-- constraint name assumed: review_events_word_progress_id_fkey — confirmed
-- by validation query (d) above before this migration is applied.

alter table public.review_events
  drop constraint review_events_word_progress_id_fkey;

alter table public.review_events
  add constraint review_events_word_progress_id_fkey
  foreign key (word_progress_id) references public.user_word_progress (id) on delete cascade;


-- ============================================================================
-- POST-MIGRATION STATE (this migration's two foreign keys only)
-- ============================================================================
--   review_events.user_id            -> auth.users.id            ON DELETE CASCADE
--     (new — no foreign key existed on this column before this migration.)
--   review_events.word_progress_id   -> user_word_progress.id    ON DELETE CASCADE
--     (replaces the prior NO ACTION foreign key of the same referenced
--     table/column; constraint name explicit rather than Postgres-default.)
--
-- Behavior change: deleting an auth.users row now cascades through
-- user_profiles, user_word_progress, user_daily_stats (all already CASCADE,
-- baseline migration), and now also directly through review_events.
-- Deleting a user_word_progress row now cascades to delete its own
-- review_events rows instead of failing with a foreign-key violation.
--
-- Untouched by this migration: every review_events column, every other
-- table's columns/constraints, both RPCs' bodies
-- (complete_new_word_study, complete_word_review),
-- set_word_progress_favorite's body and grants, all table grants, all RLS
-- policies (review_events keeps RLS enabled with zero policies — this
-- migration adds no policy), all indexes, all triggers, corrective
-- migrations 1 and 2.
-- ============================================================================
