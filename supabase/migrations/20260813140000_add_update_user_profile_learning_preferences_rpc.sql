-- ============================================================================
-- SETTINGS — CURRENT LEVEL EDITING — narrow atomic learning-preferences RPC
-- ============================================================================
--
-- The Languages card in Settings has shown Current level as read-only text
-- since Settings Phase 1 (native_language/learning_language were already
-- editable there via update_user_profile_languages). This migration adds the
-- one missing narrow write path so the same card's single Save button can
-- persist native_language + learning_language + current_level together,
-- atomically, in one round trip.
--
-- current_level itself is only a Study New Words *new-word queue threshold*
-- (see src/data/learning/newWordStudyQueue.ts's CEFR_LEVEL_RANK filter) —
-- this migration changes nothing about how that threshold is applied, only
-- how the stored value it reads can be edited afterward.
--
-- WHY A NEW FUNCTION, NOT A CHANGE TO update_user_profile_languages(text, text)
-- ------------------------------------------------------------------------
-- Adding a third parameter to the existing two-argument
-- update_user_profile_languages would either (a) change its call signature,
-- breaking PostgREST's existing `/rest/v1/rpc/update_user_profile_languages`
-- callers with a stale two-argument request body, or (b) require a second,
-- same-named overload (update_user_profile_languages(text, text, text)),
-- which PostgREST resolves ambiguously by argument count/name and is exactly
-- the ambiguity this schema's other narrow RPCs (update_user_nickname,
-- update_user_timezone, ...) have always avoided by using one function name
-- per distinct write intent. update_user_profile_languages(text, text) is
-- therefore left completely untouched by this migration — same signature,
-- same body, same grants — so any existing caller keeps working exactly as
-- before. The Settings frontend (src/lib/userProfile.ts,
-- src/features/user-profile/sections/settings/SettingsSection.tsx) is
-- updated in this same change set to call the new function instead, but
-- nothing prevents update_user_profile_languages from being called by some
-- other client independently of that frontend change.
--
-- WHY ONE ATOMIC RPC INSTEAD OF TWO SEQUENTIAL CALLS
-- ------------------------------------------------------------------------
-- Settings' Languages card has one Save button for three fields. Sequencing
-- "call update_user_profile_languages, then call a second update_current_
-- level RPC" from the frontend would let the first call succeed and the
-- second fail (network blip, validation rejection, ...), leaving the
-- profile row with only some of the requested changes persisted — exactly
-- the partial-save outcome the task brief calls out to avoid. A single
-- SECURITY DEFINER function performing one UPDATE statement is atomic by
-- construction: either all three columns change together inside one
-- transaction, or (on any validation failure/exception) none of them do.
--
-- SECURITY MODEL — identical shape to every other narrow RPC in this schema
-- ------------------------------------------------------------------------
--   * SECURITY DEFINER, SET search_path TO '' (every table reference below
--     is fully schema-qualified — no search_path hijack surface).
--   * The caller is derived exclusively from auth.uid() — there is no
--     p_user_id/p_target_user_id parameter, the same structural guarantee
--     every sibling narrow RPC (update_user_profile_languages,
--     update_user_nickname, update_user_timezone,
--     reset_learning_language_progress) already uses. It is therefore
--     structurally impossible for this function to target any profile row
--     other than the caller's own.
--   * Reuses the exact same native_language/learning_language allow-list
--     update_user_profile_languages already enforces (en, es, fr, pt, it,
--     de, ru) — not a broadened or independently-drifting list.
--   * Validates current_level against the exact same six-code allow-list
--     user_profiles_current_level_allowed_values_check already enforces at
--     the table level (A1, A2, B1, B2, C1, C2) — belt-and-suspenders, same
--     shape as the language-code validation.
--   * user_profiles' own table grants are untouched by this migration:
--     `authenticated` still holds only RLS-scoped SELECT (Profile Phase 1),
--     never direct UPDATE — every write, including this one, goes through
--     a SECURITY DEFINER function that bypasses RLS as its owner, the same
--     as every sibling narrow RPC.
--   * Updates only native_language, learning_language, current_level, and
--     updated_at — never nickname/user_age/birth_month/birth_day/
--     onboarding_completed/daily_goal/timezone/timezone_updated_at,
--     structurally (they never appear in this function's SET list). Never
--     references user_word_progress/user_daily_stats/review_events/
--     custom_practice_events — changing current_level is a pure profile-
--     field write, never a progress mutation of any kind.
--
-- SAME-VALUE CALLS — no special no-op branch, by deliberate choice
-- ------------------------------------------------------------------------
-- Calling this function with all three values already stored still performs
-- the UPDATE and still bumps updated_at, mirroring update_user_profile_
-- languages'/update_user_nickname's own precedent. The frontend's own Save
-- button is disabled when every draft matches its confirmed value, so this
-- branch is not expected to be reached through Settings' own UI.
--
-- RETURN CONTRACT
-- ------------------------------------------------------------------------
-- Mirrors update_user_profile_languages' own RETURNS TABLE shape, extended
-- with current_level: only the narrow fields the frontend actually needs
-- (native_language, learning_language, current_level, updated_at) — never
-- the full profile row.
--
-- FRONTEND INTEGRATION (companion change, not part of this migration)
-- ------------------------------------------------------------------------
-- src/lib/userProfile.ts gains an updateUserProfileLearningPreferences
-- (session, input) caller (mirroring updateUserProfileLanguages's own
-- shape) that Settings' SettingsSection.tsx calls from the Languages card's
-- single Save action, now also editing current_level via a <Select> the
-- same style as the native/learning language selects.
--
-- This migration has NOT been applied to any database as part of this
-- change. It is prepared and reviewed only.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.update_user_profile_learning_preferences(text, text, text)
-- ----------------------------------------------------------------------------
create or replace function public.update_user_profile_learning_preferences(
  p_native_language text,
  p_learning_language text,
  p_current_level text
)
returns table (
  native_language text,
  learning_language text,
  current_level text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_profile_exists boolean;
begin
  if v_user_id is null then
    raise exception
      'update_user_profile_learning_preferences: authentication required'
      using errcode = '28000';
  end if;

  if p_native_language is null or p_native_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'update_user_profile_learning_preferences: p_native_language must be one of en, es, fr, pt, it, de, ru'
      using errcode = '22023';
  end if;

  if p_learning_language is null or p_learning_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'update_user_profile_learning_preferences: p_learning_language must be one of en, es, fr, pt, it, de, ru'
      using errcode = '22023';
  end if;

  if p_current_level is null or p_current_level not in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') then
    raise exception
      'update_user_profile_learning_preferences: p_current_level must be one of A1, A2, B1, B2, C1, C2'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_profiles as up where up.id = v_user_id
  )
    into v_profile_exists;

  if not v_profile_exists then
    raise exception
      'update_user_profile_learning_preferences: no user_profiles row exists for the authenticated caller'
      using errcode = 'P0002';
  end if;

  -- Unconditional write — see this migration's header ("SAME-VALUE CALLS")
  -- for why there is deliberately no "is distinct from" guard here. This
  -- function's only write is the single profile-row UPDATE immediately
  -- below — no learning-progress table of any kind is referenced anywhere
  -- in this function body (see this migration's own header for the full
  -- list this deliberately excludes).
  update public.user_profiles as up
     set native_language = p_native_language,
         learning_language = p_learning_language,
         current_level = p_current_level,
         updated_at = v_now
   where up.id = v_user_id;

  return query
  select p_native_language, p_learning_language, p_current_level, v_now;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 2. EXECUTE privileges — same shape as update_user_profile_languages /
--    update_user_nickname: authenticated may call it (to update only their
--    own row, via auth.uid()), anon/PUBLIC may not.
-- ----------------------------------------------------------------------------
revoke execute on function public.update_user_profile_learning_preferences(text, text, text) from public;
revoke execute on function public.update_user_profile_learning_preferences(text, text, text) from anon;
grant execute on function public.update_user_profile_learning_preferences(text, text, text) to postgres;
grant execute on function public.update_user_profile_learning_preferences(text, text, text) to authenticated;
grant execute on function public.update_user_profile_learning_preferences(text, text, text) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   public.update_user_profile_learning_preferences(text, text, text)
--     - postgres, authenticated, service_role — EXECUTE.
--     - anon, PUBLIC — no EXECUTE.
--     - SECURITY DEFINER, empty search_path, derives the caller exclusively
--       from auth.uid() — no p_user_id parameter exists.
--     - validates p_native_language/p_learning_language against the same
--       seven-code allow-list update_user_profile_languages already
--       enforces, and p_current_level against the same six-code CEFR
--       allow-list user_profiles_current_level_allowed_values_check already
--       enforces at the table level.
--     - atomically updates native_language, learning_language,
--       current_level, and updated_at for the caller's own row in one UPDATE
--       statement — never partially.
--     - never touches nickname/user_age/birth_month/birth_day/
--       onboarding_completed/daily_goal/timezone/timezone_updated_at.
--     - never references user_word_progress/user_daily_stats/review_events/
--       custom_practice_events — no progress mutation of any kind.
--
-- Untouched by this migration: update_user_profile_languages(text, text) and
-- its exact signature/body/grants (kept intact for any other caller);
-- complete_user_profile_onboarding and its own current_level write path;
-- user_profiles' own table grants/RLS (authenticated still SELECT-only, per
-- Profile Phase 1); user_profiles_current_level_allowed_values_check
-- (unchanged); every other existing function, policy, and grant in this
-- schema; every existing user_profiles row (no UPDATE/backfill of any kind).
-- ============================================================================
