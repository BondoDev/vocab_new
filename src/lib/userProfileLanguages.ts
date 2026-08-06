// Strict response parser for the update_user_profile_languages RPC — same
// precedent as userProfileOnboarding.ts/dailyGoalUpdate.ts/
// userProfileTimezone.ts: one small file that only knows how to turn this
// one RPC's snake_case row into a typed, validated result.
//
// Reuses userProfileOnboarding.ts's language-code allow-list/validator
// instead of a third independent copy of the same seven-code set — a
// one-directional lib -> lib import (userProfileOnboarding.ts does not
// import this file back), so no circular dependency is introduced.
//
// Imported with explicit .ts extensions so this stays loadable directly via
// Node's native TypeScript stripping for
// scripts/tests/account/test-user-profile-languages-response.mjs, matching
// src/lib/dailyGoalUpdate.ts's own precedent.
import { ClassifiedSupabaseError } from "./supabaseError.ts";
import { requireLanguageCode, type SupportedLanguageCode } from "./userProfileOnboarding.ts";

interface UpdateUserProfileLanguagesRpcRow {
  native_language?: unknown;
  learning_language?: unknown;
  updated_at?: unknown;
}

export interface UpdateUserProfileLanguagesResult {
  nativeLanguage: SupportedLanguageCode;
  learningLanguage: SupportedLanguageCode;
  updatedAt: string;
}

const RPC_NAME = "update_user_profile_languages";

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be a non-empty string.`,
      "unexpected_response",
    );
  }
  return value;
}

export function parseUpdateUserProfileLanguagesRow(row: unknown): UpdateUserProfileLanguagesResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError(`${RPC_NAME} returned a malformed row.`, "unexpected_response");
  }

  const rpcRow = row as UpdateUserProfileLanguagesRpcRow;
  return {
    nativeLanguage: requireLanguageCode(rpcRow.native_language, "native_language", RPC_NAME),
    learningLanguage: requireLanguageCode(rpcRow.learning_language, "learning_language", RPC_NAME),
    updatedAt: requireNonEmptyString(rpcRow.updated_at, "updated_at"),
  };
}
