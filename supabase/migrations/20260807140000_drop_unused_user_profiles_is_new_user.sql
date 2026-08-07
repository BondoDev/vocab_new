-- PROFILE PHASE 3 - remove unused user_profiles.is_new_user
--
-- Repository audit result before this migration:
--   * is_new_user boolean not null default true — nothing in the
--     repository ever changes it away from its default. No RPC, trigger,
--     or direct write sets is_new_user = false, or references it at all,
--     anywhere in the codebase;
--   * no frontend runtime code reads or writes is_new_user/isNewUser (it
--     is not in the fixed column list the frontend selects from
--     user_profiles, and not in UserProfilesRow's read shape);
--   * onboarding/new-user UI behavior (shouldOpenAccountOnboarding in
--     src/app/utils/accountProfile.ts) is driven entirely by
--     onboarding_completed and profile-row presence, never by
--     is_new_user — the two are not coupled;
--   * no repository-owned RPC, trigger, RLS policy, analytics, email
--     automation, or admin tooling depends on it.
--
-- No current SQL function references is_new_user in its body, INSERT/SET
-- column list, or RETURNS TABLE shape, so no RPC needs to be replaced —
-- this migration only drops the column.
--
-- This migration removes the column instead of inventing semantics for
-- an always-true, never-read flag. onboarding_completed remains
-- untouched and is the sole driver of onboarding/new-user behavior.

alter table public.user_profiles
  drop column if exists is_new_user;
