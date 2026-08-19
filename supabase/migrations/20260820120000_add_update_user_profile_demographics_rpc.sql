-- ============================================================================
-- Settings Profile Details — narrow demographics update RPC
-- ============================================================================
--
-- Adds the only post-onboarding write path for user_profiles.user_age,
-- birth_month, and birth_day. The existing broad profile policy is restricted,
-- and the sibling Settings edits already use one narrow RPC per write intent
-- (nickname, learning preferences, timezone). This function follows that
-- pattern and deliberately cannot touch nickname, languages, level, daily
-- goal, timezone, onboarding_completed, or any learning-progress tables.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.update_user_profile_demographics(integer, integer, integer)
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
begin
  if v_user_id is null then
    raise exception
      'update_user_profile_demographics: authentication required'
      using errcode = '28000';
  end if;

  if p_user_age is null or p_user_age < 10 or p_user_age > 100 then
    raise exception
      'update_user_profile_demographics: p_user_age must be an integer between 10 and 100'
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


-- ----------------------------------------------------------------------------
-- 2. EXECUTE privileges — authenticated may update only their own row via
--    auth.uid(); anon/PUBLIC may not.
-- ----------------------------------------------------------------------------
revoke execute on function public.update_user_profile_demographics(integer, integer, integer) from public;
revoke execute on function public.update_user_profile_demographics(integer, integer, integer) from anon;
grant execute on function public.update_user_profile_demographics(integer, integer, integer) to postgres;
grant execute on function public.update_user_profile_demographics(integer, integer, integer) to authenticated;
grant execute on function public.update_user_profile_demographics(integer, integer, integer) to service_role;
