-- ============================================================================
-- STREAK PHASE 1 - historical daily-goal snapshots
-- ============================================================================
--
-- Fixes the historical streak-accuracy bug: the pure streak computation
-- (src/data/learning/dailyStreak.ts, computeDailyStreakSummary) has always
-- compared every user_daily_stats row - today's and every past day's alike
-- - against the CURRENT public.user_profiles.daily_goal. Raising or
-- lowering today's goal therefore silently changed whether past days
-- counted as "complete," even though nothing in the database itself ever
-- changed for those rows.
--
-- This migration adds a per-row daily-goal snapshot so a day's stats row
-- can, going forward, remember the goal that was actually active when it
-- was created, plus a narrow RPC that keeps *today's* snapshot (and only
-- today's) in sync when the profile goal changes. Historical rows are never
-- rewritten - see "Existing rows" below.
--
-- Scope, in order:
--   A. public.user_daily_stats.daily_goal - nullable per-row snapshot.
--   B. public.user_profiles.daily_goal - a CHECK restricting it to exactly
--      the five supported presets (10, 15, 20, 30, 50), guarded by an
--      explicit precondition check so this migration can never silently
--      normalize or overwrite an existing value outside that set.
--   C. CREATE OR REPLACE of the three active learning RPCs
--      (complete_new_word_study, complete_word_review,
--      complete_custom_practice_word) - their INSERT branches now stamp
--      daily_goal from the caller's current profile; their existing
--      ON CONFLICT DO UPDATE branches are otherwise untouched and still do
--      not modify daily_goal.
--   D. A new narrow RPC, update_daily_goal(integer) - the only path that
--      may change daily_goal after a row already exists, and only for the
--      caller's own today row(s).
--
-- Streak product rule is unchanged by this migration: a day is complete
-- when new_words_completed >= the applicable daily goal, and Reviews /
-- Custom Practice still never complete a streak day on their own (they may
-- create today's row and stamp its goal, exactly like Study, but only
-- Study's new_words_completed ever feeds the streak comparison - see
-- src/data/learning/dailyStreak.ts).
--
-- Existing rows: every user_daily_stats row that exists before this
-- migration keeps daily_goal = NULL. Nothing here backfills, infers, or
-- otherwise rewrites a historical row - see supabase/README.md's "Streak
-- Phase 1" section and src/data/learning/dailyStreak.ts for the read-side
-- fallback (row.dailyGoal ?? current profile daily_goal) that keeps those
-- legacy rows behaving exactly as they did before this migration.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. user_daily_stats.daily_goal - per-row snapshot
-- ----------------------------------------------------------------------------
-- No default, no backfill: every row that exists today keeps daily_goal
-- null. Only the three learning RPCs' INSERT branches (section C below) and
-- update_daily_goal (section D) ever write a value into this column.
alter table public.user_daily_stats
  add column if not exists daily_goal integer null;

alter table public.user_daily_stats
  add constraint user_daily_stats_daily_goal_allowed_values_check
  check (daily_goal is null or daily_goal in (10, 15, 20, 30, 50));


-- ----------------------------------------------------------------------------
-- B. user_profiles.daily_goal - exact-preset CHECK, precondition-guarded
-- ----------------------------------------------------------------------------
-- user_profiles.daily_goal has been `not null` with no range constraint
-- since the baseline schema
-- (20260804192152_baseline_existing_learning_system_schema.sql:93). The only
-- supported daily-goal values are the five presets DailyGoalSelector has
-- ever offered - 10, 15, 20, 30, 50 - not an arbitrary range, but nothing at
-- the database layer has ever enforced that. Before adding a CHECK that
-- could otherwise fail this migration with a generic constraint-violation
-- error (or invite a future author to "fix" it by silently normalizing the
-- offending rows), raise one explicit, named exception up front if any
-- existing profile already holds a value outside that exact set. This
-- migration never rewrites a user_profiles row itself either way.
do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from public.user_profiles
   where daily_goal not in (10, 15, 20, 30, 50);

  if v_invalid_count > 0 then
    raise exception
      'add_daily_goal_snapshot_and_update_rpc: % existing user_profiles.daily_goal row(s) hold a value outside the supported preset set (10, 15, 20, 30, 50); migration aborted without modifying any data. Resolve the unsupported value(s) before re-running this migration.',
      v_invalid_count
      using errcode = '23514';
  end if;
end;
$$;

alter table public.user_profiles
  add constraint user_profiles_daily_goal_allowed_values_check
  check (daily_goal in (10, 15, 20, 30, 50));


-- ----------------------------------------------------------------------------
-- C. CREATE OR REPLACE the three active learning RPCs
-- ----------------------------------------------------------------------------
-- Bodies are otherwise identical to the versions created in
-- 20260806170000_fix_learning_rpc_daily_stats_conflict_targets.sql -
-- authentication, ownership, validation, server-derived stat_date, timing,
-- counters, state transitions, deadlines, idempotency, concurrency
-- behavior, original event-date replay, SECURITY DEFINER, empty
-- search_path, and the named-constraint ON CONFLICT target are all
-- unchanged. Only the daily_goal stamping (INSERT branches only) is new.
-- No grant/revoke statements here: CREATE OR REPLACE with an identical
-- signature preserves the existing grants from 20260806150000.

create or replace function public.complete_new_word_study(
  p_word_id text,
  p_target_language text,
  p_study_time_seconds integer
)
 returns table(inserted boolean, already_completed boolean, new_words_completed_today integer, stat_date date)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz := now();
  v_stat_date date;
  v_row_count integer;
  v_inserted boolean := false;
  v_jitter_factor numeric;
  v_next_review_at timestamptz;
  v_new_count integer;
  v_original_stat_date date;
  v_daily_goal integer;
begin
  if v_user_id is null then
    raise exception
      'complete_new_word_study: authentication required'
      using errcode = '28000';
  end if;

  v_stat_date := public.resolve_authenticated_learning_date();

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

  if p_study_time_seconds is null then
    raise exception
      'complete_new_word_study: p_study_time_seconds is required'
      using errcode = '22023';
  end if;

  if p_study_time_seconds < 0 or p_study_time_seconds > 300 then
    raise exception
      'complete_new_word_study: p_study_time_seconds must be between 0 and 300'
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
    next_review_at,
    first_studied_stat_date
  )
  values (
    v_user_id,
    btrim(p_word_id),
    btrim(p_target_language),
    'seen',
    false,
    0,
    v_completed_at,
    v_next_review_at,
    v_stat_date
  )
  on conflict (user_id, word_id, target_language)
  do nothing;

  get diagnostics v_row_count = row_count;
  v_inserted := v_row_count > 0;

  if v_inserted then
    v_original_stat_date := v_stat_date;

    -- Streak Phase 1: stamp the goal active right now onto this brand-new
    -- row. A missing profile row falls back to the frontend's own
    -- DEFAULT_DAILY_GOAL (15, see src/lib/userProfile.ts) rather than
    -- leaving daily_goal null on a row being freshly created - null stays
    -- reserved for genuinely historical, pre-Streak-Phase-1 rows.
    v_daily_goal := coalesce(
      (
        select up.daily_goal
          from public.user_profiles as up
         where up.id = v_user_id
      ),
      15
    );

    if v_daily_goal not in (10, 15, 20, 30, 50) then
      raise exception
        'complete_new_word_study: resolved daily_goal must be one of 10, 15, 20, 30, 50'
        using errcode = '22023';
    end if;

    insert into public.user_daily_stats (
      user_id,
      target_language,
      stat_date,
      new_words_completed,
      reviews_completed,
      study_time_seconds,
      daily_goal
    )
    values (
      v_user_id,
      btrim(p_target_language),
      v_stat_date,
      1,
      0,
      p_study_time_seconds,
      v_daily_goal
    )
    on conflict on constraint user_daily_stats_language_date_unique
    do update
      set new_words_completed =
            public.user_daily_stats.new_words_completed + 1,
          study_time_seconds =
            public.user_daily_stats.study_time_seconds + p_study_time_seconds;
      -- daily_goal is deliberately absent from this SET list: once a row
      -- exists, only update_daily_goal (section D below) may change its
      -- stored goal, and only for today's row.
  else
    select uwp.first_studied_stat_date
      into v_original_stat_date
      from public.user_word_progress as uwp
     where uwp.user_id = v_user_id
       and uwp.word_id = btrim(p_word_id)
       and uwp.target_language = btrim(p_target_language);
  end if;

  if v_original_stat_date is not null then
    select uds.new_words_completed
      into v_new_count
      from public.user_daily_stats as uds
     where uds.user_id = v_user_id
       and uds.target_language = btrim(p_target_language)
       and uds.stat_date = v_original_stat_date;
  end if;

  return query
  select
    v_inserted,
    not v_inserted,
    coalesce(v_new_count, 0),
    v_original_stat_date;
end;
$function$;


create or replace function public.complete_word_review(
  p_event_id uuid,
  p_word_progress_id uuid,
  p_result text,
  p_review_time_seconds integer
)
 returns table(already_processed boolean, previous_state text, new_state text, previous_correct_streak integer, new_correct_streak integer, promoted boolean, demoted boolean, result text, reviews_completed_today integer, last_practiced_at timestamp with time zone, next_review_at timestamp with time zone, stat_date date)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz := now();
  v_stat_date date;
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
  v_insert_row_count integer;
  v_daily_goal integer;
begin
  if v_user_id is null then
    raise exception 'complete_word_review: authentication required' using errcode = '28000';
  end if;

  v_stat_date := public.resolve_authenticated_learning_date();

  if p_event_id is null then
    raise exception 'complete_word_review: p_event_id is required' using errcode = '22023';
  end if;
  if p_word_progress_id is null then
    raise exception 'complete_word_review: p_word_progress_id is required' using errcode = '22023';
  end if;
  if p_result is null or p_result not in ('correct', 'incorrect', 'skipped') then
    raise exception 'complete_word_review: p_result must be correct/incorrect/skipped' using errcode = '22023';
  end if;
  if p_review_time_seconds is null then
    raise exception 'complete_word_review: p_review_time_seconds is required' using errcode = '22023';
  end if;
  if p_review_time_seconds < 0 or p_review_time_seconds > 300 then
    raise exception 'complete_word_review: p_review_time_seconds must be between 0 and 300' using errcode = '22023';
  end if;

  select * into v_existing from public.review_events
   where event_id = p_event_id and user_id = v_user_id;

  if found then
    if v_existing.stat_date is not null then
      select uds.reviews_completed into v_reviews_completed_today
        from public.user_daily_stats uds
       where uds.user_id = v_user_id
         and uds.target_language = v_existing.target_language
         and uds.stat_date = v_existing.stat_date;
    end if;

    return query select
      true,
      v_existing.previous_state, v_existing.new_state,
      v_existing.previous_correct_streak, v_existing.new_correct_streak,
      v_existing.promoted, v_existing.demoted, v_existing.result,
      coalesce(v_reviews_completed_today, 0),
      v_existing.last_practiced_at, v_existing.next_review_at,
      v_existing.stat_date;
    return;
  end if;

  select * into v_row from public.user_word_progress
   where id = p_word_progress_id and user_id = v_user_id
   for update;

  if not found then
    raise exception 'complete_word_review: word progress row not found or not owned by caller' using errcode = '42501';
  end if;

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
  else
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

  insert into public.review_events (
    event_id, user_id, word_progress_id, target_language, result,
    previous_state, new_state, previous_correct_streak, new_correct_streak,
    promoted, demoted, last_practiced_at, next_review_at, stat_date
  ) values (
    p_event_id, v_user_id, p_word_progress_id, v_row.target_language, p_result,
    v_row.word_state, v_new_state, v_row.correct_streak, v_new_streak,
    v_promoted, v_demoted, v_completed_at, v_next_review_at, v_stat_date
  )
  on conflict (event_id) do nothing;

  get diagnostics v_insert_row_count = row_count;

  if v_insert_row_count = 0 then
    select * into v_existing from public.review_events
     where event_id = p_event_id and user_id = v_user_id;

    if v_existing.stat_date is not null then
      select uds.reviews_completed into v_reviews_completed_today
        from public.user_daily_stats uds
       where uds.user_id = v_user_id
         and uds.target_language = v_existing.target_language
         and uds.stat_date = v_existing.stat_date;
    end if;

    return query select
      true,
      v_existing.previous_state, v_existing.new_state,
      v_existing.previous_correct_streak, v_existing.new_correct_streak,
      v_existing.promoted, v_existing.demoted, v_existing.result,
      coalesce(v_reviews_completed_today, 0),
      v_existing.last_practiced_at, v_existing.next_review_at,
      v_existing.stat_date;
    return;
  end if;

  update public.user_word_progress
     set word_state = v_new_state,
         correct_streak = v_new_streak,
         last_practiced_at = v_completed_at,
         next_review_at = v_next_review_at
   where id = p_word_progress_id;

  -- Streak Phase 1: stamp the goal active right now if this call creates
  -- today's row. Reviews still never complete a streak day on their own
  -- (see src/data/learning/dailyStreak.ts) - this only ensures the row
  -- carries a correct goal snapshot if Review happens to be the first
  -- activity that creates it for the day.
  v_daily_goal := coalesce(
    (
      select up.daily_goal
        from public.user_profiles as up
       where up.id = v_user_id
    ),
    15
  );

  if v_daily_goal not in (10, 15, 20, 30, 50) then
    raise exception
      'complete_word_review: resolved daily_goal must be one of 10, 15, 20, 30, 50'
      using errcode = '22023';
  end if;

  insert into public.user_daily_stats (
    user_id, target_language, stat_date, new_words_completed, reviews_completed,
    study_time_seconds, review_time_seconds, daily_goal
  )
  values (v_user_id, v_row.target_language, v_stat_date, 0, 1, 0, p_review_time_seconds, v_daily_goal)
  on conflict on constraint user_daily_stats_language_date_unique
  do update set
    reviews_completed = public.user_daily_stats.reviews_completed + 1,
    review_time_seconds = public.user_daily_stats.review_time_seconds + p_review_time_seconds;
    -- daily_goal is deliberately absent from this SET list - see
    -- complete_new_word_study's identical comment above.

  select uds.reviews_completed into v_reviews_completed_today
    from public.user_daily_stats uds
   where uds.user_id = v_user_id
     and uds.target_language = v_row.target_language
     and uds.stat_date = v_stat_date;

  return query select
    false,
    v_row.word_state, v_new_state,
    v_row.correct_streak, v_new_streak,
    v_promoted, v_demoted, p_result,
    coalesce(v_reviews_completed_today, 0),
    v_completed_at, v_next_review_at,
    v_stat_date;
end;
$function$;


create or replace function public.complete_custom_practice_word(
  p_event_id uuid,
  p_target_language text,
  p_custom_practice_time_seconds integer
)
 returns table(already_processed boolean, custom_practice_time_seconds_today integer, stat_date date)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_stat_date date;
  v_existing public.custom_practice_events%rowtype;
  v_row_count integer;
  v_inserted boolean := false;
  v_time_today integer;
  v_original_stat_date date;
  v_original_target_language text;
  v_daily_goal integer;
begin
  if v_user_id is null then
    raise exception
      'complete_custom_practice_word: authentication required'
      using errcode = '28000';
  end if;

  v_stat_date := public.resolve_authenticated_learning_date();

  if p_event_id is null then
    raise exception
      'complete_custom_practice_word: p_event_id is required'
      using errcode = '22023';
  end if;

  if p_target_language is null or length(btrim(p_target_language)) = 0 then
    raise exception
      'complete_custom_practice_word: p_target_language is required'
      using errcode = '22023';
  end if;

  if p_custom_practice_time_seconds is null then
    raise exception
      'complete_custom_practice_word: p_custom_practice_time_seconds is required'
      using errcode = '22023';
  end if;

  if p_custom_practice_time_seconds < 0 or p_custom_practice_time_seconds > 300 then
    raise exception
      'complete_custom_practice_word: p_custom_practice_time_seconds must be between 0 and 300'
      using errcode = '22023';
  end if;

  select * into v_existing from public.custom_practice_events
   where event_id = p_event_id and user_id = v_user_id;

  if found then
    v_original_stat_date := v_existing.stat_date;
    v_original_target_language := v_existing.target_language;
  else
    insert into public.custom_practice_events (
      event_id, user_id, target_language, custom_practice_time_seconds, stat_date
    )
    values (
      p_event_id, v_user_id, btrim(p_target_language), p_custom_practice_time_seconds, v_stat_date
    )
    on conflict (event_id) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted := v_row_count > 0;

    if v_inserted then
      v_original_stat_date := v_stat_date;
      v_original_target_language := btrim(p_target_language);

      -- Streak Phase 1: stamp the goal active right now if this call
      -- creates today's row. Custom Practice still never completes a
      -- streak day on its own (see src/data/learning/dailyStreak.ts) -
      -- this only ensures the row carries a correct goal snapshot if
      -- Custom Practice happens to be the first activity that creates it.
      v_daily_goal := coalesce(
        (
          select up.daily_goal
            from public.user_profiles as up
           where up.id = v_user_id
        ),
        15
      );

      if v_daily_goal not in (10, 15, 20, 30, 50) then
        raise exception
          'complete_custom_practice_word: resolved daily_goal must be one of 10, 15, 20, 30, 50'
          using errcode = '22023';
      end if;

      insert into public.user_daily_stats (
        user_id, target_language, stat_date, new_words_completed, reviews_completed,
        study_time_seconds, review_time_seconds, custom_practice_time_seconds, daily_goal
      )
      values (
        v_user_id, btrim(p_target_language), v_stat_date, 0, 0, 0, 0, p_custom_practice_time_seconds, v_daily_goal
      )
      on conflict on constraint user_daily_stats_language_date_unique
      do update
        set custom_practice_time_seconds =
          public.user_daily_stats.custom_practice_time_seconds + p_custom_practice_time_seconds;
        -- daily_goal is deliberately absent from this SET list - see
        -- complete_new_word_study's identical comment above.
    else
      select * into v_existing from public.custom_practice_events
       where event_id = p_event_id and user_id = v_user_id;
      v_original_stat_date := v_existing.stat_date;
      v_original_target_language := v_existing.target_language;
    end if;
  end if;

  if v_original_stat_date is not null then
    select uds.custom_practice_time_seconds
      into v_time_today
      from public.user_daily_stats as uds
     where uds.user_id = v_user_id
       and uds.target_language = v_original_target_language
       and uds.stat_date = v_original_stat_date;
  end if;

  return query
  select
    not v_inserted,
    coalesce(v_time_today, 0),
    v_original_stat_date;
end;
$function$;


-- ----------------------------------------------------------------------------
-- D. update_daily_goal(integer) - narrow goal-update RPC
-- ----------------------------------------------------------------------------
-- The only path (besides the row-creation stamping in section C) that may
-- ever change daily_goal after a row already exists, and only for the
-- caller's own today row(s) - across every target_language, since
-- daily_goal is a single profile-wide setting, never per-language. There is
-- no stat_date filter here other than "= this call's own server-derived
-- today," so no historical row can ever be reached by this function.
--
-- Every column reference below is qualified with a table alias (up./uds.)
-- specifically because this function's own RETURNS TABLE introduces
-- PL/pgSQL variables named daily_goal and stat_date - the same
-- variable-vs-column ambiguity class that
-- 20260806170000_fix_learning_rpc_daily_stats_conflict_targets.sql had to
-- correct for its ON CONFLICT target lists.
create or replace function public.update_daily_goal(
  p_daily_goal integer
)
 returns table(daily_goal integer, stat_date date, updated_daily_stats_rows integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_stat_date date;
  v_row_count integer;
  v_profile_exists boolean;
begin
  if v_user_id is null then
    raise exception
      'update_daily_goal: authentication required'
      using errcode = '28000';
  end if;

  if p_daily_goal is null then
    raise exception
      'update_daily_goal: p_daily_goal is required'
      using errcode = '22023';
  end if;

  if p_daily_goal not in (10, 15, 20, 30, 50) then
    raise exception
      'update_daily_goal: p_daily_goal must be one of 10, 15, 20, 30, 50'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_profiles as up where up.id = v_user_id
  )
    into v_profile_exists;

  if not v_profile_exists then
    raise exception
      'update_daily_goal: no user_profiles row exists for the authenticated caller'
      using errcode = 'P0002';
  end if;

  -- Resolved once, before either write, so the profile update and the
  -- today-row sync below act on exactly the same server-derived date - no
  -- window where a midnight rollover between the two statements could
  -- apply the new goal to two different dates.
  v_stat_date := public.resolve_authenticated_learning_date();

  update public.user_profiles as up
     set daily_goal = p_daily_goal,
         updated_at = now()
   where up.id = v_user_id;

  -- Today only, every target_language row the caller owns for that date -
  -- previous dates are never matched by this WHERE clause, and no row is
  -- ever created here (a plain UPDATE, never an upsert).
  update public.user_daily_stats as uds
     set daily_goal = p_daily_goal
   where uds.user_id = v_user_id
     and uds.stat_date = v_stat_date;

  get diagnostics v_row_count = row_count;

  return query
  select p_daily_goal, v_stat_date, v_row_count;
end;
$function$;

revoke execute on function public.update_daily_goal(integer) from public;
revoke execute on function public.update_daily_goal(integer) from anon;
grant execute on function public.update_daily_goal(integer) to postgres;
grant execute on function public.update_daily_goal(integer) to authenticated;
grant execute on function public.update_daily_goal(integer) to service_role;
