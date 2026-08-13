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
  parseUpdateUserTimezoneRow,
  type InitializeUserTimezoneResult,
  type UpdateUserTimezoneResult,
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
import {
  parseUpdateUserProfileLearningPreferencesRow,
  type UpdateUserProfileLearningPreferencesResult,
} from "./userProfileLearningPreferences";
import {
  parseUpdateUserNicknameRow,
  type UpdateUserNicknameResult,
} from "./userProfileNickname";
import {
  parseResetLearningLanguageProgressRow,
  type ResetLearningLanguageProgressResult,
} from "./learningProgressReset";
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
  startsWithLetter,
} from "../app/utils/accountProfileCompleteness";

export {
  DEFAULT_DAILY_GOAL,
  normalizeLanguage,
  normalizeUserProfile,
  isUserProfileComplete,
  startsWithLetter,
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

// Settings' account-deletion success path (and nothing else today) — removes
// this account's cached profile from localStorage so a stale nickname/
// language pair can never be read back for a since-deleted account. Narrow
// on purpose: unlike signOutSupabase (src/lib/supabaseAuth.ts), an ordinary
// sign-out deliberately leaves this cache in place (so the same account's
// profile still shows instantly on the next sign-in) - only account deletion
// needs it gone for good.
export function clearStoredUserProfile(userId: string): void {
  if (canUseLocalStorage()) {
    window.localStorage.removeItem(buildStorageKey(userId));
  }
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

// Settings backend follow-up — explicit "change my timezone" write, distinct
// from initializeUserTimezone above. Calls update_user_timezone (see
// supabase/migrations/20260812120000_add_update_user_timezone_rpc.sql),
// which unconditionally replaces the caller's stored timezone (including an
// already-set one) — unlike initialize_user_timezone's null-only guard.
// Settings' Save action (both "Use current timezone" and the searchable
// selector) calls this function; useUserProfileLoad.ts's automatic
// first-load initialization keeps calling initializeUserTimezone above,
// unchanged — the two responsibilities are deliberately never conflated.
export async function updateUserTimezone(
  session: StoredSupabaseSession,
  timezone: string,
): Promise<UpdateUserTimezoneResult> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const rows = await supabaseProfileRequest<unknown[] | unknown>(
    session,
    "/rest/v1/rpc/update_user_timezone",
    {
      method: "POST",
      body: JSON.stringify({ p_timezone: timezone }),
    },
  );

  if (Array.isArray(rows)) {
    if (rows.length !== 1) {
      throw new ClassifiedSupabaseError(
        "update_user_timezone returned an unexpected number of rows.",
        "unexpected_response",
      );
    }
    return parseUpdateUserTimezoneRow(rows[0]);
  }

  return parseUpdateUserTimezoneRow(rows);
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

// Settings' Current Level editing follow-up — the Languages card's actual
// Save path as of this change. Distinct RPC from updateUserProfileLanguages
// above (kept intact, untouched, for any other caller — see
// update_user_profile_learning_preferences's own migration header for why a
// new function was added instead of widening the existing one): this one
// atomically writes native_language + learning_language + current_level in
// a single update_user_profile_learning_preferences call, so a mid-save
// failure can never leave only some of the three fields persisted. Sends
// exactly these three fields; the RPC rejects a caller with no existing
// profile row rather than implicitly creating an incomplete one, same as
// updateUserProfileLanguages.
function fromUpdateUserProfileLearningPreferencesResult(
  result: UpdateUserProfileLearningPreferencesResult,
): Partial<UserProfile> {
  return {
    nativeLanguage: result.nativeLanguage,
    practiceLanguage: result.learningLanguage,
    languageLevel: result.currentLevel,
    updatedAt: result.updatedAt,
  };
}

export interface UpdateUserProfileLearningPreferencesInput {
  nativeLanguage: UILanguage;
  practiceLanguage: UILanguage;
  languageLevel: LanguageLevelCode;
}

export async function updateUserProfileLearningPreferences(
  session: StoredSupabaseSession,
  input: UpdateUserProfileLearningPreferencesInput,
): Promise<Partial<UserProfile>> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const rows = await supabaseProfileRequest<unknown[] | unknown>(
    session,
    "/rest/v1/rpc/update_user_profile_learning_preferences",
    {
      method: "POST",
      body: JSON.stringify({
        p_native_language: input.nativeLanguage,
        p_learning_language: input.practiceLanguage,
        p_current_level: input.languageLevel,
      }),
    },
  );

  if (Array.isArray(rows)) {
    if (rows.length !== 1) {
      throw new ClassifiedSupabaseError(
        "update_user_profile_learning_preferences returned an unexpected number of rows.",
        "unexpected_response",
      );
    }
    return fromUpdateUserProfileLearningPreferencesResult(parseUpdateUserProfileLearningPreferencesRow(rows[0]));
  }

  return fromUpdateUserProfileLearningPreferencesResult(parseUpdateUserProfileLearningPreferencesRow(rows));
}

// Settings' nickname-editing follow-up — narrow "change my nickname" write,
// distinct from both completeUserProfileOnboarding (bundles nickname with
// six unrelated onboarding fields) and updateUserProfileLanguages (a
// different single-purpose RPC entirely). Calls update_user_nickname (see
// supabase/migrations/20260813130000_add_update_user_nickname_rpc.sql),
// which updates only nickname/updated_at for the caller's own row —
// native_language/learning_language/current_level/user_age/birth_month/
// birth_day/onboarding_completed/daily_goal/timezone/timezone_updated_at are
// structurally unreachable through this path. Settings' inline Account-
// section nickname edit row is the only caller.
export async function updateUserNickname(
  session: StoredSupabaseSession,
  nickname: string,
): Promise<UpdateUserNicknameResult> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const rows = await supabaseProfileRequest<unknown[] | unknown>(
    session,
    "/rest/v1/rpc/update_user_nickname",
    {
      method: "POST",
      body: JSON.stringify({
        p_nickname: nickname,
      }),
    },
  );

  if (Array.isArray(rows)) {
    if (rows.length !== 1) {
      throw new ClassifiedSupabaseError(
        "update_user_nickname returned an unexpected number of rows.",
        "unexpected_response",
      );
    }
    return parseUpdateUserNicknameRow(rows[0]);
  }

  return parseUpdateUserNicknameRow(rows);
}

// Settings' "Reset language progress" action. Calls
// reset_learning_language_progress (see
// supabase/migrations/20260808120000_add_learning_language_progress_reset_rpc.sql)
// with only the target language — the caller identity comes exclusively from
// auth.uid() inside the function itself, never a parameter here.
//
// ACTIVATED (Settings backend follow-up,
// supabase/migrations/20260812130000_activate_learning_progress_reset_rpc.sql):
// `authenticated` now holds EXECUTE on this function — see that migration's
// own header for the full security re-audit performed before granting it.
// The function's own definition (identity, validation, deletion scoping) is
// unchanged from the original migration; only its reachability changed.
export async function resetLearningLanguageProgress(
  session: StoredSupabaseSession,
  targetLanguage: UILanguage,
): Promise<ResetLearningLanguageProgressResult> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const rows = await supabaseProfileRequest<unknown[] | unknown>(
    session,
    "/rest/v1/rpc/reset_learning_language_progress",
    {
      method: "POST",
      body: JSON.stringify({
        p_target_language: targetLanguage,
      }),
    },
  );

  if (Array.isArray(rows)) {
    if (rows.length !== 1) {
      throw new ClassifiedSupabaseError(
        "reset_learning_language_progress returned an unexpected number of rows.",
        "unexpected_response",
      );
    }
    return parseResetLearningLanguageProgressRow(rows[0]);
  }

  return parseResetLearningLanguageProgressRow(rows);
}
