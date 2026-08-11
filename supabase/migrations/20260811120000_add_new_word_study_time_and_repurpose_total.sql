-- ============================================================================
-- STUDY ACTIVITY PHASE 1 — new_word_study_time_seconds + study_time_seconds
-- repurposed as the true per-day total
-- ============================================================================
--
-- BACKGROUND — corrective migration 5
-- (20260805190000_add_learning_mode_time_tracking.sql) gave
-- public.user_daily_stats three active-time columns intended as one column
-- per learning mode: study_time_seconds, review_time_seconds,
-- custom_practice_time_seconds. In practice study_time_seconds has NEVER
-- been a total — since the very first baseline migration
-- (20260804192152_baseline_existing_learning_system_schema.sql) it has been
-- written by exactly one RPC, complete_new_word_study, alongside
-- new_words_completed, i.e. it has only ever meant "Study New Words active
-- time." review_time_seconds/custom_practice_time_seconds are correctly
-- mode-specific (each written by exactly one RPC). No column has ever held
-- a genuine per-day total.
--
-- The Dashboard's "Study Activity" card needs to report total active
-- learning time plus its three-way breakdown, with the total maintained
-- atomically server-side (never client-computed) per this repo's existing
-- authoritative-write posture. This migration:
--   1. Adds a new mode-specific column, new_word_study_time_seconds, to
--      hold what study_time_seconds has always actually meant.
--   2. One-time backfills every existing row: copies its current
--      study_time_seconds value into the new column (a truthful,
--      exact reclassification — not a fabrication, since that value has
--      only ever come from complete_new_word_study), then turns
--      study_time_seconds itself into the true total by adding
--      review_time_seconds + custom_practice_time_seconds to it in the
--      same statement.
--   3. Redefines the three active learning RPCs (complete_new_word_study,
--      complete_word_review, complete_custom_practice_word) — SAME
--      signatures as their current (20260806190000) versions, so grants are
--      preserved automatically by CREATE OR REPLACE and the frontend needs
--      no changes at all — so each one increments its own mode column AND
--      study_time_seconds (the total) atomically, in the same upsert.
--
-- INVARIANT — going forward:
--   study_time_seconds = new_word_study_time_seconds + review_time_seconds
--                         + custom_practice_time_seconds
-- maintained entirely server-side; no client ever computes or sends a total.
--
-- LEGACY DATA — every existing row already has full per-mode fidelity
-- (mode-tracking has been the only write path since 20260805190000
-- shipped), so no "Uncategorized" bucket is fabricated or needed anywhere:
-- the backfill below is an exact reclassification, not a guess.
--
-- BACKFILL RE-RUN NOTE — the backfill UPDATE is a one-time data migration,
-- not idempotent DDL. It is guarded with
-- `where new_word_study_time_seconds = 0` as a best-effort safety net (this
-- correctly no-ops a second run for any row that had nonzero legacy
-- study_time_seconds), but — like every other migration file in this
-- repository — it is written to run exactly once, as the Supabase
-- migration runner guarantees; it must not be manually re-executed against
-- an already-migrated database.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. New mode-specific column: new_word_study_time_seconds
-- ----------------------------------------------------------------------------
alter table public.user_daily_stats
  add column if not exists new_word_study_time_seconds integer not null default 0;

do $$
declare
  v_existing_def text;
  v_expected_def constant text := 'CHECK ((new_word_study_time_seconds >= 0))';
begin
  select pg_get_constraintdef(c.oid)
    into v_existing_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'user_daily_stats'
     and c.conname = 'user_daily_stats_new_word_study_time_seconds_non_negative';

  if v_existing_def is null then
    alter table public.user_daily_stats
      add constraint user_daily_stats_new_word_study_time_seconds_non_negative
      check (new_word_study_time_seconds >= 0);
  elsif v_existing_def <> v_expected_def then
    raise exception
      'user_daily_stats_new_word_study_time_seconds_non_negative already exists with an unexpected definition (%), expected (%) — refusing to proceed silently',
      v_existing_def, v_expected_def;
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 2. One-time backfill: reclassify existing rows, turn study_time_seconds
--    into the true total
-- ----------------------------------------------------------------------------
-- Both assignments read study_time_seconds/review_time_seconds/
-- custom_practice_time_seconds as they stood BEFORE this statement (Postgres
-- evaluates every SET expression in an UPDATE against the row's pre-update
-- values), so this is safe as a single statement: new_word_study_time_seconds
-- receives the old (pre-migration) study_time_seconds value exactly, and the
-- new study_time_seconds is computed from the same old value plus the other
-- two columns' current values — never from its own just-written result.
update public.user_daily_stats
   set new_word_study_time_seconds = study_time_seconds,
       study_time_seconds = study_time_seconds + review_time_seconds + custom_practice_time_seconds
 where new_word_study_time_seconds = 0;


-- ----------------------------------------------------------------------------
-- 3. CREATE OR REPLACE the three active learning RPCs — identical
--    signatures to 20260806190000, only the user_daily_stats column lists
--    change
-- ----------------------------------------------------------------------------
-- Every other line (authentication, ownership, validation, server-derived
-- stat_date, jitter/deadline math, promotion/demotion, idempotency,
-- concurrency handling, daily_goal stamping) is copied byte-identical from
-- 20260806190000_add_daily_goal_snapshot_and_update_rpc.sql. No grant/revoke
-- statements here: CREATE OR REPLACE with an identical signature preserves
-- the existing grants.

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

    -- Study Activity Phase 1: new_word_study_time_seconds is the
    -- mode-specific column (what study_time_seconds used to mean, exactly);
    -- study_time_seconds is now the per-day total and receives the same
    -- p_study_time_seconds contribution — this RPC's contribution to the
    -- total equals its own mode's time, same as before this migration, so
    -- the increment on study_time_seconds itself is unchanged. Both columns
    -- are only ever touched inside this same `if v_inserted` branch, so a
    -- retry that finds the row already present increments neither.
    insert into public.user_daily_stats (
      user_id,
      target_language,
      stat_date,
      new_words_completed,
      reviews_completed,
      study_time_seconds,
      new_word_study_time_seconds,
      daily_goal
    )
    values (
      v_user_id,
      btrim(p_target_language),
      v_stat_date,
      1,
      0,
      p_study_time_seconds,
      p_study_time_seconds,
      v_daily_goal
    )
    on conflict on constraint user_daily_stats_language_date_unique
    do update
      set new_words_completed =
            public.user_daily_stats.new_words_completed + 1,
          study_time_seconds =
            public.user_daily_stats.study_time_seconds + p_study_time_seconds,
          new_word_study_time_seconds =
            public.user_daily_stats.new_word_study_time_seconds + p_study_time_seconds;
      -- daily_goal is deliberately absent from this SET list: once a row
      -- exists, only update_daily_goal may change its stored goal, and only
      -- for today's row.
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

  -- Study Activity Phase 1: study_time_seconds is now the per-day total —
  -- this RPC's own review_time_seconds contribution is also added to it, on
  -- both the INSERT branch (was hardcoded 0 before this migration) and the
  -- ON CONFLICT UPDATE branch (new SET clause below).
  insert into public.user_daily_stats (
    user_id, target_language, stat_date, new_words_completed, reviews_completed,
    study_time_seconds, review_time_seconds, daily_goal
  )
  values (v_user_id, v_row.target_language, v_stat_date, 0, 1, p_review_time_seconds, p_review_time_seconds, v_daily_goal)
  on conflict on constraint user_daily_stats_language_date_unique
  do update set
    reviews_completed = public.user_daily_stats.reviews_completed + 1,
    review_time_seconds = public.user_daily_stats.review_time_seconds + p_review_time_seconds,
    study_time_seconds = public.user_daily_stats.study_time_seconds + p_review_time_seconds;
    -- daily_goal is deliberately absent from this SET list — see
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

      -- Study Activity Phase 1: study_time_seconds is now the per-day total
      -- — this RPC's own custom_practice_time_seconds contribution is also
      -- added to it, on both the INSERT branch (was hardcoded 0 before this
      -- migration) and the ON CONFLICT UPDATE branch (new SET clause below).
      insert into public.user_daily_stats (
        user_id, target_language, stat_date, new_words_completed, reviews_completed,
        study_time_seconds, review_time_seconds, custom_practice_time_seconds, daily_goal
      )
      values (
        v_user_id, btrim(p_target_language), v_stat_date, 0, 0,
        p_custom_practice_time_seconds, 0, p_custom_practice_time_seconds, v_daily_goal
      )
      on conflict on constraint user_daily_stats_language_date_unique
      do update
        set custom_practice_time_seconds =
              public.user_daily_stats.custom_practice_time_seconds + p_custom_practice_time_seconds,
            study_time_seconds =
              public.user_daily_stats.study_time_seconds + p_custom_practice_time_seconds;
        -- daily_goal is deliberately absent from this SET list — see
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


-- ============================================================================
-- POST-MIGRATION STATE (this migration's objects only)
-- ============================================================================
--   user_daily_stats.new_word_study_time_seconds  integer not null default 0
--     CHECK (>= 0). Holds exactly what study_time_seconds used to mean.
--   user_daily_stats.study_time_seconds  — repurposed: now the per-day
--     total across all three modes, backfilled once for every existing row,
--     maintained atomically by all three RPCs going forward. Its own CHECK
--     (>= 0, from corrective migration 2) still applies and is untouched.
--
--   complete_new_word_study(text, text, integer)         — same signature,
--     now also increments new_word_study_time_seconds.
--   complete_word_review(uuid, uuid, text, integer)       — same signature,
--     now also increments study_time_seconds (total).
--   complete_custom_practice_word(uuid, text, integer)    — same signature,
--     now also increments study_time_seconds (total).
--   All three: grants unchanged (CREATE OR REPLACE, identical signatures).
--
-- Untouched: user_word_progress, user_profiles, review_events,
-- custom_practice_events, update_daily_goal, every RLS policy, every prior
-- migration file, all state-transition/promotion/demotion/streak/deadline/
-- idempotency/concurrency logic (byte-identical to 20260806190000
-- wherever it appears above).
-- ============================================================================
