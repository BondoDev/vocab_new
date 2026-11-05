-- ============================================================================
-- Automatic age: inferred birth year + server-computed current age
-- ============================================================================
--
-- Problem: user_profiles.user_age is a number declared once (onboarding or
-- Settings) and never changes, so it goes stale every birthday. Nothing
-- recorded WHEN the age was declared, and updated_at moves on every profile
-- edit, so it cannot be used to reconstruct the age.
--
-- Design:
--   * New nullable columns birth_year (inferred) and age_confirmed_at (the
--     server time the age was declared/confirmed). Existing rows are NOT
--     backfilled: their declaration date is unknown, so their birth year
--     cannot be inferred. The app asks those users once to confirm their age
--     (update_user_profile_demographics below then fills both columns).
--   * birth_year is inferred on the server from the declared age, the birth
--     month/day, and "today" in the user's time zone (UTC when unknown),
--     using the server clock, never the device clock:
--       birth_year = year(today) - age - (today < birthday this year ? 1 : 0)
--     A brand-new profile has no time zone yet when onboarding runs, so its
--     first inference uses UTC. initialize_user_timezone (recreated below)
--     re-infers it once, from the same declaration instant (age_confirmed_at)
--     in the user's real zone, when it stores the first time zone. Time-zone
--     writes stay exclusive to the two time-zone RPCs.
--   * public.current_age(user_profiles) is a PostgREST computed field: a
--     profile read with select=...,current_age gets the correct age on every
--     read, so the app never has to write the same age back on page load.
--     user_age keeps its meaning of "age as declared at age_confirmed_at".
--   * February 29 birthdays: in non-leap years the age increases on March 1
--     (never early). A declared age that implies a non-leap birth year for a
--     Feb 29 birthday is rejected as inconsistent.
--   * Impossible dates (Feb 30/31, Apr/Jun/Sep/Nov 31) are rejected by both
--     write RPCs. Existing rows holding such a date are left untouched; they
--     must pick a real date when they confirm their age.
--   * Minimum age 16 is unchanged for onboarding. Settings/confirmation keeps
--     the legacy exception for accounts created under the earlier 10+ rule,
--     narrowed to "not below that account's own current age": such an
--     account can confirm its true (higher) age while still under 16, but no
--     value below 16 can be newly introduced and an age can never be lowered
--     below 16.
--
-- Compatibility (Supabase migration and Cloudflare deploy are not atomic):
--   * complete_user_profile_onboarding and update_user_profile_demographics
--     keep their arguments and return three extra columns (existing response
--     parsers ignore unknown fields). Both are dropped and recreated because
--     a return type cannot change in place.
--   * initialize_user_timezone keeps its signature and return shape.
--   * Apply this migration BEFORE deploying the app that selects
--     current_age/birth_year. The app also retries with the legacy column
--     list if these columns are missing, so a reversed order degrades to the
--     old behavior instead of failing.
--
-- Untouched: learning progress, reviews, statistics, lists, languages,
-- daily goal, nickname, and every existing column value.
--
-- Atomicity: the whole file runs in ONE explicit transaction (begin/commit
-- below), whether pasted into the SQL Editor or run with psql. Any error
-- rolls everything back, so the old onboarding/Settings/time-zone functions
-- stay in place and registration keeps working. The schema-cache NOTIFY is
-- delivered only at COMMIT.
--
-- Read-only pre-flight checks (run first; each must return the noted result):
--   -- (a) exactly one overload of each recreated RPC, with these arguments:
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in
--      ('complete_user_profile_onboarding', 'update_user_profile_demographics', 'initialize_user_timezone');
--   --   expect: complete_user_profile_onboarding(text,text,text,text,integer,integer,integer)
--   --           update_user_profile_demographics(integer,integer,integer)
--   --           initialize_user_timezone(text)
--   -- (b) no existing functions/columns/constraints this migration would add:
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('birth_date_is_valid', 'birth_year_matches_birthday',
--      'birthday_in_year', 'age_on_date', 'infer_birth_year', 'user_local_date', 'current_age');  -- expect 0 rows
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_profiles'
--      and column_name in ('birth_year', 'age_confirmed_at');                                    -- expect 0 rows
--   select conname from pg_constraint where conname like 'user_profiles_birth_year%';            -- expect 0 rows
-- ============================================================================

begin;


-- ----------------------------------------------------------------------------
-- 1. Columns and constraints (new columns only; existing rows stay null)
-- ----------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists birth_year smallint null,
  add column if not exists age_confirmed_at timestamptz null;


-- ----------------------------------------------------------------------------
-- 2. Pure date helpers (immutable; no table access)
-- ----------------------------------------------------------------------------

-- True for a real calendar month/day. Feb 29 is valid (checked against the
-- leap year 2000); whether it fits a specific birth year is checked
-- separately by birth_year_matches_birthday.
create or replace function public.birth_date_is_valid(p_month integer, p_day integer)
returns boolean
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select case
    when p_month is null or p_day is null or p_month < 1 or p_month > 12 or p_day < 1 then false
    else p_day <= extract(day from (pg_catalog.make_date(2000, p_month, 1) + interval '1 month' - interval '1 day'))::integer
  end;
$function$;

-- A Feb 29 birthday is only possible in a leap birth year.
create or replace function public.birth_year_matches_birthday(p_birth_year integer, p_month integer, p_day integer)
returns boolean
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select not (p_month = 2 and p_day = 29)
      or ((p_birth_year % 4 = 0 and p_birth_year % 100 <> 0) or p_birth_year % 400 = 0);
$function$;

-- The date the birthday is celebrated in p_year. Feb 29 falls on March 1 in
-- non-leap years, so the age never increases before the birthday has really
-- passed. Callers must pass a valid month/day (birth_date_is_valid).
create or replace function public.birthday_in_year(p_year integer, p_month integer, p_day integer)
returns date
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select case
    when p_month = 2 and p_day = 29
         and not ((p_year % 4 = 0 and p_year % 100 <> 0) or p_year % 400 = 0)
      then pg_catalog.make_date(p_year, 3, 1)
    else pg_catalog.make_date(p_year, p_month, p_day)
  end;
$function$;

-- Age in completed years on p_on.
create or replace function public.age_on_date(p_birth_year integer, p_month integer, p_day integer, p_on date)
returns integer
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select extract(year from p_on)::integer - p_birth_year
         - case
             when p_on < public.birthday_in_year(extract(year from p_on)::integer, p_month, p_day) then 1
             else 0
           end;
$function$;

-- Inverse of age_on_date: the birth year for which age_on_date(...) = p_age.
create or replace function public.infer_birth_year(p_age integer, p_month integer, p_day integer, p_on date)
returns integer
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select extract(year from p_on)::integer - p_age
         - case
             when p_on < public.birthday_in_year(extract(year from p_on)::integer, p_month, p_day) then 1
             else 0
           end;
$function$;

-- "Today" in an IANA time zone, from the server clock. Unknown or invalid
-- zones fall back to UTC, matching resolve_authenticated_learning_date.
create or replace function public.user_local_date(p_timezone text)
returns date
language sql
stable
set search_path to ''
as $function$
  select (pg_catalog.now() at time zone coalesce(
           (select tzn.name
              from pg_catalog.pg_timezone_names as tzn
             where tzn.name = p_timezone
             limit 1),
           'UTC'))::date;
$function$;


-- ----------------------------------------------------------------------------
-- 3. Row constraints for the new columns (all existing rows are null, so
--    every check passes; they guarantee current_age can never fail)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_birth_year_range_check') then
    alter table public.user_profiles
      add constraint user_profiles_birth_year_range_check
      check (birth_year is null or birth_year between 1900 and 2200);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_profiles_birth_year_confirmation_pair_check') then
    alter table public.user_profiles
      add constraint user_profiles_birth_year_confirmation_pair_check
      check ((birth_year is null) = (age_confirmed_at is null));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_profiles_birth_year_date_check') then
    alter table public.user_profiles
      add constraint user_profiles_birth_year_date_check
      check (
        birth_year is null
        or (
          public.birth_date_is_valid(birth_month, birth_day)
          and public.birth_year_matches_birthday(birth_year, birth_month, birth_day)
        )
      );
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. public.current_age(user_profiles) — PostgREST computed field
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER and evaluated only on rows the caller can already read
-- (RLS on user_profiles), so it exposes nothing new. Null until the account
-- has a birth_year (existing users before their one-time confirmation).
create or replace function public.current_age(p_profile public.user_profiles)
returns integer
language sql
stable
set search_path to ''
as $function$
  select case
    when p_profile.birth_year is null then null
    else public.age_on_date(
      p_profile.birth_year,
      p_profile.birth_month,
      p_profile.birth_day,
      public.user_local_date(p_profile.timezone)
    )
  end;
$function$;


-- ----------------------------------------------------------------------------
-- 5. public.complete_user_profile_onboarding(...)
-- ----------------------------------------------------------------------------
-- Recreated from 20261105120000_enforce_minimum_registration_age_16.sql. Same
-- arguments and validation (16-100), plus: real calendar date, Feb 29
-- consistency, and birth year inference from the server clock in the stored
-- time zone (UTC for a new profile; see initialize_user_timezone below).
drop function if exists public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer);

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

  v_today := public.user_local_date(v_stored_timezone);
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


-- ----------------------------------------------------------------------------
-- 6. public.update_user_profile_demographics(integer, integer, integer)
-- ----------------------------------------------------------------------------
-- Settings edits AND the one-time age confirmation for existing users. Every
-- successful call re-infers birth_year from the submitted age and birthday
-- and stamps age_confirmed_at, so the reference data always matches what the
-- user last declared. Dropped first because the return type gains columns.
drop function if exists public.update_user_profile_demographics(integer, integer, integer);

create function public.update_user_profile_demographics(
  p_user_age integer,
  p_birth_month integer,
  p_birth_day integer
)
returns table (
  user_age integer,
  birth_month integer,
  birth_day integer,
  updated_at timestamptz,
  birth_year integer,
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
  v_profile public.user_profiles%rowtype;
  v_today date;
  v_baseline_age integer;
  v_birth_year integer;
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

  if not public.birth_date_is_valid(p_birth_month, p_birth_day) then
    raise exception
      'update_user_profile_demographics: p_birth_month/p_birth_day must be a real calendar date'
      using errcode = '22023';
  end if;

  select up.*
    into v_profile
    from public.user_profiles as up
   where up.id = v_user_id;

  if not found then
    raise exception
      'update_user_profile_demographics: no user_profiles row exists for the authenticated caller'
      using errcode = 'P0002';
  end if;

  v_today := public.user_local_date(v_profile.timezone);

  -- The account's own current age: computed when a birth year is known,
  -- otherwise the stored (possibly outdated, therefore lower-or-equal) age.
  v_baseline_age := case
    when v_profile.birth_year is not null
      then public.age_on_date(v_profile.birth_year, v_profile.birth_month, v_profile.birth_day, v_today)
    else v_profile.user_age
  end;

  -- 16+ always allowed. Below 16 only for an account already below 16
  -- (registered under the earlier 10+ rule) and never below its own current
  -- age, so no new under-16 value can be introduced.
  if p_user_age < 16 and (v_baseline_age is null or p_user_age < v_baseline_age) then
    raise exception
      'update_user_profile_demographics: p_user_age must be an integer between 16 and 100'
      using errcode = '22023';
  end if;

  v_birth_year := public.infer_birth_year(p_user_age, p_birth_month, p_birth_day, v_today);

  if not public.birth_year_matches_birthday(v_birth_year, p_birth_month, p_birth_day) then
    raise exception
      'update_user_profile_demographics: February 29 does not exist in the birth year implied by p_user_age'
      using errcode = '22023';
  end if;

  update public.user_profiles as up
     set user_age = p_user_age,
         birth_month = p_birth_month,
         birth_day = p_birth_day,
         birth_year = v_birth_year,
         age_confirmed_at = v_now,
         updated_at = v_now
   where up.id = v_user_id;

  -- current_age equals p_user_age by construction of infer_birth_year.
  return query
  select p_user_age, p_birth_month, p_birth_day, v_now, v_birth_year, v_now, p_user_age;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 7. public.initialize_user_timezone(text) — first time zone + birth year fix
-- ----------------------------------------------------------------------------
-- Recreated from 20260806120000_add_user_timezone_foundation.sql with the same
-- signature, return shape, validation, and "only when no time zone is stored"
-- rule. One addition: when it stores the first time zone of a profile that
-- already has an inferred birth year (onboarding ran in UTC), the birth year
-- is re-inferred from the declared user_age at the declaration instant
-- age_confirmed_at, now read in the user's real zone. Exact by construction,
-- and skipped if the result would contradict a Feb 29 birthday.
create or replace function public.initialize_user_timezone(p_timezone text)
returns table (
  timezone text,
  timezone_updated_at timestamp with time zone,
  initialized boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_timezone text := btrim(p_timezone);
  v_now timestamptz := now();
  v_row_count integer;
begin
  if v_user_id is null then
    raise exception
      'initialize_user_timezone: authentication required'
      using errcode = '28000';
  end if;

  if p_timezone is null or length(v_timezone) = 0 then
    raise exception
      'initialize_user_timezone: p_timezone is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as tzn
    where tzn.name = v_timezone
  ) then
    raise exception
      'initialize_user_timezone: p_timezone must be a valid IANA timezone'
      using errcode = '22023';
  end if;

  perform set_config('app.allow_user_timezone_write', 'on', true);

  update public.user_profiles as up
     set timezone = v_timezone,
         timezone_updated_at = v_now,
         updated_at = v_now,
         birth_year = case
           when up.birth_year is not null
                and up.age_confirmed_at is not null
                and public.birth_year_matches_birthday(
                      public.infer_birth_year(up.user_age, up.birth_month, up.birth_day,
                                              (up.age_confirmed_at at time zone v_timezone)::date),
                      up.birth_month, up.birth_day)
             then public.infer_birth_year(up.user_age, up.birth_month, up.birth_day,
                                          (up.age_confirmed_at at time zone v_timezone)::date)
           else up.birth_year
         end
   where up.id = v_user_id
     and up.timezone is null;

  get diagnostics v_row_count = row_count;

  if v_row_count > 0 then
    return query select v_timezone, v_now, true;
    return;
  end if;

  return query
  select up.timezone, up.timezone_updated_at, false
    from public.user_profiles as up
   where up.id = v_user_id;

  if not found then
    raise exception
      'initialize_user_timezone: profile row not found'
      using errcode = '42501';
  end if;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 8. EXECUTE privileges
-- ----------------------------------------------------------------------------
-- Helpers are pure and reachable only through current_age (invoker) and the
-- two SECURITY DEFINER RPCs; authenticated needs EXECUTE on the ones
-- current_age calls. anon/PUBLIC get nothing.
revoke execute on function public.birth_date_is_valid(integer, integer) from public, anon;
revoke execute on function public.birth_year_matches_birthday(integer, integer, integer) from public, anon;
revoke execute on function public.birthday_in_year(integer, integer, integer) from public, anon;
revoke execute on function public.age_on_date(integer, integer, integer, date) from public, anon;
revoke execute on function public.infer_birth_year(integer, integer, integer, date) from public, anon;
revoke execute on function public.user_local_date(text) from public, anon;
revoke execute on function public.current_age(public.user_profiles) from public, anon;

grant execute on function public.birth_date_is_valid(integer, integer) to postgres, authenticated, service_role;
grant execute on function public.birth_year_matches_birthday(integer, integer, integer) to postgres, authenticated, service_role;
grant execute on function public.birthday_in_year(integer, integer, integer) to postgres, authenticated, service_role;
grant execute on function public.age_on_date(integer, integer, integer, date) to postgres, authenticated, service_role;
grant execute on function public.infer_birth_year(integer, integer, integer, date) to postgres, authenticated, service_role;
grant execute on function public.user_local_date(text) to postgres, authenticated, service_role;
grant execute on function public.current_age(public.user_profiles) to postgres, authenticated, service_role;

revoke execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer) from public, anon;
grant execute on function public.complete_user_profile_onboarding(text, text, text, text, integer, integer, integer) to postgres, authenticated, service_role;

revoke execute on function public.initialize_user_timezone(text) from public, anon;
grant execute on function public.initialize_user_timezone(text) to postgres, authenticated, service_role;

revoke execute on function public.update_user_profile_demographics(integer, integer, integer) from public, anon;
grant execute on function public.update_user_profile_demographics(integer, integer, integer) to postgres, authenticated, service_role;

-- PostgREST must see the new computed field and the changed signatures.
notify pgrst, 'reload schema';

commit;

-- Read-only post-checks (informational):
--   select count(*) filter (where birth_year is null) as awaiting_confirmation,
--          count(*) as total
--     from public.user_profiles;
--   select public.age_on_date(2004, 2, 29, date '2026-02-28'),  -- 21
--          public.age_on_date(2004, 2, 29, date '2026-03-01'),  -- 22
--          public.age_on_date(2004, 2, 29, date '2028-02-29');  -- 24
