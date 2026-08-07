// Profile-completeness normalization, extracted from src/lib/userProfile.ts
// (test/profile-load-and-onboarding, 2026-08-07) so it can be exercised
// directly by scripts/tests/account/test-profile-load-and-onboarding.mjs via
// Node's native TypeScript stripping. src/lib/userProfile.ts itself pulls in
// src/lib/supabaseAuth.ts (import.meta.env, extensionless relative imports
// throughout that chain) and so cannot be loaded directly by a bundler-free
// Node script — the same constraint documented in
// scripts/tests/account/test-account-language-sync.mjs for
// languageProfileSyncPolicy.ts/accountLanguageSave.ts. This module has no
// such dependency: its only non-type import (isSupportedDailyGoalValue) is
// itself Node-loadable (dailyGoalUpdate.ts -> supabaseError.ts, both
// import.meta-free), and the UserProfile/LanguageLevelCode type imports are
// fully erased at runtime.
//
// Pure move, not a behavior change: userProfile.ts re-exports every symbol
// that was previously public from this module unchanged
// (DEFAULT_DAILY_GOAL, normalizeLanguage, normalizeUserProfile,
// isUserProfileComplete), and src/app/utils/accountProfile.ts now imports
// isUserProfileComplete/normalizeLanguage/normalizeUserProfile from here
// directly instead of from userProfile.ts — its own public API and every
// other consumer of userProfile.ts are unaffected.
import { isSupportedDailyGoalValue } from "../../lib/dailyGoalUpdate.ts";
import type { UILanguage } from "../../contexts/LanguageContext";
import type { LanguageLevelCode, UserProfile } from "../../lib/userProfile";

export const DEFAULT_DAILY_GOAL = 15;

export function normalizeLanguage(value: unknown): UILanguage | "" {
  if (
    value === "en" ||
    value === "es" ||
    value === "fr" ||
    value === "pt" ||
    value === "it" ||
    value === "de" ||
    value === "ru"
  ) {
    return value;
  }

  return "";
}

export function normalizeAge(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  if (rounded < 10 || rounded > 100) {
    return null;
  }

  return rounded;
}

export function normalizeBirthMonth(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!/^\d{2}$/.test(trimmed)) {
    return "";
  }

  const month = Number(trimmed);
  if (month < 1 || month > 12) {
    return "";
  }

  return trimmed;
}

export function normalizeBirthDay(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!/^\d{2}$/.test(trimmed)) {
    return "";
  }

  const day = Number(trimmed);
  if (day < 1 || day > 31) {
    return "";
  }

  return trimmed;
}

// Exactly the five supported presets (10, 15, 20, 30, 50) — not a numeric
// range. Delegates to dailyGoalUpdate.ts's isSupportedDailyGoalValue (the
// same check update_daily_goal's own response parser uses) instead of
// maintaining a second, looser definition of "valid daily goal" here. Any
// other value (malformed localStorage cache, a legacy value predating the
// exact-preset database CHECK, ...) falls back to the safe default rather
// than being accepted or rounded.
export function normalizeDailyGoal(value: unknown): number {
  return isSupportedDailyGoalValue(value) ? value : DEFAULT_DAILY_GOAL;
}

export function normalizeLanguageLevel(value: unknown): LanguageLevelCode | "" {
  if (
    value === "A1" ||
    value === "A2" ||
    value === "B1" ||
    value === "B2" ||
    value === "C1" ||
    value === "C2"
  ) {
    return value;
  }

  return "";
}

export function normalizeTimezone(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeTimestamp(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeUserProfile(value: Partial<UserProfile> | null | undefined): UserProfile {
  const nickname =
    typeof value?.nickname === "string" ? value.nickname.trim().slice(0, 40) : "";
  const languageLevel = normalizeLanguageLevel(value?.languageLevel);
  const age = normalizeAge(value?.age);
  const birthMonth = normalizeBirthMonth(value?.birthMonth);
  const birthDay = normalizeBirthDay(value?.birthDay);
  const nativeLanguage = normalizeLanguage(value?.nativeLanguage);
  const practiceLanguage = normalizeLanguage(value?.practiceLanguage);
  const dailyGoal = normalizeDailyGoal(value?.dailyGoal);
  const onboardingCompleted = Boolean(
    value?.onboardingCompleted &&
      nickname &&
      languageLevel &&
      age !== null &&
      birthMonth &&
      birthDay &&
      nativeLanguage &&
      practiceLanguage,
  );

  return {
    nickname,
    languageLevel,
    age,
    birthMonth,
    birthDay,
    nativeLanguage,
    practiceLanguage,
    onboardingCompleted,
    dailyGoal,
    updatedAt:
      typeof value?.updatedAt === "string" && value.updatedAt.trim()
        ? value.updatedAt
        : null,
    timezone: normalizeTimezone(value?.timezone),
    timezoneUpdatedAt: normalizeTimestamp(value?.timezoneUpdatedAt),
  };
}

export function isUserProfileComplete(profile: Partial<UserProfile> | null | undefined): boolean {
  const normalized = normalizeUserProfile(profile);
  return Boolean(
    normalized.nickname &&
      normalized.languageLevel &&
      normalized.age !== null &&
      normalized.birthMonth &&
      normalized.birthDay &&
      normalized.nativeLanguage &&
      normalized.practiceLanguage,
  );
}
