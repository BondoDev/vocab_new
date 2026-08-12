import { createSingleFlight } from "./singleFlight";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

const STORAGE_KEYS = {
  session: "supabase.auth.session",
  pkceVerifier: "supabase.auth.pkce.verifier",
} as const;

const AUTH_SESSION_CHANGED_EVENT = "supabase-auth-session-changed";

export interface StoredSupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  expires_in?: number | null;
  token_type?: string | null;
  user?: {
    id?: string;
    email?: string;
    // GoTrue's own per-user provider record — "email" for a password
    // account, "google" for Google OAuth, etc. Present on the user object
    // GoTrue returns from every sign-in/token/user endpoint; read by
    // isPasswordAccount (src/lib/accountDeletion.ts) to decide whether the
    // Delete Account flow can offer password-based reauthentication.
    app_metadata?: {
      provider?: string;
      providers?: string[];
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: StoredSupabaseSession["user"];
  session?: StoredSupabaseSession | null;
  error_description?: string;
  msg?: string;
};

export interface SupabaseAuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: { provider?: string; providers?: string[]; [key: string]: unknown } | null;
  [key: string]: unknown;
}

function ensureSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }
}

export function getAuthHeaders() {
  ensureSupabaseConfig();
  return {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
}

function storeSession(session: StoredSupabaseSession | null) {
  if (typeof window === "undefined") return;

  if (!session) {
    window.localStorage.removeItem(STORAGE_KEYS.session);
  } else {
    window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  }

  window.dispatchEvent(
    new CustomEvent<StoredSupabaseSession | null>(AUTH_SESSION_CHANGED_EVENT, {
      detail: session,
    }),
  );
}

function normalizeSession(payload: AuthResponse): StoredSupabaseSession | null {
  if (payload.session) {
    return payload.session;
  }

  if (!payload.access_token || !payload.refresh_token) {
    return null;
  }

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at ?? null,
    expires_in: payload.expires_in ?? null,
    token_type: payload.token_type ?? null,
    user: payload.user ?? null,
  };
}

async function populateSessionUser(
  session: StoredSupabaseSession | null,
): Promise<StoredSupabaseSession | null> {
  if (!session?.access_token) {
    return session;
  }

  if (session.user?.id) {
    return session;
  }

  try {
    const user = await fetchSupabaseAuthUser(session);
    return {
      ...session,
      user,
    };
  } catch {
    return session;
  }
}

function isSessionExpiringSoon(session: StoredSupabaseSession | null | undefined) {
  if (!session?.expires_at) {
    return false;
  }

  const expiresAtMs = session.expires_at * 1000;
  return Date.now() >= expiresAtMs - 60_000;
}

// Thrown by supabaseRequest for any non-2xx HTTP response — i.e. a real
// response was received from Supabase (auth or PostgREST), just not a
// successful one. Carries the structured fields a PostgREST error body
// exposes (code/details/hint) plus the HTTP status, so callers can classify
// failures via src/lib/supabaseError.ts's classifySupabaseError instead of
// pattern-matching `.message` text. Extends Error (not a new base type) so
// every existing `error instanceof Error` / `error.message` check across
// the app keeps working unchanged.
export class SupabaseRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(
    message: string,
    status: number,
    options: { code?: string | null; details?: string | null; hint?: string | null } = {},
  ) {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.code = options.code ?? null;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
  }
}

interface SupabaseErrorResponseBody {
  msg?: string;
  error_description?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  // The delete-account Edge Function's own error shape (`{ error: "..." }`,
  // e.g. "reauthentication_required"/"account_deletion_disabled") — none of
  // GoTrue's (msg/error_description) or PostgREST's (message/code) fields
  // apply to it, so without this it silently fell back to a generic
  // "Authentication request failed." string and callers lost the
  // machine-readable reason entirely. Used only as a last-resort fallback
  // below (after every GoTrue/PostgREST-specific field), so this can never
  // shadow a real GoTrue/PostgREST error's own message/code.
  error?: string;
}

export async function supabaseRequest<TResponse>(
  path: string,
  options: RequestInit,
): Promise<TResponse> {
  ensureSupabaseConfig();

  // A fetch() rejection (offline, DNS failure, CORS, a reset connection)
  // means no HTTP response was ever received — it propagates as-is here,
  // never repackaged into a SupabaseRequestError (which always represents a
  // real, if unsuccessful, HTTP response). classifySupabaseError recognizes
  // this shape (a bare TypeError, no status/code) as the "network" category.
  const response = await fetch(`${SUPABASE_URL}${path}`, options);
  const data = (await response.json().catch(() => ({}))) as TResponse | SupabaseErrorResponseBody;

  if (!response.ok) {
    const errorBody = data as SupabaseErrorResponseBody;
    const message =
      errorBody.msg ||
      errorBody.error_description ||
      errorBody.message ||
      errorBody.error ||
      "Authentication request failed.";
    throw new SupabaseRequestError(message, response.status, {
      // .code falls back to the Edge Function's own `error` string too, so
      // a caller can check .code (its usual, message-text-independent way
      // of classifying a SupabaseRequestError) for
      // "reauthentication_required" etc. exactly like a real PostgREST code.
      code: errorBody.code ?? errorBody.error ?? null,
      details: errorBody.details ?? null,
      hint: errorBody.hint ?? null,
    });
  }

  return data as TResponse;
}

export function getStoredSupabaseSession(): StoredSupabaseSession | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEYS.session);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredSupabaseSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEYS.session);
    return null;
  }
}

// The actual GoTrue refresh request + response handling. Never call this
// directly - always go through refreshSupabaseSession below, which is what
// makes sure at most one of these is ever running at a time.
async function performSupabaseSessionRefresh(
  session: StoredSupabaseSession,
): Promise<StoredSupabaseSession> {
  if (!session.refresh_token) {
    storeSession(null);
    throw new Error("Missing refresh token. Sign in again.");
  }

  let payload: AuthResponse;
  try {
    payload = await supabaseRequest<AuthResponse>(
      "/auth/v1/token?grant_type=refresh_token",
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          refresh_token: session.refresh_token,
        }),
      },
    );
  } catch (error) {
    // A SupabaseRequestError here means GoTrue actually responded and
    // rejected this refresh_token (expired, already rotated, revoked,
    // "Refresh Token Not Found") — the stored session can never succeed as
    // a refresh again. Clearing it here, at the one place every caller's
    // refresh eventually funnels through, is what stops each caller's own
    // "Try again" from re-sending the same dead token forever: the
    // AUTH_SESSION_CHANGED_EVENT this fires flips useAuthSession's
    // authUserId to null app-wide, so callers see "signed out" instead of
    // repeating the same failed request. A bare network failure (fetch()
    // itself throwing — offline, DNS, CORS) is not a SupabaseRequestError
    // and must NOT clear the session; that's a transient condition, not
    // proof the token is invalid.
    if (error instanceof SupabaseRequestError) {
      storeSession(null);
    }
    throw error;
  }

  const nextSession = normalizeSession(payload);
  if (!nextSession) {
    throw new Error("Could not refresh session. Sign in again.");
  }

  const mergedSession: StoredSupabaseSession = {
    ...session,
    ...nextSession,
    user: nextSession.user ?? session.user ?? null,
  };

  const hydratedSession = await populateSessionUser(mergedSession);
  storeSession(hydratedSession);
  return hydratedSession ?? mergedSession;
}

// D-2: single-flight refresh. Supabase refresh tokens are rotated, so two
// concurrent refreshes racing on the same still-stale refresh_token can
// have the second one rejected by GoTrue - and a real rejection above
// clears the stored session, which would turn a still-valid session into
// an accidental app-wide logout. refreshSingleFlight holds the one Promise
// for "the app's current refresh attempt, if any," so every concurrent
// caller - regardless of which (possibly stale) session object it is
// holding - joins that same Promise instead of issuing its own request.
// See src/lib/singleFlight.ts for the join/settle-ordering guarantees.
const refreshSingleFlight = createSingleFlight<StoredSupabaseSession>();

export function refreshSupabaseSession(
  session: StoredSupabaseSession,
): Promise<StoredSupabaseSession> {
  // The `session` argument is only used if this call is the one that
  // starts a new attempt; a call that instead joins an already-running
  // attempt (see singleFlight.ts) never even looks at its own `session` -
  // the in-flight Promise represents the app's one current refresh
  // operation, not a request keyed by which session object triggered it.
  return refreshSingleFlight.run(() => performSupabaseSessionRefresh(session));
}

export async function ensureFreshSupabaseSession(
  session: StoredSupabaseSession,
): Promise<StoredSupabaseSession> {
  if (!isSessionExpiringSoon(session)) {
    return session;
  }

  return refreshSupabaseSession(session);
}

export function subscribeToSupabaseSessionChanges(
  listener: (session: StoredSupabaseSession | null) => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleSessionChanged = (event: Event) => {
    listener((event as CustomEvent<StoredSupabaseSession | null>).detail ?? null);
  };

  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged);
  return () => {
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged);
  };
}

export async function signInWithPassword(email: string, password: string) {
  const payload = await supabaseRequest<AuthResponse>(
    "/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, password }),
    },
  );

  const session = await populateSessionUser(normalizeSession(payload));
  storeSession(session);
  return session;
}

// Reauthentication-specific password verification — the same GoTrue
// password grant signInWithPassword uses above, but deliberately does NOT
// call storeSession() itself. A caller reauthenticating before a
// destructive action (account deletion) must verify the RETURNED session's
// user id matches the CURRENTLY authenticated account before the app ever
// adopts it: if this function stored the session itself first, a caller
// who enters a different account's valid email+password (by mistake or
// otherwise) would briefly have that other account's session live in the
// app before any mismatch check could run. See adoptSupabaseSession below
// and src/lib/accountDeletion.ts's reauthenticateForAccountDeletion, which
// performs that check before ever calling it.
export async function reauthenticateWithPassword(
  email: string,
  password: string,
): Promise<StoredSupabaseSession> {
  const payload = await supabaseRequest<AuthResponse>(
    "/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, password }),
    },
  );

  const session = await populateSessionUser(normalizeSession(payload));
  if (!session) {
    throw new Error("reauthenticateWithPassword: no session returned.");
  }
  return session;
}

// Explicit, narrow public entry point for adopting an already-verified
// session as the app's current one (persists it + notifies every
// useAuthSession subscriber via the same event storeSession always fires).
// Exported separately — rather than exporting storeSession directly — so
// every call site reads as a deliberate "make this the app's session now"
// decision, never an incidental side effect of an unrelated network call.
export function adoptSupabaseSession(session: StoredSupabaseSession): void {
  storeSession(session);
}

// The local-only half of signing out: clears the stored session + PKCE
// verifier and notifies every subscriber (useAuthSession, via
// subscribeToSupabaseSessionChanges) that the app is now signed out —
// without ever contacting Supabase's own /auth/v1/logout endpoint.
//
// This is the ONLY correct sign-out mechanism once the account itself no
// longer exists server-side (post account-deletion): the stored access
// token's own `sub` claim names a user `auth.users` no longer has, so
// calling /auth/v1/logout with it is not a real sign-out request GoTrue can
// honor — it correctly rejects it with 403 "User from sub claim in JWT
// does not exist", a real, expected rejection for a genuinely gone user,
// never something to retry or treat as a cleanup failure. Exported
// separately from signOutSupabase (below), which still performs the real
// network logout for an ordinary, still-existing account — keeping the two
// as distinct named functions means an accidental swap can never silently
// skip real server-side session invalidation for a live account.
export function clearLocalSupabaseSession(): void {
  storeSession(null);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEYS.pkceVerifier);
  }
}

export async function signOutSupabase(
  session?: StoredSupabaseSession | null,
): Promise<void> {
  try {
    if (session?.access_token) {
      await supabaseRequest<AuthResponse>("/auth/v1/logout", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    }
  } finally {
    clearLocalSupabaseSession();
  }
}

export async function signUpWithPassword(input: {
  email: string;
  password: string;
}) {
  const payload = await supabaseRequest<AuthResponse>(
    "/auth/v1/signup",
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        email: input.email,
        password: input.password,
      }),
    },
  );

  const session = await populateSessionUser(normalizeSession(payload));
  if (session) {
    storeSession(session);
  }

  return {
    session,
    user: payload.user ?? session?.user ?? null,
  };
}

export async function sendPasswordRecoveryEmail(
  email: string,
  redirectTo: string,
) {
  await supabaseRequest<AuthResponse>("/auth/v1/recover", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });
}

function base64UrlEncode(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createPkceChallenge(verifier: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(buffer));
}

function createRandomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

function getStoredPkceVerifier() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEYS.pkceVerifier);
}

export async function signInWithGoogleOAuth(redirectTo: string) {
  ensureSupabaseConfig();

  const verifier = createRandomVerifier();
  const challenge = await createPkceChallenge(verifier);
  window.localStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier);

  const authorizeUrl = new URL("/auth/v1/authorize", SUPABASE_URL);
  authorizeUrl.searchParams.set("provider", "google");
  authorizeUrl.searchParams.set("redirect_to", redirectTo);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "s256");

  window.location.assign(authorizeUrl.toString());
}

async function exchangeCodeForSession(code: string) {
  const verifier = getStoredPkceVerifier();

  if (!verifier) {
    throw new Error("Missing OAuth verifier. Try signing in with Google again.");
  }

  const payload = await supabaseRequest<AuthResponse>("/auth/v1/token?grant_type=pkce", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      auth_code: code,
      code_verifier: verifier,
    }),
  });

  window.localStorage.removeItem(STORAGE_KEYS.pkceVerifier);

  const session = await populateSessionUser(normalizeSession(payload));
  storeSession(session);
  return session;
}

function clearAuthParamsFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  // GoTrue's implicit-flow recovery redirect puts `type=recovery` in the
  // hash (cleared below via url.hash = ""); this query-string deletion is
  // defensive in case a future redirect shape ever surfaces `type` there
  // instead, so no recovery/auth parameter of either shape can survive a
  // page refresh.
  url.searchParams.delete("type");
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

export interface SupabaseAuthRedirectResult {
  changed: boolean;
  session: StoredSupabaseSession | null;
  error: string | null;
  // True when this redirect established a password-recovery session (the
  // user clicked a "reset your password" email link) rather than an
  // ordinary login/signup/OAuth session. Verified against GoTrue's actual
  // recovery redirect: since sendPasswordRecoveryEmail's POST /auth/v1/recover
  // call below never sends code_challenge/code_challenge_method, GoTrue
  // always resolves the recovery link through the implicit/hash-token flow
  // and appends `type=recovery` to the URL fragment alongside
  // access_token/refresh_token - never through the `?code=` PKCE branch.
  recovery: boolean;
}

// Header and AppContent both call this on mount; the flag ensures only the
// first caller performs the (single-use) code/token exchange per page load.
let redirectHandledThisLoad = false;

export async function handleSupabaseAuthRedirect(): Promise<SupabaseAuthRedirectResult> {
  if (typeof window === "undefined" || redirectHandledThisLoad) {
    return { changed: false, session: null, error: null, recovery: false };
  }
  redirectHandledThisLoad = true;

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const errorDescription = url.searchParams.get("error_description");
  // D-5: some OAuth/auth failures redirect with `error` and/or `error_code`
  // but no `error_description` (e.g. a provider-side error GoTrue couldn't
  // attach a description to). Before this, that shape fell through every
  // branch below to the silent no-op fallback at the bottom of this
  // function - the failure was swallowed and `error`/`error_code` were left
  // sitting in the URL instead of being cleaned up like every other
  // consumed auth redirect.
  const oauthError = url.searchParams.get("error");
  const oauthErrorCode = url.searchParams.get("error_code");
  const authCode = url.searchParams.get("code");
  const hashAccessToken = hashParams.get("access_token");
  const hashRefreshToken = hashParams.get("refresh_token");

  if (hashAccessToken && hashRefreshToken) {
    const isRecovery = hashParams.get("type") === "recovery";
    const session: StoredSupabaseSession = {
      access_token: hashAccessToken,
      refresh_token: hashRefreshToken,
      expires_at: hashParams.get("expires_at")
        ? Number(hashParams.get("expires_at"))
        : null,
      expires_in: hashParams.get("expires_in")
        ? Number(hashParams.get("expires_in"))
        : null,
      token_type: hashParams.get("token_type"),
      user: null,
    };
    const hydratedSession = await populateSessionUser(session);
    storeSession(hydratedSession);
    clearAuthParamsFromUrl();
    return { changed: true, session: hydratedSession, error: null, recovery: isRecovery };
  }

  if (errorDescription || oauthError || oauthErrorCode) {
    clearAuthParamsFromUrl();
    // A real error_description (GoTrue's own user-facing text for this
    // failure, e.g. "Email link is invalid or has expired") is preserved
    // exactly as before. Without one, a generic, safe message is returned
    // instead of silently dropping the failure - never anything derived
    // from the raw `error`/`error_code` values themselves, which are
    // provider-internal identifiers, not user-facing text.
    return {
      changed: false,
      session: null,
      error: errorDescription
        ? decodeURIComponent(errorDescription)
        : "Authentication failed. Please try again.",
      recovery: false,
    };
  }

  if (authCode) {
    if (!getStoredPkceVerifier()) {
      clearAuthParamsFromUrl();
      return { changed: false, session: null, error: null, recovery: false };
    }

    const session = await exchangeCodeForSession(authCode);
    clearAuthParamsFromUrl();
    return { changed: true, session, error: null, recovery: false };
  }

  return { changed: false, session: null, error: null, recovery: false };
}

export async function fetchSupabaseAuthUser(
  session: StoredSupabaseSession,
): Promise<SupabaseAuthUser> {
  return supabaseRequest<SupabaseAuthUser>("/auth/v1/user", {
    method: "GET",
    headers: {
      ...getAuthHeaders(),
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

export async function updateSupabaseAuthUserMetadata(
  session: StoredSupabaseSession,
  metadata: Record<string, unknown>,
): Promise<SupabaseAuthUser> {
  return supabaseRequest<SupabaseAuthUser>("/auth/v1/user", {
    method: "PUT",
    headers: {
      ...getAuthHeaders(),
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      data: metadata,
    }),
  });
}

// Updates the password of whichever user the given session's access token
// authenticates as - GoTrue's "Update user" endpoint (PUT /auth/v1/user,
// verified against the official Supabase Auth API reference) authenticates
// purely off the Authorization: Bearer token, exactly like
// updateSupabaseAuthUserMetadata above. Deliberately takes a session, not a
// user ID: there is no request shape for "update this other user's
// password" here, only "update the password of whoever this access token
// belongs to" - which is what makes it safe to drive from a
// password-recovery session.
export async function updateSupabaseAuthUserPassword(
  session: StoredSupabaseSession,
  password: string,
): Promise<SupabaseAuthUser> {
  return supabaseRequest<SupabaseAuthUser>("/auth/v1/user", {
    method: "PUT",
    headers: {
      ...getAuthHeaders(),
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      password,
    }),
  });
}
