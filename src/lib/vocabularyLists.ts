// Supabase access for "My Lists": reading a signed-in user's vocabulary-list
// rows for the active target language, creating/renaming/deleting a list,
// and (Phase 2A) reading which user_word_progress rows belong to which
// lists. This module is the only place that knows about
// public.user_vocabulary_lists and public.user_vocabulary_list_words —
// mirrors newWordProgress.ts's own one-module-per-table(-family) convention.
//
// No membership-WRITE path exists yet (Add/Remove Words is Phase 2B), and
// this module never resolves word display data (target word/translation/
// CEFR) — that stays owned by vocabulary.json, resolved client-side only
// when a list's detail rows are actually rendered (see
// loadVocabularyProgress.ts, reused as-is for that). user_vocabulary_lists/
// user_vocabulary_list_words are organization-only; canonical word state
// stays owned by user_word_progress (see both migrations' own headers for
// the full rationale). Do not add vocabulary.json imports or word
// resolution here.
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
// Create/Rename/Delete List dialogs, matching VocabularyFavoriteUpdateError's
// precedent. Shared across create/rename/delete since all three follow the
// identical safe-wrapper shape (message + classified category); category
// "conflict" is what a duplicate-name rejection (23505, from either RPC's
// own proactive check or the unique index itself) classifies as — see
// src/lib/supabaseError.ts.
export class VocabularyListError extends Error {
  readonly category: SupabaseErrorCategory;

  constructor(message: string, category: SupabaseErrorCategory) {
    super(message);
    this.name = "VocabularyListError";
    this.category = category;
  }
}

// Creates exactly one list via the create_user_vocabulary_list RPC — never
// a direct POST to user_vocabulary_lists (that table only grants
// authenticated clients SELECT; the only write path is this narrow,
// SECURITY DEFINER RPC). The RPC derives the caller from auth.uid()
// server-side, validates and trims p_name itself, rejects an unsupported
// target language, and rejects a duplicate name (scoped to user + target
// language, case/whitespace-insensitive) — this function still
// trims/validates first so a bad name never round-trips to the server
// before being rejected; the duplicate check itself is authoritative only
// server-side (this module never pre-checks it against already-loaded
// lists — see MyListsSection for the optional fast-feedback check).
export async function createUserVocabularyList(
  session: StoredSupabaseSession,
  targetLanguage: string,
  name: string,
): Promise<UserVocabularyList> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage) {
    throw new VocabularyListError("Missing authenticated session or target language.", "unauthenticated");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new VocabularyListError("List name is required.", "validation");
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
      throw new VocabularyListError("Your session has expired. Please sign in again.", category);
    }
    // Never surface the raw Supabase/PostgreSQL message to the UI — only
    // this safe, generic failure copy, matching updateWordProgressFavorite's
    // precedent. MyListsSection picks a more specific safe message for
    // forbidden/missing_rpc/network/conflict via `category` instead.
    throw new VocabularyListError("We couldn't create your list. Please try again.", category);
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  const parsed = row ? parseListRow(row) : null;
  if (!parsed) {
    throw new VocabularyListError(
      "create_user_vocabulary_list returned a malformed row.",
      "unexpected_response",
    );
  }
  return parsed;
}

// Renames exactly one list via the rename_user_vocabulary_list RPC — same
// RPC-only-write shape as create above. The RPC re-derives ownership and
// the list's own target_language server-side (neither is a parameter here),
// so this function only ever needs to send the list id and the new name.
export async function renameUserVocabularyList(
  session: StoredSupabaseSession,
  listId: string,
  name: string,
): Promise<UserVocabularyList> {
  const userId = session.user?.id;
  if (!userId || !listId) {
    throw new VocabularyListError("Missing authenticated session or list.", "unauthenticated");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new VocabularyListError("List name is required.", "validation");
  }

  let rows: UserVocabularyListRawRow[] | UserVocabularyListRawRow;
  try {
    rows = await supabaseListsMutationRequest<UserVocabularyListRawRow[] | UserVocabularyListRawRow>(
      session,
      "/rest/v1/rpc/rename_user_vocabulary_list",
      {
        p_list_id: listId,
        p_name: trimmedName,
      },
    );
  } catch (error) {
    const category = classifySupabaseError(error);
    console.warn("vocabularyLists: renameUserVocabularyList failed.", describeSupabaseError("renameUserVocabularyList", error));

    if (category === "unauthenticated") {
      throw new VocabularyListError("Your session has expired. Please sign in again.", category);
    }
    throw new VocabularyListError("We couldn't rename your list. Please try again.", category);
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  const parsed = row ? parseListRow(row) : null;
  if (!parsed) {
    throw new VocabularyListError(
      "rename_user_vocabulary_list returned a malformed row.",
      "unexpected_response",
    );
  }
  return parsed;
}

// Deletes exactly one list via the delete_user_vocabulary_list RPC.
// Membership rows cascade-delete server-side (the migration's FK, not this
// function); user_word_progress is never touched by this call.
export async function deleteUserVocabularyList(session: StoredSupabaseSession, listId: string): Promise<void> {
  const userId = session.user?.id;
  if (!userId || !listId) {
    throw new VocabularyListError("Missing authenticated session or list.", "unauthenticated");
  }

  try {
    await supabaseListsMutationRequest<unknown>(session, "/rest/v1/rpc/delete_user_vocabulary_list", {
      p_list_id: listId,
    });
  } catch (error) {
    const category = classifySupabaseError(error);
    console.warn("vocabularyLists: deleteUserVocabularyList failed.", describeSupabaseError("deleteUserVocabularyList", error));

    if (category === "unauthenticated") {
      throw new VocabularyListError("Your session has expired. Please sign in again.", category);
    }
    throw new VocabularyListError("We couldn't delete your list. Please try again.", category);
  }
}

export interface UserVocabularyListMembership {
  listId: string;
  wordProgressId: string;
  createdAt: string;
}

interface UserVocabularyListMembershipRawRow {
  list_id?: unknown;
  word_progress_id?: unknown;
  created_at?: unknown;
}

// Reads every membership row for a batch of the caller's own lists in one
// request — never one query per card (see the Phase 2A brief's own "avoid
// one query per card" requirement). Direct SELECT, not an RPC: RLS already
// scopes this table to lists the caller owns (an EXISTS join against
// user_vocabulary_lists — see the migration), so passing this function only
// list ids the caller genuinely owns (as MyListsSection already does, from
// its own just-loaded list set) is sufficient; a foreign list id would
// simply match zero rows rather than leaking anything.
export async function readUserVocabularyListMemberships(
  session: StoredSupabaseSession,
  listIds: readonly string[],
): Promise<UserVocabularyListMembership[]> {
  if (listIds.length === 0) {
    return [];
  }

  const rawRows = await supabaseListsRequest<UserVocabularyListMembershipRawRow[]>(
    session,
    `/rest/v1/user_vocabulary_list_words?list_id=in.(${listIds.join(",")})&select=list_id,word_progress_id,created_at`,
  );

  const rows: UserVocabularyListMembership[] = [];
  for (const raw of rawRows) {
    if (
      typeof raw.list_id !== "string" ||
      typeof raw.word_progress_id !== "string" ||
      typeof raw.created_at !== "string"
    ) {
      continue;
    }
    rows.push({ listId: raw.list_id, wordProgressId: raw.word_progress_id, createdAt: raw.created_at });
  }
  return rows;
}
