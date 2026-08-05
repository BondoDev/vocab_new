-- ============================================================================
-- TIMEZONE PHASE 1 - profile timezone foundation and automatic initialization
-- ============================================================================
--
-- Adds optional IANA timezone storage to user_profiles without backfilling or
-- changing historical daily statistics. Learning RPCs still accept
-- client-provided p_stat_date in this phase; server-derived stat_date is a
-- later migration.
--
-- Automatic initialization is deliberately not a general "set timezone"
-- operation. public.initialize_user_timezone(text) writes only when the stored
-- profile timezone is currently null, so two tabs, travel, or a later browser
-- report cannot silently replace a value that already exists. A future
-- Settings flow can add a separate manual replacement RPC.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Nullable profile columns; no default, no backfill.
-- ----------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists timezone text null,
  add column if not exists timezone_updated_at timestamptz null;


-- ----------------------------------------------------------------------------
-- 2. Guard timezone columns from direct client/profile-upsert writes.
-- ----------------------------------------------------------------------------
-- Existing table grants/RLS allow authenticated users to update their own
-- user_profiles rows. This trigger preserves that legacy profile-write path
-- while preventing the newly-added timezone columns from becoming directly
-- writable through generic REST PATCH/POST payloads. The initialization RPC
-- sets a transaction-local flag immediately before its own scoped update.
create or replace function public.prevent_direct_user_timezone_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if current_setting('app.allow_user_timezone_write', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.timezone is not null or new.timezone_updated_at is not null then
      raise exception
        'user_profiles timezone fields are writable only through initialize_user_timezone'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.timezone is distinct from old.timezone
     or new.timezone_updated_at is distinct from old.timezone_updated_at then
    raise exception
      'user_profiles timezone fields are writable only through initialize_user_timezone'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists prevent_direct_user_timezone_write on public.user_profiles;
create trigger prevent_direct_user_timezone_write
  before insert or update on public.user_profiles
  for each row
  execute function public.prevent_direct_user_timezone_write();

revoke execute on function public.prevent_direct_user_timezone_write() from public;


-- ----------------------------------------------------------------------------
-- 3. Automatic-only timezone initialization RPC.
-- ----------------------------------------------------------------------------
create or replace function public.initialize_user_timezone(p_timezone text)
returns table (
  timezone text,
  timezone_updated_at timestamp with time zone,
  initialized boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_timezone text := btrim(p_timezone);
  v_now timestamptz := now();
  v_row_count integer;
begin
  if v_user_id is null then
    raise exception
      'initialize_user_timezone: authentication required'
      using errcode = '28000';
  end if;

  if p_timezone is null or length(v_timezone) = 0 then
    raise exception
      'initialize_user_timezone: p_timezone is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as tzn
    where tzn.name = v_timezone
  ) then
    raise exception
      'initialize_user_timezone: p_timezone must be a valid IANA timezone'
      using errcode = '22023';
  end if;

  perform set_config('app.allow_user_timezone_write', 'on', true);

  update public.user_profiles as up
     set timezone = v_timezone,
         timezone_updated_at = v_now,
         updated_at = v_now
   where up.id = v_user_id
     and up.timezone is null;

  get diagnostics v_row_count = row_count;

  if v_row_count > 0 then
    return query select v_timezone, v_now, true;
    return;
  end if;

  return query
  select up.timezone, up.timezone_updated_at, false
    from public.user_profiles as up
   where up.id = v_user_id;

  if not found then
    raise exception
      'initialize_user_timezone: profile row not found'
      using errcode = '42501';
  end if;
end;
$function$;

revoke execute on function public.initialize_user_timezone(text) from public;
revoke execute on function public.initialize_user_timezone(text) from anon;
grant execute on function public.initialize_user_timezone(text) to postgres;
grant execute on function public.initialize_user_timezone(text) to authenticated;
grant execute on function public.initialize_user_timezone(text) to service_role;


-- ============================================================================
-- POST-MIGRATION STATE
-- ============================================================================
--   public.user_profiles.timezone              text null, no default
--   public.user_profiles.timezone_updated_at   timestamptz null, no default
--
--   public.initialize_user_timezone(text)
--     - authenticated/postgres/service_role EXECUTE
--     - PUBLIC/anon EXECUTE revoked
--     - validates against pg_catalog.pg_timezone_names
--     - updates only timezone, timezone_updated_at, and updated_at
--     - updates only when the stored timezone is currently null
--     - never inserts a missing profile row
--
--   public.prevent_direct_user_timezone_write()
--     - blocks direct INSERT/UPDATE changes to timezone columns unless a
--       transaction-local flag is set by the initialization RPC
--
-- Untouched: learning RPC signatures and p_stat_date behavior, streak logic,
-- user_daily_stats rows, historical statistics, and all prior migrations.
-- ============================================================================
