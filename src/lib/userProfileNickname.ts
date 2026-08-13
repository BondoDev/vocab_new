// Strict response parser for the update_user_nickname RPC — same precedent
// as userProfileTimezone.ts/userProfileLanguages.ts/userProfileOnboarding.ts:
// one small file that only knows how to turn this one RPC's snake_case row
// into a typed, validated result.
//
// Imported with an explicit .ts extension so this stays loadable directly
// via Node's native TypeScript stripping, matching every sibling parser's
// own precedent (see e.g. userProfileTimezone.ts's header).
import { ClassifiedSupabaseError } from "./supabaseError.ts";

interface UpdateUserNicknameRpcRow {
  nickname?: unknown;
  updated_at?: unknown;
}

export interface UpdateUserNicknameResult {
  nickname: string;
  updatedAt: string;
}

const RPC_NAME = "update_user_nickname";

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be a non-empty string.`,
      "unexpected_response",
    );
  }
  return value;
}

export function parseUpdateUserNicknameRow(row: unknown): UpdateUserNicknameResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError(`${RPC_NAME} returned a malformed row.`, "unexpected_response");
  }

  const rpcRow = row as UpdateUserNicknameRpcRow;
  return {
    nickname: requireNonEmptyString(rpcRow.nickname, "nickname"),
    updatedAt: requireNonEmptyString(rpcRow.updated_at, "updated_at"),
  };
}
