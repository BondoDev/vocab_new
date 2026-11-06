-- ============================================================================
-- Onboarding: infer the birth year in the browser's validated time zone
-- ============================================================================
--
-- Problem: complete_user_profile_onboarding infers birth_year from the
-- declared age and "today" in the stored time zone. A brand-new profile has
-- no time zone yet (initialize_user_timezone only runs once the row exists),
-- so onboarding used the UTC date, while the client validated the same age
-- against the browser's local date. For a February 29 birthday the age
-- changes on Feb 29 (leap years) or March 1 (non-leap years); while the
-- local and UTC dates sit on opposite sides of that change, the honestly
-- declared age implied a non-leap birth year in UTC and the registration was
-- rejected ("February 29 does not exist in the birth year implied by
-- p_user_age").
--   West: born 2008-02-29, Honolulu, 2026-02-28 20:00 local
--         (2026-03-01 06:00 UTC). Local 17 -> 2008. UTC: 2009 -> rejected.
--   East: born 2012-02-29, Tokyo, 2028-02-29 00:30 local
--         (2028-02-28 15:30 UTC). Local 16 -> 2012. UTC: 2011 -> rejected
--         on the 16th birthday.
--
-- Fix:
--   * complete_user_profile_onboarding gains an optional trailing
--     p_timezone text DEFAULT NULL: the browser's IANA zone, the same value
--     the client validated against.
--   * "Today" for the inference comes from the new helper
--     onboarding_reference_date(stored zone, supplied zone, instant):
--     the stored zone wins when present; otherwise the supplied zone;
--     missing or unknown identifiers fall back to UTC (the same
--     pg_timezone_names lookup user_local_date uses). The RPC passes its own
--     transaction time, so the helper only exists to make the boundary
--     testable with explicit instants (supabase/tests/database/).
--   * p_timezone is used for this calculation only and is NEVER stored:
--     time-zone writes stay exclusive to initialize_user_timezone and
--     update_user_timezone. initialize_user_timezone (unchanged) re-infers
--     from age_confirmed_at in the zone it stores; for the usual case of the
--     same browser zone the result is identical.
--
-- Unchanged on purpose: the 16-100 rule, the real-date check, the Feb 29
-- consistency rejection, "Feb 29 ages on March 1 in non-leap years", the
-- return columns, all other RPCs and helpers, and every existing row (no
-- data change, no new column or constraint).
--
-- Compatibility:
--   * PostgreSQL identifies functions by argument types, so the 7-argument
--     function is DROPPED and the 8-argument one created in the same
--     transaction. Keeping both would make PostgREST's named-argument
--     resolution ambiguous for 7-argument calls (PGRST203).
--   * Existing 7-argument clients keep working: p_timezone defaults to NULL,
--     which is exactly the previous behavior (stored zone, else UTC).
--   * A client that sends p_timezone to a database WITHOUT this migration
--     gets PGRST202; the app retries once without p_timezone for that
--     specific error. Apply this migration before deploying that client
--     anyway.
--   * The DO block before COMMIT aborts the migration unless exactly the
--     intended signature remains.
--
-- Rollback (one transaction): drop the 8-argument function and
-- onboarding_reference_date, re-run the complete_user_profile_onboarding
-- block and its REVOKE/GRANT lines from
-- 20261105160000_add_inferred_birth_year_and_current_age.sql, then
-- notify pgrst, 'reload schema'. Clients fall back automatically (PGRST202).
-- Rows written meanwhile stay valid under every existing constraint.
--
-- Atomicity: one explicit transaction; any error leaves the previous
-- function in place and registration working.

begin;

-- ----------------------------------------------------------------------------
-- 1. public.onboarding_reference_date(text, text, timestamptz)
-- ----------------------------------------------------------------------------
-- The calendar date onboarding infers the birth year on. Explicit instant
-- and zones, so the date boundary is testable; no table access.
create or replace function public.onboarding_reference_date(
  p_stored_timezone text,
  p_timezone text,
  p_at timestamptz
)
returns date
language sql
stable
set search_path to ''
as $function$
  select (p_at at time zone coalesce(
           (select tzn.name
              from pg_catalog.pg_timezone_names as tzn
             where tzn.name = coalesce(p_stored_timezone, p_timezone)
             limit 1),
           'UTC'))::date;
$function$;

-- Only the SECURITY DEFINER RPC (owner postgres) calls it.
revoke execute on function public.onboarding_reference_date(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.onboarding_reference_date(text, text, timestamptz) to postgres, service_role;


-- ----------------------------------------------------------------------------
-- 2. public.complete_user_profile_onboarding — 7 -> 8 arguments
-- ----------------------------------------------------------------------------
-- Body copied from 20261105160000; the only changes are the p_timezone
-- argument and the line that computes v_today.
drop function if exists public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer);

create or replace function public.complete_user_profile_onboarding(
  p_nickname text,
  p_native_language text,
  p_learning_language text,
  p_current_level text,
  p_user_age integer,
  p_birth_month integer,
  p_birth_day integer,
  p_timezone text default null
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
  updated_at timestamptz,
  birth_year smallint,
  age_confirmed_at timestamptz,
  current_age integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_nickname text := btrim(p_nickname);
  v_stored_timezone text;
  v_today date;
  v_birth_year integer;
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

  if not public.birth_date_is_valid(p_birth_month, p_birth_day) then
    raise exception
      'complete_user_profile_onboarding: p_birth_month/p_birth_day must be a real calendar date'
      using errcode = '22023';
  end if;

  select up.timezone
    into v_stored_timezone
    from public.user_profiles as up
   where up.id = v_user_id;

  -- Stored zone first, else the browser zone the client validated with,
  -- else UTC. p_timezone is never written (time-zone RPCs own that).
  v_today := public.onboarding_reference_date(v_stored_timezone, p_timezone, v_now);
  v_birth_year := public.infer_birth_year(p_user_age, p_birth_month, p_birth_day, v_today);

  if not public.birth_year_matches_birthday(v_birth_year, p_birth_month, p_birth_day) then
    raise exception
      'complete_user_profile_onboarding: February 29 does not exist in the birth year implied by p_user_age'
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
    birth_year,
    age_confirmed_at,
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
    v_birth_year,
    v_now,
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
        birth_year = excluded.birth_year,
        age_confirmed_at = excluded.age_confirmed_at,
        onboarding_completed = true,
        updated_at = excluded.updated_at;
        -- daily_goal, timezone, timezone_updated_at, and created_at are
        -- deliberately absent.

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
    up.updated_at,
    up.birth_year,
    up.age_confirmed_at,
    public.current_age(up)
  from public.user_profiles as up
  where up.id = v_user_id;
end;
$function$;

revoke execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer, text) from public, anon;
grant execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer, text) to postgres, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. Guard: exactly the intended signature remains (else roll back)
-- ----------------------------------------------------------------------------
do $$
declare
  v_signatures text[];
begin
  select array_agg(pg_catalog.pg_get_function_identity_arguments(p.oid) order by p.oid)
    into v_signatures
    from pg_catalog.pg_proc as p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'complete_user_profile_onboarding';

  if v_signatures is distinct from array[
    'p_nickname text, p_native_language text, p_learning_language text, p_current_level text, p_user_age integer, p_birth_month integer, p_birth_day integer, p_timezone text'
  ] then
    raise exception 'complete_user_profile_onboarding: unexpected signatures after migration: %', v_signatures;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Read-only post-checks (informational):
--   select pg_get_function_identity_arguments(p.oid), p.proacl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('complete_user_profile_onboarding', 'onboarding_reference_date');
--   select public.onboarding_reference_date(null, 'Pacific/Honolulu', timestamptz '2026-03-01 06:00+00'),  -- 2026-02-28
--          public.onboarding_reference_date(null, 'Asia/Tokyo', timestamptz '2028-02-28 15:30+00'),        -- 2028-02-29
--          public.onboarding_reference_date('Asia/Tokyo', 'Pacific/Honolulu', timestamptz '2026-03-01 06:00+00'), -- 2026-03-01
--          public.onboarding_reference_date(null, 'Not/AZone', timestamptz '2026-03-01 06:00+00');        -- 2026-03-01 (UTC)
