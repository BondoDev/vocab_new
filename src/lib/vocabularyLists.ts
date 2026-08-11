// Supabase access for "My Lists" (Phase 1): reading a signed-in user's
// vocabulary-list rows for the active target language, and creating a new
// list. This module is the only place that knows about
// public.user_vocabulary_lists — mirrors newWordProgress.ts's own
// one-module-per-table convention.
//
// Phase 1 deliberately supports only read + create. No update/delete/rename
// path exists yet, and none of this module resolves word membership —
// user_vocabulary_lists is organization-only; word state stays owned by
// user_word_progress (see the migration's own header for the full
// rationale). Do not add vocabulary.json imports or word resolution here.
import {
  ensureFreshSupabaseSession,
  getAuthHeaders,
  refreshSupabaseSession,
  supabaseRequest,
  type StoredSupabaseSession,
} from "./supabaseAuth";
import { classifySupabaseError, describeSupabaseError, type SupabaseErrorCategory } from "./supabaseError";

export interface UserVocabularyList {
  id: string;
  targetLanguage: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function getAuthorizedHeaders(session: StoredSupabaseSession) {
  return {
    ...getAuthHeaders(),
    Authorization: `Bearer ${session.access_token}`,
  };
}

// Same refresh-then-retry-once shape as newWordProgress.ts's own private
// request helpers — duplicated rather than imported/shared because each
// data module intentionally stays the only place that knows about its own
// table(s) (see that file's header for the same convention).
async function supabaseListsRequest<TResponse>(session: StoredSupabaseSession, path: string): Promise<TResponse> {
  const freshSession = await ensureFreshSupabaseSession(session);

  try {
    return await supabaseRequest<TResponse>(path, {
      method: "GET",
      headers: getAuthorizedHeaders(freshSession),
    });
  } catch (error) {
    if (!(error instanceof Error) || !/jwt expired/i.test(error.message)) {
      throw error;
    }

    const refreshedSession = await refreshSupabaseSession(freshSession);
    return supabaseRequest<TResponse>(path, {
      method: "GET",
      headers: getAuthorizedHeaders(refreshedSession),
    });
  }
}

async function supabaseListsMutationRequest<TResponse>(
  session: StoredSupabaseSession,
  path: string,
  body: unknown,
): Promise<TResponse> {
  const freshSession = await ensureFreshSupabaseSession(session);
  const requestInit: RequestInit = {
    method: "POST",
    body: JSON.stringify(body),
  };

  try {
    return await supabaseRequest<TResponse>(path, {
      ...requestInit,
      headers: getAuthorizedHeaders(freshSession),
    });
  } catch (error) {
    if (!(error instanceof Error) || !/jwt expired/i.test(error.message)) {
      throw error;
    }

    const refreshedSession = await refreshSupabaseSession(freshSession);
    return supabaseRequest<TResponse>(path, {
      ...requestInit,
      headers: getAuthorizedHeaders(refreshedSession),
    });
  }
}

interface UserVocabularyListRawRow {
  id?: unknown;
  target_language?: unknown;
  name?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

function parseListRow(raw: UserVocabularyListRawRow): UserVocabularyList | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.target_language !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.created_at !== "string" ||
    typeof raw.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    targetLanguage: raw.target_language,
    name: raw.name,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

// Reads directly against user_vocabulary_lists — authenticated holds a
// standing SELECT grant on this table (RLS-scoped to auth.uid() = user_id),
// so unlike creation this never needs an RPC. Scoped by both user_id and
// target_language, the same isolation readUserWordProgress uses, so a list
// created under one target language can never surface under another.
export async function readUserVocabularyLists(
  session: StoredSupabaseSession,
  targetLanguage: string,
): Promise<UserVocabularyList[]> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage) {
    return [];
  }

  const rawRows = await supabaseListsRequest<UserVocabularyListRawRow[]>(
    session,
    `/rest/v1/user_vocabulary_lists?user_id=eq.${encodeURIComponent(userId)}&target_language=eq.${encodeURIComponent(
      targetLanguage,
    )}&select=id,target_language,name,created_at,updated_at&order=created_at.desc`,
  );

  const rows: UserVocabularyList[] = [];
  for (const raw of rawRows) {
    const parsed = parseListRow(raw);
    // Skips a malformed row rather than failing the whole page load —
    // matching readUserWordProgress's own resilience precedent.
    if (parsed) rows.push(parsed);
  }
  return rows;
}

// User-safe wrapper — never exposes a raw Supabase/PostgreSQL error to the
// Create List dialog, matching VocabularyFavoriteUpdateError's precedent.
export class VocabularyListCreateError extends Error {
  readonly category: SupabaseErrorCategory;

  constructor(message: string, category: SupabaseErrorCategory) {
    super(message);
    this.name = "VocabularyListCreateError";
    this.category = category;
  }
}

// Creates exactly one list via the create_user_vocabulary_list RPC — never
// a direct POST to user_vocabulary_lists (that table only grants
// authenticated clients SELECT; the only write path is this narrow,
// SECURITY DEFINER RPC). The RPC derives the caller from auth.uid()
// server-side, validates and trims p_name itself, and rejects an
// unsupported target language — this function still trims/validates first
// so a bad name never round-trips to the server before being rejected.
export async function createUserVocabularyList(
  session: StoredSupabaseSession,
  targetLanguage: string,
  name: string,
): Promise<UserVocabularyList> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage) {
    throw new VocabularyListCreateError("Missing authenticated session or target language.", "unauthenticated");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new VocabularyListCreateError("List name is required.", "validation");
  }

  let rows: UserVocabularyListRawRow[] | UserVocabularyListRawRow;
  try {
    rows = await supabaseListsMutationRequest<UserVocabularyListRawRow[] | UserVocabularyListRawRow>(
      session,
      "/rest/v1/rpc/create_user_vocabulary_list",
      {
        p_target_language: targetLanguage,
        p_name: trimmedName,
      },
    );
  } catch (error) {
    const category = classifySupabaseError(error);
    console.warn("vocabularyLists: createUserVocabularyList failed.", describeSupabaseError("createUserVocabularyList", error));

    if (category === "unauthenticated") {
      throw new VocabularyListCreateError("Your session has expired. Please sign in again.", category);
    }
    // Never surface the raw Supabase/PostgreSQL message to the UI — only
    // this safe, generic failure copy, matching updateWordProgressFavorite's
    // precedent. MyListsSection picks a more specific safe message for
    // forbidden/missing_rpc/network via `category` instead.
    throw new VocabularyListCreateError("We couldn't create your list. Please try again.", category);
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  const parsed = row ? parseListRow(row) : null;
  if (!parsed) {
    throw new VocabularyListCreateError(
      "create_user_vocabulary_list returned a malformed row.",
      "unexpected_response",
    );
  }
  return parsed;
}
