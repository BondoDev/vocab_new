-- ============================================================================
-- MY LISTS PHASE 2B — membership write RPCs (Add/Remove Words)
-- ============================================================================
--
-- SCOPE
-- ------------------------------------------------------------------------
-- Adds the two narrow write paths public.user_vocabulary_list_words has
-- lacked since it was created (20260811140000...sql): adding and removing
-- membership rows. That table itself, its columns, indexes, RLS policy,
-- and grants are all untouched — this migration only adds RPCs. Neither
-- 20260811140000...sql nor 20260811150000...sql is modified.
--
-- CORE RULE — organization only, never learning state
-- ------------------------------------------------------------------------
-- A membership row means exactly "this user_word_progress row belongs to
-- this list" — nothing else. Neither RPC below ever touches
-- public.user_word_progress (no UPDATE, no INSERT, no DELETE against it):
-- word_state, is_favorite, last_practiced_at, next_review_at,
-- correct_streak are all completely unaffected by adding or removing a
-- word from a list. public.user_daily_stats is likewise never referenced.
--
-- BATCH-ONLY ADD DESIGN — no separate single-word add RPC
-- ------------------------------------------------------------------------
-- Only add_words_to_vocabulary_list(uuid, uuid[]) exists; there is no
-- separate add_word_to_vocabulary_list(uuid, uuid). The frontend's Add
-- Words picker always operates on an array of selected word_progress ids
-- (even a single selection is a one-element array), so a second,
-- singular-signature RPC would duplicate the exact same ownership/
-- language-validation/idempotency logic below for no caller that actually
-- needs it — every requirement Part 1 of the brief lists (ownership,
-- word-progress ownership, cross-language rejection, clean idempotent
-- duplicate handling) is already satisfied by the batch RPC for a
-- one-element array. This mirrors the brief's own explicit allowance:
-- "If batch RPC is implemented, individual add RPC is not mandatory
-- unless useful elsewhere."
--
-- add_words_to_vocabulary_list(p_list_id uuid, p_word_progress_ids uuid[])
-- ------------------------------------------------------------------------
--   - SECURITY DEFINER, empty search_path, caller derived exclusively
--     from auth.uid() (no p_user_id parameter).
--   - Validates list ownership first (list not found/not owned -> 42501).
--   - De-duplicates the input array (a caller sending the same id twice
--     is not "an invalid row" — the picker can't select the same row
--     twice anyway, so this only guards against a malformed direct call).
--   - Validates EVERY requested word_progress_id in one set-based check:
--     it must exist, be owned by the caller, and match the list's own
--     target_language. If even one requested id fails any of those three
--     checks, the whole call aborts (one named exception, errcode 22023)
--     with **no partial writes** — the INSERT below runs only after
--     validation has already succeeded for every id, and a plpgsql
--     function body is one implicit transaction, so an earlier RAISE
--     rolls back anything already written in the same call regardless.
--     This is the "reject the whole operation" behavior the brief
--     prefers over partially adding the valid subset.
--   - Duplicate membership (a word already in the list) is never an
--     error: the set of already-member ids is captured *before* the
--     INSERT, the INSERT itself uses ON CONFLICT (list_id,
--     word_progress_id) DO NOTHING (the table's own existing unique
--     constraint — see 20260811140000...sql), and the RETURNS TABLE
--     reports one (word_progress_id, already_added) row per requested id
--     either way — a clean, idempotent, always-fully-explained result the
--     frontend never needs to guess about or catch a unique-violation for.
--
-- remove_word_from_vocabulary_list(p_list_id uuid, p_word_progress_id uuid)
-- ------------------------------------------------------------------------
--   - SECURITY DEFINER, empty search_path, auth.uid()-derived ownership.
--   - Validates list ownership explicitly first (raises 42501 if the
--     list isn't the caller's own) so an authorization problem is never
--     silently swallowed as a no-op.
--   - The DELETE itself is idempotent: removing a membership that's
--     already absent (already removed, never existed, or a stale UI
--     click after another tab already removed it) affects zero rows and
--     is not an error — matching the brief's "idempotent if practical."
--   - Only ever deletes from user_vocabulary_list_words. Never touches
--     user_word_progress, is_favorite, or any daily-stats table.
--
-- CROSS-LANGUAGE ENFORCEMENT — server-side, not merely client-side
-- ------------------------------------------------------------------------
-- add_words_to_vocabulary_list's validation compares
-- user_word_progress.target_language against the list's own
-- target_language for every requested row inside the RPC itself — a
-- German list can only ever gain German user_word_progress rows, and this
-- is enforced regardless of what the client sends or omits. See
-- scripts/tests/learning/test-my-lists-phase2b-migration-contract.mjs for
-- the dedicated guard.
--
-- SECURITY / GRANTS
-- ------------------------------------------------------------------------
-- Both RPCs: EXECUTE revoked from public/anon, granted to
-- postgres/authenticated/service_role only — the same three-role grant
-- set every other narrow write RPC in this schema carries.
-- user_vocabulary_list_words' own table grants are untouched by this
-- migration: authenticated still holds SELECT only (no direct INSERT/
-- DELETE grant), matching the brief's explicit "authenticated must NOT
-- receive broad INSERT/DELETE table grants" requirement — these two RPCs
-- are now the table's only write path.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. add_words_to_vocabulary_list — batch, ownership- and language-checked
-- ----------------------------------------------------------------------------
create or replace function public.add_words_to_vocabulary_list(
  p_list_id uuid,
  p_word_progress_ids uuid[]
)
returns table (
  word_progress_id uuid,
  already_added boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_list_target_language text;
  v_distinct_ids uuid[];
  v_requested_count integer;
  v_valid_count integer;
  v_already_added_ids uuid[];
begin
  if v_user_id is null then
    raise exception
      'add_words_to_vocabulary_list: authentication required'
      using errcode = '28000';
  end if;

  if p_list_id is null then
    raise exception
      'add_words_to_vocabulary_list: p_list_id is required'
      using errcode = '22023';
  end if;

  if p_word_progress_ids is null or array_length(p_word_progress_ids, 1) is null then
    raise exception
      'add_words_to_vocabulary_list: p_word_progress_ids must be a non-empty array'
      using errcode = '22023';
  end if;

  -- Ownership check for the list — a missing/foreign list matches zero
  -- rows here rather than ever being touched, same pattern as
  -- rename_user_vocabulary_list.
  select uvl.target_language
    into v_list_target_language
    from public.user_vocabulary_lists as uvl
   where uvl.id = p_list_id
     and uvl.user_id = v_user_id;

  if not found then
    raise exception
      'add_words_to_vocabulary_list: list not found or not owned by caller'
      using errcode = '42501';
  end if;

  select array_agg(distinct requested_id)
    into v_distinct_ids
    from unnest(p_word_progress_ids) as requested_id;
  v_requested_count := array_length(v_distinct_ids, 1);

  -- Every requested id must exist, be owned by the caller, and match
  -- this list's own target_language — validated as one set, all-or-
  -- nothing. If the count of matching rows is less than the count of
  -- distinct requested ids, at least one id is missing, foreign, or
  -- cross-language, and the whole call aborts with no partial writes.
  select count(*)
    into v_valid_count
    from public.user_word_progress as uwp
   where uwp.id = any(v_distinct_ids)
     and uwp.user_id = v_user_id
     and uwp.target_language = v_list_target_language;

  if v_valid_count <> v_requested_count then
    raise exception
      'add_words_to_vocabulary_list: one or more word progress rows are missing, not owned by caller, or do not match the list target_language'
      using errcode = '22023';
  end if;

  -- Captured before the INSERT so the result set can accurately label
  -- every requested id as already_added or not, regardless of what
  -- ON CONFLICT DO NOTHING itself returns (a conflicting row is never
  -- returned by a RETURNING clause on that statement).
  select array_agg(uvlw.word_progress_id)
    into v_already_added_ids
    from public.user_vocabulary_list_words as uvlw
   where uvlw.list_id = p_list_id
     and uvlw.word_progress_id = any(v_distinct_ids);

  insert into public.user_vocabulary_list_words (list_id, word_progress_id)
  select p_list_id, requested_id
  from unnest(v_distinct_ids) as requested_id
  on conflict (list_id, word_progress_id) do nothing;

  return query
  select requested_id, coalesce(requested_id = any(v_already_added_ids), false)
  from unnest(v_distinct_ids) as requested_id;
end;
$function$;

revoke execute on function public.add_words_to_vocabulary_list(uuid, uuid[]) from public;
revoke execute on function public.add_words_to_vocabulary_list(uuid, uuid[]) from anon;
grant execute on function public.add_words_to_vocabulary_list(uuid, uuid[]) to postgres;
grant execute on function public.add_words_to_vocabulary_list(uuid, uuid[]) to authenticated;
grant execute on function public.add_words_to_vocabulary_list(uuid, uuid[]) to service_role;


-- ----------------------------------------------------------------------------
-- 2. remove_word_from_vocabulary_list — ownership-checked, idempotent
-- ----------------------------------------------------------------------------
create or replace function public.remove_word_from_vocabulary_list(
  p_list_id uuid,
  p_word_progress_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception
      'remove_word_from_vocabulary_list: authentication required'
      using errcode = '28000';
  end if;

  if p_list_id is null then
    raise exception
      'remove_word_from_vocabulary_list: p_list_id is required'
      using errcode = '22023';
  end if;

  if p_word_progress_id is null then
    raise exception
      'remove_word_from_vocabulary_list: p_word_progress_id is required'
      using errcode = '22023';
  end if;

  -- Ownership verified explicitly first (raises if the list isn't the
  -- caller's own) so an authorization problem is never silently
  -- swallowed as a no-op — only "this word isn't in the list anymore"
  -- is treated as an ordinary, error-free outcome, by the DELETE below.
  if not exists (
    select 1
    from public.user_vocabulary_lists as uvl
    where uvl.id = p_list_id
      and uvl.user_id = v_user_id
  ) then
    raise exception
      'remove_word_from_vocabulary_list: list not found or not owned by caller'
      using errcode = '42501';
  end if;

  -- Idempotent: deletes zero rows (not an error) if the membership was
  -- already removed by an earlier call, another tab, or never existed.
  -- Never touches public.user_word_progress or any other table.
  delete from public.user_vocabulary_list_words as uvlw
   where uvlw.list_id = p_list_id
     and uvlw.word_progress_id = p_word_progress_id;
end;
$function$;

revoke execute on function public.remove_word_from_vocabulary_list(uuid, uuid) from public;
revoke execute on function public.remove_word_from_vocabulary_list(uuid, uuid) from anon;
grant execute on function public.remove_word_from_vocabulary_list(uuid, uuid) to postgres;
grant execute on function public.remove_word_from_vocabulary_list(uuid, uuid) to authenticated;
grant execute on function public.remove_word_from_vocabulary_list(uuid, uuid) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   New RPC: add_words_to_vocabulary_list(p_list_id uuid,
--     p_word_progress_ids uuid[]) — SECURITY DEFINER, batch add, rejects
--     the whole call (no partial writes) if any requested word_progress
--     row is missing, foreign, or cross-language; idempotent for already-
--     added words (returns already_added = true per id, never a
--     unique-violation error). Grants: postgres/authenticated/
--     service_role EXECUTE; public/anon revoked.
--   New RPC: remove_word_from_vocabulary_list(p_list_id uuid,
--     p_word_progress_id uuid) — SECURITY DEFINER, ownership-checked,
--     idempotent membership removal. Grants: postgres/authenticated/
--     service_role EXECUTE; public/anon revoked.
--
-- Untouched by this migration: public.user_vocabulary_list_words itself
-- (no column/index/RLS/grant change), public.user_vocabulary_lists,
-- public.user_word_progress, public.user_daily_stats, every RPC from
-- 20260811130000...sql/20260811140000...sql/20260811150000...sql, and
-- every other table/RPC/policy/grant in this schema.
-- ============================================================================
