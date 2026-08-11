-- ============================================================================
-- MY LISTS PHASE 1 — public.user_vocabulary_lists table + narrow create RPC
-- ============================================================================
--
-- PRODUCT REQUIREMENT
-- ------------------------------------------------------------------------
-- "My Lists" lets a signed-in user create their own named vocabulary
-- collections (e.g. "Travel German", "Difficult Words") to organize words
-- they want to learn together. A list is organization only — it is not a
-- second learning-state system. Word membership (which concepts belong to
-- which list) is explicitly OUT OF SCOPE for this migration/phase; it will
-- be a separate membership table in a later phase, referencing this table's
-- id and the existing user_word_progress rows, never duplicating
-- word-state.
--
-- LANGUAGE ISOLATION
-- ------------------------------------------------------------------------
-- Lists are scoped to one target_language, the same seven-code UI-language
-- set native_language/learning_language already validate against
-- (20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql).
-- A list created while German is the active learning language is a German
-- list; switching the active language to Spanish must never surface it. No
-- cross-language merge exists anywhere in this schema.
--
-- RECONCILIATION WITH AN ALREADY-EXISTING LIVE TABLE
-- ------------------------------------------------------------------------
-- public.user_vocabulary_lists was created manually against the live
-- project before this migration existed, with:
--   * the same columns this migration would otherwise create (id, user_id,
--     target_language, name, created_at, updated_at);
--   * two existing name CHECK constraints, user_vocabulary_lists_name_length
--     (char_length(name) <= 80) and user_vocabulary_lists_name_not_blank
--     (length(btrim(name)) > 0) — kept, not duplicated;
--   * no target_language CHECK constraint yet — added below via a guarded
--     DO block, not inline in CREATE TABLE, so the same statement adds it
--     whether the table was just created here or already existed;
--   * the same index name, user_vocabulary_lists_user_language_idx — safe
--     via CREATE INDEX IF NOT EXISTS either way;
--   * four broad owner-scoped RLS policies (read/create/update/delete —
--     i.e. direct INSERT/UPDATE/DELETE were allowed, not RPC-only). Every
--     statement below is written to converge BOTH a fresh database (table
--     does not exist yet) and this exact live shape onto the same final
--     state, without ever dropping/recreating the table or touching a
--     single existing row. CREATE TABLE uses IF NOT EXISTS (a full no-op
--     against the live table); the constraint guard and every
--     policy/grant/revoke below use existence checks or are naturally
--     idempotent (DROP POLICY IF EXISTS, GRANT/REVOKE), so running this
--     migration exactly once against the live database is safe and
--     produces the same end state as running it against a fresh one.
--
-- SECURITY MODEL — narrow-write-from-day-one, no broad-grant corrective
-- window ever opened on a fresh database (unlike user_word_progress/
-- user_daily_stats/user_profiles, which each started with a broad
-- ownership-scoped FOR ALL policy and full table grants, then needed a
-- later corrective migration to lock down to RPC-only writes — see
-- 20260805100000...sql and 20260806200000...sql). Against the live
-- database described above, this migration performs exactly that same
-- corrective tightening in one step. Final state either way:
--   - RLS enabled with exactly one policy: ownership-scoped FOR SELECT
--     (auth.uid() = user_id), to authenticated only.
--   - authenticated is granted SELECT and nothing else; anon receives no
--     direct privilege at all; postgres/service_role keep full access.
--   - The only write path is public.create_user_vocabulary_list(text,
--     text) below — SECURITY DEFINER, empty search_path, every referenced
--     object schema-qualified, caller derived exclusively from auth.uid()
--     (no p_user_id parameter exists), mirroring
--     complete_user_profile_onboarding's exact shape.
--   - Name validation (non-empty after trim, 80-character max) is enforced
--     twice: once in the RPC (a clean, named exception before any INSERT
--     is attempted) and once as the table's own CHECK constraints (so no
--     future write path — RPC or otherwise — can bypass it). Neither layer
--     rewrites/truncates the name silently; the RPC rejects, it never
--     clamps.
--   - No uniqueness constraint on name — the product spec explicitly does
--     not require unique list names.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. public.user_vocabulary_lists
-- ----------------------------------------------------------------------------
-- IF NOT EXISTS makes this a full no-op against the already-existing live
-- table — its columns, data, and existing constraints are left completely
-- untouched. Constraint names/expressions below match the live table's own
-- (user_vocabulary_lists_name_length / user_vocabulary_lists_name_not_blank)
-- exactly, so a fresh database ends up with the identical shape rather than
-- a differently-named equivalent.
create table if not exists public.user_vocabulary_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_language text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_vocabulary_lists_name_length
    check (char_length(name) <= 80),

  constraint user_vocabulary_lists_name_not_blank
    check (length(btrim(name)) > 0)
);

-- target_language CHECK is added here, guarded, rather than inline above,
-- so the exact same statement covers both a table just created by the
-- CREATE TABLE above (constraint doesn't exist yet) and the live table
-- (also doesn't have it yet). The precondition check fails the whole
-- migration loudly (named exception) rather than either silently skipping
-- or letting ALTER TABLE ADD CONSTRAINT fail with a generic Postgres error
-- if any existing live row already holds an unsupported value — matching
-- this schema's established confirm-before-constrain idiom (see e.g.
-- 20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql).
do $$
declare
  v_invalid_count integer;
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_vocabulary_lists_target_language_allowed_values_check'
      and conrelid = 'public.user_vocabulary_lists'::regclass
  ) then
    select count(*)
      into v_invalid_count
      from public.user_vocabulary_lists
     where target_language not in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru');

    if v_invalid_count > 0 then
      raise exception
        'user_vocabulary_lists_target_language_allowed_values_check: % existing row(s) have a target_language outside en/es/fr/pt/it/de/ru — resolve before this migration can add the constraint',
        v_invalid_count;
    end if;

    alter table public.user_vocabulary_lists
      add constraint user_vocabulary_lists_target_language_allowed_values_check
      check (target_language in ('en', 'es', 'fr', 'pt', 'it', 'de', 'ru'));
  end if;
end;
$$;

-- Serves the Phase 1 read: "this user's lists for the active target
-- language", the only query shape the frontend issues. Matches the live
-- table's existing index name — IF NOT EXISTS makes this a no-op there.
create index if not exists user_vocabulary_lists_user_language_idx
  on public.user_vocabulary_lists (user_id, target_language);

-- Idempotent regardless of current state (a no-op if RLS is already
-- enabled, which it is on the live table given its existing policies).
alter table public.user_vocabulary_lists enable row level security;

-- Drops every policy this table has ever carried under any name this
-- schema has used for it — the four broad owner-scoped policies the live
-- table currently has (read/create/update/delete, i.e. direct writes were
-- allowed), plus this migration's own target name in case it has already
-- run once. On a fresh database every one of these is a no-op. The result
-- either way is exactly one SELECT policy afterward, never a duplicate.
drop policy if exists "Users can read own vocabulary lists" on public.user_vocabulary_lists;
drop policy if exists "Users can create own vocabulary lists" on public.user_vocabulary_lists;
drop policy if exists "Users can update own vocabulary lists" on public.user_vocabulary_lists;
drop policy if exists "Users can delete own vocabulary lists" on public.user_vocabulary_lists;
drop policy if exists "Users can view their own vocabulary lists" on public.user_vocabulary_lists;

create policy "Users can view their own vocabulary lists"
  on public.user_vocabulary_lists
  as permissive
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Revokes the full privilege set first (a no-op for any privilege not
-- currently held — REVOKE never errors on an absent grant), then grants
-- back exactly what's required. This is what actually closes the live
-- table's direct INSERT/UPDATE/DELETE/TRUNCATE exposure (previously gated
-- only by the four RLS policies just dropped above, not by the grant
-- layer) — every mutation goes through create_user_vocabulary_list below
-- from this point on. anon receives nothing at all, matching every other
-- protected table in this schema.
revoke select, insert, update, delete, truncate, references, trigger, maintain
  on public.user_vocabulary_lists from authenticated;
grant select on public.user_vocabulary_lists to authenticated;

revoke select, insert, update, delete, truncate, references, trigger, maintain
  on public.user_vocabulary_lists from anon;

grant select, insert, update, delete, truncate, references, trigger, maintain
  on public.user_vocabulary_lists to postgres;
grant select, insert, update, delete, truncate, references, trigger, maintain
  on public.user_vocabulary_lists to service_role;


-- ----------------------------------------------------------------------------
-- 2. create_user_vocabulary_list — narrow, ownership-enforced insert RPC
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

  return query
  insert into public.user_vocabulary_lists as uvl (user_id, target_language, name)
  values (v_user_id, p_target_language, v_name)
  returning uvl.id, uvl.user_id, uvl.target_language, uvl.name, uvl.created_at, uvl.updated_at;
end;
$function$;

revoke execute on function public.create_user_vocabulary_list(text, text) from public;
revoke execute on function public.create_user_vocabulary_list(text, text) from anon;
grant execute on function public.create_user_vocabulary_list(text, text) to postgres;
grant execute on function public.create_user_vocabulary_list(text, text) to authenticated;
grant execute on function public.create_user_vocabulary_list(text, text) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   Table: public.user_vocabulary_lists (id, user_id, target_language, name,
--     created_at, updated_at) — created here on a fresh database, or left
--     as-is (same columns, same data) if it already existed live. Named
--     CHECK constraints: user_vocabulary_lists_name_length,
--     user_vocabulary_lists_name_not_blank (preserved from the live table,
--     not duplicated), and user_vocabulary_lists_target_language_allowed_values_check
--     (added by this migration on both paths). RLS enabled, exactly one
--     policy — ownership-scoped SELECT for authenticated. Grants:
--     postgres/service_role full; authenticated SELECT only; anon none.
--   RPC: public.create_user_vocabulary_list(p_target_language text,
--     p_name text) — SECURITY DEFINER, the only write path onto this
--     table. Grants: postgres/authenticated/service_role EXECUTE;
--     public/anon explicitly revoked.
--
-- Explicitly NOT built in this migration/phase: any word-membership table,
-- any update/delete/rename RPC for a list, any uniqueness constraint on
-- list name. Untouched by this migration: every other table, RPC, policy,
-- and grant in this schema, and every existing row in
-- user_vocabulary_lists (no INSERT/UPDATE/DELETE against the table is ever
-- issued by this migration itself).
-- ============================================================================
