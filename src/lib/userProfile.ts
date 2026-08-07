import type { UILanguage } from "../contexts/LanguageContext";
import {
  ensureFreshSupabaseSession,
  getAuthHeaders,
  refreshSupabaseSession,
  supabaseRequest,
  type StoredSupabaseSession,
} from "./supabaseAuth";
import { ClassifiedSupabaseError } from "./supabaseError";
import {
  parseInitializeUserTimezoneRow,
  type InitializeUserTimezoneResult,
} from "./userProfileTimezone";
import {
  parseUpdateDailyGoalRow,
  type UpdateDailyGoalResult,
} from "./dailyGoalUpdate";
import {
  parseCompleteUserProfileOnboardingRow,
  type CompleteUserProfileOnboardingResult,
} from "./userProfileOnboarding";
import {
  parseUpdateUserProfileLanguagesRow,
  type UpdateUserProfileLanguagesResult,
} from "./userProfileLanguages";
// Profile-completeness normalization (normalizeUserProfile,
// isUserProfileComplete, the per-field normalizers, and DEFAULT_DAILY_GOAL)
// moved to accountProfileCompleteness.ts (test/profile-load-and-onboarding,
// 2026-08-07) so it can be loaded directly by a bundler-free Node test
// script — see that file's header for why. Re-exported below so every
// existing consumer of these four names from "../../lib/userProfile" is
// unaffected.
import {
  DEFAULT_DAILY_GOAL,
  normalizeLanguage,
  normalizeLanguageLevel,
  normalizeAge,
  normalizeDailyGoal,
  normalizeTimezone,
  normalizeTimestamp,
  normalizeUserProfile,
  buildStoredUserProfile,
  isUserProfileComplete,
} from "../app/utils/accountProfileCompleteness";

export {
  DEFAULT_DAILY_GOAL,
  normalizeLanguage,
  normalizeUserProfile,
  isUserProfileComplete,
};

const USER_PROFILE_KEY_PREFIX = "app.userProfile";

export type LanguageLevelCode = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface UserProfile {
  nickname: string;
  languageLevel: LanguageLevelCode | "";
  age: number | null;
  birthMonth: string;
  birthDay: string;
  nativeLanguage: UILanguage | "";
  practiceLanguage: UILanguage | "";
  onboardingCompleted: boolean;
  dailyGoal: number;
  updatedAt: string | null;
  timezone: string | null;
  timezoneUpdatedAt: string | null;
}

export const EMPTY_USER_PROFILE: UserProfile = {
  nickname: "",
  languageLevel: "",
  age: null,
  birthMonth: "",
  birthDay: "",
  nativeLanguage: "",
  practiceLanguage: "",
  onboardingCompleted: false,
  dailyGoal: DEFAULT_DAILY_GOAL,
  updatedAt: null,
  timezone: null,
  timezoneUpdatedAt: null,
};

export function startsWithLetter(value: string): boolean {
  return /^\p{L}/u.test(value.trim());
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function buildStorageKey(userId: string) {
  return `${USER_PROFILE_KEY_PREFIX}.${userId}`;
}

interface UserProfilesRow {
  id: string;
  nickname: string | null;
  native_language: string | null;
  learning_language: string | null;
  current_level: string | null;
  user_age: number | null;
  birth_month: number | null;
  birth_day: number | null;
  onboarding_completed: boolean | null;
  daily_goal: number | null;
  updated_at: string | null;
  timezone: string | null;
  timezone_updated_at: string | null;
}

function getAuthorizedHeaders(session: StoredSupabaseSession) {
  return {
    ...getAuthHeaders(),
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function supabaseProfileRequest<TResponse>(
  session: StoredSupabaseSession,
  path: string,
  options: RequestInit = {},
): Promise<TResponse> {
  const freshSession = await ensureFreshSupabaseSession(session);
  const requestHeaders = options.headers ?? {};

  try {
    return await supabaseRequest<TResponse>(path, {
      ...options,
      headers: {
        ...requestHeaders,
        ...getAuthorizedHeaders(freshSession),
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || !/jwt expired/i.test(error.message)) {
      throw error;
    }

    const refreshedSession = await refreshSupabaseSession(freshSession);
    return supabaseRequest<TResponse>(path, {
      ...options,
      headers: {
        ...requestHeaders,
        ...getAuthorizedHeaders(refreshedSession),
      },
    });
  }
}

function fromSupabaseProfileRow(row: UserProfilesRow | null | undefined): Partial<UserProfile> {
  if (!row) {
    return {};
  }

  return {
    nickname:
      typeof row.nickname === "string" ? row.nickname.trim().slice(0, 40) : "",
    nativeLanguage: normalizeLanguage(row.native_language),
    practiceLanguage: normalizeLanguage(row.learning_language),
    languageLevel: normalizeLanguageLevel(row.current_level),
    age: normalizeAge(row.user_age),
    birthMonth:
      typeof row.birth_month === "number"
        ? String(row.birth_month).padStart(2, "0")
        : "",
    birthDay:
      typeof row.birth_day === "number"
        ? String(row.birth_day).padStart(2, "0")
        : "",
    onboardingCompleted: Boolean(row.onboarding_completed),
    dailyGoal: normalizeDailyGoal(row.daily_goal),
    updatedAt: normalizeTimestamp(row.updated_at),
    timezone: normalizeTimezone(row.timezone),
    timezoneUpdatedAt: normalizeTimestamp(row.timezone_updated_at),
  };
}

export function readStoredUserProfile(userId: string): UserProfile | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(buildStorageKey(userId));
  if (!rawValue) {
    return null;
  }

  try {
    return normalizeUserProfile(JSON.parse(rawValue) as Partial<UserProfile>);
  } catch {
    window.localStorage.removeItem(buildStorageKey(userId));
    return null;
  }
}

export function writeStoredUserProfile(userId: string, profile: Partial<UserProfile>): UserProfile {
  const nextProfile = buildStoredUserProfile(profile);

  if (canUseLocalStorage()) {
    window.localStorage.setItem(buildStorageKey(userId), JSON.stringify(nextProfile));
  }

  return nextProfile;
}

export async function readSupabaseUserProfile(
  session: StoredSupabaseSession,
): Promise<Partial<UserProfile> | null> {
  const userId = session.user?.id;
  if (!userId) {
    return null;
  }

  const rows = await supabaseProfileRequest<UserProfilesRow[]>(
    session,
    `/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=id,nickname,native_language,learning_language,current_level,user_age,birth_month,birth_day,onboarding_completed,daily_goal,updated_at,timezone,timezone_updated_at`,
    {
      method: "GET",
    },
  );

  if (!rows.length) {
    return null;
  }

  return fromSupabaseProfileRow(rows[0]);
}

export async function initializeUserTimezone(
  session: StoredSupabaseSession,
  timezone: string,
): Promise<InitializeUserTimezoneResult> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const rows = await supabaseProfileRequest<unknown[] | unknown>(
    session,
    "/rest/v1/rpc/initialize_user_timezone",
    {
      method: "POST",
      body: JSON.stringify({ p_timezone: timezone }),
    },
  );

  if (Array.isArray(rows)) {
    if (rows.length !== 1) {
      throw new ClassifiedSupabaseError(
        "initialize_user_timezone returned an unexpected number of rows.",
        "unexpected_response",
      );
    }
    return parseInitializeUserTimezoneRow(rows[0]);
  }

  return parseInitializeUserTimezoneRow(rows);
}

// Streak Phase 1's narrow goal-update path — replaces DailyGoalSelector's
// previous call to the broad writeSupabaseUserProfile upsert (removed in
// Profile Phase 1 — see completeUserProfileOnboarding/
// updateUserProfileLanguages below for its narrow replacements), which
// re-sent all 11 profile fields for a single-field change. Sends only
// p_daily_goal; the update_daily_goal RPC (see
// supabase/migrations/20260806190000_add_daily_goal_snapshot_and_update_rpc.sql)
// derives the caller and today's date server-side, updates
// user_profiles.daily_goal, and syncs today's (only today's)
// user_daily_stats.daily_goal rows in the same transaction.
export async function updateDailyGoal(
  session: StoredSupabaseSession,
  dailyGoal: number,
): Promise<UpdateDailyGoalResult> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const rows = await supabaseProfileRequest<unknown[] | unknown>(
    session,
    "/rest/v1/rpc/update_daily_goal",
    {
      method: "POST",
      body: JSON.stringify({ p_daily_goal: dailyGoal }),
    },
  );

  if (Array.isArray(rows)) {
    if (rows.length !== 1) {
      throw new ClassifiedSupabaseError(
        "update_daily_goal returned an unexpected number of rows.",
        "unexpected_response",
      );
    }
    return parseUpdateDailyGoalRow(rows[0]);
  }

  return parseUpdateDailyGoalRow(rows);
}

// Profile Phase 1's narrow onboarding path — replaces the former broad
// writeSupabaseUserProfile upsert (POST /rest/v1/user_profiles, direct table
// write) that onboarding used to call. Sends only the seven fields
// onboarding owns; complete_user_profile_onboarding (see
// supabase/migrations/20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql)
// derives the caller server-side, sets onboarding_completed itself, and
// never touches daily_goal/timezone/timezone_updated_at/created_at — a
// stale or default-valued in-memory dailyGoal can no longer be re-sent
// and silently overwrite a value saved through the narrow update_daily_goal
// path. authenticated no longer holds direct INSERT/
// UPDATE privileges on user_profiles at all (same migration) — this RPC is
// the only remaining way to create or complete onboarding for a profile row
// from the frontend.
function fromCompleteUserProfileOnboardingResult(
  result: CompleteUserProfileOnboardingResult,
): Partial<UserProfile> {
  return {
    nickname: result.nickname,
    nativeLanguage: result.nativeLanguage,
    practiceLanguage: result.learningLanguage,
    languageLevel: result.currentLevel,
    age: result.userAge,
    birthMonth: String(result.birthMonth).padStart(2, "0"),
    birthDay: String(result.birthDay).padStart(2, "0"),
    onboardingCompleted: result.onboardingCompleted,
    dailyGoal: result.dailyGoal,
    timezone: result.timezone,
    timezoneUpdatedAt: result.timezoneUpdatedAt,
    updatedAt: result.updatedAt,
  };
}

export interface CompleteUserProfileOnboardingInput {
  nickname: string;
  nativeLanguage: UILanguage;
  practiceLanguage: UILanguage;
  languageLevel: LanguageLevelCode;
  age: number;
  // Two-digit strings ("01".."12" / "01".."31"), matching UserProfile's own
  // birthMonth/birthDay representation — converted to integers only in the
  // request body sent to the RPC below.
  birthMonth: string;
  birthDay: string;
}

export async function completeUserProfileOnboarding(
  session: StoredSupabaseSession,
  input: CompleteUserProfileOnboardingInput,
): Promise<Partial<UserProfile>> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const rows = await supabaseProfileRequest<unknown[] | unknown>(
    session,
    "/rest/v1/rpc/complete_user_profile_onboarding",
    {
      method: "POST",
      body: JSON.stringify({
        p_nickname: input.nickname,
        p_native_language: input.nativeLanguage,
        p_learning_language: input.practiceLanguage,
        p_current_level: input.languageLevel,
        p_user_age: input.age,
        p_birth_month: Number(input.birthMonth),
        p_birth_day: Number(input.birthDay),
      }),
    },
  );

  if (Array.isArray(rows)) {
    if (rows.length !== 1) {
      throw new ClassifiedSupabaseError(
        "complete_user_profile_onboarding returned an unexpected number of rows.",
        "unexpected_response",
      );
    }
    return fromCompleteUserProfileOnboardingResult(parseCompleteUserProfileOnboardingRow(rows[0]));
  }

  return fromCompleteUserProfileOnboardingResult(parseCompleteUserProfileOnboardingRow(rows));
}

// Profile Phase 1's narrow language-change path — replaces the former broad
// writeSupabaseUserProfile upsert the account-language-confirm popup used to
// call. Sends only the two language fields; update_user_profile_languages
// (same migration as above) updates only native_language/learning_language/
// updated_at and rejects a caller with no existing profile row rather than
// implicitly creating an incomplete one. daily_goal, timezone, onboarding
// fields, and demographic fields are structurally unreachable through this
// path.
function fromUpdateUserProfileLanguagesResult(
  result: UpdateUserProfileLanguagesResult,
): Partial<UserProfile> {
  return {
    nativeLanguage: result.nativeLanguage,
    practiceLanguage: result.learningLanguage,
    updatedAt: result.updatedAt,
  };
}

export interface UpdateUserProfileLanguagesInput {
  nativeLanguage: UILanguage;
  practiceLanguage: UILanguage;
}

export async function updateUserProfileLanguages(
  session: StoredSupabaseSession,
  input: UpdateUserProfileLanguagesInput,
): Promise<Partial<UserProfile>> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const rows = await supabaseProfileRequest<unknown[] | unknown>(
    session,
    "/rest/v1/rpc/update_user_profile_languages",
    {
      method: "POST",
      body: JSON.stringify({
        p_native_language: input.nativeLanguage,
        p_learning_language: input.practiceLanguage,
      }),
    },
  );

  if (Array.isArray(rows)) {
    if (rows.length !== 1) {
      throw new ClassifiedSupabaseError(
        "update_user_profile_languages returned an unexpected number of rows.",
        "unexpected_response",
      );
    }
    return fromUpdateUserProfileLanguagesResult(parseUpdateUserProfileLanguagesRow(rows[0]));
  }

  return fromUpdateUserProfileLanguagesResult(parseUpdateUserProfileLanguagesRow(rows));
}
