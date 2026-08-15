-- ============================================================================
-- SCHEMA AUDIT PHASE 2 — legacy table cleanup, grant-drift correction,
-- missing target_language constraints, missing event-ledger/list indexes
-- ============================================================================
--
-- WHAT THIS FILE IS
-- ------------------------------------------------------------------------
-- The cleanup migration produced by a three-phase, evidence-first audit of
-- this project's Supabase schema:
--   Phase 1  — repository-only inventory (every migration, RPC, and
--              frontend call site read directly; see supabase/README.md's
--              own equivalent narrative style for this project's history).
--   Phase 1B — live-catalog reconciliation (2026-08-15), read-only queries
--              run directly against the linked production project via
--              `supabase db query --linked` (Management API, no DB
--              password used, no row of application data ever selected —
--              only system-catalog metadata and exact/aggregate counts).
--   Phase 2  — this file. Drafted and reviewed only; NOT applied to any
--              database as part of producing it. Every guarded assumption
--              below was re-verified against the live project immediately
--              before this file was written (fresh queries, not reused
--              from Phase 1B), and is re-verified again at migration-run
--              time by this file's own guards — so this migration will
--              refuse to run, rather than silently do the wrong thing, if
--              live state has moved since either check.
--
-- SCOPE — five independent, individually-guarded changes:
--   1. Drop the two live-only, unused, permanently-empty legacy tables
--      practice_answers / practice_sessions.
--   2. Correct three confirmed grant-drift objects where a Supabase
--      project's own default privileges left anon/authenticated holding
--      more than the originating migration's text said they would.
--   3. Add the target_language CHECK constraint every other language-code
--      column in this schema already has, to the four tables that have
--      been missing it since they were first created.
--   4. Add the (user_id, target_language) index review_events and
--      custom_practice_events have always needed but never had.
--   5. Add the word_id index user_vocabulary_list_words needs to serve a
--      word_id-only lookup its existing (list_id, word_id) unique index
--      cannot.
--
-- EXPLICITLY NOT IN THIS MIGRATION (see the task report for why):
--   - Dropping user_vocabulary_lists_user_language_idx — under
--     investigation, not acted on; see the report's own EXPLAIN findings.
--   - Any change to user_profiles.user_age / birth_month / birth_day —
--     blocked on a product decision about intended semantics, not a
--     schema-safety question.
--   - Removing user_profiles.onboarding_completed — low-value, no cost to
--     leaving it, not attempted here.
--   - A CHECK enforcing study_time_seconds = new_word_study_time_seconds +
--     review_time_seconds + custom_practice_time_seconds — deferred
--     pending a separate legacy-row/RPC-path evaluation.
--   - Normalizing review_events.created_at's plain now() default to match
--     every sibling table's (now() at time zone 'utc') — cosmetic only,
--     not worth a migration on its own.
--
-- SAFETY MODEL
-- ------------------------------------------------------------------------
-- Like every migration in this repository, this file runs as a single
-- transaction under the standard Supabase migration runner: any guard
-- below that raises an exception aborts the ENTIRE file, including the
-- grant/constraint/index changes in later sections — nothing partially
-- applies. Sections 2-5 are non-destructive (grant/constraint/index
-- additions, safe to re-run) and are written with IF NOT EXISTS / guarded
-- pg_constraint lookups so a partial or repeated run is a no-op, not an
-- error. Section 1 is the only destructive section, and is guarded to fail
-- loudly rather than delete anything unexpected — see its own header.
--
-- FRESH-DATABASE COMPATIBILITY
-- ------------------------------------------------------------------------
-- practice_answers and practice_sessions exist only on the live project —
-- no migration in this repository ever created them (confirmed by
-- Phase 1's repository-wide search and Phase 1B's live catalog query).
-- Section 1 uses to_regclass() to test for each table's existence before
-- touching it, so on a fresh database built from this repository's
-- migrations alone (where neither table exists), section 1 is a complete,
-- silent no-op — exactly as required. Every other section already existed
-- on both the live project and would exist on a fresh database in the same
-- shape, so their guards (IF NOT EXISTS / named-constraint existence
-- checks) behave identically either way.
--
-- This migration has NOT been applied to any database as part of this
-- change. It is prepared and reviewed only.
-- ============================================================================


-- ============================================================================
-- 1. Legacy table cleanup — practice_answers, practice_sessions
-- ============================================================================
-- Both tables are live-only (absent from every migration in this
-- repository) and were confirmed by Phase 1B, then re-confirmed again
-- immediately before this file was written, to hold exactly zero rows —
-- never having recorded a single one — with no FK, function, trigger, or
-- application code referencing either one except practice_answers' own
-- session_id -> practice_sessions.id relationship. See the task report for
-- the full evidence trail (RLS shape, grant shape, column shape, all
-- pointing at an abandoned, pre-hardening-era architecture superseded by
-- user_word_progress / review_events / custom_practice_events /
-- user_daily_stats).
--
-- GUARD, not just IF EXISTS: dropping a table this migration believes is
-- empty must never silently destroy real data that has appeared since the
-- audit. The block below re-checks both existence and row count at
-- migration-run time and RAISEs — aborting the whole transaction, per this
-- file's safety model above — if either table unexpectedly contains a row.
-- Both existence checks are independent, so an asymmetric state (e.g. rows
-- appended to practice_sessions but not practice_answers) is caught before
-- either table is touched, not just before its own.
do $$
declare
  v_row_count bigint;
begin
  if to_regclass('public.practice_answers') is not null then
    select count(*) into v_row_count from public.practice_answers;
    if v_row_count > 0 then
      raise exception
        'practice_answers: expected 0 rows (confirmed empty by the 2026-08-15 live audit), found % — aborting before drop. Investigate the new rows before re-running this migration; do not simply remove this guard.',
        v_row_count
        using errcode = '55000';
    end if;
  end if;

  if to_regclass('public.practice_sessions') is not null then
    select count(*) into v_row_count from public.practice_sessions;
    if v_row_count > 0 then
      raise exception
        'practice_sessions: expected 0 rows (confirmed empty by the 2026-08-15 live audit), found % — aborting before drop. Investigate the new rows before re-running this migration; do not simply remove this guard.',
        v_row_count
        using errcode = '55000';
    end if;
  end if;
end;
$$;

-- Child before parent: practice_answers.session_id references
-- practice_sessions.id. Dropping the child first means the parent drop
-- never needs CASCADE and can never fail on a residual FK — and since the
-- guard above already proved both tables are empty, there is no
-- referencing row to cascade-delete either way. IF EXISTS makes both
-- statements a no-op on a fresh database (neither table was ever created
-- there) and a real DROP against the live project's current state.
drop table if exists public.practice_answers;
drop table if exists public.practice_sessions;


-- ============================================================================
-- 2. Grant-drift correction
-- ============================================================================
-- Root cause (Phase 1B, "New findings"): Supabase provisions every project
-- with default privileges that grant full table CRUD / function EXECUTE to
-- anon and authenticated automatically at CREATE TABLE / CREATE FUNCTION
-- time — a mechanism independent of PUBLIC's own implicit grant. A
-- migration that revokes only `... FROM PUBLIC`, or that GRANTs a
-- narrower privilege without first REVOKEing the broader default, leaves
-- the platform default intact underneath. Three objects in this schema hit
-- exactly that gap. None are exploitable today — RLS independently blocks
-- every case below — but the grant layer should say what it means, not
-- rely on RLS as an undocumented backstop for privileges nobody intended
-- to grant.
--
-- Every statement below was chosen after inspecting the actual frontend
-- call sites (src/lib/newWordProgress.ts, src/lib/vocabularyLists.ts,
-- src/lib/customPracticeProgress.ts) immediately before drafting this
-- migration, not assumed from the original migrations' stated intent alone.

-- ----------------------------------------------------------------------------
-- 2a. set_word_progress_favorite(uuid, boolean)
-- ----------------------------------------------------------------------------
-- Live problem: anon holds EXECUTE (the originating migration,
-- 20260805100000, revoked only from PUBLIC, never explicitly from anon).
-- Frontend confirmation: src/lib/newWordProgress.ts's
-- updateWordProgressFavorite() calls this RPC directly from the
-- authenticated favorite-toggle UI path — authenticated MUST keep EXECUTE,
-- and this migration does not touch that grant. Only anon's unintended
-- EXECUTE is revoked here.
revoke execute on function public.set_word_progress_favorite(uuid, boolean) from public;
revoke execute on function public.set_word_progress_favorite(uuid, boolean) from anon;
grant execute on function public.set_word_progress_favorite(uuid, boolean) to postgres;
grant execute on function public.set_word_progress_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_word_progress_favorite(uuid, boolean) to service_role;

-- ----------------------------------------------------------------------------
-- 2b. public.custom_practice_events
-- ----------------------------------------------------------------------------
-- Live problem: anon and authenticated both hold the full table privilege
-- set (the originating migration, 20260805190000, granted only to
-- postgres/service_role and never issued any REVOKE for anon/authenticated
-- at all, incorrectly assuming skipping the GRANT meant no privilege would
-- exist). Frontend confirmation: no file under src/ issues any direct
-- REST call against custom_practice_events — the sole write path is
-- complete_custom_practice_word (SECURITY DEFINER), matching the
-- originating migration's own stated intent exactly. Intended final state:
-- neither anon nor authenticated holds any direct table privilege at all,
-- identical to review_events' already-correct shape.
revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.custom_practice_events from anon;
revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.custom_practice_events from authenticated;

-- ----------------------------------------------------------------------------
-- 2c. public.user_vocabulary_list_words
-- ----------------------------------------------------------------------------
-- Live problem: anon holds full table CRUD, and authenticated holds full
-- table CRUD instead of the SELECT-only the originating migration
-- (20260811140000) states ("authenticated: SELECT only ... anon: no grant
-- at all") — that migration issued `grant select ... to authenticated`
-- without first revoking the broader Supabase-default set, so the GRANT
-- was additive on top of it rather than a reset. Frontend confirmation:
-- src/lib/vocabularyLists.ts reads this table only via
-- `select=list_id,word_id,created_at` GET requests (by list_id and,
-- separately, by word_id alone) and its own comment states directly there
-- is "no direct INSERT grant on user_vocabulary_list_words" — every write
-- goes through add_words_to_vocabulary_list / remove_word_from_vocabulary_list.
-- Intended final state: authenticated SELECT only, anon nothing — the
-- same revoke-the-full-set-then-grant-back-only-what's-needed pattern this
-- schema already uses correctly for user_word_progress/user_daily_stats.
revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_vocabulary_list_words from authenticated;
grant select on public.user_vocabulary_list_words to authenticated;

revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_vocabulary_list_words from anon;


-- ============================================================================
-- 3. Missing target_language CHECK constraints
-- ============================================================================
-- user_profiles.native_language/learning_language and
-- user_vocabulary_lists.target_language already enforce this exact
-- seven-code allow-list at the table level (Profile Phase 1,
-- 20260806200000; My Lists Phase 1, 20260811130000) — these four tables
-- are the schema's one remaining gap, relying entirely on RPC-level
-- validation (itself incomplete: complete_new_word_study and
-- complete_custom_practice_word validate only non-blank, never the
-- allow-list; complete_word_review never takes a target_language parameter
-- at all).
--
-- Live data was verified clean immediately before drafting this migration
-- (a fresh `count(*) filter (where target_language not in (...))` against
-- all four tables, live, returned 0 for every one) — but each guard below
-- re-verifies this independently at migration-run time and RAISEs rather
-- than silently reject or coerce a row if that has changed. Each guard
-- also checks for an already-existing constraint of the same name first
-- (this repository's established confirm-before-constrain idiom — see
-- e.g. 20260806200000, 20260811130000), so a partial or repeated run of
-- this migration is safe.

do $$
declare
  v_invalid_count integer;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_word_progress_target_language_allowed_values_check'
      and conrelid = 'public.user_word_progress'::regclass
  ) then
    select count(*)
      into v_invalid_count
      from public.user_word_progress
     where target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru');

    if v_invalid_count > 0 then
      raise exception
        'user_word_progress_target_language_allowed_values_check: % existing row(s) have a target_language outside en/es/fr/pt/it/de/ru — resolve before this migration can add the constraint',
        v_invalid_count
        using errcode = '23514';
    end if;

    alter table public.user_word_progress
      add constraint user_word_progress_target_language_allowed_values_check
      check (target_language in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'));
  end if;
end;
$$;

do $$
declare
  v_invalid_count integer;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_daily_stats_target_language_allowed_values_check'
      and conrelid = 'public.user_daily_stats'::regclass
  ) then
    select count(*)
      into v_invalid_count
      from public.user_daily_stats
     where target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru');

    if v_invalid_count > 0 then
      raise exception
        'user_daily_stats_target_language_allowed_values_check: % existing row(s) have a target_language outside en/es/fr/pt/it/de/ru — resolve before this migration can add the constraint',
        v_invalid_count
        using errcode = '23514';
    end if;

    alter table public.user_daily_stats
      add constraint user_daily_stats_target_language_allowed_values_check
      check (target_language in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'));
  end if;
end;
$$;

do $$
declare
  v_invalid_count integer;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'review_events_target_language_allowed_values_check'
      and conrelid = 'public.review_events'::regclass
  ) then
    select count(*)
      into v_invalid_count
      from public.review_events
     where target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru');

    if v_invalid_count > 0 then
      raise exception
        'review_events_target_language_allowed_values_check: % existing row(s) have a target_language outside en/es/fr/pt/it/de/ru — resolve before this migration can add the constraint',
        v_invalid_count
        using errcode = '23514';
    end if;

    alter table public.review_events
      add constraint review_events_target_language_allowed_values_check
      check (target_language in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'));
  end if;
end;
$$;

do $$
declare
  v_invalid_count integer;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'custom_practice_events_target_language_allowed_values_check'
      and conrelid = 'public.custom_practice_events'::regclass
  ) then
    select count(*)
      into v_invalid_count
      from public.custom_practice_events
     where target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru');

    if v_invalid_count > 0 then
      raise exception
        'custom_practice_events_target_language_allowed_values_check: % existing row(s) have a target_language outside en/es/fr/pt/it/de/ru — resolve before this migration can add the constraint',
        v_invalid_count
        using errcode = '23514';
    end if;

    alter table public.custom_practice_events
      add constraint custom_practice_events_target_language_allowed_values_check
      check (target_language in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'));
  end if;
end;
$$;


-- ============================================================================
-- 4. Missing event-ledger indexes
-- ============================================================================
-- Both tables previously carried only their primary-key index (confirmed
-- live, Phase 1B). read_vocabulary_growth_events and
-- reset_learning_language_progress both filter review_events by
-- (user_id, target_language); reset_learning_language_progress filters
-- custom_practice_events the same way. Both statements are additive and
-- CREATE INDEX IF NOT EXISTS, matching this repository's existing index
-- idiom (see user_vocabulary_lists_user_language_idx, 20260811130000).
create index if not exists review_events_user_language_idx
  on public.review_events (user_id, target_language);

create index if not exists custom_practice_events_user_language_idx
  on public.custom_practice_events (user_id, target_language);


-- ============================================================================
-- 5. Missing user_vocabulary_list_words.word_id index
-- ============================================================================
-- The existing unique index on (list_id, word_id) cannot efficiently serve
-- a query that filters by word_id alone (word_id is not that index's
-- leading column) — and src/lib/vocabularyLists.ts issues exactly that
-- query shape (`?word_id=eq.<id>&select=list_id,word_id,created_at`, used
-- by AddWordsDialog to find which lists already contain a given word).
-- Confirmed live, immediately before drafting this migration, that no
-- index on word_id alone exists yet; IF NOT EXISTS makes this safe to
-- re-run regardless.
create index if not exists user_vocabulary_list_words_word_id_idx
  on public.user_vocabulary_list_words (word_id);


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   Dropped (guarded, live-only, fresh-database no-op): public.practice_answers,
--     public.practice_sessions.
--
--   public.set_word_progress_favorite(uuid, boolean)
--     - postgres, authenticated, service_role — EXECUTE.
--     - anon, PUBLIC — no EXECUTE (closes the live-only drift; unchanged
--       from every other narrow RPC's already-correct shape).
--
--   public.custom_practice_events
--     - anon, authenticated — no direct table privilege of any kind.
--     - postgres, service_role — unchanged (full access).
--     - RLS unchanged: enabled, zero policies. The only write path remains
--       complete_custom_practice_word.
--
--   public.user_vocabulary_list_words
--     - authenticated — SELECT only.
--     - anon — no direct table privilege of any kind.
--     - postgres, service_role — unchanged (full access).
--     - RLS unchanged: enabled, one ownership-scoped SELECT policy. Writes
--       remain add_words_to_vocabulary_list / remove_word_from_vocabulary_list
--       only.
--
--   New CHECK constraints (en/es/fr/pt/it/de/ru, matching every other
--   language-code column in this schema):
--     - user_word_progress_target_language_allowed_values_check
--     - user_daily_stats_target_language_allowed_values_check
--     - review_events_target_language_allowed_values_check
--     - custom_practice_events_target_language_allowed_values_check
--
--   New indexes:
--     - review_events_user_language_idx on (user_id, target_language)
--     - custom_practice_events_user_language_idx on (user_id, target_language)
--     - user_vocabulary_list_words_word_id_idx on (word_id)
--
-- Untouched by this migration: every other table, column, constraint,
-- index, RLS policy, function, and grant in this schema; every row in
-- every remaining table (no UPDATE/backfill of any kind is issued
-- anywhere in this file); user_vocabulary_lists_user_language_idx;
-- user_profiles.user_age/birth_month/birth_day; user_profiles.
-- onboarding_completed; user_daily_stats.study_time_seconds's invariant;
-- review_events.created_at's default expression.
-- ============================================================================
