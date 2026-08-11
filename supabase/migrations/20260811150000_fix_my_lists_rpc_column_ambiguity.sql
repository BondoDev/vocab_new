-- ============================================================================
-- MY LISTS CORRECTIVE FIX — column-reference ambiguity in
-- create_user_vocabulary_list / rename_user_vocabulary_list
-- ============================================================================
--
-- LIVE BUG
-- ------------------------------------------------------------------------
-- rename_user_vocabulary_list (and, on inspection, create_user_vocabulary_list
-- too) fails on the live database with:
--
--   42702  column reference "user_id" is ambiguous
--   HINT: It could refer to either a PL/pgSQL variable or a table column.
--
-- ROOT CAUSE
-- ------------------------------------------------------------------------
-- Both functions declare RETURNS TABLE (id, user_id, target_language, name,
-- created_at, updated_at) — PL/pgSQL automatically creates an output
-- variable for each of those column names, in scope for the whole function
-- body. public.user_vocabulary_lists has columns with the exact same
-- names. Each function's proactive duplicate-name check
-- (`if exists (select 1 from public.user_vocabulary_lists where ...)`)
-- referenced user_id/target_language/name/id as bare, unqualified
-- identifiers inside that subquery's WHERE clause — a genuine value-
-- expression context, where PL/pgSQL cannot tell whether "user_id" means
-- the output variable or the table column, so Postgres raises 42702.
--
-- EXACT AMBIGUOUS STATEMENT (both functions, same shape)
-- ------------------------------------------------------------------------
--   if exists (
--     select 1
--     from public.user_vocabulary_lists
--     where user_id = v_user_id                        -- ambiguous: user_id
--       and target_language = p_target_language          -- ambiguous: target_language
--       and lower(btrim(name)) = lower(v_name)            -- ambiguous: name
--   ) then
--
-- (rename_user_vocabulary_list's version additionally has `and id <> p_list_id`
-- — ambiguous: id.)
--
-- Every other statement in both functions was already fully qualified
-- (the ownership lookup, the INSERT column list / UPDATE SET target list —
-- neither of which is an expression context PL/pgSQL substitutes into, so
-- neither was ever ambiguous — and every RETURNING clause, all already
-- `uvl.`-qualified) and needed no change.
--
-- delete_user_vocabulary_list was inspected for the same pattern and does
-- NOT have it: it declares `returns void`, not RETURNS TABLE, so it has no
-- id/user_id/etc. output variables in scope at all — its
-- `where id = p_list_id and user_id = v_user_id` refers unambiguously to
-- table columns (the only PL/pgSQL variable in scope there is v_user_id,
-- a different name). Left completely untouched by this migration.
--
-- FIX
-- ------------------------------------------------------------------------
-- Both ambiguous subqueries now alias the table (`as uvl`) and qualify
-- every column reference against it, matching the rest of each function's
-- own existing style — not the `#variable_conflict use_column` pragma
-- (which would silently prefer the column over the variable everywhere in
-- the function, a much blunter and more error-prone fix than naming the
-- one place that actually needed it).
--
-- SCOPE
-- ------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION with each function's exact existing
-- signature (create_user_vocabulary_list(text, text),
-- rename_user_vocabulary_list(uuid, text)) — grants are preserved
-- automatically by CREATE OR REPLACE (same precedent as
-- 20260811120000_add_new_word_study_time_and_repurpose_total.sql), so no
-- grant/revoke statements are repeated here. No table, index, RLS policy,
-- or membership row is touched. delete_user_vocabulary_list,
-- user_vocabulary_lists, and user_vocabulary_list_words are all
-- byte-for-byte untouched by this migration.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. create_user_vocabulary_list — duplicate-check subquery now qualified
-- ----------------------------------------------------------------------------
create or replace function public.create_user_vocabulary_list(
  p_target_language text,
  p_name text
)
returns table (
  id uuid,
  user_id uuid,
  target_language text,
  name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
begin
  if v_user_id is null then
    raise exception
      'create_user_vocabulary_list: authentication required'
      using errcode = '28000';
  end if;

  if p_target_language is null or length(btrim(p_target_language)) = 0 then
    raise exception
      'create_user_vocabulary_list: p_target_language is required'
      using errcode = '22023';
  end if;

  if p_target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru') then
    raise exception
      'create_user_vocabulary_list: p_target_language must be one of en/es/fr/pt/it/de/ru'
      using errcode = '22023';
  end if;

  if v_name is null or length(v_name) = 0 then
    raise exception
      'create_user_vocabulary_list: p_name is required'
      using errcode = '22023';
  end if;

  if length(v_name) > 80 then
    raise exception
      'create_user_vocabulary_list: p_name must be 80 characters or fewer'
      using errcode = '22023';
  end if;

  -- Proactive duplicate check ahead of the unique index itself
  -- (user_vocabulary_lists_user_language_normalized_name_key, added by
  -- 20260811140000...sql) — gives a clean, predictable 23505 with this
  -- function's own message instead of surfacing the index's raw
  -- constraint-violation text. The index remains the authoritative,
  -- race-safe defense; this check only makes the common non-racing case
  -- return a clear error immediately, without a round-trip to the index.
  -- Table aliased and every column qualified (uvl.user_id/
  -- uvl.target_language/uvl.name) — RETURNS TABLE above declares
  -- same-named output variables (user_id/target_language/name), so a bare
  -- reference here is ambiguous (42702) without the alias.
  if exists (
    select 1
    from public.user_vocabulary_lists as uvl
    where uvl.user_id = v_user_id
      and uvl.target_language = p_target_language
      and lower(btrim(uvl.name)) = lower(v_name)
  ) then
    raise exception
      'create_user_vocabulary_list: a list with this name already exists for this target language'
      using errcode = '23505';
  end if;

  return query
  insert into public.user_vocabulary_lists as uvl (user_id, target_language, name)
  values (v_user_id, p_target_language, v_name)
  returning uvl.id, uvl.user_id, uvl.target_language, uvl.name, uvl.created_at, uvl.updated_at;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 2. rename_user_vocabulary_list — duplicate-check subquery now qualified
-- ----------------------------------------------------------------------------
create or replace function public.rename_user_vocabulary_list(
  p_list_id uuid,
  p_name text
)
returns table (
  id uuid,
  user_id uuid,
  target_language text,
  name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_target_language text;
begin
  if v_user_id is null then
    raise exception
      'rename_user_vocabulary_list: authentication required'
      using errcode = '28000';
  end if;

  if p_list_id is null then
    raise exception
      'rename_user_vocabulary_list: p_list_id is required'
      using errcode = '22023';
  end if;

  if v_name is null or length(v_name) = 0 then
    raise exception
      'rename_user_vocabulary_list: p_name is required'
      using errcode = '22023';
  end if;

  if length(v_name) > 80 then
    raise exception
      'rename_user_vocabulary_list: p_name must be 80 characters or fewer'
      using errcode = '22023';
  end if;

  -- Looks up the list's own target_language server-side (never a
  -- client-supplied parameter) — this is also the ownership check: a
  -- missing/foreign list simply matches zero rows here rather than ever
  -- being touched, same pattern as set_word_progress_favorite. Already
  -- fully qualified (uvl.*) — unaffected by this fix.
  select uvl.target_language
    into v_target_language
    from public.user_vocabulary_lists as uvl
   where uvl.id = p_list_id
     and uvl.user_id = v_user_id;

  if not found then
    raise exception
      'rename_user_vocabulary_list: list not found or not owned by caller'
      using errcode = '42501';
  end if;

  -- Same duplicate rule as create_user_vocabulary_list, scoped to this
  -- list's own target_language and excluding the list's own current row
  -- (renaming "Travel" to "Travel" — same value, different case/whitespace
  -- — must not falsely collide with itself). This is the exact statement
  -- that raised 42702 live: RETURNS TABLE above declares id/user_id/
  -- target_language/name output variables, so the previously-bare
  -- user_id/target_language/id/name references here were ambiguous
  -- against public.user_vocabulary_lists' own columns of the same names.
  -- Table now aliased and every column qualified.
  if exists (
    select 1
    from public.user_vocabulary_lists as uvl
    where uvl.user_id = v_user_id
      and uvl.target_language = v_target_language
      and uvl.id <> p_list_id
      and lower(btrim(uvl.name)) = lower(v_name)
  ) then
    raise exception
      'rename_user_vocabulary_list: a list with this name already exists for this target language'
      using errcode = '23505';
  end if;

  -- Already fully qualified (uvl.*) — unaffected by this fix. The SET
  -- clause's left-hand side (name, updated_at) is a target-column
  -- position, not an expression PL/pgSQL substitutes into, so it was never
  -- ambiguous either.
  return query
  update public.user_vocabulary_lists as uvl
     set name = v_name,
         updated_at = now()
   where uvl.id = p_list_id
     and uvl.user_id = v_user_id
  returning uvl.id, uvl.user_id, uvl.target_language, uvl.name, uvl.created_at, uvl.updated_at;
end;
$function$;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   create_user_vocabulary_list(text, text) and
--   rename_user_vocabulary_list(uuid, text): identical signatures, grants,
--   validation order, and error codes as 20260811140000...sql — only the
--   duplicate-check subquery in each is now alias-qualified, fixing the
--   live 42702 ambiguous-column error. No public API change.
--
-- Untouched by this migration: delete_user_vocabulary_list (audited, not
-- affected — see this file's own header), public.user_vocabulary_lists,
-- public.user_vocabulary_list_words, every index/RLS policy/grant, and
-- every existing row in either table.
-- ============================================================================
