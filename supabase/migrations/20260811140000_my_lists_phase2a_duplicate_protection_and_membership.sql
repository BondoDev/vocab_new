-- ============================================================================
-- MY LISTS PHASE 2A — duplicate-name protection, rename/delete RPCs,
-- word-membership table foundation
-- ============================================================================
--
-- NEW PRODUCT RULE — duplicate list names
-- ------------------------------------------------------------------------
-- A user must not be able to create two lists with the same name for the
-- same target_language. Duplicate detection is case-insensitive and
-- leading/trailing-whitespace-insensitive: "Travel", "travel", " TRAVEL ",
-- "Travel   " are all the same name. The same name MAY exist in different
-- target languages (German "Travel" and Spanish "Travel" are both allowed)
-- — uniqueness is scoped to (user_id, target_language, normalized name),
-- never globally. Enforced with a unique expression index on
-- (user_id, target_language, lower(btrim(name))), the authoritative,
-- race-safe defense; create_user_vocabulary_list and the new
-- rename_user_vocabulary_list below each also run a proactive check first
-- so the common (non-racing) case gets one predictable 23505
-- (unique_violation) with this schema's own message instead of the index's
-- raw constraint-violation text — src/lib/supabaseError.ts already
-- classifies 23505 as "conflict" globally, so the frontend needs no new
-- error category to map this to localized copy.
--
-- EXISTING DUPLICATES — this migration does not silently resolve them
-- ------------------------------------------------------------------------
-- Since test lists may already have been created live before this rule
-- existed, the unique index is added inside a guarded DO block that first
-- counts (user_id, target_language, normalized name) groups with more than
-- one row. If any exist, the whole migration ABORTS with a named exception
-- naming the count — it never deletes, renames, or otherwise silently
-- resolves a duplicate on your behalf. Run this query against the live
-- database first to see exactly which rows collide:
--
--   select
--     user_id,
--     target_language,
--     lower(btrim(name)) as normalized_name,
--     count(*) as duplicate_count,
--     array_agg(id order by created_at) as list_ids,
--     array_agg(name order by created_at) as names
--   from public.user_vocabulary_lists
--   group by user_id, target_language, lower(btrim(name))
--   having count(*) > 1
--   order by duplicate_count desc;
--
-- Resolve every group it returns (rename or delete the extra rows) before
-- applying this migration — see the final report for the exact procedure.
--
-- MEMBERSHIP TABLE — organization only, no state duplication
-- ------------------------------------------------------------------------
-- public.user_vocabulary_list_words says only "this progress row belongs
-- to this list": (list_id, word_progress_id) — nothing else. It never
-- duplicates word_state, target_language, translation, CEFR level, or word
-- text; every one of those stays owned by user_word_progress (state) or
-- vocabulary.json (display data, resolved client-side only when a list's
-- detail rows are actually rendered — see loadVocabularyProgress.ts, reused
-- as-is for this). target_language is deliberately NOT denormalized onto
-- this table: a row's language is always resolved by joining through
-- word_progress_id -> user_word_progress.target_language (or, from the UI
-- side, because the row was only ever added to a list matching the active
-- practice language in the first place). No membership-write RPC exists
-- yet in Phase 2A (Add Words is Phase 2B) — enforcing "a German list can
-- only contain German progress rows" is that future RPC's job; this phase
-- only establishes the schema/read layer, which makes no cross-language
-- assumption of its own to violate.
--
-- SECURITY MODEL
-- ------------------------------------------------------------------------
-- user_vocabulary_list_words: RLS enabled, one SELECT policy scoped via an
-- EXISTS join against the caller's own user_vocabulary_lists rows (no
-- user_id column on this table itself — ownership is always derived
-- through the list it belongs to). authenticated holds SELECT only, same
-- narrow-write philosophy as every other table in this schema; anon holds
-- nothing. No direct INSERT/UPDATE/DELETE grant exists — Phase 2A
-- deliberately leaves membership writes unavailable until Phase 2B's
-- narrow Add/Remove Words RPC ships as the only write path.
--
-- rename_user_vocabulary_list(p_list_id uuid, p_name text) and
-- delete_user_vocabulary_list(p_list_id uuid) mirror
-- create_user_vocabulary_list's exact shape: SECURITY DEFINER, empty
-- search_path, every referenced object schema-qualified, caller derived
-- exclusively from auth.uid() (no p_user_id parameter on either), EXECUTE
-- granted to postgres/authenticated/service_role only. Rename re-validates
-- ownership, trims/rejects-blank/80-char-caps the name, and enforces the
-- same duplicate rule (scoped to the list's own target_language, looked up
-- server-side — not a client-supplied parameter). Delete only ever removes
-- a row this caller owns; cascading FKs (list_id, word_progress_id both ON
-- DELETE CASCADE) remove membership rows automatically and require no
-- explicit cleanup in the function body. Neither RPC ever touches
-- user_word_progress — vocabulary/learning progress is untouched by a
-- list rename or delete.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Duplicate-name protection: unique index on
--    (user_id, target_language, lower(btrim(name)))
-- ----------------------------------------------------------------------------
do $$
declare
  v_duplicate_group_count integer;
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'user_vocabulary_lists'
      and indexname = 'user_vocabulary_lists_user_language_normalized_name_key'
  ) then
    select count(*)
      into v_duplicate_group_count
      from (
        select 1
        from public.user_vocabulary_lists
        group by user_id, target_language, lower(btrim(name))
        having count(*) > 1
      ) as duplicate_groups;

    if v_duplicate_group_count > 0 then
      raise exception
        'user_vocabulary_lists_user_language_normalized_name_key: % existing (user_id, target_language, normalized name) group(s) already have duplicate lists — resolve manually (rename or delete the extras) before this migration can add the uniqueness constraint. Run: select user_id, target_language, lower(btrim(name)) as normalized_name, count(*), array_agg(id order by created_at) as list_ids, array_agg(name order by created_at) as names from public.user_vocabulary_lists group by user_id, target_language, lower(btrim(name)) having count(*) > 1;',
        v_duplicate_group_count;
    end if;

    create unique index user_vocabulary_lists_user_language_normalized_name_key
      on public.user_vocabulary_lists (user_id, target_language, lower(btrim(name)));
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 2. create_user_vocabulary_list — adds a proactive duplicate check
--    (identical signature to 20260811130000...sql; CREATE OR REPLACE
--    preserves that migration's grants automatically, same precedent as
--    20260811120000_add_new_word_study_time_and_repurpose_total.sql)
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

  -- Proactive duplicate check ahead of the unique index itself (added in
  -- this same migration, above) — gives a clean, predictable 23505 with
  -- this function's own message instead of surfacing the index's raw
  -- constraint-violation text. The index remains the authoritative,
  -- race-safe defense; this check only makes the common non-racing case
  -- return a clear error immediately, without a round-trip to the index.
  if exists (
    select 1
    from public.user_vocabulary_lists
    where user_id = v_user_id
      and target_language = p_target_language
      and lower(btrim(name)) = lower(v_name)
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
-- 3. rename_user_vocabulary_list — narrow, ownership-enforced rename RPC
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
  -- being touched, same pattern as set_word_progress_favorite.
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
  -- — must not falsely collide with itself).
  if exists (
    select 1
    from public.user_vocabulary_lists
    where user_id = v_user_id
      and target_language = v_target_language
      and id <> p_list_id
      and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception
      'rename_user_vocabulary_list: a list with this name already exists for this target language'
      using errcode = '23505';
  end if;

  return query
  update public.user_vocabulary_lists as uvl
     set name = v_name,
         updated_at = now()
   where uvl.id = p_list_id
     and uvl.user_id = v_user_id
  returning uvl.id, uvl.user_id, uvl.target_language, uvl.name, uvl.created_at, uvl.updated_at;
end;
$function$;

revoke execute on function public.rename_user_vocabulary_list(uuid, text) from public;
revoke execute on function public.rename_user_vocabulary_list(uuid, text) from anon;
grant execute on function public.rename_user_vocabulary_list(uuid, text) to postgres;
grant execute on function public.rename_user_vocabulary_list(uuid, text) to authenticated;
grant execute on function public.rename_user_vocabulary_list(uuid, text) to service_role;


-- ----------------------------------------------------------------------------
-- 4. delete_user_vocabulary_list — narrow, ownership-enforced delete RPC
-- ----------------------------------------------------------------------------
create or replace function public.delete_user_vocabulary_list(
  p_list_id uuid
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
      'delete_user_vocabulary_list: authentication required'
      using errcode = '28000';
  end if;

  if p_list_id is null then
    raise exception
      'delete_user_vocabulary_list: p_list_id is required'
      using errcode = '22023';
  end if;

  -- Scoped by both the row's own id AND the caller's user_id — a
  -- missing/foreign list simply deletes zero rows rather than ever
  -- touching another user's list. user_vocabulary_list_words rows for this
  -- list cascade-delete automatically via its list_id FK (part 5, below);
  -- user_word_progress is never referenced by this function at all, so no
  -- vocabulary/learning progress is ever affected by a list delete.
  delete from public.user_vocabulary_lists
   where id = p_list_id
     and user_id = v_user_id;

  if not found then
    raise exception
      'delete_user_vocabulary_list: list not found or not owned by caller'
      using errcode = '42501';
  end if;
end;
$function$;

revoke execute on function public.delete_user_vocabulary_list(uuid) from public;
revoke execute on function public.delete_user_vocabulary_list(uuid) from anon;
grant execute on function public.delete_user_vocabulary_list(uuid) to postgres;
grant execute on function public.delete_user_vocabulary_list(uuid) to authenticated;
grant execute on function public.delete_user_vocabulary_list(uuid) to service_role;


-- ----------------------------------------------------------------------------
-- 5. public.user_vocabulary_list_words — membership foundation
-- ----------------------------------------------------------------------------
create table if not exists public.user_vocabulary_list_words (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.user_vocabulary_lists (id) on delete cascade,
  word_progress_id uuid not null references public.user_word_progress (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint user_vocabulary_list_words_list_word_key
    unique (list_id, word_progress_id)
);

-- Postgres does not automatically index an FK's referencing column — this
-- serves both the read side ("all memberships for this list", also served
-- by the unique constraint's own index since list_id is its leading
-- column, so this specifically targets) and, more importantly, the
-- word_progress_id -> user_word_progress ON DELETE CASCADE lookup:
-- without it, deleting a user_word_progress row (e.g. a future learning-
-- progress reset) would force a sequential scan of this table to find
-- rows to cascade-delete.
create index if not exists user_vocabulary_list_words_word_progress_id_idx
  on public.user_vocabulary_list_words (word_progress_id);

alter table public.user_vocabulary_list_words enable row level security;

-- No user_id column on this table (deliberately — see this migration's own
-- header on why target_language/other list-owning columns are not
-- denormalized here either). Ownership is derived by joining through the
-- list itself: only readable when the caller owns the list_id it points at.
create policy "Users can view memberships of their own lists"
  on public.user_vocabulary_list_words
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_vocabulary_lists as uvl
      where uvl.id = list_id
        and uvl.user_id = auth.uid()
    )
  );

grant select, insert, update, delete, truncate, references, trigger, maintain
  on public.user_vocabulary_list_words to postgres;
grant select, insert, update, delete, truncate, references, trigger, maintain
  on public.user_vocabulary_list_words to service_role;
-- authenticated: SELECT only — Phase 2A leaves membership writes
-- unavailable; Phase 2B's Add/Remove Words RPC will be the only write
-- path, matching every other table in this schema. anon: no grant at all.
grant select on public.user_vocabulary_list_words to authenticated;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   user_vocabulary_lists: unchanged columns/RLS/table-grants from Phase 1,
--     plus the new unique index
--     user_vocabulary_lists_user_language_normalized_name_key on
--     (user_id, target_language, lower(btrim(name))).
--   create_user_vocabulary_list(text, text): same signature and grants,
--     now rejects a duplicate name (scoped to user + target_language) with
--     a predictable 23505 before attempting the INSERT.
--   New RPC: rename_user_vocabulary_list(p_list_id uuid, p_name text) —
--     SECURITY DEFINER, ownership-checked, same validation/duplicate rule
--     as create, sets updated_at = now(). Grants:
--     postgres/authenticated/service_role EXECUTE; public/anon revoked.
--   New RPC: delete_user_vocabulary_list(p_list_id uuid) — SECURITY
--     DEFINER, ownership-checked, deletes only the caller's own row, never
--     touches user_word_progress. Grants:
--     postgres/authenticated/service_role EXECUTE; public/anon revoked.
--   New table: public.user_vocabulary_list_words (id, list_id,
--     word_progress_id, created_at), unique (list_id, word_progress_id),
--     both FKs ON DELETE CASCADE. RLS enabled, one EXISTS-scoped SELECT
--     policy. Grants: postgres/service_role full; authenticated SELECT
--     only; anon none.
--
-- Explicitly NOT built in this migration/phase: any membership-write RPC
-- (Add/Remove Words — Phase 2B), any word-detail/CEFR/translation
-- resolution (stays client-side, vocabulary.json, resolved only when a
-- list's detail rows are actually rendered). Untouched by this migration:
-- user_word_progress, user_daily_stats, user_profiles, review_events, and
-- every other table/RPC/policy/grant in this schema. No existing
-- user_vocabulary_lists row is renamed, deleted, or otherwise modified by
-- this migration itself.
-- ============================================================================
