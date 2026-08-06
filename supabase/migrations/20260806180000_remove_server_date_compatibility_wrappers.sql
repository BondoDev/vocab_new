-- ============================================================================
-- TIMEZONE PHASE 2 CLEANUP — drop the temporary client-date learning RPC
-- compatibility wrappers
-- ============================================================================
--
-- BACKGROUND
-- Migration 20260806150000_add_server_derived_learning_dates.sql (Timezone
-- Phase 2) introduced no-p_stat_date primary signatures for
-- complete_new_word_study, complete_word_review, and
-- complete_custom_practice_word, and kept the pre-existing date-taking
-- signatures alive as thin wrappers that ignored the caller's p_stat_date
-- and delegated to the new server-derived implementation. This was a
-- deliberate staged rollout for the same reason as Corrective Migration 6
-- (20260805200000_drop_legacy_learning_rpc_signatures.sql): a Supabase
-- migration deploy and a Cloudflare frontend deploy are not atomic, so the
-- wrappers had to keep working until the new frontend build was confirmed
-- to be the only thing calling these RPCs.
--
-- The new frontend build (the one that omits p_stat_date entirely) is now
-- the only caller in production. This migration drops exactly the three
-- now-obsolete wrapper signatures:
--
--   public.complete_new_word_study(text, text, date, integer)
--   public.complete_word_review(uuid, uuid, text, date, integer)
--   public.complete_custom_practice_word(uuid, text, date, integer)
--
-- Nothing else. DROP FUNCTION targets an exact signature, so the active
-- no-date signatures below — different parameter lists — are never
-- affected by these statements:
--
--   public.complete_new_word_study(text, text, integer)
--   public.complete_word_review(uuid, uuid, text, integer)
--   public.complete_custom_practice_word(uuid, text, integer)
--
-- Also untouched: public.get_current_learning_date(),
-- public.resolve_authenticated_learning_date(), every table, column,
-- constraint, trigger, RLS policy, and grant on any remaining function. No
-- CASCADE is used — none of the three wrappers is referenced by any other
-- object (no view, trigger, or other function calls a wrapper; only the
-- wrapper's own body called the active signature, which is exactly what's
-- being removed) — so an unqualified DROP FUNCTION IF EXISTS is both
-- sufficient and safer than CASCADE (CASCADE would silently take dependents
-- down with it; no-CASCADE here means this migration fails loudly instead
-- of silently widening its blast radius if that assumption is ever wrong).
--
-- IMPORTANT — do not roll production back to a pre-Timezone-Phase-2
-- frontend build after this migration is applied. Such a build sends
-- p_stat_date on every Study/Review/Custom Practice save; once these three
-- signatures are gone, PostgREST returns PGRST202 ("could not find the
-- function") for every one of those calls instead of the graceful
-- p_stat_date-ignored behavior the wrappers provided. Historical
-- user_daily_stats rows and review_events/custom_practice_events ledger
-- rows are unaffected either way — this migration performs no data
-- rewrite.
-- ============================================================================


DROP FUNCTION IF EXISTS
  public.complete_new_word_study(text, text, date, integer);

DROP FUNCTION IF EXISTS
  public.complete_word_review(uuid, uuid, text, date, integer);

DROP FUNCTION IF EXISTS
  public.complete_custom_practice_word(uuid, text, date, integer);


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   complete_new_word_study — exactly one signature remains:
--     (text, text, integer), server-derived stat_date, unchanged since the
--     20260806170000 conflict-target fix.
--
--   complete_word_review — exactly one signature remains:
--     (uuid, uuid, text, integer), server-derived stat_date, unchanged since
--     the 20260806170000 conflict-target fix.
--
--   complete_custom_practice_word — exactly one signature remains:
--     (uuid, text, integer), server-derived stat_date, unchanged since the
--     20260806170000 conflict-target fix.
--
-- Untouched by this migration: every table (user_profiles,
-- user_word_progress, user_daily_stats, review_events,
-- custom_practice_events), every column/constraint/index, every RLS policy,
-- every table grant, get_current_learning_date(),
-- resolve_authenticated_learning_date(), the active RPC bodies themselves,
-- state-transition/promotion/demotion/streak logic, all prior migration
-- files.
-- ============================================================================
