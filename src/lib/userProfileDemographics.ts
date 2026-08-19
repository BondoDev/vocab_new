// Strict response parser for the update_user_profile_demographics RPC.
// Kept separate from userProfile.ts like the sibling nickname/language/
// timezone parsers: this file only validates the one RPC response shape.
//
// Imported with an explicit .ts extension so it stays loadable directly via
// Node's native TypeScript stripping, matching sibling parser modules.
import { ClassifiedSupabaseError } from "./supabaseError.ts";

interface UpdateUserProfileDemographicsRpcRow {
  user_age?: unknown;
  birth_month?: unknown;
  birth_day?: unknown;
  updated_at?: unknown;
}

export interface UpdateUserProfileDemographicsResult {
  userAge: number;
  birthMonth: number;
  birthDay: number;
  updatedAt: string;
}

const RPC_NAME = "update_user_profile_demographics";

function requireIntegerInRange(value: unknown, fieldName: string, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be an integer between ${min} and ${max}.`,
      "unexpected_response",
    );
  }
  return value;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be a non-empty string.`,
      "unexpected_response",
    );
  }
  return value;
}

export function parseUpdateUserProfileDemographicsRow(row: unknown): UpdateUserProfileDemographicsResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError(`${RPC_NAME} returned a malformed row.`, "unexpected_response");
  }

  const rpcRow = row as UpdateUserProfileDemographicsRpcRow;
  return {
    userAge: requireIntegerInRange(rpcRow.user_age, "user_age", 10, 100),
    birthMonth: requireIntegerInRange(rpcRow.birth_month, "birth_month", 1, 12),
    birthDay: requireIntegerInRange(rpcRow.birth_day, "birth_day", 1, 31),
    updatedAt: requireNonEmptyString(rpcRow.updated_at, "updated_at"),
  };
}
