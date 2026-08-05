// Shared Supabase/PostgREST error-classification layer for the learning and
// vocabulary features (Study New Words, Review Words, favorite/unfavorite,
// vocabulary progress/count loading, daily statistics, and profile
// load/save).
//
// Before this module, session-expiry detection was three hand-copied
// `error instanceof Error && /jwt|session|unauthorized|401/i.test(error.message)`
// checks (src/lib/newWordProgress.ts's completeNewWordStudy/
// completeWordReview/updateWordProgressFavorite), all operating on plain
// Error.message text because src/lib/supabaseAuth.ts's supabaseRequest
// discarded every structured PostgREST field (code/details/hint/status)
// before the error ever reached a caller. Every other Supabase read in the
// app (vocabulary progress, daily stats, profile load) had no
// classification at all.
//
// This module only classifies errors and produces safe, privacy-scrubbed
// diagnostics for `console.warn` — it never decides what to show the user.
// Each operation keeps its own user-facing fallback message; only the four
// categories with a safe, universal, non-operation-specific message
// (unauthenticated/forbidden/missing_rpc/network — see
// resolveSupabaseErrorMessageKey below) override it.

export type SupabaseErrorCategory =
  | "unauthenticated"
  | "forbidden"
  | "missing_rpc"
  | "conflict"
  | "network"
  | "validation"
  | "unexpected_response"
  | "unknown";

// Structured shape a Supabase/PostgREST-carrying error may expose (see
// SupabaseRequestError in supabaseAuth.ts, which implements this). Anything
// else thrown — a plain Error, a TypeError from a failed fetch(), a
// non-Error value — is handled defensively by classifySupabaseError below.
export interface SupabaseErrorLike {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
}

export interface SupabaseErrorDiagnostics {
  operation: string;
  category: SupabaseErrorCategory;
  code: string | null;
  status: number | null;
  message: string | null;
  details: string | null;
  hint: string | null;
}

// Thrown by application code (never by supabaseRequest itself) when the
// category is already known with certainty from context alone — a guard
// clause ("no authenticated session" -> unauthenticated) or a
// response-shape check ("RPC returned no row" -> unexpected_response) —
// so classifySupabaseError doesn't have to re-derive it from message text.
export class ClassifiedSupabaseError extends Error {
  readonly category: SupabaseErrorCategory;

  constructor(message: string, category: SupabaseErrorCategory) {
    super(message);
    this.name = "ClassifiedSupabaseError";
    this.category = category;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSafeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toSafeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Defense in depth only: none of this app's RPC/table contracts in scope
// (user_word_progress, user_daily_stats, user_profiles keyed by uuid/date/
// language code) should ever echo a token or email back inside an error
// body, but message/details/hint are free-text server strings, so they're
// scrubbed before ever reaching a console.warn call.
const JWT_LOOKALIKE_PATTERN = /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;
const EMAIL_LOOKALIKE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

function redactSensitiveText(value: string): string {
  return value.replace(JWT_LOOKALIKE_PATTERN, "[redacted-token]").replace(EMAIL_LOOKALIKE_PATTERN, "[redacted-email]");
}

// Stable code/status checks first (never fragile against copy changes);
// message-substring matching is only a fallback for endpoints that don't
// expose a PostgREST code (GoTrue's /auth/v1/* responses have only
// msg/error_description + an HTTP status, never a `code` field).
const AUTH_MESSAGE_PATTERN =
  /\bjwt\b|invalid[_ ]?token|invalid[_ ]?grant|invalid[_ ]?refresh[_ ]?token|token is expired|not authenticated|unauthorized|refresh_token_not_found/i;
const FORBIDDEN_MESSAGE_PATTERN = /permission denied|not authorized|forbidden|row-level security|\brls\b/i;
const MISSING_RPC_MESSAGE_PATTERN = /could not find the function|schema cache|function .* does not exist/i;
const CONFLICT_MESSAGE_PATTERN = /duplicate key|already exists/i;
const NETWORK_MESSAGE_PATTERN =
  /failed to fetch|networkerror|load failed|network request failed|err_internet|err_connection|err_name_not_resolved/i;

// Postgres error codes in the 23xxx "integrity constraint violation" class
// are validation failures — except 23505 (unique_violation), classified as
// a conflict instead (checked first, before this prefix check runs).
const VALIDATION_CODE_PREFIX = "23";

function classifyByCodeAndStatus(
  status: number | null,
  code: string | null,
  message: string | null,
): SupabaseErrorCategory | null {
  if (code === "PGRST202") return "missing_rpc";
  if (code === "42501") return "forbidden";
  if (code === "23505") return "conflict";
  if (code && code.startsWith(VALIDATION_CODE_PREFIX)) return "validation";

  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "validation";

  if (message && AUTH_MESSAGE_PATTERN.test(message)) return "unauthenticated";
  if (message && FORBIDDEN_MESSAGE_PATTERN.test(message)) return "forbidden";
  if (message && MISSING_RPC_MESSAGE_PATTERN.test(message)) return "missing_rpc";
  if (message && CONFLICT_MESSAGE_PATTERN.test(message)) return "conflict";

  return null;
}

// Accepts unknown errors safely: a ClassifiedSupabaseError (category
// already known), a SupabaseErrorLike (has code/status/message — the shape
// SupabaseRequestError implements), a bare TypeError/Error (typically a
// fetch()-layer network failure with no HTTP response at all), or any other
// thrown value (string, undefined, ...).
export function classifySupabaseError(error: unknown): SupabaseErrorCategory {
  if (error instanceof ClassifiedSupabaseError) {
    return error.category;
  }

  if (isRecord(error)) {
    const like = error as SupabaseErrorLike;
    const status = toSafeNumber(like.status);
    const code = toSafeString(like.code);
    const message = toSafeString(like.message);
    const byCodeAndStatus = classifyByCodeAndStatus(status, code, message);
    if (byCodeAndStatus) {
      return byCodeAndStatus;
    }

    // fetch() itself throwing (no response object was ever produced — the
    // request never reached a server) is the one case with no HTTP status
    // at all: offline, DNS failure, CORS, a reset connection. Requiring
    // status === null here is what keeps a genuine SupabaseRequestError (a
    // real HTTP response, just a non-2xx one, e.g. a 500 whose body
    // happens to say something like "load failed") from ever being
    // misclassified as a network failure — a response WAS received.
    if (status === null && (error instanceof TypeError || (message && NETWORK_MESSAGE_PATTERN.test(message)))) {
      return "network";
    }
  }

  return "unknown";
}

// Produces the safe diagnostic object every call site logs via
// console.warn instead of dumping the raw error. Deliberately excludes
// anything not already covered by the SupabaseErrorLike shape — there is no
// path here that could pick up an access/refresh token, a full session
// object, or a request body, because none of those are ever passed in.
export function describeSupabaseError(operation: string, error: unknown): SupabaseErrorDiagnostics {
  const category = classifySupabaseError(error);

  let code: string | null = null;
  let status: number | null = null;
  let message: string | null = null;
  let details: string | null = null;
  let hint: string | null = null;

  if (isRecord(error)) {
    const like = error as SupabaseErrorLike;
    code = toSafeString(like.code);
    status = toSafeNumber(like.status);
    message = toSafeString(like.message);
    details = toSafeString(like.details);
    hint = toSafeString(like.hint);
  } else if (typeof error === "string") {
    message = error;
  }

  return {
    operation,
    category,
    code,
    status,
    message: message ? redactSensitiveText(message) : null,
    details: details ? redactSensitiveText(details) : null,
    hint: hint ? redactSensitiveText(hint) : null,
  };
}

// The four categories with one safe, universal message that isn't specific
// to any one operation — every operation in scope shows this verbatim
// (via the shared "supabaseErrors" translation namespace) instead of its
// own generic fallback. Every other category (validation/conflict/
// unexpected_response/unknown) is intentionally absent here: those keep
// whichever operation-specific fallback message the caller already had
// (see resolveSupabaseErrorMessageKey below) rather than being forced
// through one universal message for every operation.
export const SHARED_ERROR_MESSAGE_KEYS: Partial<Record<SupabaseErrorCategory, string>> = {
  unauthenticated: "supabaseErrors.sessionExpired",
  forbidden: "supabaseErrors.forbidden",
  missing_rpc: "supabaseErrors.temporarilyUnavailable",
  network: "supabaseErrors.network",
};

// Resolves the translation key an operation should show for a classified
// category: the shared key above for the four universal categories, or the
// caller's own existing fallback key for everything else. Never invents a
// new message — operationFallbackKey is always a key the caller already
// had before this refactor.
export function resolveSupabaseErrorMessageKey(
  category: SupabaseErrorCategory,
  operationFallbackKey: string,
): string {
  return SHARED_ERROR_MESSAGE_KEYS[category] ?? operationFallbackKey;
}
