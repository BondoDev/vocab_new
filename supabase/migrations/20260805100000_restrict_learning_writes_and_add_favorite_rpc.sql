-- ============================================================================
-- CORRECTIVE MIGRATION 1 — restrict protected learning writes, add narrow
-- favorite-toggle RPC
-- ============================================================================
--
-- Closes the confirmed High-severity self-data-integrity weakness recorded
-- in the baseline migration's PROPOSED NEXT MIGRATIONS items 1-2: broad
-- ownership-scoped FOR ALL RLS policies on user_word_progress and
-- user_daily_stats, combined with broad anon/authenticated table grants,
-- let an authenticated user directly PATCH their own word_state,
-- correct_streak, last_practiced_at, next_review_at, new_words_completed,
-- reviews_completed, and study_time_seconds — bypassing
-- complete_new_word_study / complete_word_review entirely.
--
-- After this migration:
--   * authenticated users may SELECT their own user_word_progress and
--     user_daily_stats rows directly;
--   * authenticated users may no longer INSERT / UPDATE / DELETE / TRUNCATE
--     (or use REFERENCES/TRIGGER/MAINTAIN) on either table directly;
--   * anon loses all direct privileges on both tables. RLS already blocked
--     anon in practice (auth.uid() is null for an unauthenticated request,
--     so the USING clause was never true) — this closes the grant-layer
--     exposure too, so RLS isn't the only thing stopping anon;
--   * favorite toggling moves to a new SECURITY DEFINER RPC,
--     set_word_progress_favorite, which touches only is_favorite on a row
--     the caller owns;
--   * complete_new_word_study and complete_word_review are UNCHANGED — both
--     are SECURITY DEFINER, owned by postgres, so they keep writing
--     successfully regardless of the authenticated role's own table grants
--     (SECURITY DEFINER functions execute with the definer's privileges,
--     not the caller's).
--
-- Explicitly OUT OF SCOPE for this migration (left for later corrective
-- migrations — see baseline's PROPOSED NEXT MIGRATIONS items 3-8): missing
-- non-negative CHECK constraints, anon's EXECUTE grant on the two existing
-- RPCs, review_events FK/deletion semantics, index changes, timezone
-- changes, user_profiles cleanup.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Narrow favorite-toggle RPC
-- ----------------------------------------------------------------------------
-- Derives the caller exclusively from auth.uid() (never a client-supplied
-- user id), updates only is_favorite, and only on a row the caller already
-- owns. Mirrors complete_new_word_study / complete_word_review's own safety
-- shape: SECURITY DEFINER, empty search_path, fully schema-qualified
-- references, reject-then-act validation, deterministic RETURNS TABLE
-- result. Does not accept user_id, word_state, correct_streak,
-- last_practiced_at, next_review_at, word_id, or target_language — the only
-- writable input is the boolean flag itself.
create or replace function public.set_word_progress_favorite(
  p_word_progress_id uuid,
  p_is_favorite boolean
)
returns table (word_progress_id uuid, is_favorite boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_result_id uuid;
  v_result_is_favorite boolean;
begin
  if v_user_id is null then
    raise exception
      'set_word_progress_favorite: authentication required'
      using errcode = '28000';
  end if;

  if p_word_progress_id is null then
    raise exception
      'set_word_progress_favorite: p_word_progress_id is required'
      using errcode = '22023';
  end if;

  if p_is_favorite is null then
    raise exception
      'set_word_progress_favorite: p_is_favorite is required'
      using errcode = '22023';
  end if;

  -- Scoped by both the row's own id AND the authenticated caller's id —
  -- a mismatched/foreign row simply matches zero rows rather than ever
  -- being touched. Only is_favorite is in the SET list; every other
  -- column on this row is left exactly as it was.
  update public.user_word_progress
     set is_favorite = p_is_favorite
   where id = p_word_progress_id
     and user_id = v_user_id
  returning public.user_word_progress.id, public.user_word_progress.is_favorite
    into v_result_id, v_result_is_favorite;

  if not found then
    raise exception
      'set_word_progress_favorite: word progress row not found or not owned by caller'
      using errcode = '42501';
  end if;

  return query select v_result_id, v_result_is_favorite;
end;
$function$;

-- PostgreSQL grants EXECUTE on a newly created function to PUBLIC by
-- default — revoke that immediately so anon never receives it implicitly,
-- then grant explicitly only to the roles that need it. Unlike the two
-- existing RPCs (which grant anon EXECUTE — a separate, already-tracked
-- follow-up, not reopened here), anon has no demonstrated need to toggle a
-- favorite on a row it can never own, so anon is deliberately left out.
revoke execute on function public.set_word_progress_favorite(uuid, boolean) from public;
grant execute on function public.set_word_progress_favorite(uuid, boolean) to postgres;
grant execute on function public.set_word_progress_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_word_progress_favorite(uuid, boolean) to service_role;


-- ----------------------------------------------------------------------------
-- 2. Restrict public.user_word_progress to owner-scoped SELECT
-- ----------------------------------------------------------------------------
-- All writes now go through complete_new_word_study, complete_word_review,
-- or set_word_progress_favorite — all three SECURITY DEFINER, all three
-- already ownership-checked internally, none of which depend on the
-- authenticated role's own table grants to keep working.
drop policy if exists "Users can manage their word progress" on public.user_word_progress;

create policy "Users can view their own word progress"
  on public.user_word_progress
  as permissive
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Grants control which operations are even attemptable; RLS above then
-- controls which rows. Revoke everything from both client roles first, then
-- re-grant only the one operation still needed (authenticated SELECT).
-- postgres/service_role are intentionally untouched — both need full access
-- for migrations, SECURITY DEFINER RPC execution as the function owner, and
-- admin tooling.
revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_word_progress from authenticated;
grant select on public.user_word_progress to authenticated;

revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_word_progress from anon;


-- ----------------------------------------------------------------------------
-- 3. Restrict public.user_daily_stats to owner-scoped SELECT
-- ----------------------------------------------------------------------------
-- complete_new_word_study and complete_word_review remain the sole write
-- path (both upsert-increment this table as postgres via SECURITY DEFINER,
-- unaffected by the authenticated-role grant changes below).
drop policy if exists "Users can manage their daily" on public.user_daily_stats;

create policy "Users can view their own daily stats"
  on public.user_daily_stats
  as permissive
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_daily_stats from authenticated;
grant select on public.user_daily_stats to authenticated;

revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_daily_stats from anon;


-- ============================================================================
-- POST-MIGRATION ACCESS MODEL (this migration's two tables + new RPC only)
-- ============================================================================
--   user_word_progress:
--     postgres        — unchanged (full direct access; also the owner/
--                        execution identity of all three SECURITY DEFINER
--                        RPCs, so it never depends on its own table grants
--                        for those RPCs to succeed).
--     anon             — no direct table privileges (was: full CRUD +
--                        TRUNCATE/REFERENCES/TRIGGER/MAINTAIN).
--     authenticated     — SELECT only, RLS-scoped to auth.uid() = user_id
--                        (was: full CRUD + TRUNCATE/REFERENCES/TRIGGER/
--                        MAINTAIN via an ownership-only FOR ALL policy).
--     service_role      — unchanged (full direct access).
--
--   user_daily_stats: identical shape to user_word_progress above.
--
--   set_word_progress_favorite(uuid, boolean):
--     postgres, authenticated, service_role — EXECUTE.
--     anon, PUBLIC                          — no EXECUTE (explicitly
--                                              revoked from PUBLIC after
--                                              creation).
--
-- Untouched by this migration: user_profiles, review_events, both existing
-- RPCs' bodies and grants (complete_new_word_study, complete_word_review),
-- all CHECK constraints, all indexes, all triggers.
-- ============================================================================
