import type { UILanguage } from "../contexts/LanguageContext";
import {
  ensureFreshSupabaseSession,
  getAuthHeaders,
  refreshSupabaseSession,
  supabaseRequest,
  type StoredSupabaseSession,
} from "./supabaseAuth";

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
  updatedAt: string | null;
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
  updatedAt: null,
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function buildStorageKey(userId: string) {
  return `${USER_PROFILE_KEY_PREFIX}.${userId}`;
}

function normalizeLanguage(value: unknown): UILanguage | "" {
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

function normalizeAge(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  if (rounded < 10 || rounded > 100) {
    return null;
  }

  return rounded;
}

function normalizeBirthMonth(value: unknown): string {
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

function normalizeBirthDay(value: unknown): string {
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

function normalizeLanguageLevel(value: unknown): LanguageLevelCode | "" {
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
  updated_at: string | null;
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

function toSupabaseProfilePatch(profile: Partial<UserProfile>) {
  const normalized = normalizeUserProfile(profile);
  const timestamp = new Date().toISOString();

  return {
    nickname: normalized.nickname || null,
    native_language: normalized.nativeLanguage || null,
    learning_language: normalized.practiceLanguage || null,
    current_level: normalized.languageLevel || null,
    user_age: normalized.age,
    birth_month: normalized.birthMonth ? Number(normalized.birthMonth) : null,
    birth_day: normalized.birthDay ? Number(normalized.birthDay) : null,
    onboarding_completed: normalized.onboardingCompleted,
    updated_at: timestamp,
    last_active_at: timestamp,
  };
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
    updatedAt: row.updated_at ?? null,
  };
}

export function normalizeUserProfile(value: Partial<UserProfile> | null | undefined): UserProfile {
  const nickname =
    typeof value?.nickname === "string"
      ? value.nickname.trim().slice(0, 40)
      : EMPTY_USER_PROFILE.nickname;
  const languageLevel = normalizeLanguageLevel(value?.languageLevel);
  const age = normalizeAge(value?.age);
  const birthMonth = normalizeBirthMonth(value?.birthMonth);
  const birthDay = normalizeBirthDay(value?.birthDay);
  const nativeLanguage = normalizeLanguage(value?.nativeLanguage);
  const practiceLanguage = normalizeLanguage(value?.practiceLanguage);
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
    updatedAt:
      typeof value?.updatedAt === "string" && value.updatedAt.trim()
        ? value.updatedAt
        : null,
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
  const nextProfile = normalizeUserProfile({
    ...profile,
    onboardingCompleted: isUserProfileComplete(profile),
    updatedAt: new Date().toISOString(),
  });

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
    `/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=id,nickname,native_language,learning_language,current_level,user_age,birth_month,birth_day,onboarding_completed,updated_at`,
    {
      method: "GET",
    },
  );

  if (!rows.length) {
    return null;
  }

  return fromSupabaseProfileRow(rows[0]);
}

export async function writeSupabaseUserProfile(
  session: StoredSupabaseSession,
  profile: Partial<UserProfile>,
): Promise<Partial<UserProfile>> {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing authenticated user.");
  }

  const payload = {
    id: userId,
    ...toSupabaseProfilePatch(profile),
  };

  const rows = await supabaseProfileRequest<UserProfilesRow[]>(
    session,
    "/rest/v1/user_profiles",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation,missing=default",
      },
      body: JSON.stringify(payload),
    },
  );

  return fromSupabaseProfileRow(rows[0]);
}
