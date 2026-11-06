-- pgTAP: onboarding birth-year inference in the browser's time zone
-- (migrations/20261106120000_fix_onboarding_leap_day_utc_boundary.sql).
--
-- Runs on a disposable local Supabase database, never production:
--   supabase db start   # applies every migration in supabase/migrations
--   supabase test db    # runs supabase/tests/**/*.sql with pg_prove
-- CI does the same in .github/workflows/database-tests.yml. Everything runs
-- in one transaction that is rolled back, so nothing persists.
--
-- [A] uses fixed instants: onboarding_reference_date takes the instant
--     explicitly, combined with the real SQL calendar helpers.
-- [B] checks the catalog: one signature, defaults, privileges.
-- [C] calls the RPC end to end as synthetic auth users. now() is fixed per
--     transaction but not controllable, so expectations are computed from
--     now() with the same SQL helpers, and the birthday is chosen so that
--     Pacific/Kiritimati (UTC+14) and Etc/GMT+12 (UTC-12), which are always
--     on different dates, imply different birth years.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- ---------------------------------------------------------------------------
-- [A] Calendar boundary at fixed instants
-- ---------------------------------------------------------------------------

-- February 29 in leap and non-leap years (policy unchanged).
select ok(public.birth_date_is_valid(2, 29), 'Feb 29 is a valid birthday');
select ok(not public.birth_date_is_valid(2, 30), 'Feb 30 is not');
select is(public.birthday_in_year(2028, 2, 29), date '2028-02-29', 'leap year: celebrated on Feb 29');
select is(public.birthday_in_year(2026, 2, 29), date '2026-03-01', 'non-leap year: celebrated on March 1');
select is(public.age_on_date(2008, 2, 29, date '2026-02-28'), 17, 'non-leap year: not older on Feb 28');
select is(public.age_on_date(2008, 2, 29, date '2026-03-01'), 18, 'non-leap year: older on March 1');

-- Honolulu (UTC-10): 2026-03-01 06:00 UTC is 2026-02-28 20:00 locally.
select is(public.onboarding_reference_date(null, 'Pacific/Honolulu', timestamptz '2026-03-01 06:00:00+00'),
          date '2026-02-28', 'Honolulu: the local date is used');
select is(public.infer_birth_year(17, 2, 29,
            public.onboarding_reference_date(null, 'Pacific/Honolulu', timestamptz '2026-03-01 06:00:00+00')),
          2008, 'Honolulu: an honest 17 implies 2008');
select ok(public.birth_year_matches_birthday(2008, 2, 29), 'Honolulu: 2008 fits Feb 29 (accepted)');
select is(public.infer_birth_year(17, 2, 29,
            public.onboarding_reference_date(null, null, timestamptz '2026-03-01 06:00:00+00')),
          2009, 'previous behavior: without a zone the UTC date implied 2009');
select ok(not public.birth_year_matches_birthday(2009, 2, 29), 'previous behavior: 2009 was rejected');

-- Tokyo (UTC+9), 16th birthday: 2028-02-28 15:30 UTC is 2028-02-29 00:30.
select is(public.onboarding_reference_date(null, 'Asia/Tokyo', timestamptz '2028-02-28 15:30:00+00'),
          date '2028-02-29', 'Tokyo: the local date is used');
select is(public.infer_birth_year(16, 2, 29,
            public.onboarding_reference_date(null, 'Asia/Tokyo', timestamptz '2028-02-28 15:30:00+00')),
          2012, 'Tokyo: an honest 16 on the 16th birthday implies 2012 (accepted)');
select is(public.infer_birth_year(16, 2, 29,
            public.onboarding_reference_date(null, null, timestamptz '2028-02-28 15:30:00+00')),
          2011, 'previous behavior: the UTC date implied 2011 (rejected)');
select is(public.age_on_date(2012, 2, 29, date '2028-02-28'), 15, '15 the day before the 16th birthday');
select is(public.age_on_date(2012, 2, 29, date '2028-02-29'), 16, '16 on the 16th birthday');

-- Underage: born 2012-02-29, in Honolulu on 2028-02-28 20:00 local, claims 16.
select is(public.infer_birth_year(16, 2, 29,
            public.onboarding_reference_date(null, 'Pacific/Honolulu', timestamptz '2028-02-29 06:00:00+00')),
          2011, 'a 15-year-old claiming 16 in their own zone implies 2011');
select ok(not public.birth_year_matches_birthday(2011, 2, 29), '... and is rejected');

-- UTC midnight.
select is(public.onboarding_reference_date(null, 'UTC', timestamptz '2026-02-28 23:59:59.999999+00'),
          date '2026-02-28', 'UTC: last microsecond of Feb 28');
select is(public.onboarding_reference_date(null, 'UTC', timestamptz '2026-03-01 00:00:00+00'),
          date '2026-03-01', 'UTC: midnight starts March 1');

-- Extreme positive and negative offsets.
select is(public.onboarding_reference_date(null, 'Pacific/Kiritimati', timestamptz '2026-02-28 10:00:00+00'),
          date '2026-03-01', 'UTC+14 is already on the next date');
select is(public.onboarding_reference_date(null, 'Etc/GMT+12', timestamptz '2026-03-01 11:59:00+00'),
          date '2026-02-28', 'UTC-12 is still on the previous date');

-- December 31 -> January 1.
select is(public.onboarding_reference_date(null, 'Asia/Tokyo', timestamptz '2026-12-31 20:00:00+00'),
          date '2027-01-01', 'Tokyo: already January 1');
select is(public.onboarding_reference_date(null, 'America/New_York', timestamptz '2026-12-31 20:00:00+00'),
          date '2026-12-31', 'New York: still December 31');
select is(public.infer_birth_year(17, 1, 1, date '2027-01-01'), 2010, 'Jan 1 birthday on Jan 1');
select is(public.age_on_date(2010, 1, 1, date '2026-12-31'), 16, 'one day before a Jan 1 birthday');

-- Ordinary birthdays.
select is(public.infer_birth_year(16, 6, 15, date '2026-06-14'), 2009, 'day before an ordinary birthday');
select is(public.infer_birth_year(16, 6, 15, date '2026-06-15'), 2010, 'on an ordinary birthday');

-- Zone precedence and fallback.
select is(public.onboarding_reference_date('Asia/Tokyo', 'Pacific/Honolulu', timestamptz '2026-03-01 06:00:00+00'),
          date '2026-03-01', 'a stored zone wins over the supplied zone');
select is(public.onboarding_reference_date(null, null, timestamptz '2026-03-01 06:00:00+00'),
          date '2026-03-01', 'no zone: UTC');
select is(public.onboarding_reference_date(null, '', timestamptz '2026-02-28 23:00:00+00'),
          date '2026-02-28', 'empty zone: UTC');
select is(public.onboarding_reference_date(null, 'Not/AZone', timestamptz '2026-03-01 06:00:00+00'),
          date '2026-03-01', 'unknown zone: UTC');

-- ---------------------------------------------------------------------------
-- [B] Catalog: signature, default, privileges
-- ---------------------------------------------------------------------------

select is((select count(*)::integer from pg_catalog.pg_proc
            where pronamespace = 'public'::regnamespace and proname = 'complete_user_profile_onboarding'),
          1, 'exactly one complete_user_profile_onboarding exists (old signature dropped)');
select is((select pg_catalog.pg_get_function_identity_arguments(p.oid) from pg_catalog.pg_proc as p
            where p.pronamespace = 'public'::regnamespace and p.proname = 'complete_user_profile_onboarding'),
          'p_nickname text, p_native_language text, p_learning_language text, p_current_level text, p_user_age integer, p_birth_month integer, p_birth_day integer, p_timezone text',
          'the 8-argument signature');
select matches((select pg_catalog.pg_get_function_arguments(p.oid) from pg_catalog.pg_proc as p
                 where p.pronamespace = 'public'::regnamespace and p.proname = 'complete_user_profile_onboarding'),
               'p_timezone text DEFAULT NULL',
               'p_timezone defaults to NULL');
select ok((select p.prosecdef from pg_catalog.pg_proc as p
            where p.oid = 'public.complete_user_profile_onboarding(text,text,text,text,integer,integer,integer,text)'::regprocedure),
          'the RPC is still SECURITY DEFINER');
select is((select p.proconfig from pg_catalog.pg_proc as p
            where p.oid = 'public.complete_user_profile_onboarding(text,text,text,text,integer,integer,integer,text)'::regprocedure),
          array['search_path=""'], 'the RPC still pins search_path to empty');
select is((select pg_catalog.pg_get_userbyid(p.proowner)::text from pg_catalog.pg_proc as p
            where p.oid = 'public.complete_user_profile_onboarding(text,text,text,text,integer,integer,integer,text)'::regprocedure),
          'postgres', 'the RPC is owned by postgres, like the function it replaces');
select is((select array_agg(distinct pg_catalog.pg_get_userbyid(a.grantee)::text order by pg_catalog.pg_get_userbyid(a.grantee)::text)
             from pg_catalog.pg_proc as p, pg_catalog.aclexplode(p.proacl) as a
            where p.oid = 'public.complete_user_profile_onboarding(text,text,text,text,integer,integer,integer,text)'::regprocedure
              and a.privilege_type = 'EXECUTE' and a.grantee <> 0),
          array['authenticated', 'postgres', 'service_role'], 'RPC EXECUTE grantees are exactly the previous set');
select ok(not exists (select 1 from pg_catalog.pg_proc as p, pg_catalog.aclexplode(p.proacl) as a
                       where p.oid = 'public.complete_user_profile_onboarding(text,text,text,text,integer,integer,integer,text)'::regprocedure
                         and a.grantee = 0),
          'PUBLIC holds no privilege on the RPC');
select is((select p.proconfig from pg_catalog.pg_proc as p
            where p.oid = 'public.onboarding_reference_date(text,text,timestamptz)'::regprocedure),
          array['search_path=""'], 'the helper pins search_path to empty');
select is((select array_agg(distinct pg_catalog.pg_get_userbyid(a.grantee)::text order by pg_catalog.pg_get_userbyid(a.grantee)::text)
             from pg_catalog.pg_proc as p, pg_catalog.aclexplode(p.proacl) as a
            where p.oid = 'public.onboarding_reference_date(text,text,timestamptz)'::regprocedure
              and a.privilege_type = 'EXECUTE' and a.grantee <> 0),
          array['postgres', 'service_role'], 'helper EXECUTE grantees are exactly postgres and service_role');
select ok(has_function_privilege('authenticated',
            'public.complete_user_profile_onboarding(text,text,text,text,integer,integer,integer,text)', 'execute'),
          'authenticated may call the RPC');
select ok(not has_function_privilege('anon',
            'public.complete_user_profile_onboarding(text,text,text,text,integer,integer,integer,text)', 'execute'),
          'anon may not call the RPC');
select ok(not has_function_privilege('anon',
            'public.onboarding_reference_date(text,text,timestamptz)', 'execute'),
          'anon may not call the helper');
select ok(not has_function_privilege('authenticated',
            'public.onboarding_reference_date(text,text,timestamptz)', 'execute'),
          'authenticated may not call the helper directly');
select ok(has_function_privilege('service_role',
            'public.onboarding_reference_date(text,text,timestamptz)', 'execute'),
          'service_role may call the helper');

-- ---------------------------------------------------------------------------
-- [C] RPC end to end
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'leap-a1@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'leap-a2@example.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'leap-a3@example.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated', 'leap-a4@example.test'),
  ('00000000-0000-4000-8000-0000000000a5', 'authenticated', 'authenticated', 'leap-a5@example.test');

-- The birthday is today's date in UTC+14 (birthday reached there, not yet
-- in UTC-12). On the rare day that is Feb 29 it falls back to March 1, and
-- the "zones differ" assertion is skipped.
create temporary table t_now on commit drop as
select kiri, m12, utc,
       (kiri_md = '02-29') as substituted,
       case when kiri_md = '02-29' then 3 else extract(month from kiri)::integer end as bmonth,
       case when kiri_md = '02-29' then 1 else extract(day from kiri)::integer end as bday
  from (select (now() at time zone 'Pacific/Kiritimati')::date as kiri,
               (now() at time zone 'Etc/GMT+12')::date as m12,
               (now() at time zone 'UTC')::date as utc,
               to_char((now() at time zone 'Pacific/Kiritimati')::date, 'MM-DD') as kiri_md) as d;

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.expected_year(p_zone text) returns integer
language sql as $$
  select public.infer_birth_year(30, bmonth, bday, (now() at time zone p_zone)::date) from t_now;
$$;

select ok((select substituted or pg_temp.expected_year('Pacific/Kiritimati') <> pg_temp.expected_year('Etc/GMT+12') from t_now),
          'the chosen birthday distinguishes UTC+14 from UTC-12');


-- Old 7-argument call (named notation, as PostgREST sends it).
do $$ begin perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a1'); end $$;
select is((select r.birth_year::integer from t_now,
             public.complete_user_profile_onboarding(
               p_nickname => 'Ann', p_native_language => 'en', p_learning_language => 'es',
               p_current_level => 'A1', p_user_age => 30, p_birth_month => t_now.bmonth,
               p_birth_day => t_now.bday) as r),
          pg_temp.expected_year('UTC'),
          'seven-argument call still works: no stored zone -> UTC');
select is((select up.timezone from public.user_profiles as up where up.id = '00000000-0000-4000-8000-0000000000a1'),
          null::text, 'seven-argument call stores no zone');

-- Supplied zone is used when none is stored, and is never stored.
do $$ begin perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a2'); end $$;
select is((select r.birth_year::integer from t_now,
             public.complete_user_profile_onboarding(
               p_nickname => 'Bea', p_native_language => 'en', p_learning_language => 'es',
               p_current_level => 'A1', p_user_age => 30, p_birth_month => t_now.bmonth,
               p_birth_day => t_now.bday, p_timezone => 'Etc/GMT+12') as r),
          pg_temp.expected_year('Etc/GMT+12'),
          'supplied zone is used when none is stored');
select is((select up.timezone from public.user_profiles as up where up.id = '00000000-0000-4000-8000-0000000000a2'),
          null::text, 'the supplied zone is not stored');

-- Unknown supplied zone falls back to UTC.
do $$ begin perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a3'); end $$;
select is((select r.birth_year::integer from t_now,
             public.complete_user_profile_onboarding(
               p_nickname => 'Cleo', p_native_language => 'en', p_learning_language => 'es',
               p_current_level => 'A1', p_user_age => 30, p_birth_month => t_now.bmonth,
               p_birth_day => t_now.bday, p_timezone => 'Not/AZone') as r),
          pg_temp.expected_year('UTC'),
          'unknown supplied zone: UTC');

-- A stored zone wins over the supplied one.
do $$ begin perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4'); end $$;
select is((select r.birth_year::integer from t_now,
             public.complete_user_profile_onboarding(
               p_nickname => 'Dora', p_native_language => 'en', p_learning_language => 'es',
               p_current_level => 'A1', p_user_age => 30, p_birth_month => t_now.bmonth,
               p_birth_day => t_now.bday, p_timezone => 'Etc/GMT+12') as r),
          pg_temp.expected_year('Etc/GMT+12'),
          'first onboarding uses the supplied zone');
select is((select i.initialized from public.initialize_user_timezone('Pacific/Kiritimati') as i),
          true, 'initialize_user_timezone stores the first zone');
select is((select up.birth_year::integer from public.user_profiles as up where up.id = '00000000-0000-4000-8000-0000000000a4'),
          pg_temp.expected_year('Pacific/Kiritimati'),
          'initialize_user_timezone re-infers in the stored zone (unchanged behavior)');
select is((select r.birth_year::integer from t_now,
             public.complete_user_profile_onboarding(
               p_nickname => 'Dora', p_native_language => 'en', p_learning_language => 'es',
               p_current_level => 'A1', p_user_age => 30, p_birth_month => t_now.bmonth,
               p_birth_day => t_now.bday, p_timezone => 'Etc/GMT+12') as r),
          pg_temp.expected_year('Pacific/Kiritimati'),
          'stored zone takes precedence over p_timezone');
select is((select up.timezone from public.user_profiles as up where up.id = '00000000-0000-4000-8000-0000000000a4'),
          'Pacific/Kiritimati', 'onboarding leaves the stored zone untouched');

-- Eligibility and Feb 29 consistency are still enforced.
do $$ begin perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a5'); end $$;
select throws_ok(
  $q$select * from public.complete_user_profile_onboarding(
       p_nickname => 'Eve', p_native_language => 'en', p_learning_language => 'es', p_current_level => 'A1',
       p_user_age => 15, p_birth_month => 6, p_birth_day => 15, p_timezone => 'Pacific/Kiritimati')$q$,
  '22023', 'complete_user_profile_onboarding: p_user_age must be between 16 and 100',
  'under 16 is rejected whatever the zone');
select throws_ok(
  $q$select * from public.complete_user_profile_onboarding(
       p_nickname => 'Eve', p_native_language => 'en', p_learning_language => 'es', p_current_level => 'A1',
       p_user_age => 15, p_birth_month => 6, p_birth_day => 15)$q$,
  '22023', 'complete_user_profile_onboarding: p_user_age must be between 16 and 100',
  'under 16 is rejected by the seven-argument call');
-- An age with (year - age) = 2 (mod 4): neither candidate birth year is a
-- leap year, whatever today's date.
select throws_ok(
  format($q$select * from public.complete_user_profile_onboarding(
       p_nickname => 'Eve', p_native_language => 'en', p_learning_language => 'es', p_current_level => 'A1',
       p_user_age => %s, p_birth_month => 2, p_birth_day => 29, p_timezone => 'UTC')$q$,
         (select 18 + (((extract(year from utc)::integer - 20) % 4) + 4) % 4 from t_now)),
  '22023', 'complete_user_profile_onboarding: February 29 does not exist in the birth year implied by p_user_age',
  'a Feb 29 birthday with an age implying a non-leap year is rejected');
-- The age that implies the latest leap year at least 16 years back.
select is((select r.birth_year::integer
             from (select base - ((base - 16) - ((base - 16) % 4)) as age
                     from (select extract(year from utc)::integer
                                  - case when utc < public.birthday_in_year(extract(year from utc)::integer, 2, 29)
                                         then 1 else 0 end as base
                             from t_now) as b) as a,
                  public.complete_user_profile_onboarding(
                    p_nickname => 'Eve', p_native_language => 'en', p_learning_language => 'es',
                    p_current_level => 'A1', p_user_age => a.age, p_birth_month => 2,
                    p_birth_day => 29, p_timezone => 'UTC') as r),
          (select (base - 16) - ((base - 16) % 4)
             from (select extract(year from utc)::integer
                          - case when utc < public.birthday_in_year(extract(year from utc)::integer, 2, 29)
                                 then 1 else 0 end as base
                     from t_now) as b),
          'a consistent Feb 29 declaration is accepted end to end with a leap birth year');

select * from finish();

rollback;
