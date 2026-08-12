// Imported with an explicit .ts extension — matches
// userProfileOnboarding.ts/userProfileLanguages.ts/dailyGoalUpdate.ts's own
// precedent (see their headers) so this file stays loadable directly via
// Node's native TypeScript stripping, e.g. by
// scripts/tests/live/scenarios/timezone.mjs. No behavior change under Vite
// either way — its bundler resolver accepts both forms.
import { ClassifiedSupabaseError } from "./supabaseError.ts";

interface InitializeUserTimezoneRpcRow {
  timezone?: unknown;
  timezone_updated_at?: unknown;
  initialized?: unknown;
}

export interface InitializeUserTimezoneResult {
  timezone: string;
  timezoneUpdatedAt: string;
  initialized: boolean;
}

// Shared by both timezone RPC parsers below (initialize_user_timezone and
// update_user_timezone return the same timezone/timezone_updated_at string
// pair, differing only in their third, RPC-specific boolean field) —
// parametrized by rpcName so each parser's error message still names the
// actual RPC that returned the malformed row.
function requireTimezoneRowString(value: unknown, fieldName: string, rpcName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ClassifiedSupabaseError(
      `${rpcName} returned a malformed row: ${fieldName} must be a non-empty string.`,
      "unexpected_response",
    );
  }

  return value.trim();
}

export function parseInitializeUserTimezoneRow(row: unknown): InitializeUserTimezoneResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError(
      "initialize_user_timezone returned a malformed row.",
      "unexpected_response",
    );
  }

  const rpcRow = row as InitializeUserTimezoneRpcRow;
  if (typeof rpcRow.initialized !== "boolean") {
    throw new ClassifiedSupabaseError(
      "initialize_user_timezone returned a malformed row: initialized must be a boolean.",
      "unexpected_response",
    );
  }

  return {
    timezone: requireTimezoneRowString(rpcRow.timezone, "timezone", "initialize_user_timezone"),
    timezoneUpdatedAt: requireTimezoneRowString(rpcRow.timezone_updated_at, "timezone_updated_at", "initialize_user_timezone"),
    initialized: rpcRow.initialized,
  };
}

// Settings backend follow-up — parser for update_user_timezone (see
// supabase/migrations/20260812120000_add_update_user_timezone_rpc.sql),
// the explicit-replacement counterpart to initialize_user_timezone above.
// Same RETURNS TABLE shape (timezone, timezone_updated_at, + one boolean)
// but the boolean is named `updated`, not `initialized` — deliberately
// separate types/parsers so a caller can never accidentally pass one RPC's
// result off as the other's (the two mean different things: `initialized`
// is genuinely conditional, `updated` is always true on success here).
interface UpdateUserTimezoneRpcRow {
  timezone?: unknown;
  timezone_updated_at?: unknown;
  updated?: unknown;
}

export interface UpdateUserTimezoneResult {
  timezone: string;
  timezoneUpdatedAt: string;
  updated: boolean;
}

export function parseUpdateUserTimezoneRow(row: unknown): UpdateUserTimezoneResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError(
      "update_user_timezone returned a malformed row.",
      "unexpected_response",
    );
  }

  const rpcRow = row as UpdateUserTimezoneRpcRow;
  if (typeof rpcRow.updated !== "boolean") {
    throw new ClassifiedSupabaseError(
      "update_user_timezone returned a malformed row: updated must be a boolean.",
      "unexpected_response",
    );
  }

  return {
    timezone: requireTimezoneRowString(rpcRow.timezone, "timezone", "update_user_timezone"),
    timezoneUpdatedAt: requireTimezoneRowString(rpcRow.timezone_updated_at, "timezone_updated_at", "update_user_timezone"),
    updated: rpcRow.updated,
  };
}
