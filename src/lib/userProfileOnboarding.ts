// Strict response parser for the complete_user_profile_onboarding RPC — kept
// separate from userProfile.ts the same way userProfileTimezone.ts/
// dailyGoalUpdate.ts are kept separate from their own call sites: one small
// file that only knows how to turn the RPC's snake_case row into a typed,
// validated result, reused by nothing else except userProfileLanguages.ts
// (which imports only the language-code allow-list/validator below to avoid
// a third independent copy of the same seven-code set — see that file's own
// header).
//
// Imported with explicit .ts extensions throughout (tsconfig's
// allowImportingTsExtensions) so this stays loadable directly via Node's
// native TypeScript stripping for
// scripts/tests/account/test-user-profile-onboarding-response.mjs, matching
// src/lib/dailyGoalUpdate.ts's own precedent for the same reason.
import { ClassifiedSupabaseError } from "./supabaseError.ts";
import { isSupportedDailyGoalValue, type SupportedDailyGoalValue } from "./dailyGoalUpdate.ts";

// The only supported language codes — mirrors src/lib/userProfile.ts's
// normalizeLanguage allow-list and the database's new
// user_profiles_native_language_allowed_values_check /
// user_profiles_learning_language_allowed_values_check constraints
// (supabase/migrations/20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql).
// Kept here rather than imported from userProfile.ts to avoid a
// lib -> lib circular dependency (userProfile.ts imports this file's parser
// below); userProfileLanguages.ts imports this constant/validator instead of
// redefining a third copy.
export const SUPPORTED_LANGUAGE_CODES = ["en", "es", "fr", "pt", "it", "de", "ru"] as const;
export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export function isSupportedLanguageCode(value: unknown): value is SupportedLanguageCode {
  return typeof value === "string" && (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(value);
}

export function requireLanguageCode(
  value: unknown,
  fieldName: string,
  rpcName: string,
): SupportedLanguageCode {
  if (!isSupportedLanguageCode(value)) {
    throw new ClassifiedSupabaseError(
      `${rpcName} returned a malformed row: ${fieldName} must be one of ${SUPPORTED_LANGUAGE_CODES.join(", ")}.`,
      "unexpected_response",
    );
  }
  return value;
}

// The only supported CEFR level codes — mirrors src/lib/userProfile.ts's
// normalizeLanguageLevel allow-list and the database's new
// user_profiles_current_level_allowed_values_check constraint.
const SUPPORTED_LEVEL_CODES = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type SupportedLevelCode = (typeof SUPPORTED_LEVEL_CODES)[number];

function isSupportedLevelCode(value: unknown): value is SupportedLevelCode {
  return typeof value === "string" && (SUPPORTED_LEVEL_CODES as readonly string[]).includes(value);
}

interface CompleteUserProfileOnboardingRpcRow {
  nickname?: unknown;
  native_language?: unknown;
  learning_language?: unknown;
  current_level?: unknown;
  user_age?: unknown;
  birth_month?: unknown;
  birth_day?: unknown;
  onboarding_completed?: unknown;
  daily_goal?: unknown;
  timezone?: unknown;
  timezone_updated_at?: unknown;
  updated_at?: unknown;
}

export interface CompleteUserProfileOnboardingResult {
  nickname: string;
  nativeLanguage: SupportedLanguageCode;
  learningLanguage: SupportedLanguageCode;
  currentLevel: SupportedLevelCode;
  userAge: number;
  birthMonth: number;
  birthDay: number;
  onboardingCompleted: boolean;
  dailyGoal: SupportedDailyGoalValue;
  timezone: string | null;
  timezoneUpdatedAt: string | null;
  updatedAt: string;
}

const RPC_NAME = "complete_user_profile_onboarding";

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be a non-empty string.`,
      "unexpected_response",
    );
  }
  return value;
}

function optionalNonEmptyString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be null or a non-empty string.`,
      "unexpected_response",
    );
  }
  return value;
}

function requireLevelCode(value: unknown): SupportedLevelCode {
  if (!isSupportedLevelCode(value)) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: current_level must be one of ${SUPPORTED_LEVEL_CODES.join(", ")}.`,
      "unexpected_response",
    );
  }
  return value;
}

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

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be a boolean.`,
      "unexpected_response",
    );
  }
  return value;
}

function requireDailyGoal(value: unknown): SupportedDailyGoalValue {
  if (!isSupportedDailyGoalValue(value)) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: daily_goal must be one of 10, 15, 20, 30, 50.`,
      "unexpected_response",
    );
  }
  return value;
}

export function parseCompleteUserProfileOnboardingRow(row: unknown): CompleteUserProfileOnboardingResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError(`${RPC_NAME} returned a malformed row.`, "unexpected_response");
  }

  const rpcRow = row as CompleteUserProfileOnboardingRpcRow;
  return {
    nickname: requireNonEmptyString(rpcRow.nickname, "nickname"),
    nativeLanguage: requireLanguageCode(rpcRow.native_language, "native_language", RPC_NAME),
    learningLanguage: requireLanguageCode(rpcRow.learning_language, "learning_language", RPC_NAME),
    currentLevel: requireLevelCode(rpcRow.current_level),
    userAge: requireIntegerInRange(rpcRow.user_age, "user_age", 10, 100),
    birthMonth: requireIntegerInRange(rpcRow.birth_month, "birth_month", 1, 12),
    birthDay: requireIntegerInRange(rpcRow.birth_day, "birth_day", 1, 31),
    onboardingCompleted: requireBoolean(rpcRow.onboarding_completed, "onboarding_completed"),
    dailyGoal: requireDailyGoal(rpcRow.daily_goal),
    timezone: optionalNonEmptyString(rpcRow.timezone, "timezone"),
    timezoneUpdatedAt: optionalNonEmptyString(rpcRow.timezone_updated_at, "timezone_updated_at"),
    updatedAt: requireNonEmptyString(rpcRow.updated_at, "updated_at"),
  };
}
