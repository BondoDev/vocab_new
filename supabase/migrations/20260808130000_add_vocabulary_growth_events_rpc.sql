-- ============================================================================
-- VOCABULARY GROWTH — narrow read-only RPC exposing the caller's own
-- review_events state-transition history to the authenticated client
-- ============================================================================
--
-- PRODUCT REQUIREMENT
-- ------------------------------------------------------------------------
-- The Progress page's "Vocabulary Growth" chart reconstructs historical
-- Learning/Known/Mastered counts over time (see
-- src/data/learning/vocabularyGrowth.ts's own pure reconstruction engine,
-- already implemented and unit-tested). Accurate reconstruction requires
-- each word's state-transition history, which only review_events records
-- (previous_state -> new_state, per review). user_word_progress alone only
-- stores each word's *current* state and cannot reconstruct the past — see
-- that engine's own header for the full rationale.
--
-- WHY A NEW RPC, NOT A BROADER review_events GRANT/POLICY
-- ------------------------------------------------------------------------
-- review_events has RLS enabled with ZERO policies for any role
-- (baseline migration, 20260804192152_baseline_existing_learning_system_schema.sql)
-- and every direct table privilege was explicitly revoked from anon and
-- authenticated (20260805170000_revoke_review_events_client_privileges.sql)
-- specifically because no frontend code needed to read it at the time.
-- That lockdown remains correct in general — review_events carries
-- per-review streak/promotion/demotion internals the client has no
-- business reading wholesale. This migration does not reopen it: it adds
-- one narrow, purpose-built, SECURITY DEFINER RPC that returns only the
-- four columns Vocabulary Growth's reconstruction engine actually needs,
-- scoped to the caller's own rows for one target language, using the same
-- hardened pattern already established by get_current_learning_date
-- (20260806150000_add_server_derived_learning_dates.sql) and
-- resolve_authenticated_learning_date before it. review_events' own RLS
-- (zero policies) and table grants (anon/authenticated: none) are left
-- completely untouched by this migration — the RPC reads through them as
-- postgres (its SECURITY DEFINER owner), exactly like complete_word_review
-- already writes through them today.
--
-- ACTUAL SCHEMA VERIFIED BEFORE WRITING THIS — do not assume a timestamp
-- column name
-- ------------------------------------------------------------------------
-- review_events has no `reviewed_at` column. Its authoritative "when did
-- this review happen" columns, confirmed by reading complete_word_review's
-- own current INSERT list
-- (20260806190000_add_daily_goal_snapshot_and_update_rpc.sql), are:
--   - stat_date date, NULLABLE — the server-derived learning date (via
--     resolve_authenticated_learning_date, the exact same function
--     user_daily_stats.stat_date already uses), added by
--     20260806150000_add_server_derived_learning_dates.sql. Populated on
--     every row written since that migration; null on any older row (that
--     migration explicitly does not backfill history).
--   - last_practiced_at timestamptz, NOT NULL — the review's exact
--     completion timestamp, always present on every row regardless of age.
-- This RPC returns a single, always-non-null `event_date` per row,
-- resolved server-side via
--   coalesce(stat_date, (last_practiced_at at time zone 'utc')::date)
-- so the client-side reconstruction engine never needs to know about this
-- fallback at all — see src/data/learning/vocabularyGrowth.ts's own header
-- for the matching client-side convention used for
-- user_word_progress.first_studied_stat_date (which has the identical
-- nullable-legacy-column shape, added by the same migration).
--
-- SECURITY MODEL (mirrors get_current_learning_date exactly)
-- ------------------------------------------------------------------------
--   - SECURITY DEFINER, empty search_path, every referenced object
--     schema-qualified (public.review_events).
--   - Caller derived exclusively from auth.uid() — no p_user_id parameter
--     exists; a null auth.uid() raises rather than silently returning
--     nothing.
--   - p_target_language is required and validated against the same
--     seven-code allow-list learning_language/native_language already use
--     (20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql).
--   - p_since_date is optional (default null = no lower bound), so the
--     UI's "All time" range is never silently truncated by a caller that
--     forgets to pass it — see src/data/learning/vocabularyGrowth.ts's
--     header for why the loader always requests the unbounded history
--     once and filters ranges locally, never re-querying per range click.
--   - Returns only word_progress_id, previous_state, new_state, event_date
--     — no event_id, no user_id, no result/streak/promoted/demoted
--     columns, no other user's rows, no daily-count snapshots.
--   - Read only: a single `select` statement, no insert/update/delete.
--   - EXECUTE: revoked from public and anon (explicitly, not merely never
--     granted), granted to postgres, authenticated, and service_role —
--     the same three-role grant set every other client-facing learning RPC
--     in this schema already carries.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. read_vocabulary_growth_events
-- ----------------------------------------------------------------------------

create or replace function public.read_vocabulary_growth_events(
  p_target_language text,
  p_since_date date default null
)
returns table(
  word_progress_id uuid,
  previous_state text,
  new_state text,
  event_date date
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception
      'read_vocabulary_growth_events: authentication required'
      using errcode = '28000';
  end if;

  if p_target_language is null or length(btrim(p_target_language)) = 0 then
    raise exception
      'read_vocabulary_growth_events: p_target_language is required'
      using errcode = '22023';
  end if;

  if p_target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'read_vocabulary_growth_events: p_target_language must be one of en/es/fr/pt/it/de/ru'
      using errcode = '22023';
  end if;

  return query
  select
    re.word_progress_id,
    re.previous_state,
    re.new_state,
    coalesce(re.stat_date, (re.last_practiced_at at time zone 'utc')::date) as event_date
  from public.review_events as re
  where re.user_id = v_user_id
    and re.target_language = p_target_language
    and (
      p_since_date is null
      or coalesce(re.stat_date, (re.last_practiced_at at time zone 'utc')::date) >= p_since_date
    )
  order by
    coalesce(re.stat_date, (re.last_practiced_at at time zone 'utc')::date) asc,
    re.last_practiced_at asc;
end;
$function$;

revoke execute on function public.read_vocabulary_growth_events(text, date) from public;
revoke execute on function public.read_vocabulary_growth_events(text, date) from anon;
grant execute on function public.read_vocabulary_growth_events(text, date) to postgres;
grant execute on function public.read_vocabulary_growth_events(text, date) to authenticated;
grant execute on function public.read_vocabulary_growth_events(text, date) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   New: public.read_vocabulary_growth_events(p_target_language text,
--     p_since_date date default null) — SECURITY DEFINER, read-only,
--     returns the caller's own review_events transitions for one target
--     language as (word_progress_id, previous_state, new_state,
--     event_date). Grants: postgres/authenticated/service_role EXECUTE;
--     public/anon explicitly revoked.
--
-- Untouched by this migration: review_events' own table (no columns
-- added/removed), its RLS (still enabled, still zero policies), its table
-- grants (anon/authenticated still hold none), every other table/RPC in
-- this schema, complete_word_review, complete_new_word_study,
-- resolve_authenticated_learning_date, get_current_learning_date, and all
-- prior migrations. No row anywhere is inserted, updated, or deleted by
-- this migration.
-- ============================================================================
