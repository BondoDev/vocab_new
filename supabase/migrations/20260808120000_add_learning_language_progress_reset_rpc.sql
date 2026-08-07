-- ============================================================================
-- LEARNING PROGRESS RESET — backend primitive for "reset progress for one
-- studied language", disabled by default via PostgreSQL EXECUTE privileges
-- ============================================================================
--
-- Prepared on request, mirroring the delete-account Edge Function
-- (supabase/functions/delete-account/index.ts) audit/decision process: a
-- secure server-side operation for a Settings feature that does not exist
-- yet. No Settings UI is built here — see supabase/README.md's "Learning
-- Progress Reset" section for the full audit this migration implements.
--
-- PRODUCT REQUIREMENT
-- ------------------------------------------------------------------------
-- Reset one selected learning language as though the authenticated caller
-- had never studied it, while leaving the account, every other studied
-- language, and the account's own identity/profile fields untouched.
--
-- WHY A POSTGRES RPC, NOT AN EDGE FUNCTION (see supabase/README.md for the
-- full comparison this summarizes)
-- ------------------------------------------------------------------------
-- Every table this operation touches already lives in Postgres, the caller
-- is already identifiable via auth.uid() with no Auth Admin API involved
-- (unlike delete-account, which needs auth.admin.deleteUser and therefore a
-- service_role-holding Edge Function), and a single SECURITY DEFINER
-- PL/pgSQL function body already executes as one atomic unit — a Supabase
-- Edge Function wrapper would add a network hop and a second place to keep
-- an identity/validation contract in sync, for zero transactional or
-- security benefit over calling this function directly with the caller's
-- own session. This is exactly the case the task's own stated preference
-- describes: "a narrow authenticated PostgreSQL RPC ... optionally invoked
-- directly by the future client."
--
-- SCOPE — every table found in the per-language data audit
-- (supabase/README.md), scoped by (user_id, target_language) directly on
-- each table, never by relying on a cascade:
--   * public.review_events            — direct target_language column.
--   * public.custom_practice_events   — direct target_language column.
--   * public.user_word_progress       — word/state/streak/favorite rows
--     themselves (is_favorite is a column here, not a separate table, so
--     deleting these rows also clears favorite state for this language —
--     required by the product's own "all data ... deleted" wording).
--   * public.user_daily_stats         — daily new-word/review/time counters
--     that the Daily Streak card (src/data/learning/dailyStreak.ts) derives
--     its current/best streak from; deleting a language's rows here returns
--     that language's streak to empty, without touching any other
--     language's rows (each row is already uniquely keyed by
--     (user_id, target_language, stat_date)).
--
-- NOT touched, and why: public.user_profiles — account identity, native
-- language, onboarding fields, daily_goal, and timezone are not learning
-- progress for a specific target language. `learning_language` (the
-- currently-active language) is deliberately left exactly as it is even
-- when that same language is the one being reset — see this migration's
-- "ACTIVE-LANGUAGE BEHAVIOR" note below. There is nothing else in this
-- schema to touch: `grep create table` across every migration in this
-- folder still returns exactly the same five user-owned tables the
-- account-deletion audit found (supabase/README.md's Account Deletion
-- section) — no achievements/milestones table exists anywhere in this
-- repository, and no TypeScript source anywhere under src/ references
-- "achievement" or "milestone" in any form (grep-confirmed). Achievements
-- are not implemented at all today, so there is no separate achievement
-- state to reset — once they exist, if ever, they would need their own
-- audit; this migration does not invent one, per the task's own
-- instruction not to.
--
-- ACTIVE-LANGUAGE BEHAVIOR
-- ------------------------------------------------------------------------
-- NewWordStudyPreparation.tsx and every other learning-queue entry point
-- read progress by (auth user, practiceLanguage) — practiceLanguage being
-- user_profiles.learning_language, the profile's single "currently active"
-- language — and the vocabulary catalog itself (src/data/vocabulary/...) is
-- static content, entirely independent of any user_word_progress row.
-- Resetting the same language the profile is currently configured to learn
-- therefore requires no special-casing: the next queue build simply finds
-- zero owned rows for that language and behaves exactly as it already does
-- for a brand-new learner of that language. This function never reads or
-- writes user_profiles.learning_language.
--
-- LANGUAGE ALLOW-LIST
-- ------------------------------------------------------------------------
-- The same seven-code set user_profiles.native_language/learning_language
-- were constrained to in Profile Phase 1 (20260806200000...sql):
-- ('en','es','fr','pt','it','de','ru'). None of the four progress tables
-- above have ever had a CHECK constraint on their own target_language
-- column (confirmed absent by grepping every migration file for
-- `target_language` alongside `check`/`in (`) — every row they hold was
-- still written by frontend code that only ever supplies one of these seven
-- values (src/lib/userProfileOnboarding.ts's SUPPORTED_LANGUAGE_CODES).
-- Validating the input against this same list here is therefore not a
-- narrower rule than what the data already conforms to in practice, and it
-- is what rejects "unsupported language codes" as this task requires.
--
-- IDENTITY — the same shape every narrow RPC in this repository already
-- uses (complete_new_word_study, complete_word_review,
-- set_word_progress_favorite, update_daily_goal, initialize_user_timezone,
-- complete_user_profile_onboarding, update_user_profile_languages): the
-- caller is derived exclusively from auth.uid(), and there is no
-- p_user_id/p_target_user_id parameter anywhere in this function's
-- signature — structurally impossible to target another account's data,
-- not merely validated-and-rejected. This check stays in the function body
-- even though EXECUTE is currently revoked from every client role (see
-- below) — privilege configuration is what makes the function unreachable
-- today, but the function must remain self-defensive on its own once EXECUTE
-- is eventually granted to authenticated; ownership scoping is never made
-- conditional on the current privilege state.
--
-- TRANSACTIONALITY — a single PL/pgSQL function body executes as one atomic
-- unit of work; the four DELETEs below either all commit or (on any error)
-- none of them do. There is no multi-step client-driven sequence and
-- nothing partially reset is ever observable.
--
-- DELETE ORDER — deliberately review_events, then custom_practice_events,
-- then user_word_progress, then user_daily_stats, and deliberately NOT by
-- relying on review_events.word_progress_id's foreign-key cascade. That
-- cascade is CASCADE as authored in Corrective Migration 3
-- (20260805150000...sql) but NO ACTION before it, and — exactly like the
-- account-deletion primitive's own caveat — this repository has no way to
-- independently confirm Corrective Migration 3 is actually live against the
-- production database from this environment. Deleting review_events FIRST,
-- by its own direct (user_id, target_language) columns, removes every row
-- that could ever reference a user_word_progress row before that
-- user_word_progress row is deleted a few lines later — so the later delete
-- can never hit a FK violation, and this function's correctness does not
-- depend on which ON DELETE behavior happens to be live. (Contrast with
-- account deletion, which structurally requires the cascade to be live and
-- documents a mandatory pre-enablement live-catalog check for exactly that
-- reason — this function needs no equivalent check.)
--
-- IDEMPOTENCY — every DELETE is a plain predicate match with no existence
-- precondition; a language with zero rows in a given table simply deletes
-- zero rows there. A repeated call (or a call for a language the caller
-- never studied) succeeds identically every time, always returning
-- `reset: true` with whatever counts (possibly all zero) actually applied.
-- There is no not-found error path.
--
-- PRODUCTION DEPLOYMENT GATE — PostgreSQL EXECUTE privilege, not a runtime
-- config flag
-- ------------------------------------------------------------------------
-- An earlier revision of this migration gated the destructive path behind a
-- runtime check inside the function body — a Postgres configuration
-- parameter (app.learning_progress_reset_enabled) read with
-- current_setting(..., true), the RPC-shaped analogue of delete-account's
-- ACCOUNT_DELETION_ENABLED Edge Function secret. That approach is REPLACED
-- here by a strictly stronger mechanism: PostgreSQL's own EXECUTE privilege
-- system. Section 2 below revokes EXECUTE on this function from PUBLIC,
-- anon, AND authenticated, and grants it only to postgres/service_role —
-- deliberately NOT to authenticated. No runtime flag, no
-- current_setting(...) call, and no out-of-band `alter database ... set`
-- step exists anywhere in or around this function.
--
-- Why this is stronger than a runtime flag: a runtime check only rejects a
-- call after PostgREST has already authenticated the caller, routed the
-- request, and invoked the function — the function body itself is what
-- decides to refuse. An EXECUTE-privilege gate is enforced by PostgreSQL
-- BEFORE the function is invoked at all (PostgREST's own role-switched
-- connection receives a catalog-level "permission denied for function
-- reset_learning_language_progress", SQLSTATE 42501, straight from
-- Postgres) — there is no code path inside this function, now or after any
-- future edit to it, that could accidentally skip or misconfigure that
-- check, because the check never runs inside the function's control flow in
-- the first place. This also removes the one thing the old design still
-- depended on outside version control: a manually-run `alter database`
-- statement that this repository could not verify was ever actually
-- applied to the live project. Privilege grants ARE version-controlled, in
-- this very migration file.
--
-- Deployment state after this migration is applied: the function exists in
-- production, fully defined and callable in principle, but neither anon nor
-- authenticated holds EXECUTE on it — every call from a real browser
-- session (which always arrives as one of those two roles) is rejected by
-- Postgres itself, before auth.uid() is ever evaluated, before any input is
-- validated, before any table is touched. Safe to apply to production now.
--
-- FUTURE ACTIVATION — see this migration's own POST-MIGRATION STATE section
-- and supabase/README.md's Learning Progress Reset section for the exact
-- future migration this repository should add once a real Settings "Reset
-- progress" flow exists, tested, and ready to ship:
--
--   grant execute on function public.reset_learning_language_progress(text)
--     to authenticated;
--
-- as its own small, separately reviewed, VERSIONED migration file — not an
-- ad-hoc SQL command run by hand, unlike the old design's `alter database`
-- step. This keeps the moment this destructive capability became reachable
-- from the browser part of this repository's own migration history,
-- reviewable and revertable the same way every other schema change here is.
--
-- REAUTHENTICATION — not added, for the same reason delete-account does not
-- add it (supabase/README.md's Account Deletion section): nothing in this
-- repository decodes/validates JWT claims today, there is no UI that would
-- ever force a fresh sign-in immediately before calling this function, and
-- resetting progress data is meaningfully less destructive than deleting
-- the account itself (no data outside this one language is touched, the
-- account and every other language's history survive). auth.uid() ownership
-- scoping remains the function's own defense once EXECUTE is eventually
-- granted; nothing here is weakened by the fact that privileges currently
-- block every call before that check would even run.
--
-- This migration has NOT been applied to any database as part of this
-- change. It is prepared and reviewed only, exactly like every other
-- migration in this folder — see this file's own "not applied" note and
-- supabase/README.md's Learning Progress Reset section for the deployment
-- procedure.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.reset_learning_language_progress(text)
-- ----------------------------------------------------------------------------
create or replace function public.reset_learning_language_progress(
  p_target_language text
)
returns table (
  reset boolean,
  target_language text,
  word_progress_deleted integer,
  daily_stats_deleted integer,
  review_events_deleted integer,
  custom_practice_events_deleted integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_target_language text := btrim(p_target_language);
  v_review_events_deleted integer;
  v_custom_practice_events_deleted integer;
  v_word_progress_deleted integer;
  v_daily_stats_deleted integer;
begin
  if v_user_id is null then
    raise exception
      'reset_learning_language_progress: authentication required'
      using errcode = '28000';
  end if;

  if p_target_language is null or length(v_target_language) = 0 then
    raise exception
      'reset_learning_language_progress: p_target_language is required'
      using errcode = '22023';
  end if;

  if v_target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'reset_learning_language_progress: p_target_language must be one of en, es, fr, pt, it, de, ru'
      using errcode = '22023';
  end if;

  -- No runtime deployment-gate check here by design — see this migration's
  -- header ("PRODUCTION DEPLOYMENT GATE"). Reachability is controlled
  -- entirely by section 2's EXECUTE grants below, enforced by PostgreSQL
  -- before this function body ever runs.

  -- Deletion order — review_events and custom_practice_events FIRST, by
  -- their own direct (user_id, target_language) columns, so the later
  -- user_word_progress delete can never hit a foreign-key violation
  -- regardless of review_events.word_progress_id's live ON DELETE behavior.
  -- See this migration's header for the full reasoning.
  delete from public.review_events
   where user_id = v_user_id
     and target_language = v_target_language;
  get diagnostics v_review_events_deleted = row_count;

  delete from public.custom_practice_events
   where user_id = v_user_id
     and target_language = v_target_language;
  get diagnostics v_custom_practice_events_deleted = row_count;

  delete from public.user_word_progress
   where user_id = v_user_id
     and target_language = v_target_language;
  get diagnostics v_word_progress_deleted = row_count;

  delete from public.user_daily_stats
   where user_id = v_user_id
     and target_language = v_target_language;
  get diagnostics v_daily_stats_deleted = row_count;

  return query
  select
    true,
    v_target_language,
    v_word_progress_deleted,
    v_daily_stats_deleted,
    v_review_events_deleted,
    v_custom_practice_events_deleted;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 2. EXECUTE privileges — the deployment gate itself (see this migration's
--    header). Fail-closed by construction: PostgreSQL grants EXECUTE on a
--    newly created function to PUBLIC by default, so the first statement
--    below revokes that immediately; the following two statements then
--    revoke it from anon and authenticated explicitly, so neither role's
--    access depends on PUBLIC's default ever having been revoked correctly
--    upstream. postgres/service_role receive EXECUTE for admin tooling and
--    any future server-side (non-browser) caller — authenticated is
--    deliberately NOT granted EXECUTE in this migration. See this
--    migration's header ("FUTURE ACTIVATION") for the exact follow-up
--    migration that grants it once a real Settings flow exists.
-- ----------------------------------------------------------------------------
revoke execute on function public.reset_learning_language_progress(text) from public;
revoke execute on function public.reset_learning_language_progress(text) from anon;
revoke execute on function public.reset_learning_language_progress(text) from authenticated;
grant execute on function public.reset_learning_language_progress(text) to postgres;
grant execute on function public.reset_learning_language_progress(text) to service_role;
-- Deliberately no `grant execute ... to authenticated;` in this migration.


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   public.reset_learning_language_progress(text)
--     - postgres, service_role — EXECUTE.
--     - anon, authenticated, PUBLIC — no EXECUTE (explicitly revoked, not
--       merely never granted).
--     - SECURITY DEFINER, empty search_path, derives the caller exclusively
--       from auth.uid() — no p_user_id/p_target_user_id parameter exists.
--     - validates p_target_language against the same seven-code allow-list
--       user_profiles.native_language/learning_language already use.
--     - no runtime deployment-gate check — reachability is controlled
--       entirely by the EXECUTE grants above.
--     - deletes only rows matching (auth.uid(), p_target_language) across
--       review_events, custom_practice_events, user_word_progress, and
--       user_daily_stats — never touches user_profiles, never touches
--       another language's rows, never touches another user's rows.
--     - idempotent: a repeated call, or a call for a language the caller
--       never studied, succeeds with reset: true and zero-or-more deleted
--       counts — never a not-found error.
--
--   FUTURE ACTIVATION (do not apply now — a separate, later migration):
--     grant execute on function public.reset_learning_language_progress(text)
--       to authenticated;
--   Only after a real Settings "Reset progress" UI, an explicit destructive
--   confirmation step, and this function's own test suite all exist and
--   pass — see supabase/README.md's Learning Progress Reset section.
--
-- Untouched by this migration: every existing table, RPC, trigger, policy,
-- and grant in this schema; user_profiles.learning_language (this function
-- never reads or writes it); the delete-account Edge Function and its own
-- ACCOUNT_DELETION_ENABLED gate (a separate, already-shipped primitive this
-- migration does not modify).
-- ============================================================================
