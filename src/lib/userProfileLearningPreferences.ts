// Strict response parser for the update_user_profile_learning_preferences RPC
// (Settings Current Level editing follow-up —
// supabase/migrations/20260813140000_add_update_user_profile_learning_preferences_rpc.sql).
// Same precedent as userProfileLanguages.ts/userProfileNickname.ts: one small
// file that only knows how to turn this one RPC's snake_case row into a
// typed, validated result.
//
// Reuses userProfileOnboarding.ts's language-code AND level-code
// allow-lists/validators instead of a third independent copy of either set —
// a one-directional lib -> lib import (userProfileOnboarding.ts does not
// import this file back), so no circular dependency is introduced. Mirrors
// userProfileLanguages.ts's own header for the identical reasoning.
//
// Imported with explicit .ts extensions so this stays loadable directly via
// Node's native TypeScript stripping for
// scripts/tests/account/test-user-profile-learning-preferences-response.mjs,
// matching src/lib/userProfileLanguages.ts's own precedent.
import { ClassifiedSupabaseError } from "./supabaseError.ts";
import {
  requireLanguageCode,
  requireLevelCode,
  type SupportedLanguageCode,
  type SupportedLevelCode,
} from "./userProfileOnboarding.ts";

interface UpdateUserProfileLearningPreferencesRpcRow {
  native_language?: unknown;
  learning_language?: unknown;
  current_level?: unknown;
  updated_at?: unknown;
}

export interface UpdateUserProfileLearningPreferencesResult {
  nativeLanguage: SupportedLanguageCode;
  learningLanguage: SupportedLanguageCode;
  currentLevel: SupportedLevelCode;
  updatedAt: string;
}

const RPC_NAME = "update_user_profile_learning_preferences";

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be a non-empty string.`,
      "unexpected_response",
    );
  }
  return value;
}

export function parseUpdateUserProfileLearningPreferencesRow(
  row: unknown,
): UpdateUserProfileLearningPreferencesResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError(`${RPC_NAME} returned a malformed row.`, "unexpected_response");
  }

  const rpcRow = row as UpdateUserProfileLearningPreferencesRpcRow;
  return {
    nativeLanguage: requireLanguageCode(rpcRow.native_language, "native_language", RPC_NAME),
    learningLanguage: requireLanguageCode(rpcRow.learning_language, "learning_language", RPC_NAME),
    currentLevel: requireLevelCode(rpcRow.current_level, "current_level", RPC_NAME),
    updatedAt: requireNonEmptyString(rpcRow.updated_at, "updated_at"),
  };
}
