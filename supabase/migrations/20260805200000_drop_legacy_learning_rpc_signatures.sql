-- ============================================================================
-- CORRECTIVE MIGRATION 6 — drop the two temporary legacy learning RPC
-- signatures now that the duration-aware frontend is the only caller
-- ============================================================================
--
-- BACKGROUND — Corrective Migration 5
-- (20260805190000_add_learning_mode_time_tracking.sql) added duration-aware
-- 4th/5th-parameter signatures for complete_new_word_study/
-- complete_word_review alongside their pre-existing signatures, redefining
-- the pre-existing ones as thin 0-second delegating wrappers. This was a
-- deliberate staged rollout (see that migration's own header and
-- supabase/README.md's "Legacy RPC cleanup" section): a Supabase migration
-- deploy and a Cloudflare frontend deploy are not atomic with each other, so
-- the legacy signatures had to keep working until the new frontend build was
-- confirmed to be the only thing calling these RPCs.
--
-- THIS MIGRATION drops exactly those two now-obsolete legacy signatures:
--
--   public.complete_new_word_study(text, text, date)
--   public.complete_word_review(uuid, uuid, text, date)
--
-- Nothing else. The duration-aware signatures
-- (complete_new_word_study(text, text, date, integer),
-- complete_word_review(uuid, uuid, text, date, integer)) and
-- complete_custom_practice_word(uuid, text, date, integer) are untouched —
-- DROP FUNCTION targets an exact signature, so a same-named function with a
-- different parameter list is never affected. No CASCADE is used: neither
-- legacy function is referenced by any other object (no view, trigger, or
-- other function calls the legacy signature — only the duration-aware
-- signature is called, including by the legacy wrapper's own body before
-- this migration, which is exactly what's being removed), so an unqualified
-- DROP FUNCTION IF EXISTS is both sufficient and safer than CASCADE (CASCADE
-- would silently take dependents down with it; IF NOT EXISTS/no-CASCADE here
-- means this migration fails loudly instead of silently widening its blast
-- radius if that assumption is ever wrong).
--
-- SAFETY GATE — do not apply this migration until every item below is
-- confirmed true. See supabase/README.md's "Legacy RPC cleanup" section for
-- the authoritative checklist; this migration's own PR/report must record
-- the answer to each:
--
--   1. The duration-aware frontend (the build that sends p_study_time_seconds
--      / p_review_time_seconds on every call) is deployed and live on the
--      production Cloudflare Worker, not just merged to `master` in git.
--   2. A live Study New Words smoke test passes against production.
--   3. A live Review Words smoke test passes against production.
--   4. A live Custom Practice smoke test passes against production.
--   5. No rollback to a pre-duration-aware Cloudflare deployment is expected
--      or queued (a rollback to an old build after this migration is applied
--      would break that build's RPC calls outright — PostgREST would return
--      PGRST202 "could not find the function" for the 3-arg/4-arg calls).
--
-- None of these five can be proven from repository state alone — they
-- require live verification against the actual Supabase project and the
-- actual Cloudflare deployment, neither of which this environment has direct
-- access to (no Supabase DB password/CLI token, no Cloudflare API access —
-- same limitation documented in the baseline migration's own header). This
-- migration is therefore prepared but NOT confirmed safe to apply — see the
-- PR/task report accompanying this file for the explicit "not yet safe"
-- determination as of the commit that introduces it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Drop the legacy Study New Words signature
-- ----------------------------------------------------------------------------
-- Exact signature match only — the duration-aware
-- complete_new_word_study(text, text, date, integer) is a distinct function
-- (different parameter list) and is not affected by this statement.

DROP FUNCTION IF EXISTS
  public.complete_new_word_study(text, text, date);


-- ----------------------------------------------------------------------------
-- 2. Drop the legacy Review Words signature
-- ----------------------------------------------------------------------------
-- Exact signature match only — the duration-aware
-- complete_word_review(uuid, uuid, text, date, integer) is a distinct
-- function (different parameter list) and is not affected by this statement.

DROP FUNCTION IF EXISTS
  public.complete_word_review(uuid, uuid, text, date);


-- ============================================================================
-- POST-MIGRATION STATE (this migration's two DROPs only)
-- ============================================================================
--   complete_new_word_study — exactly one signature remains:
--     (text, text, date, integer), unchanged body/grants from Corrective
--     Migration 5 (postgres/authenticated/service_role EXECUTE, anon none).
--
--   complete_word_review — exactly one signature remains:
--     (uuid, uuid, text, date, integer), unchanged body/grants from
--     Corrective Migration 5 (postgres/authenticated/service_role EXECUTE,
--     anon none).
--
--   complete_custom_practice_word(uuid, text, date, integer) — untouched.
--
-- Untouched by this migration: every table (user_profiles,
-- user_word_progress, user_daily_stats, review_events,
-- custom_practice_events), every column/constraint/index, every RLS policy,
-- every table grant, the duration-aware RPC bodies themselves, state-
-- transition/promotion/demotion/streak/deadline logic, all prior migration
-- files.
--
-- IMPORTANT — after this migration is applied, any Cloudflare deployment
-- older than the duration-aware frontend build can no longer save Study New
-- Words or Review Words progress at all (its RPC calls will fail with
-- PostgREST error PGRST202, "could not find the function", since the
-- signature it calls no longer exists). Do not roll back to such a build
-- after applying this migration without first re-adding a compatible
-- wrapper.
-- ============================================================================
