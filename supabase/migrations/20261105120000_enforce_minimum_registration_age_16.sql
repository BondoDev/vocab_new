-- ============================================================================
-- Minimum registration age 16
-- ============================================================================
--
-- Raises the minimum accepted age for new registrations and age edits from
-- 10 to 16 (maximum stays 100) in the only two write paths for
-- user_profiles.user_age. Direct table writes were revoked from anon and
-- authenticated by 20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql,
-- so these two RPCs are the complete set:
--
--   1. complete_user_profile_onboarding — rejects p_user_age < 16 or > 100.
--      Recreated from its current definition
--      (20260807130000_drop_unused_user_profiles_last_active_at.sql); only
--      the age bound and its message change.
--   2. update_user_profile_demographics — rejects ages outside 16-100,
--      except the caller's own unchanged stored age, so an account created
--      under the earlier 10+ rule can still edit its birth date. It can
--      never be used to set or lower an age below 16. Recreated from
--      20260820120000_add_update_user_profile_demographics_rpc.sql; only the
--      age validation changes.
--
-- Existing data is deliberately untouched:
--   * No UPDATE/DELETE of any row; stored ages of existing accounts are kept.
--   * user_profiles_user_age_range_check (10-100) is intentionally NOT
--     tightened. Existing 10-15 rows would violate a 16+ CHECK, and even a
--     NOT VALID constraint is re-checked on every UPDATE of such a row, which
--     would break unrelated writes for those users (timezone, nickname,
--     learning preferences). The RPCs enforce 16+ for every new value.
--   * Signatures, return shapes, SECURITY DEFINER, search_path, and EXECUTE
--     grants are unchanged (grants are re-stated idempotently below).
--
-- Read-only pre-check (informational; nothing depends on the result):
--   select count(*) filter (where user_age < 16) as under_16_existing,
--          count(*) as total
--     from public.user_profiles;
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.complete_user_profile_onboarding(...)
-- ----------------------------------------------------------------------------
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

  if p_user_age is null or p_user_age < 16 or p_user_age > 100 then
    raise exception
      'complete_user_profile_onboarding: p_user_age must be between 16 and 100'
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


-- ----------------------------------------------------------------------------
-- 2. public.update_user_profile_demographics(integer, integer, integer)
-- ----------------------------------------------------------------------------
create or replace function public.update_user_profile_demographics(
  p_user_age integer,
  p_birth_month integer,
  p_birth_day integer
)
returns table (
  user_age integer,
  birth_month integer,
  birth_day integer,
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
  v_stored_age integer;
begin
  if v_user_id is null then
    raise exception
      'update_user_profile_demographics: authentication required'
      using errcode = '28000';
  end if;

  if p_user_age is null or p_user_age > 100 then
    raise exception
      'update_user_profile_demographics: p_user_age must be an integer between 16 and 100'
      using errcode = '22023';
  end if;

  if p_birth_month is null or p_birth_month < 1 or p_birth_month > 12 then
    raise exception
      'update_user_profile_demographics: p_birth_month must be an integer between 1 and 12'
      using errcode = '22023';
  end if;

  if p_birth_day is null or p_birth_day < 1 or p_birth_day > 31 then
    raise exception
      'update_user_profile_demographics: p_birth_day must be an integer between 1 and 31'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_profiles as up where up.id = v_user_id
  )
    into v_profile_exists;

  if not v_profile_exists then
    raise exception
      'update_user_profile_demographics: no user_profiles row exists for the authenticated caller'
      using errcode = 'P0002';
  end if;

  -- Below 16 is accepted only when it is the caller's own unchanged stored
  -- age (an account registered under the earlier 10+ rule, editing only its
  -- birth date). Any other value below 16 is rejected.
  select up.user_age
    into v_stored_age
    from public.user_profiles as up
   where up.id = v_user_id;

  if p_user_age < 16 and p_user_age is distinct from v_stored_age then
    raise exception
      'update_user_profile_demographics: p_user_age must be an integer between 16 and 100'
      using errcode = '22023';
  end if;

  update public.user_profiles as up
     set user_age = p_user_age,
         birth_month = p_birth_month,
         birth_day = p_birth_day,
         updated_at = v_now
   where up.id = v_user_id;

  return query
  select p_user_age, p_birth_month, p_birth_day, v_now;
end;
$function$;

revoke execute on function public.update_user_profile_demographics(integer, integer, integer) from public;
revoke execute on function public.update_user_profile_demographics(integer, integer, integer) from anon;
grant execute on function public.update_user_profile_demographics(integer, integer, integer) to postgres;
grant execute on function public.update_user_profile_demographics(integer, integer, integer) to authenticated;
grant execute on function public.update_user_profile_demographics(integer, integer, integer) to service_role;
