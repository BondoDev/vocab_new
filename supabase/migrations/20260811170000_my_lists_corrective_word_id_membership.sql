-- ============================================================================
-- MY LISTS CORRECTIVE PHASE — word_id-based membership (decoupled from
-- user_word_progress)
-- ============================================================================
--
-- PROBLEM WITH THE PHASE 2B SHAPE
-- ------------------------------------------------------------------------
-- public.user_vocabulary_list_words.word_progress_id referenced
-- public.user_word_progress(id) — so a word could only ever join a list if
-- the caller already had a user_word_progress row for it (i.e. had already
-- studied it via Study New Words). That is not the intended product: a
-- list is a neutral vocabulary collection, not an SRS-state container. A
-- user must be able to add ANY vocabulary word from the active target
-- language to a list, whether or not they have ever studied it.
--
-- FIX
-- ------------------------------------------------------------------------
-- Membership now identifies the vocabulary concept itself —
-- public.user_vocabulary_list_words.word_id text, the same cross-language
-- concept id already stored in user_word_progress.word_id (e.g.
-- "A1-00193" — confirmed by reading src/data/vocabulary/*/vocabulary.json:
-- concept_id is the shared key every language's vocabulary.json indexes by,
-- and it is this exact string that user_word_progress.word_id already
-- stores — see baseline migration line "word_id text not null"). No second
-- id system is introduced. Progress (if any) is optional supplementary
-- data, looked up separately by (word_id, target_language) — never
-- required, never auto-created just because a word joined a list.
--
-- word_id is NOT a foreign key to user_word_progress and never will be:
-- vocabulary itself has no database table (it lives in this repository's
-- vocabulary.json files) for word_id to reference, and even if it did,
-- membership must be able to outlive/precede any progress row for the same
-- concept. Vocabulary-existence validation for word_id therefore stays an
-- application-layer concern (src/data/vocabulary/resolveVocabularyWordData.ts's
-- concept resolver) — this migration's RPC below validates shape (non-null,
-- non-blank, sane length) and list ownership only, exactly like every other
-- narrow write RPC in this schema validates what the database can actually
-- know.
--
-- MIGRATION SAFETY — existing Phase 2B testing rows are preserved, not lost
-- ------------------------------------------------------------------------
-- This table went live during Phase 2B testing, so this migration is
-- forward-only and converts every existing row in place rather than
-- dropping/recreating the table:
--   1. Add word_id text, nullable at first.
--   2. Backfill it for every existing row via the row's own
--      word_progress_id -> user_word_progress.id -> user_word_progress.word_id.
--   3. Verify every row now has a non-blank word_id. If even one row can't
--      be resolved (its word_progress_id points at a user_word_progress row
--      that no longer exists — should be structurally impossible given the
--      column's own ON DELETE CASCADE FK, but checked explicitly rather than
--      assumed), the whole migration ABORTS with a named exception naming
--      the exact count and the affected row ids. It never silently drops a
--      membership row to make the constraint fit.
--   4. Only once every row has passed step 3 does word_id become NOT NULL.
--   5. The old (list_id, word_progress_id) unique constraint is dropped.
--   6. The old word_progress_id -> user_word_progress FK (and its supporting
--      index, which existed only to serve that FK's cascade) is dropped.
--   7. word_progress_id itself is dropped.
--   8. The new authoritative uniqueness constraint (list_id, word_id) is
--      added — this is what "duplicate membership" means from now on.
--   9. list_id -> user_vocabulary_lists(id) ON DELETE CASCADE is untouched
--      throughout — a list delete still cascades its memberships exactly as
--      before (see delete_user_vocabulary_list, unchanged by this
--      migration).
--
-- Neither 20260811140000...sql, 20260811150000...sql, nor
-- 20260811160000...sql is edited by this migration — every statement below
-- is new, forward-only DDL/RPC-replacement against the table and functions
-- those files created.
--
-- SECURITY — unchanged narrow-write shape
-- ------------------------------------------------------------------------
-- user_vocabulary_list_words: RLS stays enabled with its existing
-- ownership-scoped SELECT policy (untouched by this migration — it never
-- referenced word_progress_id). authenticated keeps direct SELECT only, no
-- direct INSERT/UPDATE/DELETE grant. anon keeps nothing. The only write
-- path remains the two RPCs below, both SECURITY DEFINER with an empty
-- search_path, both deriving the caller exclusively from auth.uid().
--
-- RPC REPLACEMENT — signatures change, so the old overloads are dropped
-- ------------------------------------------------------------------------
-- add_words_to_vocabulary_list(uuid, uuid[]) and
-- remove_word_from_vocabulary_list(uuid, uuid) both read/write the
-- now-removed word_progress_id column, so CREATE OR REPLACE cannot simply
-- retarget them (a different parameter list creates a new overload, it
-- does not replace the old one, and the old bodies would be left behind
-- referencing a column that no longer exists). This feature has not been
-- committed/deployed at any point up to this migration (explicit constraint
-- on every phase of this feature so far), so there is no live frontend
-- build calling the old signatures to stage a compatibility window for —
-- unlike the learning-RPC duration-aware rollout (Corrective Migration 5/6
-- in this README), the old-signature functions are dropped outright in the
-- same migration that adds their replacements:
--   add_words_to_vocabulary_list(p_list_id uuid, p_word_ids text[])
--   remove_word_from_vocabulary_list(p_list_id uuid, p_word_id text)
-- Both preserve every behavioral guarantee the Phase 2B versions had
-- (SECURITY DEFINER, empty search_path, auth.uid()-derived caller, no
-- p_user_id, list-ownership-checked first, batch add is all-or-nothing
-- with no partial writes, duplicate membership is idempotent via
-- ON CONFLICT DO NOTHING + an already_added flag, remove is idempotent,
-- neither ever touches user_word_progress or user_daily_stats) — only the
-- identity type moves from uuid (word_progress_id) to text (word_id), and
-- the add RPC additionally rejects null/blank word_id entries and caps
-- their length as a defense-in-depth sanity check (vocabulary-existence
-- itself is not, and cannot be, validated here — see above).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Add word_id, nullable for now.
-- ----------------------------------------------------------------------------
alter table public.user_vocabulary_list_words
  add column if not exists word_id text;


-- ----------------------------------------------------------------------------
-- 2. Backfill from the existing word_progress_id -> user_word_progress link.
--    A no-op for any row that already has word_id set (re-run safety).
-- ----------------------------------------------------------------------------
update public.user_vocabulary_list_words as uvlw
   set word_id = uwp.word_id
  from public.user_word_progress as uwp
 where uvlw.word_progress_id = uwp.id
   and uvlw.word_id is null;


-- ----------------------------------------------------------------------------
-- 3. Verify every row resolved. Abort loudly rather than ever dropping a
--    membership row to make the later NOT NULL/constraint fit.
-- ----------------------------------------------------------------------------
do $$
declare
  v_unresolved_count integer;
  v_unresolved_ids uuid[];
begin
  select count(*), array_agg(id order by created_at)
    into v_unresolved_count, v_unresolved_ids
    from public.user_vocabulary_list_words
   where word_id is null or length(btrim(word_id)) = 0;

  if v_unresolved_count > 0 then
    raise exception
      'user_vocabulary_list_words: % existing membership row(s) could not be resolved to a word_id via word_progress_id -> user_word_progress.word_id — aborting rather than dropping them. Affected row ids: %. Investigate why word_progress_id no longer points at a live user_word_progress row (should be impossible given its ON DELETE CASCADE FK) before re-running this migration.',
      v_unresolved_count, v_unresolved_ids;
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. word_id is now guaranteed non-blank for every row — make it NOT NULL.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_vocabulary_list_words'
      and column_name = 'word_id'
      and is_nullable = 'YES'
  ) then
    alter table public.user_vocabulary_list_words
      alter column word_id set not null;
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 5. Drop the old (list_id, word_progress_id) uniqueness constraint.
-- ----------------------------------------------------------------------------
alter table public.user_vocabulary_list_words
  drop constraint if exists user_vocabulary_list_words_list_word_key;


-- ----------------------------------------------------------------------------
-- 6. Drop the old word_progress_id -> user_word_progress FK and its
--    supporting index (that index existed only to serve this FK's cascade
--    lookup — see 20260811140000...sql's own header — so it has no purpose
--    once the column it indexes is gone).
-- ----------------------------------------------------------------------------
alter table public.user_vocabulary_list_words
  drop constraint if exists user_vocabulary_list_words_word_progress_id_fkey;

drop index if exists public.user_vocabulary_list_words_word_progress_id_idx;


-- ----------------------------------------------------------------------------
-- 7. Drop word_progress_id itself.
-- ----------------------------------------------------------------------------
alter table public.user_vocabulary_list_words
  drop column if exists word_progress_id;


-- ----------------------------------------------------------------------------
-- 8. Add the new authoritative uniqueness constraint (list_id, word_id).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_vocabulary_list_words_list_word_id_key'
      and conrelid = 'public.user_vocabulary_list_words'::regclass
  ) then
    alter table public.user_vocabulary_list_words
      add constraint user_vocabulary_list_words_list_word_id_key unique (list_id, word_id);
  end if;
end;
$$;

-- list_id -> user_vocabulary_lists(id) ON DELETE CASCADE (added in
-- 20260811140000...sql) is untouched — not repeated here.


-- ----------------------------------------------------------------------------
-- 9. Replace the write RPCs — old uuid[]/uuid overloads dropped, new
--    text[]/text overloads created. See this file's own header for why a
--    drop-then-create (not a compatibility-window rollout) is safe here.
-- ----------------------------------------------------------------------------
drop function if exists public.add_words_to_vocabulary_list(uuid, uuid[]);
drop function if exists public.remove_word_from_vocabulary_list(uuid, uuid);


create or replace function public.add_words_to_vocabulary_list(
  p_list_id uuid,
  p_word_ids text[]
)
returns table (
  word_id text,
  already_added boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_distinct_ids text[];
  v_requested_count integer;
  v_already_added_ids text[];
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

  if p_word_ids is null or array_length(p_word_ids, 1) is null then
    raise exception
      'add_words_to_vocabulary_list: p_word_ids must be a non-empty array'
      using errcode = '22023';
  end if;

  -- Ownership check for the list — a missing/foreign list matches zero rows
  -- here rather than ever being touched, same pattern as every other
  -- narrow write RPC in this schema. Unlike the Phase 2B version, this
  -- lookup no longer needs the list's own target_language: vocabulary
  -- membership carries no language of its own to cross-check against here
  -- (the app layer sources word ids from the list's own target_language's
  -- vocabulary.json in the first place — see AddWordsDialog/ListDetailView
  -- — and the database has no vocabulary table to validate that against
  -- itself, by design; see this file's own header).
  if not exists (
    select 1
    from public.user_vocabulary_lists as uvl
    where uvl.id = p_list_id
      and uvl.user_id = v_user_id
  ) then
    raise exception
      'add_words_to_vocabulary_list: list not found or not owned by caller'
      using errcode = '42501';
  end if;

  -- Reject the whole call if any requested id is null/blank — no partial
  -- writes for a malformed request, matching the batch-add's existing
  -- all-or-nothing behavior for an invalid id.
  if exists (
    select 1
    from unnest(p_word_ids) as requested_id
    where requested_id is null or length(btrim(requested_id)) = 0
  ) then
    raise exception
      'add_words_to_vocabulary_list: p_word_ids must not contain null or blank entries'
      using errcode = '22023';
  end if;

  -- Defense-in-depth sanity cap — every real concept id is short (e.g.
  -- "A1-00193"); this rejects obviously-garbage input without hardcoding
  -- vocabulary's exact id format here (that stays an application-layer
  -- concern — see this file's own header).
  if exists (
    select 1
    from unnest(p_word_ids) as requested_id
    where length(btrim(requested_id)) > 64
  ) then
    raise exception
      'add_words_to_vocabulary_list: one or more p_word_ids entries exceed the maximum allowed length'
      using errcode = '22023';
  end if;

  select array_agg(distinct btrim(requested_id))
    into v_distinct_ids
    from unnest(p_word_ids) as requested_id;
  v_requested_count := array_length(v_distinct_ids, 1);

  -- Captured before the INSERT so the result set can accurately label every
  -- requested id as already_added or not, regardless of what
  -- ON CONFLICT DO NOTHING itself returns (a conflicting row is never
  -- returned by a RETURNING clause on that statement).
  select array_agg(uvlw.word_id)
    into v_already_added_ids
    from public.user_vocabulary_list_words as uvlw
   where uvlw.list_id = p_list_id
     and uvlw.word_id = any(v_distinct_ids);

  insert into public.user_vocabulary_list_words (list_id, word_id)
  select p_list_id, requested_id
  from unnest(v_distinct_ids) as requested_id
  on conflict (list_id, word_id) do nothing;

  return query
  select requested_id, coalesce(requested_id = any(v_already_added_ids), false)
  from unnest(v_distinct_ids) as requested_id;
end;
$function$;

revoke execute on function public.add_words_to_vocabulary_list(uuid, text[]) from public;
revoke execute on function public.add_words_to_vocabulary_list(uuid, text[]) from anon;
grant execute on function public.add_words_to_vocabulary_list(uuid, text[]) to postgres;
grant execute on function public.add_words_to_vocabulary_list(uuid, text[]) to authenticated;
grant execute on function public.add_words_to_vocabulary_list(uuid, text[]) to service_role;


create or replace function public.remove_word_from_vocabulary_list(
  p_list_id uuid,
  p_word_id text
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

  if p_word_id is null or length(btrim(p_word_id)) = 0 then
    raise exception
      'remove_word_from_vocabulary_list: p_word_id is required'
      using errcode = '22023';
  end if;

  -- Ownership verified explicitly first (raises if the list isn't the
  -- caller's own) so an authorization problem is never silently swallowed
  -- as a no-op — only "this word isn't in the list anymore" is treated as
  -- an ordinary, error-free outcome, by the DELETE below.
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
     and uvlw.word_id = btrim(p_word_id);
end;
$function$;

revoke execute on function public.remove_word_from_vocabulary_list(uuid, text) from public;
revoke execute on function public.remove_word_from_vocabulary_list(uuid, text) from anon;
grant execute on function public.remove_word_from_vocabulary_list(uuid, text) to postgres;
grant execute on function public.remove_word_from_vocabulary_list(uuid, text) to authenticated;
grant execute on function public.remove_word_from_vocabulary_list(uuid, text) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   public.user_vocabulary_list_words: (id uuid pk, list_id uuid not null
--     references user_vocabulary_lists(id) on delete cascade, word_id text
--     not null, created_at timestamptz not null default now()). Unique
--     (list_id, word_id). No word_progress_id column, no FK to
--     user_word_progress. Every membership row that existed before this
--     migration is preserved, with its original created_at, now identified
--     by the word_id backfilled from its prior word_progress_id link.
--   RLS/grants: unchanged from 20260811140000...sql — authenticated SELECT
--     only, anon none, postgres/service_role full.
--   New RPC: add_words_to_vocabulary_list(p_list_id uuid, p_word_ids
--     text[]) — SECURITY DEFINER, batch add, ownership-checked,
--     rejects null/blank/oversized word ids, all-or-nothing (no partial
--     writes), idempotent for already-added words (already_added per id,
--     never a raw unique-violation). Grants:
--     postgres/authenticated/service_role EXECUTE; public/anon revoked.
--   New RPC: remove_word_from_vocabulary_list(p_list_id uuid, p_word_id
--     text) — SECURITY DEFINER, ownership-checked, idempotent membership
--     removal. Grants: postgres/authenticated/service_role EXECUTE;
--     public/anon revoked.
--   Old RPC overloads add_words_to_vocabulary_list(uuid, uuid[]) and
--     remove_word_from_vocabulary_list(uuid, uuid) no longer exist.
--
-- Untouched by this migration: public.user_vocabulary_lists (and its own
-- RPCs), public.user_word_progress, public.user_daily_stats, every other
-- table/RPC/policy/grant in this schema, and every prior migration file
-- (20260811130000/20260811140000/20260811150000/20260811160000...sql — none
-- edited). No vocabulary/learning-progress row is read, written, or
-- otherwise touched by this migration. Practice List is not implemented by
-- this migration — see the repository's own task report for why this
-- membership-model correction is a deliberate prerequisite for it.
-- ============================================================================
