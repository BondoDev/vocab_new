-- ============================================================================
-- TIMEZONE PHASE 2 - server-derived learning dates
-- ============================================================================
--
-- Learning daily-stat attribution no longer trusts client-provided
-- p_stat_date. New primary learning RPC signatures derive the caller's
-- learning date from Supabase server time and user_profiles.timezone, with a
-- UTC fallback when the profile row/timezone is missing, blank, or invalid.
--
-- Historical user_daily_stats rows are intentionally unchanged. Existing
-- review/custom-practice ledger rows are not backfilled; their new stat_date
-- columns are nullable for compatibility.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Date-memory columns for idempotent replay.
-- ----------------------------------------------------------------------------
alter table public.user_word_progress
  add column if not exists first_studied_stat_date date null;

alter table public.review_events
  add column if not exists stat_date date null;

alter table public.custom_practice_events
  add column if not exists stat_date date null;


-- ----------------------------------------------------------------------------
-- 2. Private shared date resolver.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_authenticated_learning_date()
returns date
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_resolved_timezone text := 'UTC';
begin
  if v_user_id is null then
    raise exception
      'resolve_authenticated_learning_date: authentication required'
      using errcode = '28000';
  end if;

  select btrim(up.timezone)
    into v_timezone
    from public.user_profiles as up
   where up.id = v_user_id;

  if v_timezone is not null
     and length(v_timezone) > 0
     and exists (
       select 1
         from pg_catalog.pg_timezone_names as tzn
        where tzn.name = v_timezone
     ) then
    v_resolved_timezone := v_timezone;
  end if;

  return (statement_timestamp() at time zone v_resolved_timezone)::date;
end;
$function$;

revoke execute on function public.resolve_authenticated_learning_date() from public;
revoke execute on function public.resolve_authenticated_learning_date() from anon;


-- ----------------------------------------------------------------------------
-- 3. Narrow client-facing current-date RPC.
-- ----------------------------------------------------------------------------
create or replace function public.get_current_learning_date()
returns table(stat_date date)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
  select public.resolve_authenticated_learning_date();
end;
$function$;

revoke execute on function public.get_current_learning_date() from public;
revoke execute on function public.get_current_learning_date() from anon;
grant execute on function public.get_current_learning_date() to postgres;
grant execute on function public.get_current_learning_date() to authenticated;
grant execute on function public.get_current_learning_date() to service_role;


-- ----------------------------------------------------------------------------
-- 4. New primary Study RPC: no client date input.
-- ----------------------------------------------------------------------------
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
      v_stat_date,
      1,
      0,
      p_study_time_seconds
    )
    on conflict (user_id, target_language, stat_date)
    do update
      set new_words_completed =
            public.user_daily_stats.new_words_completed + 1,
          study_time_seconds =
            public.user_daily_stats.study_time_seconds + p_study_time_seconds;
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

revoke execute on function public.complete_new_word_study(text, text, integer) from public;
revoke execute on function public.complete_new_word_study(text, text, integer) from anon;
grant execute on function public.complete_new_word_study(text, text, integer) to postgres;
grant execute on function public.complete_new_word_study(text, text, integer) to authenticated;
grant execute on function public.complete_new_word_study(text, text, integer) to service_role;


-- ----------------------------------------------------------------------------
-- 5. Temporary Study compatibility wrapper. p_stat_date is ignored.
-- ----------------------------------------------------------------------------
create or replace function public.complete_new_word_study(
  p_word_id text,
  p_target_language text,
  p_stat_date date,
  p_study_time_seconds integer
)
 returns table(inserted boolean, already_completed boolean, new_words_completed_today integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  return query
  select r.inserted, r.already_completed, r.new_words_completed_today
    from public.complete_new_word_study(p_word_id, p_target_language, p_study_time_seconds) as r;
end;
$function$;

revoke execute on function public.complete_new_word_study(text, text, date, integer) from public;
revoke execute on function public.complete_new_word_study(text, text, date, integer) from anon;
grant execute on function public.complete_new_word_study(text, text, date, integer) to postgres;
grant execute on function public.complete_new_word_study(text, text, date, integer) to authenticated;
grant execute on function public.complete_new_word_study(text, text, date, integer) to service_role;


-- ----------------------------------------------------------------------------
-- 6. New primary Review RPC: no client date input.
-- ----------------------------------------------------------------------------
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

  insert into public.user_daily_stats (
    user_id, target_language, stat_date, new_words_completed, reviews_completed,
    study_time_seconds, review_time_seconds
  )
  values (v_user_id, v_row.target_language, v_stat_date, 0, 1, 0, p_review_time_seconds)
  on conflict (user_id, target_language, stat_date)
  do update set
    reviews_completed = public.user_daily_stats.reviews_completed + 1,
    review_time_seconds = public.user_daily_stats.review_time_seconds + p_review_time_seconds;

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

revoke execute on function public.complete_word_review(uuid, uuid, text, integer) from public;
revoke execute on function public.complete_word_review(uuid, uuid, text, integer) from anon;
grant execute on function public.complete_word_review(uuid, uuid, text, integer) to postgres;
grant execute on function public.complete_word_review(uuid, uuid, text, integer) to authenticated;
grant execute on function public.complete_word_review(uuid, uuid, text, integer) to service_role;


-- ----------------------------------------------------------------------------
-- 7. Temporary Review compatibility wrapper. p_stat_date is ignored.
-- ----------------------------------------------------------------------------
create or replace function public.complete_word_review(
  p_event_id uuid,
  p_word_progress_id uuid,
  p_result text,
  p_stat_date date,
  p_review_time_seconds integer
)
 returns table(already_processed boolean, previous_state text, new_state text, previous_correct_streak integer, new_correct_streak integer, promoted boolean, demoted boolean, result text, reviews_completed_today integer, last_practiced_at timestamp with time zone, next_review_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  return query
  select
    r.already_processed, r.previous_state, r.new_state,
    r.previous_correct_streak, r.new_correct_streak,
    r.promoted, r.demoted, r.result, r.reviews_completed_today,
    r.last_practiced_at, r.next_review_at
  from public.complete_word_review(p_event_id, p_word_progress_id, p_result, p_review_time_seconds) as r;
end;
$function$;

revoke execute on function public.complete_word_review(uuid, uuid, text, date, integer) from public;
revoke execute on function public.complete_word_review(uuid, uuid, text, date, integer) from anon;
grant execute on function public.complete_word_review(uuid, uuid, text, date, integer) to postgres;
grant execute on function public.complete_word_review(uuid, uuid, text, date, integer) to authenticated;
grant execute on function public.complete_word_review(uuid, uuid, text, date, integer) to service_role;


-- ----------------------------------------------------------------------------
-- 8. New primary Custom Practice RPC: no client date input.
-- ----------------------------------------------------------------------------
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

      insert into public.user_daily_stats (
        user_id, target_language, stat_date, new_words_completed, reviews_completed,
        study_time_seconds, review_time_seconds, custom_practice_time_seconds
      )
      values (
        v_user_id, btrim(p_target_language), v_stat_date, 0, 0, 0, 0, p_custom_practice_time_seconds
      )
      on conflict (user_id, target_language, stat_date)
      do update
        set custom_practice_time_seconds =
          public.user_daily_stats.custom_practice_time_seconds + p_custom_practice_time_seconds;
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

revoke execute on function public.complete_custom_practice_word(uuid, text, integer) from public;
revoke execute on function public.complete_custom_practice_word(uuid, text, integer) from anon;
grant execute on function public.complete_custom_practice_word(uuid, text, integer) to postgres;
grant execute on function public.complete_custom_practice_word(uuid, text, integer) to authenticated;
grant execute on function public.complete_custom_practice_word(uuid, text, integer) to service_role;


-- ----------------------------------------------------------------------------
-- 9. Temporary Custom Practice compatibility wrapper. p_stat_date is ignored.
-- ----------------------------------------------------------------------------
create or replace function public.complete_custom_practice_word(
  p_event_id uuid,
  p_target_language text,
  p_stat_date date,
  p_custom_practice_time_seconds integer
)
 returns table(already_processed boolean, custom_practice_time_seconds_today integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  return query
  select r.already_processed, r.custom_practice_time_seconds_today
    from public.complete_custom_practice_word(p_event_id, p_target_language, p_custom_practice_time_seconds) as r;
end;
$function$;

revoke execute on function public.complete_custom_practice_word(uuid, text, date, integer) from public;
revoke execute on function public.complete_custom_practice_word(uuid, text, date, integer) from anon;
grant execute on function public.complete_custom_practice_word(uuid, text, date, integer) to postgres;
grant execute on function public.complete_custom_practice_word(uuid, text, date, integer) to authenticated;
grant execute on function public.complete_custom_practice_word(uuid, text, date, integer) to service_role;
