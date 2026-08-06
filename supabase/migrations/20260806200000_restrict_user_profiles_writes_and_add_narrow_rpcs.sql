-- ============================================================================
-- PROFILE PHASE 1 — narrow onboarding/language RPCs, user_profiles write
-- restriction, matching field constraints
-- ============================================================================
--
-- PRE-MIGRATION STATE
-- ------------------------------------------------------------------------
-- public.user_profiles has never received the write-restriction treatment
-- every other learning table already has (user_word_progress/
-- user_daily_stats: Corrective Migration 1, 20260805100000...sql;
-- review_events: Corrective Migration 4, 20260805170000...sql). Confirmed by
-- grepping every migration file in this repository for a `user_profiles`
-- grant/revoke/policy statement: the only hits are the baseline migration's
-- own (20260804192152...sql:104-128) — no later migration has ever touched
-- them. As of this migration:
--   * RLS is enabled with one policy, "Users can manage their profiles",
--     `AS PERMISSIVE FOR ALL TO public USING (auth.uid() = id) WITH CHECK
--     (auth.uid() = id)` — ownership-scoped, but declared for every command,
--     not just SELECT.
--   * `postgres`/`anon`/`authenticated`/`service_role` all hold the full
--     standard privilege set (`INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
--     REFERENCES, TRIGGER, MAINTAIN`) — RLS is the only thing narrowing
--     `anon`/`authenticated` in practice; the grant layer itself provides no
--     defense in depth.
--   * The frontend's broad `writeSupabaseUserProfile` upsert
--     (src/lib/userProfile.ts) is still the only write path for onboarding
--     (`useAccountOnboarding.ts`) and the account-language-confirm popup
--     (`useAccountLanguageConfirm.ts` / `accountLanguageSave.ts`) — both send
--     the entire cached client-side profile object (9 fields) on every call,
--     the same broad-upsert pattern `update_daily_goal` (Streak Phase 1,
--     20260806190000...sql) and `initialize_user_timezone` (Timezone Phase 1,
--     20260806120000...sql) already replaced for daily-goal and timezone
--     specifically.
--   * `daily_goal` already has an exact-preset CHECK
--     (`user_profiles_daily_goal_allowed_values_check`, Streak Phase 1).
--     `timezone`/`timezone_updated_at` are already write-guarded by the
--     `prevent_direct_user_timezone_write` trigger (Timezone Phase 1,
--     20260806120000...sql). Every other column
--     (`nickname`/`native_language`/`learning_language`/`current_level`/
--     `user_age`/`birth_month`/`birth_day`) has no database-level validation
--     at all today — only the frontend's own normalizers
--     (src/lib/userProfile.ts) constrain them, and only on the read side.
--
-- WHY THIS MIGRATION
-- ------------------------------------------------------------------------
-- Closes that one remaining gap the same way the other tables were closed:
-- move onboarding and language-pair writes onto narrow, ownership-checked,
-- SECURITY DEFINER RPCs that touch only the columns each operation actually
-- owns, then remove `authenticated`'s/`anon`'s ability to write
-- `user_profiles` directly at all. `timezone`/`timezone_updated_at` and
-- `daily_goal` are explicitly OUT OF SCOPE here — both already have their
-- own narrow write path and are left completely untouched by every operation
-- below.
--
-- EXACT OPERATIONS IN THIS MIGRATION
-- ------------------------------------------------------------------------
--   A. Seven new precondition-guarded CHECK constraints on user_profiles
--      (native_language, learning_language, current_level, user_age,
--      birth_month, birth_day, nickname), mirroring the frontend's own
--      normalizers in src/lib/userProfile.ts exactly. Each is guarded by a
--      DO block that raises a named exception (aborting the whole migration)
--      if any existing row would violate it — the same
--      confirm-before-constrain pattern Streak Phase 1 used for
--      user_profiles_daily_goal_allowed_values_check
--      (20260806190000...sql:79-99) — never a silent constraint failure and
--      never a value rewritten by this migration.
--   B. public.complete_user_profile_onboarding(...) — narrow onboarding RPC.
--   C. public.update_user_profile_languages(...) — narrow language-pair RPC.
--   D. EXECUTE grants for both: postgres/authenticated/service_role only,
--      anon and PUBLIC explicitly excluded.
--   E. Replaces user_profiles' single ownership-scoped FOR ALL policy with a
--      named ownership-scoped FOR SELECT policy — the same replacement
--      Corrective Migration 1 already made for user_word_progress/
--      user_daily_stats (20260805100000...sql), applied here for
--      consistency now that every mutation command is grant-blocked anyway;
--      a FOR ALL policy that reads as "every command" while every command
--      except SELECT is unreachable at the grant layer is misleading to a
--      future reader.
--   F. Revokes every direct table privilege on user_profiles from anon, and
--      revokes INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
--      from authenticated while re-granting SELECT explicitly — the same
--      shape as Corrective Migration 1's user_word_progress/user_daily_stats
--      changes. postgres/service_role are completely untouched.
--
-- COMPATIBILITY ASSUMPTIONS
-- ------------------------------------------------------------------------
-- This migration assumes the frontend build deployed alongside it is the one
-- that calls complete_user_profile_onboarding/update_user_profile_languages
-- instead of the broad upsert (see the accompanying frontend changes in this
-- same change set: src/lib/userProfile.ts, src/app/hooks/
-- useAccountOnboarding.ts, src/app/hooks/useAccountLanguageConfirm.ts /
-- src/app/utils/accountLanguageSave.ts). Unlike the learning-RPC rollouts
-- (Corrective Migrations 5/6, Timezone Phase 2), this migration does NOT add
-- a temporary broad-upsert-compatible wrapper: `writeSupabaseUserProfile`
-- itself is removed from the frontend in the same change set, not kept
-- alive as a fallback, so there is no old build expected to keep calling the
-- direct-table upsert after this migration ships. If a rollback to a
-- pre-Profile-Phase-1 frontend build is ever needed after this migration is
-- applied, that build's onboarding/language-save calls (`POST
-- /rest/v1/user_profiles` with `Prefer: resolution=merge-duplicates`) will
-- fail with a permissions error (`42501`), not a graceful no-op — the same
-- class of rollback caution already documented for the learning-RPC cleanup
-- migrations.
--
-- POST-MIGRATION SECURITY BOUNDARY
-- ------------------------------------------------------------------------
--   user_profiles:
--     postgres/service_role   — unchanged, full direct access.
--     authenticated            — SELECT only, RLS-scoped to auth.uid() = id.
--     anon                      — no direct privileges at all.
--   complete_user_profile_onboarding(text, text, text, text, integer,
--   integer, integer):
--     postgres/authenticated/service_role — EXECUTE. anon/PUBLIC — none.
--   update_user_profile_languages(text, text):
--     postgres/authenticated/service_role — EXECUTE. anon/PUBLIC — none.
--   Both RPCs: SECURITY DEFINER, `SET search_path TO ''`, derive the caller
--   exclusively from auth.uid(), never accept a client-supplied user id,
--   never touch daily_goal/timezone/timezone_updated_at/created_at/
--   is_new_user.
--
-- Untouched by this migration: user_word_progress, user_daily_stats,
-- review_events, custom_practice_events and every RPC that touches them;
-- update_daily_goal, initialize_user_timezone,
-- resolve_authenticated_learning_date, get_current_learning_date, and their
-- existing grants/bodies; user_profiles.daily_goal's existing CHECK;
-- prevent_direct_user_timezone_write and its trigger; every existing row
-- (this migration performs no UPDATE/backfill of any existing
-- user_profiles row — confirmed by the absence of any bare `update
-- public.user_profiles` statement outside the two new function bodies,
-- which only ever run later, on explicit caller action).
--
-- ROLLBACK CONSIDERATIONS
-- ------------------------------------------------------------------------
-- Rolling back section F (the grant/policy tightening) without also rolling
-- back the frontend change set would immediately break onboarding and
-- language-pair saves for whatever frontend build is live at that point,
-- since the new RPCs would still exist but the old broad-upsert frontend
-- code would no longer be present to call them, and the direct-table upsert
-- path this migration removes access to would still be gone. Any rollback
-- of this migration should restore the four `user_profiles` grants
-- (`INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
-- MAINTAIN` to `anon`/`authenticated`) and the original FOR ALL policy
-- together, in the same statement as reverting the frontend to a build that
-- calls `writeSupabaseUserProfile` again — never one without the other.
-- Sections A-D (constraints and the two new RPCs) are additive and safe to
-- leave in place even if F is rolled back.
--
-- PRODUCTION PREFLIGHT REQUIRED BEFORE APPLICATION
-- ------------------------------------------------------------------------
-- Yes. This migration's own precondition DO blocks (section A) run these
-- exact checks automatically as part of applying the migration, and will
-- abort the whole migration with a named, readable exception if any
-- existing row would violate a new constraint — but running the equivalent
-- read-only queries manually in the Supabase SQL Editor FIRST, the same way
-- Corrective Migrations 2/3 documented, is still recommended so a violation
-- is discovered before attempting to apply rather than discovered by the
-- migration failing partway in:
--
--   select count(*) as invalid_native_language_rows
--     from public.user_profiles
--    where native_language not in ('en','es','fr','pt','it','de','ru');
--
--   select count(*) as invalid_learning_language_rows
--     from public.user_profiles
--    where learning_language not in ('en','es','fr','pt','it','de','ru');
--
--   select count(*) as invalid_current_level_rows
--     from public.user_profiles
--    where current_level not in ('A1','A2','B1','B2','C1','C2');
--
--   select count(*) as invalid_user_age_rows
--     from public.user_profiles
--    where user_age < 10 or user_age > 100;
--
--   select count(*) as invalid_birth_month_rows
--     from public.user_profiles
--    where birth_month < 1 or birth_month > 12;
--
--   select count(*) as invalid_birth_day_rows
--     from public.user_profiles
--    where birth_day < 1 or birth_day > 31;
--
--   select count(*) as invalid_nickname_rows
--     from public.user_profiles
--    where char_length(btrim(nickname)) = 0 or char_length(nickname) > 40;
--
-- This migration has NOT been applied to any database as part of this
-- change. It is prepared and reviewed only — see the accompanying task
-- report for the explicit "not applied" confirmation.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. Precondition-guarded CHECK constraints matching the frontend's own
--    normalizers (src/lib/userProfile.ts) exactly.
-- ----------------------------------------------------------------------------
-- Each block mirrors Streak Phase 1's user_profiles_daily_goal_allowed_
-- values_check precondition (20260806190000...sql:79-99): count violating
-- rows first, raise a clear named exception (SQLSTATE 23514, matching a
-- CHECK-violation code) if any exist, and only then add the constraint. No
-- row is ever rewritten by this migration.

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from public.user_profiles
   where native_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru');

  if v_invalid_count > 0 then
    raise exception
      'restrict_user_profiles_writes: % existing user_profiles.native_language row(s) hold a value outside the supported language-code set; migration aborted without modifying any data.',
      v_invalid_count
      using errcode = '23514';
  end if;
end;
$$;

alter table public.user_profiles
  add constraint user_profiles_native_language_allowed_values_check
  check (native_language in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'));

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from public.user_profiles
   where learning_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru');

  if v_invalid_count > 0 then
    raise exception
      'restrict_user_profiles_writes: % existing user_profiles.learning_language row(s) hold a value outside the supported language-code set; migration aborted without modifying any data.',
      v_invalid_count
      using errcode = '23514';
  end if;
end;
$$;

alter table public.user_profiles
  add constraint user_profiles_learning_language_allowed_values_check
  check (learning_language in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'));

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from public.user_profiles
   where current_level not in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

  if v_invalid_count > 0 then
    raise exception
      'restrict_user_profiles_writes: % existing user_profiles.current_level row(s) hold a value outside the supported CEFR level set; migration aborted without modifying any data.',
      v_invalid_count
      using errcode = '23514';
  end if;
end;
$$;

alter table public.user_profiles
  add constraint user_profiles_current_level_allowed_values_check
  check (current_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from public.user_profiles
   where user_age < 10 or user_age > 100;

  if v_invalid_count > 0 then
    raise exception
      'restrict_user_profiles_writes: % existing user_profiles.user_age row(s) fall outside the supported 10-100 range; migration aborted without modifying any data.',
      v_invalid_count
      using errcode = '23514';
  end if;
end;
$$;

alter table public.user_profiles
  add constraint user_profiles_user_age_range_check
  check (user_age >= 10 and user_age <= 100);

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from public.user_profiles
   where birth_month < 1 or birth_month > 12;

  if v_invalid_count > 0 then
    raise exception
      'restrict_user_profiles_writes: % existing user_profiles.birth_month row(s) fall outside 1-12; migration aborted without modifying any data.',
      v_invalid_count
      using errcode = '23514';
  end if;
end;
$$;

alter table public.user_profiles
  add constraint user_profiles_birth_month_range_check
  check (birth_month >= 1 and birth_month <= 12);

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from public.user_profiles
   where birth_day < 1 or birth_day > 31;

  if v_invalid_count > 0 then
    raise exception
      'restrict_user_profiles_writes: % existing user_profiles.birth_day row(s) fall outside 1-31; migration aborted without modifying any data.',
      v_invalid_count
      using errcode = '23514';
  end if;
end;
$$;

alter table public.user_profiles
  add constraint user_profiles_birth_day_range_check
  check (birth_day >= 1 and birth_day <= 31);

-- Nonempty-after-trim, max stored length matching the frontend's own
-- `.trim().slice(0, 40)` cap (src/lib/userProfile.ts's normalizeUserProfile).
-- Deliberately NOT reproducing the frontend's Unicode "starts with a letter"
-- rule (startsWithLetter, `/^\p{L}/u`) here — PostgreSQL's regex engine does
-- not reliably support `\p{L}`-style Unicode general-category classes across
-- versions/locales the way a JavaScript `u`-flag regex does, and an
-- ASCII-only substitute would incorrectly reject legitimate international
-- names. That rule stays frontend-only, same as this migration's own header
-- documents for every other intentionally-left-frontend-only rule.
do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from public.user_profiles
   where char_length(btrim(nickname)) = 0 or char_length(nickname) > 40;

  if v_invalid_count > 0 then
    raise exception
      'restrict_user_profiles_writes: % existing user_profiles.nickname row(s) are empty-after-trim or exceed 40 characters; migration aborted without modifying any data.',
      v_invalid_count
      using errcode = '23514';
  end if;
end;
$$;

alter table public.user_profiles
  add constraint user_profiles_nickname_length_check
  check (char_length(btrim(nickname)) > 0 and char_length(nickname) <= 40);


-- ----------------------------------------------------------------------------
-- B. Narrow onboarding RPC: public.complete_user_profile_onboarding
-- ----------------------------------------------------------------------------
-- Accepts only the seven fields onboarding actually owns. Never accepts a
-- user id, daily_goal, timezone, timezone_updated_at, created_at,
-- updated_at, last_active_at, is_new_user, or an onboarding-completed flag —
-- onboarding_completed is always set to true by this function itself, never
-- read from a parameter.
--
-- Single atomic `INSERT ... ON CONFLICT (id) DO UPDATE` — not a two-branch
-- SELECT-then-INSERT-or-UPDATE — so a missing-row and an existing-row call
-- are both race-safe against a concurrent duplicate call with no separate
-- locking needed: Postgres guarantees exactly one concurrent INSERT wins an
-- (id) primary-key conflict. Neither branch's column list ever names
-- daily_goal, timezone, timezone_updated_at, created_at, or is_new_user:
--   * on a genuine INSERT (no existing row), those five columns take their
--     table defaults (daily_goal 15, timezone/timezone_updated_at null,
--     created_at now(), is_new_user true) — exactly "the database/default
--     daily goal" and no timezone backfill, per this task's own requirement.
--   * on the ON CONFLICT DO UPDATE branch, any column not named in the SET
--     list keeps its prior value automatically — daily_goal, timezone,
--     timezone_updated_at, created_at, and is_new_user are structurally
--     impossible for this function to change, not merely undocumented as
--     changing.
-- last_active_at IS set by this function on both branches (to the same
-- server `now()` used for updated_at) — unlike daily_goal/timezone, it is
-- NOT NULL with no default (so the INSERT branch must supply a value
-- regardless), and onboarding submission is a genuine profile action, which
-- is exactly what this column is documented to represent
-- (supabase/README.md / the profile audit's field-ownership notes). This is
-- the one server-owned timestamp this function touches beyond updated_at.
--
-- prevent_direct_user_timezone_write (Timezone Phase 1) fires on both the
-- INSERT and the ON CONFLICT DO UPDATE path (Postgres executes the latter as
-- a row-level UPDATE), but never raises here: this function's column/SET
-- lists never mention timezone or timezone_updated_at, so NEW.timezone always
-- equals OLD.timezone (or is NULL on a genuine INSERT) and the trigger's
-- guard condition is never met — no `app.allow_user_timezone_write` flag is
-- needed by this function.
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

  if p_user_age is null or p_user_age < 10 or p_user_age > 100 then
    raise exception
      'complete_user_profile_onboarding: p_user_age must be between 10 and 100'
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
    last_active_at,
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
    v_now,
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
        last_active_at = excluded.last_active_at,
        updated_at = excluded.updated_at;
        -- daily_goal, timezone, timezone_updated_at, created_at, and
        -- is_new_user are deliberately absent from both the INSERT column
        -- list and this SET list — see this function's own header comment.

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
-- C. Narrow language-change RPC: public.update_user_profile_languages
-- ----------------------------------------------------------------------------
-- Accepts only native_language/learning_language. Updates only those two
-- columns plus updated_at — never last_active_at (unlike the onboarding
-- function above, this one only ever runs an UPDATE against an
-- already-existing row, so there is no insert branch requiring a
-- NOT-NULL-with-no-default value to be supplied; per this task's own scope,
-- only "the two language columns" and updated_at are written here).
-- daily_goal, timezone, timezone_updated_at, onboarding fields, and
-- demographic fields are never named in the SET list and are therefore
-- structurally unreachable by this function.
--
-- Explicitly rejects a caller with no existing profile row (SQLSTATE
-- 'P0002', matching update_daily_goal's identical precedent in
-- 20260806190000...sql) rather than silently creating an incomplete row —
-- an implicit insert here would either violate the new NOT-NULL-adjacent
-- CHECK constraints above (for a row missing every onboarding field) or
-- require inventing placeholder onboarding data this function has no basis
-- for, neither of which is this function's job.
create or replace function public.update_user_profile_languages(
  p_native_language text,
  p_learning_language text
)
returns table (
  native_language text,
  learning_language text,
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
      'update_user_profile_languages: authentication required'
      using errcode = '28000';
  end if;

  if p_native_language is null or p_native_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'update_user_profile_languages: p_native_language must be one of en, es, fr, pt, it, de, ru'
      using errcode = '22023';
  end if;

  if p_learning_language is null or p_learning_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'update_user_profile_languages: p_learning_language must be one of en, es, fr, pt, it, de, ru'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_profiles as up where up.id = v_user_id
  )
    into v_profile_exists;

  if not v_profile_exists then
    raise exception
      'update_user_profile_languages: no user_profiles row exists for the authenticated caller'
      using errcode = 'P0002';
  end if;

  update public.user_profiles as up
     set native_language = p_native_language,
         learning_language = p_learning_language,
         updated_at = v_now
   where up.id = v_user_id;

  return query
  select p_native_language, p_learning_language, v_now;
end;
$function$;

revoke execute on function public.update_user_profile_languages(text, text) from public;
revoke execute on function public.update_user_profile_languages(text, text) from anon;
grant execute on function public.update_user_profile_languages(text, text) to postgres;
grant execute on function public.update_user_profile_languages(text, text) to authenticated;
grant execute on function public.update_user_profile_languages(text, text) to service_role;


-- ----------------------------------------------------------------------------
-- D. Replace the ownership-scoped FOR ALL policy with a named FOR SELECT
--    policy
-- ----------------------------------------------------------------------------
-- Same replacement Corrective Migration 1 already made for
-- user_word_progress/user_daily_stats (20260805100000...sql) — every write
-- to user_profiles now goes through the two SECURITY DEFINER RPCs above (or
-- the pre-existing update_daily_goal/initialize_user_timezone), all four of
-- which bypass RLS entirely as their owner (postgres). RLS's only remaining
-- practical job for this table is scoping the direct SELECT below.
drop policy if exists "Users can manage their profiles" on public.user_profiles;

create policy "Users can view their own profile"
  on public.user_profiles
  as permissive
  for select
  to authenticated
  using (auth.uid() = id);


-- ----------------------------------------------------------------------------
-- E. Restrict public.user_profiles to owner-scoped SELECT
-- ----------------------------------------------------------------------------
-- Identical shape to Corrective Migration 1's user_word_progress/
-- user_daily_stats tightening: revoke everything from both client roles
-- first, then re-grant only the one operation still needed (authenticated
-- SELECT). postgres/service_role are intentionally untouched — both need
-- full access for migrations, SECURITY DEFINER RPC execution as the function
-- owner, and admin tooling.
revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_profiles from authenticated;
grant select on public.user_profiles to authenticated;

revoke insert, select, update, delete, truncate, references, trigger, maintain
  on public.user_profiles from anon;


-- ============================================================================
-- POST-MIGRATION ACCESS MODEL (public.user_profiles and this migration's two
-- new functions only)
-- ============================================================================
--   user_profiles:
--     postgres/service_role — unchanged (full direct access).
--     authenticated           — SELECT only, RLS-scoped to auth.uid() = id
--                               (was: full CRUD + TRUNCATE/REFERENCES/
--                               TRIGGER/MAINTAIN via an ownership-only FOR
--                               ALL policy).
--     anon                     — no direct table privileges at all (was:
--                               full CRUD + TRUNCATE/REFERENCES/TRIGGER/
--                               MAINTAIN).
--
--   complete_user_profile_onboarding(text, text, text, text, integer,
--   integer, integer):
--     postgres, authenticated, service_role — EXECUTE.
--     anon, PUBLIC                          — no EXECUTE.
--
--   update_user_profile_languages(text, text):
--     postgres, authenticated, service_role — EXECUTE.
--     anon, PUBLIC                          — no EXECUTE.
--
-- Untouched by this migration: user_word_progress, user_daily_stats,
-- review_events, custom_practice_events and every RPC/grant/policy on them;
-- update_daily_goal, initialize_user_timezone,
-- resolve_authenticated_learning_date, get_current_learning_date and their
-- existing bodies/grants; user_profiles.daily_goal's existing CHECK;
-- prevent_direct_user_timezone_write and its trigger; every existing
-- user_profiles row (no UPDATE/backfill of any kind).
-- ============================================================================
