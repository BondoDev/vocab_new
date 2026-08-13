-- ============================================================================
-- SETTINGS — NICKNAME EDITING — narrow nickname-replacement RPC
-- ============================================================================
--
-- Settings' Account section has shown nickname/email read-only since
-- Settings Phase 1. This migration adds the one missing narrow write path so
-- Settings can let a signed-in user change their own display nickname,
-- following the exact same shape as update_user_timezone (Settings backend
-- follow-up, 20260812120000_add_update_user_timezone_rpc.sql) and
-- update_user_profile_languages (Profile Phase 1,
-- 20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql).
--
-- PRE-MIGRATION STATE
-- ------------------------------------------------------------------------
-- Profile Phase 1 already added user_profiles_nickname_length_check
-- (nonempty-after-trim, max 40 characters — 20260806200000...sql:362-364)
-- and left `authenticated` with SELECT-only access to user_profiles; every
-- write goes through a SECURITY DEFINER RPC. No RPC has ever accepted a
-- nickname on its own — only complete_user_profile_onboarding writes
-- nickname today, bundled with six other onboarding fields, and it upserts
-- the caller's entire onboarding row (never appropriate for a lone
-- "change my nickname" edit from Settings).
--
-- WHY A SEPARATE FUNCTION, NOT A CHANGE TO complete_user_profile_onboarding
-- ------------------------------------------------------------------------
-- Same reasoning update_user_timezone's own header already gives for not
-- reusing initialize_user_timezone: one RPC per distinct write intent.
-- complete_user_profile_onboarding's job is "finish onboarding" (it also
-- sets onboarding_completed, current_level, age, birth date, and the
-- language pair); reusing it for a standalone nickname edit would force
-- Settings to resend six unrelated fields it does not own, exactly the
-- broad-upsert anti-pattern Profile Phase 1 already removed.
--
-- SECURITY MODEL — identical shape to every other narrow RPC in this schema
-- ------------------------------------------------------------------------
--   * SECURITY DEFINER, SET search_path TO '' (every table reference below
--     is fully schema-qualified — no search_path hijack surface).
--   * The caller is derived exclusively from auth.uid() — there is no
--     p_user_id/p_target_user_id parameter, the same structural guarantee
--     every sibling narrow RPC (update_user_timezone,
--     update_user_profile_languages, update_daily_goal,
--     reset_learning_language_progress) already uses. It is therefore
--     structurally impossible for this function to target any profile row
--     other than the caller's own.
--   * Reuses the exact same nonempty-after-trim / max-40-characters rule
--     user_profiles_nickname_length_check and
--     complete_user_profile_onboarding already enforce — not a second,
--     potentially-diverging validation rule. Deliberately does NOT add a
--     "starts with a letter" check here, for the same reason Profile
--     Phase 1's own migration documents for the table CHECK constraint:
--     PostgreSQL's regex engine does not reliably support `\p{L}`-style
--     Unicode general-category classes the way a JavaScript `u`-flag regex
--     does, and an ASCII-only substitute would incorrectly reject
--     legitimate international names. That rule (startsWithLetter, src/
--     lib/userProfile.ts) stays frontend-only, same as onboarding.
--   * user_profiles' own table grants are untouched by this migration:
--     `authenticated` still holds only RLS-scoped SELECT (Profile Phase 1),
--     never direct UPDATE — every write, including this one, goes through
--     a SECURITY DEFINER function that bypasses RLS as its owner, the same
--     as every sibling narrow RPC.
--   * Updates only nickname and updated_at — never native_language/
--     learning_language/current_level/user_age/birth_month/birth_day/
--     onboarding_completed/daily_goal/timezone/timezone_updated_at,
--     structurally (they never appear in this function's SET list).
--   * No uniqueness constraint is added or checked — nickname is a display
--     name, not a username; onboarding has never required uniqueness and
--     this RPC does not invent it either.
--
-- NORMALIZATION
-- ------------------------------------------------------------------------
-- Surrounding whitespace is trimmed (btrim); internal spacing, casing, and
-- Unicode are preserved exactly as submitted — no lowercasing, no
-- slugification. Same as complete_user_profile_onboarding's own
-- v_nickname := btrim(p_nickname).
--
-- SAME-VALUE CALLS — no special no-op branch, by deliberate choice
-- ------------------------------------------------------------------------
-- Calling this function with the nickname already stored still performs the
-- UPDATE and still bumps updated_at, mirroring update_user_timezone's own
-- "SAME-VALUE CALLS" precedent for the identical reason: keeping semantics
-- simple and consistent with every other explicit user-driven profile-field
-- replacement RPC in this schema. In practice the frontend's own Save
-- button is disabled when the (normalized) draft matches the confirmed
-- value, so this branch is not expected to be reached through Settings'
-- own UI, but the RPC itself does not need to special-case it.
--
-- RETURN CONTRACT
-- ------------------------------------------------------------------------
-- Mirrors update_user_profile_languages' own RETURNS TABLE shape: only the
-- narrow fields the frontend actually needs (nickname, updated_at) — never
-- the full profile row.
--
-- FRONTEND INTEGRATION (companion change, not part of this migration)
-- ------------------------------------------------------------------------
-- src/lib/userProfile.ts gains an updateUserNickname(session, nickname)
-- caller (mirroring updateUserProfileLanguages/updateUserTimezone's own
-- shape) that Settings' SettingsSection.tsx calls from its inline
-- Account-section nickname edit row.
--
-- This migration has NOT been applied to any database as part of this
-- change. It is prepared and reviewed only.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.update_user_nickname(text)
-- ----------------------------------------------------------------------------
create or replace function public.update_user_nickname(
  p_nickname text
)
returns table (
  nickname text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_nickname text := btrim(p_nickname);
  v_now timestamptz := now();
  v_profile_exists boolean;
begin
  if v_user_id is null then
    raise exception
      'update_user_nickname: authentication required'
      using errcode = '28000';
  end if;

  if p_nickname is null or char_length(v_nickname) = 0 then
    raise exception
      'update_user_nickname: p_nickname is required'
      using errcode = '22023';
  end if;

  -- Same 40-character cap user_profiles_nickname_length_check and
  -- complete_user_profile_onboarding already enforce — not a second,
  -- potentially-diverging limit.
  if char_length(v_nickname) > 40 then
    raise exception
      'update_user_nickname: p_nickname must be at most 40 characters'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_profiles as up where up.id = v_user_id
  )
    into v_profile_exists;

  if not v_profile_exists then
    raise exception
      'update_user_nickname: no user_profiles row exists for the authenticated caller'
      using errcode = 'P0002';
  end if;

  -- Unconditional write — see this migration's header ("SAME-VALUE CALLS")
  -- for why there is deliberately no "is distinct from" guard here.
  update public.user_profiles as up
     set nickname = v_nickname,
         updated_at = v_now
   where up.id = v_user_id;

  return query select v_nickname, v_now;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 2. EXECUTE privileges — same shape as update_user_timezone /
--    update_user_profile_languages: authenticated may call it (to update
--    only their own row, via auth.uid()), anon/PUBLIC may not.
-- ----------------------------------------------------------------------------
revoke execute on function public.update_user_nickname(text) from public;
revoke execute on function public.update_user_nickname(text) from anon;
grant execute on function public.update_user_nickname(text) to postgres;
grant execute on function public.update_user_nickname(text) to authenticated;
grant execute on function public.update_user_nickname(text) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   public.update_user_nickname(text)
--     - postgres, authenticated, service_role — EXECUTE.
--     - anon, PUBLIC — no EXECUTE.
--     - SECURITY DEFINER, empty search_path, derives the caller exclusively
--       from auth.uid() — no p_user_id parameter exists.
--     - validates p_nickname the same way user_profiles_nickname_length_check
--       and complete_user_profile_onboarding already do (nonempty after
--       trim, at most 40 characters).
--     - unconditionally updates nickname and updated_at for the caller's
--       own row.
--     - never touches native_language/learning_language/current_level/
--       user_age/birth_month/birth_day/onboarding_completed/daily_goal/
--       timezone/timezone_updated_at.
--     - adds no uniqueness constraint — duplicate nicknames remain allowed,
--       matching onboarding's existing behavior.
--
-- Untouched by this migration: complete_user_profile_onboarding and its
-- exact nickname-write behavior/grants; user_profiles' own table grants/RLS
-- (authenticated still SELECT-only, per Profile Phase 1);
-- user_profiles_nickname_length_check (unchanged); every other existing
-- function, policy, and grant in this schema; every existing user_profiles
-- row (no UPDATE/backfill of any kind).
-- ============================================================================
