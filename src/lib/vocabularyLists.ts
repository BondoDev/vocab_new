// Supabase access for "My Lists": reading a signed-in user's vocabulary-list
// rows for the active target language, creating/renaming/deleting a list,
// reading which vocabulary concepts (word ids) belong to which lists, and
// adding/removing that membership. This module is the only place that
// knows about public.user_vocabulary_lists and
// public.user_vocabulary_list_words — mirrors newWordProgress.ts's own
// one-module-per-table(-family) convention.
//
// Membership is concept-based (word_id), not progress-based — see
// supabase/README.md's "My Lists Corrective Phase" section. A list may
// contain a word the caller has never studied; user_word_progress is
// consulted only optionally, client-side, when the UI wants to show a
// word's current learning status. This module itself never reads or
// requires user_word_progress at all.
//
// This module never resolves word display data (target word/translation/
// CEFR) — that stays owned by vocabulary.json, resolved client-side only
// when a list's detail rows or the Add Words picker are actually rendered
// (see loadFullVocabulary.ts and loadVocabularyProgress.ts).
// user_vocabulary_lists/user_vocabulary_list_words are organization-only;
// canonical word state stays owned by user_word_progress (see every
// migration's own header for the full rationale) — addWordsToVocabularyList
// and removeWordFromVocabularyList below only ever touch
// user_vocabulary_list_words, never user_word_progress or user_daily_stats.
// Do not add vocabulary.json imports or word resolution here.
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

// Membership identifies the vocabulary CONCEPT itself (wordId — the same
// cross-language concept id user_word_progress.word_id already stores,
// e.g. "A1-00193"), not a user_word_progress row. This is the corrective
// My Lists phase's core change: a list must be able to contain any
// vocabulary word from its target language, studied or not — see
// supabase/README.md's "My Lists Corrective Phase" section for the full
// rationale and migration strategy
// (20260811170000_my_lists_corrective_word_id_membership.sql). Optional
// progress (if any exists for wordId) is looked up separately, client-side,
// by the UI layer — never required, never implied by this type.
export interface UserVocabularyListMembership {
  listId: string;
  wordId: string;
  createdAt: string;
}

interface UserVocabularyListMembershipRawRow {
  list_id?: unknown;
  word_id?: unknown;
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
    `/rest/v1/user_vocabulary_list_words?list_id=in.(${listIds.join(",")})&select=list_id,word_id,created_at`,
  );

  const rows: UserVocabularyListMembership[] = [];
  for (const raw of rawRows) {
    if (
      typeof raw.list_id !== "string" ||
      typeof raw.word_id !== "string" ||
      typeof raw.created_at !== "string"
    ) {
      continue;
    }
    rows.push({ listId: raw.list_id, wordId: raw.word_id, createdAt: raw.created_at });
  }
  return rows;
}

export interface AddWordsToListResultRow {
  wordId: string;
  alreadyAdded: boolean;
}

interface AddWordsToListRawRow {
  word_id?: unknown;
  already_added?: unknown;
}

// Adds one or more words to a list via the add_words_to_vocabulary_list
// RPC — the table's only write path for INSERTs (authenticated holds no
// direct INSERT grant on user_vocabulary_list_words). Always a batch call,
// even for a single selected word — see the migration's own header for why
// no separate singular-signature RPC exists. wordIds are vocabulary concept
// ids (the same ids the app's vocabulary resolver produces), never
// user_word_progress ids — a word needs no progress row to be addable. The
// RPC itself re-validates list ownership and word-id shape server-side;
// this function only guards against calling with an empty selection.
export async function addWordsToVocabularyList(
  session: StoredSupabaseSession,
  listId: string,
  wordIds: readonly string[],
): Promise<AddWordsToListResultRow[]> {
  const userId = session.user?.id;
  if (!userId || !listId) {
    throw new VocabularyListError("Missing authenticated session or list.", "unauthenticated");
  }
  if (wordIds.length === 0) {
    throw new VocabularyListError("Select at least one word to add.", "validation");
  }

  let rows: AddWordsToListRawRow[] | AddWordsToListRawRow;
  try {
    rows = await supabaseListsMutationRequest<AddWordsToListRawRow[] | AddWordsToListRawRow>(
      session,
      "/rest/v1/rpc/add_words_to_vocabulary_list",
      {
        p_list_id: listId,
        p_word_ids: wordIds,
      },
    );
  } catch (error) {
    const category = classifySupabaseError(error);
    console.warn("vocabularyLists: addWordsToVocabularyList failed.", describeSupabaseError("addWordsToVocabularyList", error));

    if (category === "unauthenticated") {
      throw new VocabularyListError("Your session has expired. Please sign in again.", category);
    }
    // Never surface the raw Supabase/PostgreSQL message — a malformed-id
    // rejection (category "validation", from the RPC's own 22023) and a
    // not-owned list (category "forbidden", 42501) both get this same safe
    // fallback; MyListsSection picks a sharper message for the four
    // universal categories via resolveSupabaseErrorMessageKey instead.
    throw new VocabularyListError("We couldn't add those words to your list. Please try again.", category);
  }

  const rawArray = Array.isArray(rows) ? rows : [rows];
  const results: AddWordsToListResultRow[] = [];
  for (const raw of rawArray) {
    if (typeof raw.word_id !== "string") continue;
    results.push({ wordId: raw.word_id, alreadyAdded: Boolean(raw.already_added) });
  }
  return results;
}

// Removes exactly one word from a list via the
// remove_word_from_vocabulary_list RPC — never a direct DELETE (same
// grant-layer restriction as above). Idempotent server-side: calling this
// again for a word already removed (a stale click, another tab) succeeds
// silently rather than erroring, matching the RPC's own contract. Never
// touches user_word_progress — removing a word from a list never affects
// its learning progress, if any exists.
export async function removeWordFromVocabularyList(
  session: StoredSupabaseSession,
  listId: string,
  wordId: string,
): Promise<void> {
  const userId = session.user?.id;
  if (!userId || !listId || !wordId) {
    throw new VocabularyListError("Missing authenticated session, list, or word.", "unauthenticated");
  }

  try {
    await supabaseListsMutationRequest<unknown>(session, "/rest/v1/rpc/remove_word_from_vocabulary_list", {
      p_list_id: listId,
      p_word_id: wordId,
    });
  } catch (error) {
    const category = classifySupabaseError(error);
    console.warn("vocabularyLists: removeWordFromVocabularyList failed.", describeSupabaseError("removeWordFromVocabularyList", error));

    if (category === "unauthenticated") {
      throw new VocabularyListError("Your session has expired. Please sign in again.", category);
    }
    throw new VocabularyListError("We couldn't remove this word. Please try again.", category);
  }
}
