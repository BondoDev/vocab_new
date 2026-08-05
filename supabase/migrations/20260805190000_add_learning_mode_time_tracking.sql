-- ============================================================================
-- CORRECTIVE MIGRATION 5 — learning-mode active-time tracking: reconcile two
-- live-only columns/constraints, add duration-aware RPC signatures alongside
-- the existing ones, add a Custom Practice time-tracking ledger + RPC
-- ============================================================================
--
-- BACKGROUND — two columns were added directly to the live database outside
-- of any migration:
--   * public.user_daily_stats.review_time_seconds          integer not null default 0
--   * public.user_daily_stats.custom_practice_time_seconds integer not null default 0
-- along with two matching non-negative CHECK constraints:
--   * user_daily_stats_review_time_seconds_non_negative
--   * user_daily_stats_custom_practice_time_seconds_non_negative
-- Neither the columns nor the constraints exist in any migration file prior
-- to this one — this migration is what brings the repository's migration
-- history in line with the live schema, using catalog-guarded, idempotent
-- DDL so it succeeds unchanged both on the live database (where these
-- objects already exist) and on a fresh database built from this
-- repository's migrations alone (where they do not yet exist).
--
-- STATISTICS MODEL — three independent active-time columns, one per learning
-- mode. total_time_seconds is NEVER stored: every reader derives it as
-- study_time_seconds + review_time_seconds + custom_practice_time_seconds at
-- read time (see src/lib/learningTimeStats.ts).
--
-- RPC ROLLOUT STRATEGY (see supabase/README.md and
-- src/data/learning/activeWordTimer.ts's own header for the frontend half) —
-- staged/compatible, per the deployment-order risk between a Supabase
-- migration deploy and a Cloudflare frontend deploy:
--   * complete_new_word_study(text, text, date) and
--     complete_word_review(uuid, uuid, text, date) — their EXISTING
--     signatures — are NOT dropped. They are redefined as thin delegating
--     wrappers (0 seconds, no duplicated business logic) around two NEW
--     duration-aware signatures below. Any frontend build still calling the
--     legacy signature keeps working throughout the rollout, just recording
--     0 seconds of active time until it's replaced.
--   * complete_new_word_study(text, text, date, integer) and
--     complete_word_review(uuid, uuid, text, date, integer) are the new,
--     real implementations — SECURITY DEFINER, empty search_path,
--     authenticated-only EXECUTE (anon excluded, matching the existing
--     signatures' already-corrected state), duration validated 0-300.
--   * complete_custom_practice_word(...) has no legacy predecessor and is
--     created directly in its final form.
--   * A SEPARATE future cleanup migration removes the two legacy signatures
--     once the new frontend build is deployed and verified — not this one
--     (see supabase/README.md's "Legacy RPC cleanup" section).
--
-- CUSTOM PRACTICE LEDGER — Custom Practice (src/features/practice/
-- VocabularyPractice.tsx) has never written to Supabase at all (audit-
-- confirmed: no import of src/lib/newWordProgress.ts or supabaseAuth.ts
-- anywhere in that file or its tree). review_events is NOT reused for this:
-- its previous_state/new_state/previous_correct_streak/new_correct_streak/
-- promoted/demoted/word_progress_id columns all describe a spaced-repetition
-- state transition Custom Practice must never produce, and word_progress_id
-- is NOT NULL — a Custom Practice event has no user_word_progress row to
-- point at (Custom Practice deliberately does not touch word progress at
-- all). A new, minimal ledger (public.custom_practice_events) is added
-- instead: event_id primary key (the idempotency gate), user_id, target_
-- language, one duration column, created_at. RLS enabled with zero policies
-- and no anon/authenticated table grants — identical lockdown shape to
-- review_events' current (post corrective-migration-4) state — so the only
-- write path is complete_custom_practice_word, SECURITY DEFINER.
--
-- CONCURRENCY HARDENING (complete_word_review only) — the existing
-- idempotency check (`select ... from review_events where event_id = ...`,
-- then proceed) has a genuine TOCTOU race: two truly concurrent requests
-- with the same event_id could both pass the "not found" check before
-- either commits, both lock and update the SAME user_word_progress row
-- (serialized by the row lock, but neither aware of the other), and both
-- attempt to apply the transition — double-promoting/demoting the word and
-- double-incrementing user_daily_stats before the second INSERT INTO
-- review_events finally fails on its primary key. The new duration-aware
-- complete_word_review(uuid, uuid, text, date, integer) closes this by
-- reordering the write sequence: the transition is still computed from the
-- locked row exactly as before (same thresholds, same streak logic, same
-- deadline math — UNCHANGED), but now review_events is INSERTed (with
-- `on conflict (event_id) do nothing`) BEFORE user_word_progress or
-- user_daily_stats are touched. If that insert affects zero rows (lost a
-- concurrent race), the function returns the winner's already-committed
-- result WITHOUT ever mutating word progress or daily stats a second time —
-- data-safe, time-counter-safe, and caller-safe (no error surfaces to a
-- losing concurrent caller; it just receives already_processed: true).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Reconcile the two live-only columns on public.user_daily_stats
-- ----------------------------------------------------------------------------
-- IF NOT EXISTS makes both statements a no-op on the live database (columns
-- already present, untouched, no data rewritten) and a real ADD COLUMN on a
-- fresh database built from this repository's migrations alone. DEFAULT 0
-- backfills instantly (Postgres 11+ fast-default) without rewriting existing
-- rows or requiring a table lock beyond the DDL statement itself.

alter table public.user_daily_stats
  add column if not exists review_time_seconds integer not null default 0;

alter table public.user_daily_stats
  add column if not exists custom_practice_time_seconds integer not null default 0;


-- ----------------------------------------------------------------------------
-- 2. Reconcile the two live-only non-negative CHECK constraints
-- ----------------------------------------------------------------------------
-- PostgreSQL has no `ADD CONSTRAINT IF NOT EXISTS`. Each guarded DO block
-- below looks the constraint up by name in pg_constraint; if absent, it adds
-- it (fresh-database path); if present, it verifies the existing
-- constraint's canonical definition (via pg_get_constraintdef) matches
-- exactly what this migration intends before accepting it as already
-- satisfied (live-database path) — an incompatible same-named constraint
-- raises an exception instead of being silently accepted.

do $$
declare
  v_existing_def text;
  v_expected_def constant text := 'CHECK ((review_time_seconds >= 0))';
begin
  select pg_get_constraintdef(c.oid)
    into v_existing_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'user_daily_stats'
     and c.conname = 'user_daily_stats_review_time_seconds_non_negative';

  if v_existing_def is null then
    alter table public.user_daily_stats
      add constraint user_daily_stats_review_time_seconds_non_negative
      check (review_time_seconds >= 0);
  elsif v_existing_def <> v_expected_def then
    raise exception
      'user_daily_stats_review_time_seconds_non_negative already exists with an unexpected definition (%), expected (%) — refusing to proceed silently',
      v_existing_def, v_expected_def;
  end if;
  -- else: already exists with the intended definition — nothing to do.
end;
$$;

do $$
declare
  v_existing_def text;
  v_expected_def constant text := 'CHECK ((custom_practice_time_seconds >= 0))';
begin
  select pg_get_constraintdef(c.oid)
    into v_existing_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'user_daily_stats'
     and c.conname = 'user_daily_stats_custom_practice_time_seconds_non_negative';

  if v_existing_def is null then
    alter table public.user_daily_stats
      add constraint user_daily_stats_custom_practice_time_seconds_non_negative
      check (custom_practice_time_seconds >= 0);
  elsif v_existing_def <> v_expected_def then
    raise exception
      'user_daily_stats_custom_practice_time_seconds_non_negative already exists with an unexpected definition (%), expected (%) — refusing to proceed silently',
      v_existing_def, v_expected_def;
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 3. New duration-aware complete_new_word_study(text, text, date, integer)
-- ----------------------------------------------------------------------------
-- Identical logic to the existing complete_new_word_study(text, text, date)
-- (baseline migration) — same idempotency gate (user_word_progress's unique
-- (user_id, word_id, target_language) + `on conflict do nothing`), same
-- initial word state, same review-deadline jitter, same daily-goal-unrelated
-- behavior — with exactly one addition: p_study_time_seconds, validated and
-- added to study_time_seconds inside the SAME `if v_inserted` branch that
-- already gates new_words_completed. A retry that finds the row already
-- present (v_inserted = false) increments neither counter — the existing
-- unique-constraint-backed idempotency mechanism is what makes this safe,
-- unchanged from the original function.
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

  -- Duration validation: not null, not negative, capped at 300 seconds per
  -- completed word (MAX_WORD_TIME_SECONDS — see
  -- src/data/learning/activeWordTimer.ts). The frontend already enforces
  -- this before sending; the database validates independently and never
  -- trusts the client.
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
      p_study_time_seconds
    )
    on conflict (user_id, target_language, stat_date)
    do update
      set new_words_completed =
            public.user_daily_stats.new_words_completed + 1,
          study_time_seconds =
            public.user_daily_stats.study_time_seconds + p_study_time_seconds;
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

revoke execute on function
  public.complete_new_word_study(text, text, date, integer)
from public;
grant execute on function
  public.complete_new_word_study(text, text, date, integer)
to postgres;
grant execute on function
  public.complete_new_word_study(text, text, date, integer)
to authenticated;
grant execute on function
  public.complete_new_word_study(text, text, date, integer)
to service_role;


-- ----------------------------------------------------------------------------
-- 4. Legacy complete_new_word_study(text, text, date) — thin 0-second wrapper
-- ----------------------------------------------------------------------------
-- Same signature as the baseline migration's original function. Its grants
-- (postgres/authenticated/service_role EXECUTE, anon revoked — corrective
-- migration 2) are untouched by this CREATE OR REPLACE; only the body
-- changes, to a single delegating call with zero duplicated business logic.
-- Kept only for rollout safety (see this migration's header) — a follow-up
-- cleanup migration removes this once the new frontend build is verified.
create or replace function public.complete_new_word_study(
  p_word_id text,
  p_target_language text,
  p_stat_date date
)
 returns table(inserted boolean, already_completed boolean, new_words_completed_today integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  return query
  select * from public.complete_new_word_study(p_word_id, p_target_language, p_stat_date, 0);
end;
$function$;


-- ----------------------------------------------------------------------------
-- 5. New duration-aware
--    complete_word_review(uuid, uuid, text, date, integer)
-- ----------------------------------------------------------------------------
-- Same state-transition/streak/deadline logic as the existing
-- complete_word_review(uuid, uuid, text, date) (baseline migration) —
-- UNCHANGED. What's new: p_review_time_seconds (validated 0-300, added to
-- review_time_seconds only — never study_time_seconds), and the write-order
-- restructure described in this migration's header (review_events INSERTed
-- before user_word_progress/user_daily_stats are touched, with `on conflict
-- (event_id) do nothing` as the atomic race gate) so a genuinely concurrent
-- duplicate event_id can never double-apply a transition or double-count
-- time, and never surfaces an error to the losing caller.
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
  v_insert_row_count integer;
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
  if p_review_time_seconds is null then
    raise exception 'complete_word_review: p_review_time_seconds is required' using errcode = '22023';
  end if;
  if p_review_time_seconds < 0 or p_review_time_seconds > 300 then
    raise exception 'complete_word_review: p_review_time_seconds must be between 0 and 300' using errcode = '22023';
  end if;

  -- Fast path: a retried event_id that has already fully committed replays
  -- its stored result without touching anything else. Cheap, and covers the
  -- overwhelmingly common case (sequential retry after a network error or a
  -- component re-render) without taking any lock.
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

  -- Lock the owned row — never trusts a client-supplied state/streak. This
  -- SELECT alone mutates nothing, so two concurrent callers racing past the
  -- fast path above can both reach here safely; only one of them will win
  -- the review_events insert below.
  select * into v_row from public.user_word_progress
   where id = p_word_progress_id and user_id = v_user_id
   for update;

  if not found then
    raise exception 'complete_word_review: word progress row not found or not owned by caller' using errcode = '42501';
  end if;

  -- State/streak transition — mirrors reviewOutcomeTransition.ts exactly.
  -- UNCHANGED from the existing complete_word_review(uuid, uuid, text, date).
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

  -- Deadline: base interval for the RESULTING state, +/-10% jitter.
  -- UNCHANGED from the existing complete_word_review(uuid, uuid, text, date).
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

  -- Concurrency gate: attempt the review_events insert BEFORE mutating
  -- user_word_progress/user_daily_stats (reordered from the original
  -- function — see this migration's header). `on conflict (event_id) do
  -- nothing` means a genuinely concurrent duplicate loses this insert
  -- cleanly (0 rows affected) rather than raising, and — critically —
  -- nothing else has been written yet at that point, so there is nothing to
  -- undo.
  insert into public.review_events (
    event_id, user_id, word_progress_id, target_language, result,
    previous_state, new_state, previous_correct_streak, new_correct_streak,
    promoted, demoted, last_practiced_at, next_review_at
  ) values (
    p_event_id, v_user_id, p_word_progress_id, v_row.target_language, p_result,
    v_row.word_state, v_new_state, v_row.correct_streak, v_new_streak,
    v_promoted, v_demoted, v_completed_at, v_next_review_at
  )
  on conflict (event_id) do nothing;

  get diagnostics v_insert_row_count = row_count;

  if v_insert_row_count = 0 then
    -- Lost a concurrent race: some other request with this exact event_id
    -- committed between our fast-path check and this insert. Nothing above
    -- this point wrote anything else, so there is nothing to roll back —
    -- simply replay the winner's now-committed result, exactly like the
    -- fast path above.
    select * into v_existing from public.review_events
     where event_id = p_event_id and user_id = v_user_id;

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

  -- Won the race (or the only caller at all): apply the transition and
  -- increment both counters in the same upsert.
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
  values (v_user_id, v_row.target_language, p_stat_date, 0, 1, 0, p_review_time_seconds)
  on conflict (user_id, target_language, stat_date)
  do update set
    reviews_completed = public.user_daily_stats.reviews_completed + 1,
    review_time_seconds = public.user_daily_stats.review_time_seconds + p_review_time_seconds;

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

revoke execute on function
  public.complete_word_review(uuid, uuid, text, date, integer)
from public;
grant execute on function
  public.complete_word_review(uuid, uuid, text, date, integer)
to postgres;
grant execute on function
  public.complete_word_review(uuid, uuid, text, date, integer)
to authenticated;
grant execute on function
  public.complete_word_review(uuid, uuid, text, date, integer)
to service_role;


-- ----------------------------------------------------------------------------
-- 6. Legacy complete_word_review(uuid, uuid, text, date) — thin 0-second
--    wrapper
-- ----------------------------------------------------------------------------
-- Same signature as the baseline migration's original function. Grants
-- (postgres/authenticated/service_role EXECUTE, anon revoked — corrective
-- migration 2) are untouched by this CREATE OR REPLACE. Kept only for
-- rollout safety — see this migration's header.
create or replace function public.complete_word_review(
  p_event_id uuid,
  p_word_progress_id uuid,
  p_result text,
  p_stat_date date
)
 returns table(already_processed boolean, previous_state text, new_state text, previous_correct_streak integer, new_correct_streak integer, promoted boolean, demoted boolean, result text, reviews_completed_today integer, last_practiced_at timestamp with time zone, next_review_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  return query
  select * from public.complete_word_review(p_event_id, p_word_progress_id, p_result, p_stat_date, 0);
end;
$function$;


-- ----------------------------------------------------------------------------
-- 7. Custom Practice ledger: public.custom_practice_events
-- ----------------------------------------------------------------------------
-- Minimal, purpose-built idempotency ledger — NOT a reuse of review_events
-- (see this migration's header for why review_events' schema doesn't fit).
-- event_id is the primary key and the sole idempotency gate, exactly like
-- review_events.event_id is for complete_word_review. RLS is enabled with
-- zero policies and no anon/authenticated table grants — the same lockdown
-- shape review_events itself now has (post corrective migration 4) — so the
-- only write path is complete_custom_practice_word below.
create table if not exists public.custom_practice_events (
  event_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language text not null,
  custom_practice_time_seconds integer not null,
  created_at timestamptz not null default (now() at time zone 'utc'),

  constraint custom_practice_events_time_non_negative
    check (custom_practice_time_seconds >= 0),
  constraint custom_practice_events_time_max
    check (custom_practice_time_seconds <= 300)
);

alter table public.custom_practice_events enable row level security;
-- Deliberately zero policies — default-deny for every client role on every
-- command, identical to review_events. The only way this table is ever
-- written is via complete_custom_practice_word (SECURITY DEFINER, owner
-- postgres), which bypasses RLS entirely.

grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.custom_practice_events to postgres;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on public.custom_practice_events to service_role;
-- No anon/authenticated grants at all — unlike the original baseline's
-- four tables (which were first over-granted, then corrected in later
-- migrations), this table is new and goes straight to the corrected end
-- state: RLS-locked, no direct client table privileges, RPC-only writes.


-- ----------------------------------------------------------------------------
-- 8. complete_custom_practice_word — Custom Practice's only write path
-- ----------------------------------------------------------------------------
-- Deliberately narrow: authenticates the caller, validates language/date/
-- event id/duration, records exactly one idempotent ledger row, and
-- increments only user_daily_stats.custom_practice_time_seconds on first
-- processing. Never touches user_word_progress, never increments
-- new_words_completed or reviews_completed, never writes review_events —
-- Custom Practice stays fully independent of spaced-repetition state, per
-- the product requirement.
--
-- Idempotency: `on conflict (event_id) do nothing` on the INSERT is the
-- atomic gate — race-safe by construction (Postgres guarantees exactly one
-- concurrent INSERT wins a primary-key conflict), unlike complete_word_review
-- above, this function never mutates anything before that insert, so no
-- reordering/rollback concern exists here at all.
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
declare
  v_user_id uuid := auth.uid();
  v_row_count integer;
  v_inserted boolean := false;
  v_time_today integer;
begin
  if v_user_id is null then
    raise exception
      'complete_custom_practice_word: authentication required'
      using errcode = '28000';
  end if;

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

  if p_stat_date is null then
    raise exception
      'complete_custom_practice_word: p_stat_date is required'
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

  insert into public.custom_practice_events (
    event_id, user_id, target_language, custom_practice_time_seconds
  )
  values (
    p_event_id, v_user_id, btrim(p_target_language), p_custom_practice_time_seconds
  )
  on conflict (event_id) do nothing;

  get diagnostics v_row_count = row_count;
  v_inserted := v_row_count > 0;

  if v_inserted then
    insert into public.user_daily_stats (
      user_id, target_language, stat_date, new_words_completed, reviews_completed,
      study_time_seconds, review_time_seconds, custom_practice_time_seconds
    )
    values (
      v_user_id, btrim(p_target_language), p_stat_date, 0, 0, 0, 0, p_custom_practice_time_seconds
    )
    on conflict (user_id, target_language, stat_date)
    do update
      set custom_practice_time_seconds =
        public.user_daily_stats.custom_practice_time_seconds + p_custom_practice_time_seconds;
  end if;

  select uds.custom_practice_time_seconds
  into v_time_today
  from public.user_daily_stats as uds
  where uds.user_id = v_user_id
    and uds.target_language = btrim(p_target_language)
    and uds.stat_date = p_stat_date;

  return query
  select
    not v_inserted,
    coalesce(v_time_today, 0);
end;
$function$;

revoke execute on function
  public.complete_custom_practice_word(uuid, text, date, integer)
from public;
grant execute on function
  public.complete_custom_practice_word(uuid, text, date, integer)
to postgres;
grant execute on function
  public.complete_custom_practice_word(uuid, text, date, integer)
to authenticated;
grant execute on function
  public.complete_custom_practice_word(uuid, text, date, integer)
to service_role;


-- ============================================================================
-- POST-MIGRATION STATE (this migration's objects only)
-- ============================================================================
--   user_daily_stats.review_time_seconds            integer not null default 0
--   user_daily_stats.custom_practice_time_seconds    integer not null default 0
--     both CHECK (>= 0), reconciled idempotently (no-op if already live).
--
--   complete_new_word_study(text, text, date, integer)  — NEW, real impl.
--     postgres, authenticated, service_role — EXECUTE. anon — none.
--   complete_new_word_study(text, text, date)           — legacy, delegates
--     with 0 seconds. Grants unchanged from corrective migration 2.
--
--   complete_word_review(uuid, uuid, text, date, integer) — NEW, real impl.,
--     race-hardened review_events-first write order.
--     postgres, authenticated, service_role — EXECUTE. anon — none.
--   complete_word_review(uuid, uuid, text, date)          — legacy, delegates
--     with 0 seconds. Grants unchanged from corrective migration 2.
--
--   custom_practice_events — new table, RLS enabled/zero policies, no anon/
--     authenticated grants.
--   complete_custom_practice_word(uuid, text, date, integer) — NEW.
--     postgres, authenticated, service_role — EXECUTE. anon — none.
--
-- Untouched by this migration: user_word_progress, user_profiles,
-- review_events' own columns/constraints/grants, set_word_progress_favorite,
-- every prior migration file, all state-transition/promotion/demotion/
-- streak/deadline/review-queue logic (byte-identical to the existing
-- functions wherever it appears above).
-- ============================================================================
