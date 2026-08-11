-- ============================================================================
-- MY LISTS CORRECTIVE-PHASE FIX — RPC column-reference ambiguity in
-- add_words_to_vocabulary_list
-- ============================================================================
--
-- LIVE BUG
-- ------------------------------------------------------------------------
-- add_words_to_vocabulary_list (the word_id-based RPC added by
-- 20260811170000_my_lists_corrective_word_id_membership.sql) fails on the
-- live database with:
--
--   42702  column reference "word_id" is ambiguous
--   HINT: It could refer to either a PL/pgSQL variable or a table column.
--
-- Same root-cause CLASS as 20260811150000_fix_my_lists_rpc_column_ambiguity.sql
-- (which fixed create_user_vocabulary_list/rename_user_vocabulary_list for
-- "user_id"): this function declares
-- RETURNS TABLE (word_id text, already_added boolean), which gives
-- PL/pgSQL a same-named output variable, word_id, in scope for the entire
-- function body — anywhere that name is later used as a bare identifier in
-- a genuine SQL value-expression context (a ColumnRef the core parser has
-- to resolve), Postgres cannot tell whether it means that output variable
-- or a same-named table column, and raises 42702.
--
-- AUDIT — every occurrence of the bare token "word_id" in the prior body
-- ------------------------------------------------------------------------
-- 1. `returns table (word_id text, already_added boolean)` — the
--    declaration itself; not a query, not the bug.
-- 2. `select array_agg(uvlw.word_id) into v_already_added_ids from
--    public.user_vocabulary_list_words as uvlw where uvlw.list_id = ...
--    and uvlw.word_id = any(v_distinct_ids);` — already fully qualified
--    (uvlw.word_id, twice). Not ambiguous, left alone.
-- 3. `insert into public.user_vocabulary_list_words (list_id, word_id)
--    select ... on conflict (list_id, word_id) do nothing;` — TWO bare
--    occurrences: the INSERT target column list and the ON CONFLICT
--    arbiter column list. Per Postgres's own grammar, neither is parsed as
--    a general expression (`a_expr`)/ColumnRef — an INSERT column list is
--    a plain `insert_column_list`, and an ON CONFLICT column-list arbiter
--    is a plain `index_params` list — both resolved directly against the
--    target relation's own columns, with no ColumnRef node ever created,
--    so PL/pgSQL's variable-substitution hook is never even invoked for
--    them. This matches 20260811150000...sql's own established finding
--    that an INSERT column list / UPDATE SET target list is not a
--    substitution context. The INSERT column list is therefore left as
--    bare column names (unavoidable — SQL syntax does not allow qualifying
--    an INSERT target column list with a table alias) with a comment
--    explaining why it is safe. The ON CONFLICT arbiter, however, is
--    rewritten below to name the unique constraint directly
--    (`ON CONFLICT ON CONSTRAINT ...`) rather than listing its columns —
--    strictly safer regardless of the arbiter-list theory above (no
--    column-name token appears in that clause at all once rewritten), and
--    removes any remaining doubt about this specific reported failure.
-- 4. `return query select requested_id, coalesce(requested_id =
--    any(v_already_added_ids), false) from unnest(v_distinct_ids) as
--    requested_id;` — uses the alias `requested_id`, never the bare token
--    `word_id`, so this was never the literal source of the reported
--    error either. Rewritten below anyway (renamed to a table-qualified
--    `candidate.requested_word_id`) purely for defense in depth, per this
--    task's own "do not fix only the exact line that currently throws"
--    instruction — every remaining table/derived-relation reference in the
--    function is now alias-qualified, with no bare identifier left that
--    could ever collide with word_id/already_added again, regardless of
--    future edits to this function.
--
-- FIX
-- ------------------------------------------------------------------------
-- add_words_to_vocabulary_list is recreated with the exact same signature,
-- SECURITY DEFINER/empty search_path/auth.uid()-derivation, validation
-- order, error codes, and behavioral guarantees (list-ownership-checked
-- first, null/blank/oversized word-id rejection before any write,
-- all-or-nothing — no partial writes for a malformed request, duplicate
-- membership idempotent via ON CONFLICT DO NOTHING with already_added
-- reported per id, never touches user_word_progress/user_daily_stats) —
-- only its internal aliasing changes:
--   - `unnest(p_word_ids) as requested_id` -> `unnest(p_word_ids) as
--     candidate(requested_word_id)`, referenced everywhere as
--     `candidate.requested_word_id` — never a bare identifier.
--   - `on conflict (list_id, word_id) do nothing` -> `on conflict on
--     constraint user_vocabulary_list_words_list_word_id_key do nothing`
--     (that constraint is 20260811170000...sql's own new uniqueness
--     constraint on (list_id, word_id) — unchanged, still exists, still
--     the authoritative arbiter; only how it's referenced here changes).
--   - The INSERT's target table is now given an explicit alias (`as
--     uvlw`) for consistency with every other statement in this function,
--     even though (per the audit above) its column list itself needed no
--     change.
--
-- Not touched: remove_word_from_vocabulary_list — audited below and found
-- already safe.
--
-- remove_word_from_vocabulary_list AUDIT (no fix needed)
-- ------------------------------------------------------------------------
-- This function declares `returns void`, not `RETURNS TABLE` — it creates
-- no PL/pgSQL output variables at all, so it cannot suffer this bug class
-- by construction (the exact same reasoning 20260811150000...sql already
-- applied to delete_user_vocabulary_list, which also declares `returns
-- void`). Its own DELETE statement already fully qualifies every column
-- reference (`uvlw.list_id`, `uvlw.word_id`), and its ownership-check
-- subquery is already `uvl.`-qualified. Confirmed safe by inspection;
-- left byte-for-byte untouched by this migration — not recreated, not
-- even a no-op CREATE OR REPLACE, so its definition, statistics, and
-- dependency graph are not disturbed for no reason.
--
-- SCOPE
-- ------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION for add_words_to_vocabulary_list(uuid, text[])
-- only — its exact existing signature, so grants are preserved
-- automatically (same precedent as 20260811150000...sql). No table, index,
-- RLS policy, or membership row is touched. No grant/revoke statement is
-- repeated here. 20260811170000...sql (the corrective migration this fixes)
-- is not edited — this is a new, forward-only file layered on top of it,
-- per this repository's "never edit an already-applied migration" rule.
-- ============================================================================


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
  -- narrow write RPC in this schema.
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

  -- Every derived relation below is named `candidate` with its single
  -- column explicitly aliased `requested_word_id` (never `word_id`) — a
  -- deliberate choice so no reference to a requested id anywhere in this
  -- function can ever lexically collide with the RETURNS TABLE `word_id`
  -- output variable, even in a position that theoretically wouldn't be
  -- ambiguous today. Reject the whole call if any requested id is
  -- null/blank — no partial writes for a malformed request.
  if exists (
    select 1
    from unnest(p_word_ids) as candidate(requested_word_id)
    where candidate.requested_word_id is null or length(btrim(candidate.requested_word_id)) = 0
  ) then
    raise exception
      'add_words_to_vocabulary_list: p_word_ids must not contain null or blank entries'
      using errcode = '22023';
  end if;

  -- Defense-in-depth sanity cap — every real concept id is short (e.g.
  -- "A1-00193"); this rejects obviously-garbage input without hardcoding
  -- vocabulary's exact id format here (that stays an application-layer
  -- concern — vocabulary itself has no database table).
  if exists (
    select 1
    from unnest(p_word_ids) as candidate(requested_word_id)
    where length(btrim(candidate.requested_word_id)) > 64
  ) then
    raise exception
      'add_words_to_vocabulary_list: one or more p_word_ids entries exceed the maximum allowed length'
      using errcode = '22023';
  end if;

  select array_agg(distinct btrim(candidate.requested_word_id))
    into v_distinct_ids
    from unnest(p_word_ids) as candidate(requested_word_id);
  v_requested_count := array_length(v_distinct_ids, 1);

  -- Captured before the INSERT so the result set can accurately label
  -- every requested id as already_added or not, regardless of what
  -- ON CONFLICT DO NOTHING itself returns (a conflicting row is never
  -- returned by a RETURNING clause on that statement). Already fully
  -- qualified (uvlw.word_id) — this was never the ambiguous statement.
  select array_agg(uvlw.word_id)
    into v_already_added_ids
    from public.user_vocabulary_list_words as uvlw
   where uvlw.list_id = p_list_id
     and uvlw.word_id = any(v_distinct_ids);

  -- The INSERT's own target column list, (list_id, word_id), stays as
  -- bare column names — SQL syntax does not allow qualifying an INSERT
  -- column list with a table alias, and (per this migration's own header
  -- audit) it is parsed as a plain column-name list, never a ColumnRef
  -- expression, so it was never actually subject to PL/pgSQL's
  -- variable-substitution ambiguity. The arbiter itself, previously a bare
  -- (list_id, word_id) column list, now names the unique constraint
  -- directly instead — removing every column-name token from that clause
  -- entirely, regardless of the theory above.
  insert into public.user_vocabulary_list_words as uvlw (list_id, word_id)
  select p_list_id, candidate.requested_word_id
  from unnest(v_distinct_ids) as candidate(requested_word_id)
  on conflict on constraint user_vocabulary_list_words_list_word_id_key do nothing;

  return query
  select
    candidate.requested_word_id,
    coalesce(candidate.requested_word_id = any(v_already_added_ids), false)
  from unnest(v_distinct_ids) as candidate(requested_word_id);
end;
$function$;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   add_words_to_vocabulary_list(uuid, text[]): identical signature,
--     grants, validation order, error codes, and behavioral guarantees as
--     20260811170000...sql's version — only its internal SQL is rewritten
--     to alias-qualify every reference and to target the ON CONFLICT
--     arbiter by constraint name instead of a bare column list. No public
--     API change; PostgREST callers (addWordsToVocabularyList in
--     src/lib/vocabularyLists.ts) need no change.
--   remove_word_from_vocabulary_list(uuid, text): untouched — audited in
--     this file's own header and confirmed already safe (returns void, no
--     RETURNS TABLE output variables, every reference already qualified).
--
-- Untouched by this migration: public.user_vocabulary_list_words itself
-- (no column/index/RLS/grant change), public.user_vocabulary_lists, every
-- other table/RPC/policy/grant in this schema, and every prior migration
-- file (20260811130000/140000/150000/160000/170000...sql — none edited).
-- No membership row, vocabulary data, or learning-progress row is read,
-- written, or otherwise touched by this migration.
-- ============================================================================
