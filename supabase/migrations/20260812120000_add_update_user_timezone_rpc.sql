-- ============================================================================
-- SETTINGS BACKEND FOLLOW-UP — explicit timezone replacement RPC
-- ============================================================================
--
-- Settings Phase 1 built a full Time & Region UI (searchable IANA timezone
-- selector, "Use current timezone", Save) around the only timezone RPC that
-- existed at the time: public.initialize_user_timezone(text) (Timezone
-- Phase 1, 20260806120000_add_user_timezone_foundation.sql). That RPC is
-- deliberately null-only — it writes only when user_profiles.timezone IS
-- NULL, and returns the existing value with initialized: false otherwise
-- (see that migration's own header: "Automatic initialization is
-- deliberately not a general 'set timezone' operation ... A future Settings
-- flow can add a separate manual replacement RPC."). Because a timezone is
-- auto-initialized for essentially every real signed-in user on first
-- profile load (useUserProfileLoad.ts), Settings' Save action almost always
-- hit that null-only guard and could never actually change an
-- already-set timezone — a real backend gap, not a frontend bug.
--
-- This migration is exactly the deferred "separate manual replacement RPC."
--
-- WHY A SEPARATE FUNCTION, NOT A CHANGED initialize_user_timezone
-- ------------------------------------------------------------------------
-- initialize_user_timezone's null-only guard is not incidental — it is what
-- makes automatic first-load initialization race-safe against two tabs, a
-- slow network, or a retried request: every call after the first is a
-- guaranteed no-op, never a silent overwrite of a value the user (or a
-- concurrent tab) already established. Changing that function's semantics
-- to "always overwrite" would break that guarantee for every existing
-- caller (useUserProfileLoad.ts) with no code change on their part needed
-- to trigger it. A second, narrowly-scoped function keeps each RPC's job
-- singular and matches this repository's own established pattern of one
-- RPC per distinct write intent (complete_user_profile_onboarding vs.
-- update_user_profile_languages is the same split, for the same reason —
-- see Profile Phase 1, 20260806200000...sql).
--
-- SECURITY MODEL — identical shape to every other narrow RPC in this schema
-- ------------------------------------------------------------------------
--   * SECURITY DEFINER, SET search_path TO '' (every table reference below
--     is fully schema-qualified — no search_path hijack surface).
--   * The caller is derived exclusively from auth.uid() — there is no
--     p_user_id/p_target_user_id parameter, the same structural guarantee
--     initialize_user_timezone/update_user_profile_languages/
--     update_daily_goal/reset_learning_language_progress all already use.
--     It is therefore structurally impossible for this function to target
--     any profile row other than the caller's own.
--   * Reuses the exact same IANA validation initialize_user_timezone uses
--     (`exists (select 1 from pg_catalog.pg_timezone_names where name =
--     v_timezone)`) — not a second, potentially-diverging validation rule.
--     Frontend validation is never trusted alone; an invalid string is
--     rejected here regardless of what the client already checked.
--   * Reuses prevent_direct_user_timezone_write's existing trigger-bypass
--     protocol (`perform set_config('app.allow_user_timezone_write', 'on',
--     true)` immediately before the scoped UPDATE, exactly like
--     initialize_user_timezone already does) — no change to that trigger,
--     no new bypass mechanism, no widening of who may write these two
--     columns directly. Direct client REST PATCH of user_profiles.timezone
--     remains blocked exactly as before.
--   * user_profiles' own table grants are untouched by this migration:
--     `authenticated` still holds only RLS-scoped SELECT (Profile Phase 1),
--     never direct UPDATE — every write, including this one, goes through
--     a SECURITY DEFINER function that bypasses RLS as its owner, the same
--     as every sibling narrow RPC.
--   * Updates only timezone, timezone_updated_at, and updated_at — never
--     nickname/native_language/learning_language/current_level/daily_goal/
--     onboarding fields, structurally (they never appear in this
--     function's SET list).
--
-- UPDATE SEMANTICS — this is the one behavior that differs from
-- initialize_user_timezone by design
-- ------------------------------------------------------------------------
-- Unlike initialize_user_timezone, this function unconditionally updates
-- the caller's row on every valid call, replacing whatever timezone was
-- previously stored (including a non-null one). This is the entire point
-- of the function: Settings' explicit, user-initiated "change my timezone"
-- action, as opposed to automatic silent first-run initialization.
--
-- SAME-VALUE CALLS — no special no-op branch, by deliberate choice
-- ------------------------------------------------------------------------
-- Calling this function with the timezone already stored still performs the
-- UPDATE and still bumps timezone_updated_at/updated_at. This mirrors the
-- established convention of every other narrow profile-update RPC in this
-- schema: update_user_profile_languages (Profile Phase 1) unconditionally
-- writes native_language/learning_language/updated_at on every call with no
-- "is distinct from" guard, even when the supplied values equal the current
-- ones — grep-confirmed against that function's own body, the only existing
-- precedent for "explicit user-driven profile field replacement" this
-- repository has. Following that precedent here (rather than inventing a
-- new same-value special case unique to this one function) keeps the
-- semantics simple and consistent, and is also arguably more correct for
-- this specific column: timezone_updated_at is documented as "the last time
-- the user confirmed/saved this timezone," not "the last time the stored
-- value actually changed" — a user re-confirming their already-correct
-- timezone from Settings is a genuine save action worth timestamping.
--
-- HISTORICAL STATISTICS — untouched, by design
-- ------------------------------------------------------------------------
-- This function writes only public.user_profiles.{timezone,
-- timezone_updated_at,updated_at}. It never references user_daily_stats,
-- user_word_progress, review_events, or custom_practice_events in any way —
-- no historical `stat_date` row is ever rewritten, migrated, or
-- recalculated by a timezone change. A changed timezone only affects how
-- *future* calls to get_current_learning_date (Timezone Phase 2,
-- 20260806150000...sql) resolve "today" going forward; every already-stored
-- daily-stats row keeps the stat_date it was written with.
--
-- RETURN CONTRACT
-- ------------------------------------------------------------------------
-- Mirrors initialize_user_timezone's own RETURNS TABLE shape exactly
-- (timezone, timezone_updated_at, plus one boolean) so the frontend's
-- existing row-parsing pattern needs no new shape to learn — `updated` is
-- always true on a successful call here (this function has no false
-- branch, unlike initialize_user_timezone's genuinely conditional
-- `initialized`), which is itself useful signal: any row ever returned by
-- this function represents a real write that just happened.
--
-- FRONTEND INTEGRATION (companion change, not part of this migration)
-- ------------------------------------------------------------------------
-- src/lib/userProfile.ts gains an updateUserTimezone(session, timezone)
-- caller (mirroring updateUserProfileLanguages's own shape) that Settings'
-- SettingsSection.tsx now calls from its Save action instead of
-- initializeUserTimezone. useUserProfileLoad.ts's own automatic first-load
-- initialization call is UNCHANGED — it keeps calling initializeUserTimezone
-- exactly as before; conflating the two call sites was explicitly what this
-- migration's whole design avoids.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.update_user_timezone(text)
-- ----------------------------------------------------------------------------
create or replace function public.update_user_timezone(
  p_timezone text
)
returns table (
  timezone text,
  timezone_updated_at timestamptz,
  updated boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_timezone text := btrim(p_timezone);
  v_now timestamptz := now();
  v_profile_exists boolean;
begin
  if v_user_id is null then
    raise exception
      'update_user_timezone: authentication required'
      using errcode = '28000';
  end if;

  if p_timezone is null or length(v_timezone) = 0 then
    raise exception
      'update_user_timezone: p_timezone is required'
      using errcode = '22023';
  end if;

  -- Same validation source initialize_user_timezone already uses — not a
  -- second, potentially-diverging IANA check.
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as tzn
    where tzn.name = v_timezone
  ) then
    raise exception
      'update_user_timezone: p_timezone must be a valid IANA timezone'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_profiles as up where up.id = v_user_id
  )
    into v_profile_exists;

  if not v_profile_exists then
    raise exception
      'update_user_timezone: no user_profiles row exists for the authenticated caller'
      using errcode = 'P0002';
  end if;

  -- Trigger bypass — the same transaction-local flag
  -- prevent_direct_user_timezone_write (Timezone Phase 1) checks before
  -- allowing a timezone/timezone_updated_at change. This function is the
  -- second (and, after this migration, only other) legitimate writer.
  perform set_config('app.allow_user_timezone_write', 'on', true);

  -- Unconditional write — see this migration's header ("SAME-VALUE CALLS")
  -- for why there is deliberately no "is distinct from" guard here.
  update public.user_profiles as up
     set timezone = v_timezone,
         timezone_updated_at = v_now,
         updated_at = v_now
   where up.id = v_user_id;

  return query select v_timezone, v_now, true;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 2. EXECUTE privileges — same shape as initialize_user_timezone /
--    update_user_profile_languages: authenticated may call it (to update
--    only their own row, via auth.uid()), anon/PUBLIC may not.
-- ----------------------------------------------------------------------------
revoke execute on function public.update_user_timezone(text) from public;
revoke execute on function public.update_user_timezone(text) from anon;
grant execute on function public.update_user_timezone(text) to postgres;
grant execute on function public.update_user_timezone(text) to authenticated;
grant execute on function public.update_user_timezone(text) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   public.update_user_timezone(text)
--     - postgres, authenticated, service_role — EXECUTE.
--     - anon, PUBLIC — no EXECUTE.
--     - SECURITY DEFINER, empty search_path, derives the caller exclusively
--       from auth.uid() — no p_user_id parameter exists.
--     - validates p_timezone against pg_catalog.pg_timezone_names (same
--       source initialize_user_timezone uses).
--     - unconditionally updates timezone, timezone_updated_at, and
--       updated_at for the caller's own row, including replacing an
--       already-set value — this is its entire purpose, distinct from
--       initialize_user_timezone's null-only guard.
--     - never touches user_daily_stats/user_word_progress/review_events/
--       custom_practice_events — no historical stat_date row is ever
--       rewritten by a timezone change.
--     - never touches nickname/native_language/learning_language/
--       current_level/daily_goal/onboarding fields.
--
-- Untouched by this migration: initialize_user_timezone(text) and its exact
-- null-only semantics/grants; prevent_direct_user_timezone_write and its
-- trigger; user_profiles' own table grants/RLS (authenticated still SELECT-
-- only, per Profile Phase 1); every other existing function, policy, and
-- grant in this schema; every existing user_profiles row (no UPDATE/
-- backfill of any kind).
-- ============================================================================
