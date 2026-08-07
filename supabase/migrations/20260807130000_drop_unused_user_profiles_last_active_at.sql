-- PROFILE PHASE 2 - remove unused user_profiles.last_active_at
--
-- Repository audit result before this migration:
--   * no frontend runtime code reads or writes last_active_at/lastActiveAt;
--   * no RPC returns last_active_at;
--   * the only active writer is complete_user_profile_onboarding from
--     Profile Phase 1, where it is stamped incidentally with updated_at;
--   * no repository-owned product behavior depends on a general
--     "last active" profile timestamp.
--
-- This migration removes the column instead of inventing semantics for it.
-- It preserves updated_at as the authoritative profile mutation timestamp.

-- Replace the onboarding RPC first so the current function body no longer
-- names the column that is dropped below. Signature, return shape, auth
-- checks, validation, SECURITY DEFINER/search_path, and grants are preserved.
create or replace function public.complete_user_profile_onboarding(
  p_nickname text,
  p_native_language text,
  p_learning_language text,
  p_current_level text,
  p_user_age integer,
  p_birth_month integer,
  p_birth_day integer
)
returns table (
  nickname text,
  native_language text,
  learning_language text,
  current_level text,
  user_age integer,
  birth_month smallint,
  birth_day smallint,
  onboarding_completed boolean,
  daily_goal integer,
  timezone text,
  timezone_updated_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_nickname text := btrim(p_nickname);
begin
  if v_user_id is null then
    raise exception
      'complete_user_profile_onboarding: authentication required'
      using errcode = '28000';
  end if;

  if p_nickname is null or char_length(v_nickname) = 0 then
    raise exception
      'complete_user_profile_onboarding: p_nickname is required'
      using errcode = '22023';
  end if;

  if char_length(v_nickname) > 40 then
    raise exception
      'complete_user_profile_onboarding: p_nickname must be at most 40 characters'
      using errcode = '22023';
  end if;

  if p_native_language is null or p_native_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'complete_user_profile_onboarding: p_native_language must be one of en, es, fr, pt, it, de, ru'
      using errcode = '22023';
  end if;

  if p_learning_language is null or p_learning_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'complete_user_profile_onboarding: p_learning_language must be one of en, es, fr, pt, it, de, ru'
      using errcode = '22023';
  end if;

  if p_current_level is null or p_current_level not in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') then
    raise exception
      'complete_user_profile_onboarding: p_current_level must be one of A1, A2, B1, B2, C1, C2'
      using errcode = '22023';
  end if;

  if p_user_age is null or p_user_age < 10 or p_user_age > 100 then
    raise exception
      'complete_user_profile_onboarding: p_user_age must be between 10 and 100'
      using errcode = '22023';
  end if;

  if p_birth_month is null or p_birth_month < 1 or p_birth_month > 12 then
    raise exception
      'complete_user_profile_onboarding: p_birth_month must be between 1 and 12'
      using errcode = '22023';
  end if;

  if p_birth_day is null or p_birth_day < 1 or p_birth_day > 31 then
    raise exception
      'complete_user_profile_onboarding: p_birth_day must be between 1 and 31'
      using errcode = '22023';
  end if;

  insert into public.user_profiles (
    id,
    nickname,
    native_language,
    learning_language,
    current_level,
    user_age,
    birth_month,
    birth_day,
    onboarding_completed,
    updated_at
  )
  values (
    v_user_id,
    v_nickname,
    p_native_language,
    p_learning_language,
    p_current_level,
    p_user_age,
    p_birth_month,
    p_birth_day,
    true,
    v_now
  )
  on conflict (id) do update
    set nickname = excluded.nickname,
        native_language = excluded.native_language,
        learning_language = excluded.learning_language,
        current_level = excluded.current_level,
        user_age = excluded.user_age,
        birth_month = excluded.birth_month,
        birth_day = excluded.birth_day,
        onboarding_completed = true,
        updated_at = excluded.updated_at;
        -- daily_goal, timezone, timezone_updated_at, created_at, and
        -- is_new_user are deliberately absent from both the INSERT column
        -- list and this SET list.

  return query
  select
    up.nickname,
    up.native_language,
    up.learning_language,
    up.current_level,
    up.user_age,
    up.birth_month,
    up.birth_day,
    up.onboarding_completed,
    up.daily_goal,
    up.timezone,
    up.timezone_updated_at,
    up.updated_at
  from public.user_profiles as up
  where up.id = v_user_id;
end;
$function$;

revoke execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer) from public;
revoke execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer) from anon;
grant execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer) to postgres;
grant execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer) to service_role;

alter table public.user_profiles
  drop column if exists last_active_at;
