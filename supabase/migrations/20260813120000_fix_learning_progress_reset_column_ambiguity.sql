-- ============================================================================
-- CORRECTIVE FIX — reset_learning_language_progress: ambiguous
-- "target_language" column reference (Postgres 42702)
-- ============================================================================
--
-- LIVE FAILURE
-- ------------------------------------------------------------------------
-- Now that reset_learning_language_progress is reachable by `authenticated`
-- (supabase/migrations/20260812130000_activate_learning_progress_reset_rpc.sql),
-- Settings' Reset Progress action reaches this RPC and fails every time
-- with:
--   HTTP 400, Postgres code 42702
--   "column reference \"target_language\" is ambiguous"
--   "It could refer to either a PL/pgSQL variable or a table column."
--
-- ROOT CAUSE — confirmed by reading the live function definition in
-- 20260808120000_add_learning_language_progress_reset_rpc.sql, not assumed
-- ------------------------------------------------------------------------
-- The function's own RETURNS TABLE clause declares an output column named
-- `target_language`:
--
--   returns table (
--     reset boolean,
--     target_language text,       -- <-- this
--     word_progress_deleted integer,
--     ...
--
-- PL/pgSQL automatically creates an implicit variable for every RETURNS
-- TABLE output column, scoped for the whole function body — exactly the
-- same mechanism that makes an OUT parameter usable as a plain identifier
-- inside the function. That implicit `target_language` variable then
-- collides with the real `target_language` *column* on every table this
-- function deletes from (review_events/custom_practice_events/
-- user_word_progress/user_daily_stats all have their own target_language
-- column). Each of the four DELETE statements used the bare, unqualified
-- identifier:
--
--   delete from public.review_events
--    where user_id = v_user_id
--      and target_language = v_target_language;   -- <-- ambiguous LHS
--
-- The right-hand side (`v_target_language`, the local variable holding the
-- trimmed input) was always unambiguous — only the bare left-hand-side
-- `target_language` was ever the problem, because Postgres cannot tell
-- whether it means the output-column variable or the DELETE target table's
-- own column. This is exactly the ambiguity class PL/pgSQL's own
-- documentation warns about for RETURNS TABLE functions, and it went
-- undetected until now because EXECUTE was revoked from `authenticated`
-- (deliberately) until the activation migration above — this function's
-- SQL was never actually executed against a live server before that grant
-- shipped; source-text contract tests can confirm structure but cannot
-- catch a runtime-only Postgres name-resolution error like this one.
--
-- `user_id` was checked for the same class of ambiguity and is NOT
-- affected: it is not one of this function's RETURNS TABLE output columns
-- (only `reset`, `target_language`, `word_progress_deleted`,
-- `daily_stats_deleted`, `review_events_deleted`, and
-- `custom_practice_events_deleted` are), so the bare `user_id` column
-- reference in each DELETE's WHERE clause was never ambiguous — Postgres
-- resolves it to the table's own `user_id` column with no competing
-- PL/pgSQL identifier. Left as bare `user_id` would still be correct, but
-- every table reference below is qualified with an explicit alias anyway
-- (both `user_id` and `target_language`) for readability and so this exact
-- class of bug cannot silently recur if a future column is ever added to
-- this function's RETURNS TABLE list that happens to share a table's
-- column name.
--
-- FIX
-- ------------------------------------------------------------------------
-- Every table this function touches is now referenced through an explicit
-- alias (re/cpe/uwp/uds), and every column in every WHERE clause is
-- qualified through that alias (re.user_id, re.target_language, etc.) —
-- never a bare, unqualified column name anywhere a PL/pgSQL variable of the
-- same name could exist. This removes the ambiguity structurally: an
-- alias-qualified column reference can only ever resolve to that table's
-- column, never to a PL/pgSQL variable, regardless of what the function's
-- RETURNS TABLE list happens to be named.
--
-- The RETURN QUERY SELECT list was already unambiguous (it selects
-- `v_target_language`, the local variable, never the bare `target_language`
-- identifier) and required no change — see "RETURN VALUE" below.
--
-- SCOPE OF THIS MIGRATION — body-only fix, everything else byte-identical
-- ------------------------------------------------------------------------
-- Same public signature (`reset_learning_language_progress(text)`), same
-- RETURNS TABLE shape/column order/types, same validation logic, same
-- deletion order (review_events + custom_practice_events before
-- user_word_progress, never relying on FK cascade — see the original
-- migration's own header), same idempotency semantics, same security model.
-- CREATE OR REPLACE FUNCTION with an unchanged name/argument-type/return
-- signature does not alter the function's identity (OID) or its existing
-- ACL — PostgreSQL preserves ownership and all existing GRANT/REVOKE state
-- automatically in this case (see PostgreSQL's own CREATE FUNCTION
-- documentation: "the new function ... does not change any existing
-- permissions"). Section 2 below re-issues the exact same revoke/grant
-- statements anyway, purely as an explicit, auditable confirmation of that
-- fact in this migration's own text — matching every other function
-- migration in this repository's own convention of never leaving a
-- function's post-migration privilege state merely implied.
--
-- Not touched by this migration: the 20260808120000 migration itself (not
-- edited — this repository never edits an already-applied migration, see
-- every prior corrective migration's own precedent); the 20260812130000
-- activation migration (its one-line grant remains the authoritative
-- record of *when* authenticated first received EXECUTE — this migration
-- only fixes the function body the grant now actually allows executing);
-- user_profiles and every other table/policy/grant in this schema; the
-- Settings frontend (already calls this RPC correctly — this is a pure
-- backend correction, see the accompanying task report).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.reset_learning_language_progress(text) — corrected body
-- ----------------------------------------------------------------------------
create or replace function public.reset_learning_language_progress(
  p_target_language text
)
returns table (
  reset boolean,
  target_language text,
  word_progress_deleted integer,
  daily_stats_deleted integer,
  review_events_deleted integer,
  custom_practice_events_deleted integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_target_language text := btrim(p_target_language);
  v_review_events_deleted integer;
  v_custom_practice_events_deleted integer;
  v_word_progress_deleted integer;
  v_daily_stats_deleted integer;
begin
  if v_user_id is null then
    raise exception
      'reset_learning_language_progress: authentication required'
      using errcode = '28000';
  end if;

  if p_target_language is null or length(v_target_language) = 0 then
    raise exception
      'reset_learning_language_progress: p_target_language is required'
      using errcode = '22023';
  end if;

  if v_target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'reset_learning_language_progress: p_target_language must be one of en, es, fr, pt, it, de, ru'
      using errcode = '22023';
  end if;

  -- No runtime deployment-gate check here by design — see the original
  -- migration's header ("PRODUCTION DEPLOYMENT GATE"). Reachability is
  -- controlled entirely by the EXECUTE grants (section 2 below / the
  -- 20260812130000 activation migration), enforced by PostgreSQL before
  -- this function body ever runs.

  -- Deletion order — review_events and custom_practice_events FIRST, by
  -- their own direct (user_id, target_language) columns, so the later
  -- user_word_progress delete can never hit a foreign-key violation
  -- regardless of review_events.word_progress_id's live ON DELETE behavior.
  -- See the original migration's header for the full reasoning. Every
  -- column below is alias-qualified — see this migration's own header for
  -- why that is what fixes the 42702 ambiguity.
  delete from public.review_events as re
   where re.user_id = v_user_id
     and re.target_language = v_target_language;
  get diagnostics v_review_events_deleted = row_count;

  delete from public.custom_practice_events as cpe
   where cpe.user_id = v_user_id
     and cpe.target_language = v_target_language;
  get diagnostics v_custom_practice_events_deleted = row_count;

  delete from public.user_word_progress as uwp
   where uwp.user_id = v_user_id
     and uwp.target_language = v_target_language;
  get diagnostics v_word_progress_deleted = row_count;

  delete from public.user_daily_stats as uds
   where uds.user_id = v_user_id
     and uds.target_language = v_target_language;
  get diagnostics v_daily_stats_deleted = row_count;

  -- RETURN VALUE — selects v_target_language (the local variable holding
  -- the validated/trimmed input), never the bare `target_language`
  -- identifier, so the returned value is unambiguously and explicitly
  -- sourced from the caller's own input parameter, not from whatever the
  -- output-column variable might otherwise resolve to.
  return query
  select
    true,
    v_target_language,
    v_word_progress_deleted,
    v_daily_stats_deleted,
    v_review_events_deleted,
    v_custom_practice_events_deleted;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 2. EXECUTE privileges — re-asserted, not changed. CREATE OR REPLACE
--    FUNCTION with this function's unchanged name/argument-types/return
--    signature preserves its existing ACL automatically; these statements
--    are an explicit, auditable confirmation of that unchanged state, not
--    a new grant decision. Identical to the grant section in both
--    20260808120000 (original) and 20260812130000 (activation).
-- ----------------------------------------------------------------------------
revoke execute on function public.reset_learning_language_progress(text) from public;
revoke execute on function public.reset_learning_language_progress(text) from anon;
grant execute on function public.reset_learning_language_progress(text) to postgres;
grant execute on function public.reset_learning_language_progress(text) to authenticated;
grant execute on function public.reset_learning_language_progress(text) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   public.reset_learning_language_progress(text)
--     - Same signature, same RETURNS TABLE shape, same security model
--       (SECURITY DEFINER, empty search_path, auth.uid()-only identity, no
--       p_user_id, same seven-code language allow-list, same deletion
--       order/idempotency) as both prior migrations.
--     - Every DELETE statement now uses an explicit table alias
--       (re/cpe/uwp/uds) and qualifies every column through it — no bare
--       `target_language` (or any other column) reference remains anywhere
--       a PL/pgSQL variable of the same name could shadow it.
--     - postgres, authenticated, service_role — EXECUTE (unchanged).
--     - anon, PUBLIC — no EXECUTE (unchanged).
--     - Deletion scope unchanged: only the authenticated caller's own
--       (user_id, target_language)-scoped rows across the same four
--       tables; user_profiles/learning_language/account identity/other
--       users'/other languages' rows are still never touched.
--
-- Untouched by this migration: 20260808120000 and 20260812130000
-- themselves (not edited); every other function, table, policy, and grant
-- in this schema; the Settings frontend (unchanged — see task report).
-- ============================================================================
