import { ClassifiedSupabaseError } from "./supabaseError";

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

function requireInitializeUserTimezoneString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ClassifiedSupabaseError(
      `initialize_user_timezone returned a malformed row: ${fieldName} must be a non-empty string.`,
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
    timezone: requireInitializeUserTimezoneString(rpcRow.timezone, "timezone"),
    timezoneUpdatedAt: requireInitializeUserTimezoneString(rpcRow.timezone_updated_at, "timezone_updated_at"),
    initialized: rpcRow.initialized,
  };
}
