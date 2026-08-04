-- ============================================================================
-- CORRECTIVE MIGRATION 2 — non-negative defense-in-depth constraints, revoke
-- unnecessary anon EXECUTE on the two learning-completion RPCs
-- ============================================================================
--
-- Closes two of the remaining items from the baseline migration's PROPOSED
-- NEXT MIGRATIONS list (items 4 and 5), both left explicitly out of scope by
-- corrective migration 1
-- (20260805100000_restrict_learning_writes_and_add_favorite_rpc.sql):
--
--   4. Missing non-negative CHECK constraints on user_word_progress.
--      correct_streak and user_daily_stats.new_words_completed /
--      reviews_completed / study_time_seconds.
--   5. anon's unnecessary EXECUTE grant on complete_new_word_study and
--      complete_word_review.
--
-- Neither change alters application-visible behavior for any legitimate
-- caller:
--
--   * Direct protected writes to user_word_progress / user_daily_stats were
--     already removed in corrective migration 1 — every write to the four
--     columns constrained below already goes exclusively through
--     complete_new_word_study, complete_word_review, or
--     set_word_progress_favorite (which never touches any of these four
--     columns). Those three RPCs only ever set correct_streak /
--     new_words_completed / reviews_completed / study_time_seconds to 0 or
--     to a value one greater than an already-non-negative prior value — see
--     each RPC's body in the baseline migration. These CHECK constraints are
--     defense-in-depth against a future bug or a not-yet-existing write
--     path, not a fix for any currently-reachable violation.
--   * complete_new_word_study and complete_word_review both already reject
--     an unauthenticated caller internally (`if v_user_id is null then
--     raise exception ... using errcode = '28000'`) — anon's EXECUTE grant
--     never let an anonymous request actually write anything. Revoking it
--     removes an unnecessary privilege layer in front of a check that was
--     already enforced, not a fix for a live gap.
--
-- Authentication checks inside both RPCs, both RPC bodies, both RPCs' grants
-- to authenticated/service_role/postgres, set_word_progress_favorite's
-- grants, and all table grants/RLS policies are all left completely
-- unchanged by this migration.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Non-negative CHECK constraints
-- ----------------------------------------------------------------------------
-- One constraint per column (rather than one combined CHECK per table) so a
-- violation's error message names the exact invalid column.
--
-- Existing-data safety: both tables currently hold very little data, and the
-- two read-only validation queries below (run manually in the Supabase SQL
-- Editor before this migration is applied) confirmed zero violating rows —
-- see supabase/README.md's Corrective Migration 2 section for the queries
-- and the confirmation this migration depends on. Because no violating rows
-- exist, these are added as normal, immediately validated constraints (not
-- NOT VALID) — for tables this small, there is no benefit to deferring
-- validation, and a normal constraint gives the strongest guarantee with the
-- simplest migration.
--
--   select count(*) as invalid_correct_streak_rows
--   from public.user_word_progress
--   where correct_streak < 0;
--
--   select
--     count(*) filter (where new_words_completed < 0)
--       as invalid_new_words_completed_rows,
--     count(*) filter (where reviews_completed < 0)
--       as invalid_reviews_completed_rows,
--     count(*) filter (where study_time_seconds < 0)
--       as invalid_study_time_seconds_rows
--   from public.user_daily_stats;

alter table public.user_word_progress
  add constraint user_word_progress_correct_streak_non_negative
  check (correct_streak >= 0);

alter table public.user_daily_stats
  add constraint user_daily_stats_new_words_completed_non_negative
  check (new_words_completed >= 0);

alter table public.user_daily_stats
  add constraint user_daily_stats_reviews_completed_non_negative
  check (reviews_completed >= 0);

alter table public.user_daily_stats
  add constraint user_daily_stats_study_time_seconds_non_negative
  check (study_time_seconds >= 0);


-- ----------------------------------------------------------------------------
-- 2. Revoke anon EXECUTE on the two existing learning-completion RPCs
-- ----------------------------------------------------------------------------
-- Exact existing signatures, matching the baseline migration's grants
-- verbatim. authenticated/service_role/postgres are untouched — only anon's
-- grant is revoked. Neither function's body is redefined by this migration.

revoke execute on function
  public.complete_new_word_study(text, text, date)
from anon;

revoke execute on function
  public.complete_word_review(uuid, uuid, text, date)
from anon;


-- ============================================================================
-- POST-MIGRATION STATE (this migration's four constraints + two RPC grants
-- only)
-- ============================================================================
--   user_word_progress.correct_streak            — CHECK (>= 0), validated.
--   user_daily_stats.new_words_completed          — CHECK (>= 0), validated.
--   user_daily_stats.reviews_completed             — CHECK (>= 0), validated.
--   user_daily_stats.study_time_seconds            — CHECK (>= 0), validated.
--
--   complete_new_word_study(text, text, date):
--     postgres, authenticated, service_role — EXECUTE (unchanged).
--     anon                                  — EXECUTE revoked.
--
--   complete_word_review(uuid, uuid, text, date):
--     postgres, authenticated, service_role — EXECUTE (unchanged).
--     anon                                  — EXECUTE revoked.
--
-- Untouched by this migration: both RPCs' bodies, set_word_progress_favorite
-- (body and grants), every table grant, every RLS policy, review_events,
-- user_profiles, all indexes, all triggers, corrective migration 1.
--
-- Still open (see supabase/README.md): review_events.user_id has no foreign
-- key, and review_events.word_progress_id's foreign key has no specified
-- ON DELETE behavior — deliberately not addressed here.
-- ============================================================================
