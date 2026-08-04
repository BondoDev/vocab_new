-- ============================================================================
-- CORRECTIVE MIGRATION 4 — revoke review_events' unnecessary anon/
-- authenticated table privileges
-- ============================================================================
--
-- Closes the baseline migration's PROPOSED NEXT MIGRATIONS item 3, left
-- explicitly out of scope by all three prior corrective migrations
-- (20260805100000_restrict_learning_writes_and_add_favorite_rpc.sql,
-- 20260805130000_add_learning_non_negative_constraints_and_revoke_anon_rpc.sql,
-- 20260805150000_add_review_events_referential_integrity.sql):
--
--   3. Revoke the same excessive grant set from review_events for
--      anon/authenticated — RLS already fully blocks them, but the grant
--      layer should not rely on RLS being the only backstop.
--
-- CURRENT STATE — the baseline migration granted review_events the full
-- standard table-privilege set (INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER, MAINTAIN) to all four roles: postgres, anon,
-- authenticated, service_role (baseline migration, [CATALOG-CONFIRMED]).
-- review_events is written only by complete_word_review, which is
-- SECURITY DEFINER (baseline migration) and therefore executes with its
-- owner's (postgres's) privileges regardless of the calling role's own
-- table grants. No frontend code selects, inserts, updates, or deletes
-- review_events directly — grepped across src/ and scripts/; the only match
-- is a comment in src/lib/newWordProgress.ts describing complete_word_review's
-- own idempotency behavior, not a client-side query. RLS is enabled on
-- review_events with zero policies (baseline migration), so anon/
-- authenticated already cannot read or write this table today — this
-- migration removes the redundant grant layer underneath that RLS lockdown,
-- exactly as proposed-item-3 describes, rather than fixing a live gap.
--
-- WHY NOW, SEPARATE FROM THE REST OF THE "excessive grants across the
-- board" imperfection (supabase/README.md item 5) — proposed-item-3 is
-- scoped to review_events specifically, matching this migration exactly.
-- user_profiles, user_word_progress, and user_daily_stats's own excessive
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants remain untouched and open,
-- to be addressed by a later, separately-reviewed migration.
--
-- NO DATA COMPATIBILITY CONCERNS — unlike corrective migrations 2 and 3,
-- this migration changes no rows and no constraints, only role privileges.
-- No read-only validation queries are required before applying it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Revoke every table privilege on public.review_events from anon
-- ----------------------------------------------------------------------------
-- Removes INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
-- MAINTAIN — the full set granted by the baseline migration. anon never had
-- a legitimate reason to hold any of these: RLS already blocked every one of
-- them (zero policies), and anon does not even hold EXECUTE on
-- complete_word_review any more (revoked by corrective migration 2).

revoke all privileges on table public.review_events from anon;


-- ----------------------------------------------------------------------------
-- 2. Revoke every table privilege on public.review_events from authenticated
-- ----------------------------------------------------------------------------
-- Same full privilege set, same rationale: RLS already blocked every one of
-- these for authenticated too (zero policies). authenticated keeps EXECUTE
-- on complete_word_review (unchanged, SECURITY DEFINER writes review_events
-- as postgres regardless of authenticated's own table grants) — only the
-- direct table-level privileges are removed here.

revoke all privileges on table public.review_events from authenticated;


-- ============================================================================
-- POST-MIGRATION STATE (this migration's two REVOKEs only)
-- ============================================================================
--   review_events grants:
--     postgres        — INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
--                        REFERENCES, TRIGGER, MAINTAIN (unchanged)
--     service_role     — INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
--                        REFERENCES, TRIGGER, MAINTAIN (unchanged)
--     anon             — none (all revoked by this migration)
--     authenticated    — none (all revoked by this migration)
--
-- Behavior change: none for any legitimate caller. complete_word_review
-- keeps writing review_events exactly as before — it is SECURITY DEFINER,
-- owned by postgres, and postgres's own grants are untouched. anon and
-- authenticated could never actually read or write review_events before
-- this migration either (RLS enabled, zero policies); this migration only
-- removes the now-redundant grant layer underneath that lockdown.
--
-- Untouched by this migration: every review_events column, constraint,
-- foreign key, and index; RLS remains enabled with zero policies (no policy
-- is added); both RPCs' bodies and grants (complete_new_word_study,
-- complete_word_review); set_word_progress_favorite's body and grants;
-- postgres's and service_role's review_events grants; every other table's
-- grants; all prior migrations.
-- ============================================================================
