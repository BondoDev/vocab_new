-- ============================================================================
-- BASELINE MIGRATION — existing live schema, captured as-is
-- ============================================================================
--
-- WHAT THIS FILE IS
-- ------------------------------------------------------------------------
-- A snapshot of the FluentStellar learning system's database objects
-- exactly as they exist in the live Supabase project. It intentionally
-- preserves every known imperfection found during the Phase 1 (client
-- code) and Phase 2/3 (live-catalog) audits that produced it — broad
-- anon/authenticated table grants (including TRUNCATE/REFERENCES/MAINTAIN,
-- well beyond ordinary CRUD), ownership-only RLS policies on three tables,
-- an unnecessary anon EXECUTE grant on both RPCs, missing non-negative
-- CHECK constraints, and review_events' incomplete foreign-key coverage.
-- NONE of these are fixed here — see PROPOSED NEXT MIGRATIONS at the
-- bottom. This file only describes what already exists.
--
-- CONFIDENCE — every object below is [CATALOG-CONFIRMED] (read directly
-- from pg_attribute/pg_class/pg_constraint/pg_policies/pg_proc via
-- aclexplode()/format_type()/pg_get_functiondef(), not information_schema,
-- not inferred from frontend code). This includes both RPCs' EXECUTE
-- grants: complete_new_word_study and complete_word_review both confirmed
-- granting EXECUTE to postgres/anon/authenticated/service_role, none WITH
-- GRANT OPTION.
--
-- Column existence: two tables (user_word_progress, user_daily_stats) and
-- user_profiles have gaps in their ordinal column positions (e.g.
-- user_word_progress jumps from column 2 to column 16). This was
-- cross-checked against a direct `count(*) ... where not attisdropped`
-- query, which returned exactly the same column counts as this file
-- reflects (14/10/8/14 for user_profiles/user_word_progress/
-- user_daily_stats/review_events) — confirming the gaps are dropped-column
-- history, not missing/hidden live columns.
--
-- HOW THIS FILE WAS PRODUCED
-- ------------------------------------------------------------------------
-- CLI-based `supabase db pull`/`db dump` was evaluated and found not
-- safely available (no DB password or CLI access token exists anywhere in
-- this environment — see this migration's own git history / the Phase 3
-- audit report for the full reasoning). Every object below was instead
-- reconstructed from read-only catalog queries run directly against the
-- live project in the Supabase SQL Editor and relayed back verbatim.
--
-- POSTGRES VERSION: 17 (also independently corroborated by the MAINTAIN
-- privilege appearing in this project's grants below — MAINTAIN did not
-- exist before Postgres 17).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- EXTENSIONS (for reference only — see note below; not reproduced as
-- CREATE EXTENSION statements)
-- ----------------------------------------------------------------------------
-- Confirmed installed on the live project: plpgsql (pg_catalog),
-- pg_stat_statements, uuid-ossp, pgcrypto (all in the `extensions` schema),
-- and supabase_vault (in the `vault` schema). uuid-ossp and/or pgcrypto are
-- almost certainly what backs the gen_random_uuid() defaults below.
-- Deliberately NOT reproduced as CREATE EXTENSION statements here: three of
-- the five (pg_stat_statements, supabase_vault, plpgsql) are Supabase
-- platform-managed extensions unrelated to these four tables, and
-- reproducing all five indiscriminately would pull unrelated, unstable
-- objects into a migration meant to describe the learning system
-- specifically, contradicting the instruction not to auto-reproduce every
-- Supabase-managed extension.


-- ----------------------------------------------------------------------------
-- TABLE: public.user_profiles  (14 live columns, confirmed)
-- ----------------------------------------------------------------------------
-- PRIMARY KEY / FOREIGN KEY: [CATALOG-CONFIRMED], Phase 2.
-- All column types/nullability/defaults: [CATALOG-CONFIRMED], Phase 3.
--
-- NOTE — every column here is NOT NULL with no default except id/created_at/
-- updated_at/daily_goal/onboarding_completed/is_new_user. Some of the
-- remaining columns (nickname, native_language, learning_language,
-- current_level, user_age, birth_month, birth_day, last_active_at) are
-- NOT NULL in PostgreSQL while the frontend's corresponding read type
-- (UserProfilesRow in src/lib/userProfile.ts) may permit null. This
-- baseline preserves the live schema as deployed and does not resolve
-- that application/schema contract question — see supabase/README.md.
--
-- NOTE — `is_new_user` (boolean, default true) exists and was never
-- referenced anywhere in the frontend TypeScript reviewed in Phase 1 (not
-- in UserProfilesRow's read shape, not in the write payload). Its
-- ownership/purpose is UNKNOWN as of this audit — captured here exactly as
-- deployed, not removed or "corrected."
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  native_language text not null,
  learning_language text not null,
  daily_goal integer not null default 15,
  onboarding_completed boolean not null default false,
  is_new_user boolean not null default true, -- purpose/ownership unknown, see note above
  current_level text not null,
  last_active_at timestamptz not null,
  user_age integer not null,
  birth_month smallint not null,
  birth_day smallint not null,
  nickname text not null
);

alter table public.user_profiles enable row level security;

-- [CATALOG-CONFIRMED] verbatim, Phase 2.
create policy "Users can manage their profiles"
  on public.user_profiles
  as permissive
  for all
  to public
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- [CATALOG-CONFIRMED], Phase 3 — literal table grants, reproduced exactly.
-- Every one of postgres/anon/authenticated/service_role holds the full
-- privilege set (including TRUNCATE, REFERENCES, MAINTAIN — well beyond
-- what the application actually uses), none WITH GRANT OPTION. RLS above
-- is the ONLY thing restricting anon/authenticated in practice; the grant
-- layer itself provides zero defense in depth for this table.
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_profiles to postgres;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_profiles to anon;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_profiles to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_profiles to service_role;
-- No column-level grants exist on this table — [CATALOG-CONFIRMED], Phase 3
-- (aclexplode(pg_attribute.attacl) returned zero rows for every column).


-- ----------------------------------------------------------------------------
-- TABLE: public.user_word_progress  (10 live columns, confirmed)
-- ----------------------------------------------------------------------------
-- PRIMARY KEY / FOREIGN KEY / UNIQUE / CHECK: [CATALOG-CONFIRMED], Phase 2.
-- Constraint NAME corrected in this revision — Phase 2 confirmed the shape
-- but not the literal name; Phase 3 confirmed the real name is
-- user_word_progress_user_word_language_key (this file previously guessed
-- Postgres's default auto-generated name, which was wrong).
-- Column types/nullability/defaults: [CATALOG-CONFIRMED], Phase 3.
--
-- NOTE — correct_streak/last_practiced_at/next_review_at are NOT NULL with
-- no default. This is safe in normal operation because the only INSERT
-- path (complete_new_word_study, below) always supplies all three
-- explicitly — but it also means a direct REST INSERT of a brand-new row
-- (as opposed to an UPDATE of an existing one — see the High finding on
-- broad grants) would fail outright without them, which is a small,
-- incidental mitigation, not an intentional access control.
create table if not exists public.user_word_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  word_id text not null,
  target_language text not null,
  word_state text not null,
  is_favorite boolean not null default false,
  last_practiced_at timestamptz not null,
  next_review_at timestamptz not null,
  correct_streak integer not null,
  created_at timestamptz not null default (now() at time zone 'utc'),

  constraint user_word_progress_user_word_language_key
    unique (user_id, word_id, target_language),

  constraint user_word_progress_word_state_check
    check (word_state in ('seen', 'learning', 'familiar', 'strong', 'mastered'))

  -- KNOWN GAP, intentionally preserved: no CHECK (correct_streak >= 0)
  -- exists on this table today. Do not add one here.
);

alter table public.user_word_progress enable row level security;

-- [CATALOG-CONFIRMED] verbatim, Phase 2. Ownership-only — does not restrict
-- which columns/values an owning user may write. Root cause of the
-- confirmed High finding (self-integrity bypass), preserved exactly as-is.
create policy "Users can manage their word progress"
  on public.user_word_progress
  as permissive
  for all
  to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- [CATALOG-CONFIRMED], Phase 3 — same pattern/caveat as user_profiles above.
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_word_progress to postgres;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_word_progress to anon;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_word_progress to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_word_progress to service_role;
-- No column-level grants exist on this table — [CATALOG-CONFIRMED], Phase 3.


-- ----------------------------------------------------------------------------
-- TABLE: public.user_daily_stats  (8 live columns, confirmed — exactly the
-- 8 either RPC references plus created_at; the previously-hypothesized
-- daily_goal/streak_completed columns on THIS table do not exist — that
-- data lives on user_profiles.daily_goal instead, confirmed)
-- ----------------------------------------------------------------------------
-- PRIMARY KEY / FOREIGN KEY / UNIQUE: [CATALOG-CONFIRMED], Phase 2.
-- Constraint NAME corrected — the real name is
-- user_daily_stats_language_date_unique (this file previously guessed
-- wrong here too).
-- Column types/nullability/defaults: [CATALOG-CONFIRMED], Phase 3.
create table if not exists public.user_daily_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language text not null,
  stat_date date not null,
  new_words_completed integer not null default 0,
  reviews_completed integer not null default 0,
  study_time_seconds integer not null default 0,
  created_at timestamptz not null default (now() at time zone 'utc'),

  constraint user_daily_stats_language_date_unique
    unique (user_id, target_language, stat_date)

  -- KNOWN GAP, intentionally preserved: no non-negative CHECK exists on
  -- new_words_completed / reviews_completed / study_time_seconds today.
);

alter table public.user_daily_stats enable row level security;

-- [CATALOG-CONFIRMED] verbatim, Phase 2. Same ownership-only shape/caveat
-- as user_word_progress above.
create policy "Users can manage their daily"
  on public.user_daily_stats
  as permissive
  for all
  to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- [CATALOG-CONFIRMED], Phase 3 — same pattern/caveat as above.
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_daily_stats to postgres;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_daily_stats to anon;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_daily_stats to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_daily_stats to service_role;
-- No column-level grants exist on this table — [CATALOG-CONFIRMED], Phase 3.


-- ----------------------------------------------------------------------------
-- TABLE: public.review_events  (14 live columns, confirmed — no gaps in
-- ordinal position 1-14, matching this table's own RPC-derived column list
-- exactly with nothing left unaccounted for)
-- ----------------------------------------------------------------------------
-- PRIMARY KEY / CHECK constraints: [CATALOG-CONFIRMED], Phase 2.
-- Foreign key on word_progress_id: [CATALOG-CONFIRMED] — carries no
-- specified ON DELETE behavior (defaults to NO ACTION), preserved as-is.
-- user_id has NO foreign key — [CATALOG-CONFIRMED absence]. Preserved.
-- Column types/nullability/defaults: [CATALOG-CONFIRMED], Phase 3.
--
-- NOTE — created_at here defaults to plain now(), while
-- user_word_progress.created_at and user_daily_stats.created_at default to
-- (now() at time zone 'utc'). This is a genuine, minor inconsistency in
-- how "creation time" is captured across tables — reproduced exactly
-- as-is, not harmonized, since created_at isn't read by any frontend code
-- reviewed in this audit and this is descriptive, not corrective.
create table if not exists public.review_events (
  event_id uuid primary key,
  user_id uuid not null,
  word_progress_id uuid not null references public.user_word_progress (id),
  target_language text not null,
  result text not null,
  previous_state text not null,
  new_state text not null,
  previous_correct_streak integer not null,
  new_correct_streak integer not null,
  promoted boolean not null default false,
  demoted boolean not null default false,
  last_practiced_at timestamptz not null,
  next_review_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint review_events_previous_correct_streak_check
    check (previous_correct_streak >= 0),
  constraint review_events_new_correct_streak_check
    check (new_correct_streak >= 0),
  constraint review_events_previous_state_check
    check (previous_state in ('seen', 'learning', 'familiar', 'strong', 'mastered')),
  constraint review_events_new_state_check
    check (new_state in ('seen', 'learning', 'familiar', 'strong', 'mastered')),
  constraint review_events_result_check
    check (result in ('correct', 'incorrect', 'skipped'))
);

-- [CATALOG-CONFIRMED], Phase 2: RLS enabled, ZERO policies for any
-- command/role — default-deny for every client role on every command. The
-- only way this table is ever written is via the two SECURITY DEFINER
-- RPCs below, executing as their owner (postgres), which bypasses RLS.
-- Preserved exactly as-is: no policy is added here.
alter table public.review_events enable row level security;

-- [CATALOG-CONFIRMED], Phase 3 — same broad grant pattern as the other
-- three tables. Worth stating plainly: the raw GRANTs below would allow
-- anon/authenticated to INSERT/SELECT/UPDATE/DELETE/TRUNCATE this table
-- directly with no restriction whatsoever — RLS's zero-policy lockdown
-- above is the ONLY thing preventing that. There is no independent,
-- grant-level defense in depth for this table either.
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.review_events to postgres;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.review_events to anon;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.review_events to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.review_events to service_role;
-- No column-level grants exist on this table — [CATALOG-CONFIRMED], Phase 3.


-- ----------------------------------------------------------------------------
-- FUNCTION: public.complete_new_word_study
-- ----------------------------------------------------------------------------
-- [CATALOG-CONFIRMED] — retrieved verbatim via pg_get_functiondef, Phase 2.
CREATE OR REPLACE FUNCTION public.complete_new_word_study(p_word_id text, p_target_language text, p_stat_date date)
 RETURNS TABLE(inserted boolean, already_completed boolean, new_words_completed_today integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz := now();
  v_row_count integer;
  v_inserted boolean := false;
  v_jitter_factor numeric;
  v_next_review_at timestamptz;
  v_new_count integer;
begin
  if v_user_id is null then
    raise exception
      'complete_new_word_study: authentication required'
      using errcode = '28000';
  end if;

  if p_word_id is null or length(btrim(p_word_id)) = 0 then
    raise exception
      'complete_new_word_study: p_word_id is required'
      using errcode = '22023';
  end if;

  if p_target_language is null
     or length(btrim(p_target_language)) = 0 then
    raise exception
      'complete_new_word_study: p_target_language is required'
      using errcode = '22023';
  end if;

  if p_stat_date is null then
    raise exception
      'complete_new_word_study: p_stat_date is required'
      using errcode = '22023';
  end if;

  v_jitter_factor := 0.9 + random() * 0.2;

  v_next_review_at :=
    v_completed_at + (interval '1 day' * v_jitter_factor);

  insert into public.user_word_progress (
    user_id,
    word_id,
    target_language,
    word_state,
    is_favorite,
    correct_streak,
    last_practiced_at,
    next_review_at
  )
  values (
    v_user_id,
    btrim(p_word_id),
    btrim(p_target_language),
    'seen',
    false,
    0,
    v_completed_at,
    v_next_review_at
  )
  on conflict (user_id, word_id, target_language)
  do nothing;

  get diagnostics v_row_count = row_count;
  v_inserted := v_row_count > 0;

  if v_inserted then
    insert into public.user_daily_stats (
      user_id,
      target_language,
      stat_date,
      new_words_completed,
      reviews_completed,
      study_time_seconds
    )
    values (
      v_user_id,
      btrim(p_target_language),
      p_stat_date,
      1,
      0,
      0
    )
    on conflict (user_id, target_language, stat_date)
    do update
      set new_words_completed =
        public.user_daily_stats.new_words_completed + 1;
  end if;

  select uds.new_words_completed
  into v_new_count
  from public.user_daily_stats as uds
  where uds.user_id = v_user_id
    and uds.target_language = btrim(p_target_language)
    and uds.stat_date = p_stat_date;

  return query
  select
    v_inserted,
    not v_inserted,
    coalesce(v_new_count, 0);
end;
$function$;

-- [CATALOG-CONFIRMED], Phase 3 — literal, exact-signature EXECUTE grants.
grant execute on function public.complete_new_word_study(text, text, date) to postgres;
grant execute on function public.complete_new_word_study(text, text, date) to anon;
grant execute on function public.complete_new_word_study(text, text, date) to authenticated;
grant execute on function public.complete_new_word_study(text, text, date) to service_role;


-- ----------------------------------------------------------------------------
-- FUNCTION: public.complete_word_review
-- ----------------------------------------------------------------------------
-- [CATALOG-CONFIRMED] — retrieved verbatim via pg_get_functiondef, Phase 2.
CREATE OR REPLACE FUNCTION public.complete_word_review(p_event_id uuid, p_word_progress_id uuid, p_result text, p_stat_date date)
 RETURNS TABLE(already_processed boolean, previous_state text, new_state text, previous_correct_streak integer, new_correct_streak integer, promoted boolean, demoted boolean, result text, reviews_completed_today integer, last_practiced_at timestamp with time zone, next_review_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz := now();
  v_existing public.review_events%rowtype;
  v_row public.user_word_progress%rowtype;
  v_new_state text;
  v_new_streak integer;
  v_promoted boolean := false;
  v_demoted boolean := false;
  v_base_interval_days integer;
  v_jitter_factor numeric;
  v_next_review_at timestamptz;
  v_reviews_completed_today integer;
begin
  if v_user_id is null then
    raise exception 'complete_word_review: authentication required' using errcode = '28000';
  end if;
  if p_event_id is null then
    raise exception 'complete_word_review: p_event_id is required' using errcode = '22023';
  end if;
  if p_word_progress_id is null then
    raise exception 'complete_word_review: p_word_progress_id is required' using errcode = '22023';
  end if;
  if p_result is null or p_result not in ('correct', 'incorrect', 'skipped') then
    raise exception 'complete_word_review: p_result must be correct/incorrect/skipped' using errcode = '22023';
  end if;
  if p_stat_date is null then
    raise exception 'complete_word_review: p_stat_date is required' using errcode = '22023';
  end if;

  -- Idempotency: a retried event_id replays its already-applied result
  -- instead of recomputing from a row that may have already moved on.
  select * into v_existing from public.review_events
   where event_id = p_event_id and user_id = v_user_id;

  if found then
    select uds.reviews_completed into v_reviews_completed_today
      from public.user_daily_stats uds
     where uds.user_id = v_user_id
       and uds.target_language = v_existing.target_language
       and uds.stat_date = p_stat_date;

    return query select
      true,
      v_existing.previous_state, v_existing.new_state,
      v_existing.previous_correct_streak, v_existing.new_correct_streak,
      v_existing.promoted, v_existing.demoted, v_existing.result,
      coalesce(v_reviews_completed_today, 0),
      v_existing.last_practiced_at, v_existing.next_review_at;
    return;
  end if;

  -- Lock the owned row — never trusts a client-supplied state/streak.
  select * into v_row from public.user_word_progress
   where id = p_word_progress_id and user_id = v_user_id
   for update;

  if not found then
    raise exception 'complete_word_review: word progress row not found or not owned by caller' using errcode = '42501';
  end if;

  -- State/streak transition — mirrors reviewOutcomeTransition.ts exactly.
  if p_result = 'skipped' then
    v_new_state := v_row.word_state;
    v_new_streak := v_row.correct_streak;
  elsif p_result = 'incorrect' then
    v_new_state := case v_row.word_state
      when 'seen' then 'seen'
      when 'learning' then 'seen'
      when 'familiar' then 'learning'
      when 'strong' then 'familiar'
      when 'mastered' then 'strong'
      else v_row.word_state
    end;
    v_new_streak := 0;
    v_demoted := v_new_state <> v_row.word_state;
  else -- 'correct'
    if v_row.word_state = 'mastered' then
      v_new_state := 'mastered';
      v_new_streak := 0;
    else
      v_new_streak := v_row.correct_streak + 1;
      case v_row.word_state
        when 'seen' then
          if v_new_streak >= 1 then
            v_new_state := 'learning'; v_promoted := true; v_new_streak := 0;
          else
            v_new_state := 'seen';
          end if;
        when 'learning' then
          if v_new_streak >= 2 then
            v_new_state := 'familiar'; v_promoted := true; v_new_streak := 0;
          else
            v_new_state := 'learning';
          end if;
        when 'familiar' then
          if v_new_streak >= 3 then
            v_new_state := 'strong'; v_promoted := true; v_new_streak := 0;
          else
            v_new_state := 'familiar';
          end if;
        when 'strong' then
          if v_new_streak >= 4 then
            v_new_state := 'mastered'; v_promoted := true; v_new_streak := 0;
          else
            v_new_state := 'strong';
          end if;
        else
          v_new_state := v_row.word_state;
      end case;
    end if;
  end if;

  -- Deadline: base interval for the RESULTING state, +/-10% jitter,
  -- computed once here from the database's own clock. Matches
  -- src/data/learning/wordReviewSchedule.ts's BASE_REVIEW_INTERVAL_MS_BY_STATE.
  v_base_interval_days := case v_new_state
    when 'seen' then 1
    when 'learning' then 3
    when 'familiar' then 10
    when 'strong' then 45
    when 'mastered' then 180
    else 1
  end;
  v_jitter_factor := 0.9 + random() * 0.2;
  v_next_review_at := v_completed_at + (interval '1 day' * v_base_interval_days * v_jitter_factor);

  update public.user_word_progress
     set word_state = v_new_state,
         correct_streak = v_new_streak,
         last_practiced_at = v_completed_at,
         next_review_at = v_next_review_at
   where id = p_word_progress_id;

  insert into public.review_events (
    event_id, user_id, word_progress_id, target_language, result,
    previous_state, new_state, previous_correct_streak, new_correct_streak,
    promoted, demoted, last_practiced_at, next_review_at
  ) values (
    p_event_id, v_user_id, p_word_progress_id, v_row.target_language, p_result,
    v_row.word_state, v_new_state, v_row.correct_streak, v_new_streak,
    v_promoted, v_demoted, v_completed_at, v_next_review_at
  );

  insert into public.user_daily_stats (
    user_id, target_language, stat_date, new_words_completed, reviews_completed, study_time_seconds
  )
  values (v_user_id, v_row.target_language, p_stat_date, 0, 1, 0)
  on conflict (user_id, target_language, stat_date)
  do update set reviews_completed = public.user_daily_stats.reviews_completed + 1;

  select uds.reviews_completed into v_reviews_completed_today
    from public.user_daily_stats uds
   where uds.user_id = v_user_id
     and uds.target_language = v_row.target_language
     and uds.stat_date = p_stat_date;

  return query select
    false,
    v_row.word_state, v_new_state,
    v_row.correct_streak, v_new_streak,
    v_promoted, v_demoted, p_result,
    coalesce(v_reviews_completed_today, 0),
    v_completed_at, v_next_review_at;
end;
$function$;

-- [CATALOG-CONFIRMED], Phase 3 — literal, exact-signature EXECUTE grants.
grant execute on function public.complete_word_review(uuid, uuid, text, date) to postgres;
grant execute on function public.complete_word_review(uuid, uuid, text, date) to anon;
grant execute on function public.complete_word_review(uuid, uuid, text, date) to authenticated;
grant execute on function public.complete_word_review(uuid, uuid, text, date) to service_role;


-- ----------------------------------------------------------------------------
-- INDEXES AND TRIGGERS
-- ----------------------------------------------------------------------------
-- [CATALOG-CONFIRMED], Phase 3: every index on these four tables is
-- constraint-backed (created implicitly by the PRIMARY KEY/UNIQUE
-- constraint clauses above) — zero standalone indexes exist, so none are
-- declared separately here.
-- [CATALOG-CONFIRMED], Phase 3: zero triggers exist on any of these four
-- tables (confirmed via an explicit, non-empty-checked query — this is a
-- verified "none", not an unchecked gap).


-- ============================================================================
-- PROPOSED NEXT MIGRATIONS (do not implement here — listed for context only)
-- ============================================================================
--   1. Restrict direct `authenticated`/`anon` writes to user_word_progress
--      and user_daily_stats (revoke INSERT/UPDATE/DELETE/TRUNCATE/
--      REFERENCES/TRIGGER/MAINTAIN — none of which the application actually
--      uses directly; keep ownership-scoped SELECT only). Route all
--      mutations through the RPCs above.
--   2. Preserve favorite-toggling through either a verified-clean
--      column-level UPDATE (is_favorite) grant, or — preferred — a new
--      narrow set_word_favorite-style RPC alongside the two above.
--   3. Revoke the same excessive grant set from review_events for
--      anon/authenticated — RLS already fully blocks them, but the grant
--      layer should not rely on RLS being the only backstop.
--   4. Add missing non-negative CHECK constraints (user_word_progress.
--      correct_streak; user_daily_stats.new_words_completed /
--      reviews_completed / study_time_seconds).
--   5. Revoke anon's EXECUTE grant on both complete_new_word_study and
--      complete_word_review (authenticated-only is sufficient; both already
--      reject unauthenticated callers internally — this closes the
--      unnecessary privilege layer in front of that check).
--   6. Resolve review_events.word_progress_id's ON DELETE behavior and add
--      a foreign key on review_events.user_id — AFTER a product decision on
--      whether review history should survive its parent progress row being
--      deleted.
--   7. Investigate whether user_profiles' NOT-NULL-no-default columns
--      (nickname, native_language, learning_language, current_level,
--      user_age, birth_month, birth_day, last_active_at) can actually
--      receive a null write from the frontend's own upsert path in
--      practice, given the frontend's own TypeScript models several of
--      these as nullable. Trace src/app/hooks/useAccountOnboarding.ts and
--      confirm whether the first-ever profile write always populates all
--      of these, or whether a partial/early save is reachable.
--   8. Determine what (if anything) still depends on user_profiles.
--      is_new_user — it is not read or written anywhere in the frontend
--      code reviewed in this audit.
-- ============================================================================
