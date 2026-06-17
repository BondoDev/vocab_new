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

export async function supabaseRequest<TResponse>(
  path: string,
  options: RequestInit,
): Promise<TResponse> {
  ensureSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}${path}`, options);
  const data = (await response.json().catch(() => ({}))) as
    | TResponse
    | { msg?: string; error_description?: string; message?: string };

  if (!response.ok) {
    const message =
      (data as { msg?: string; error_description?: string; message?: string })
        .msg ||
      (data as { msg?: string; error_description?: string; message?: string })
        .error_description ||
      (data as { msg?: string; error_description?: string; message?: string })
        .message ||
      "Authentication request failed.";
    throw new Error(message);
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

export async function refreshSupabaseSession(
  session: StoredSupabaseSession,
): Promise<StoredSupabaseSession> {
  if (!session.refresh_token) {
    throw new Error("Missing refresh token. Sign in again.");
  }

  const payload = await supabaseRequest<AuthResponse>(
    "/auth/v1/token?grant_type=refresh_token",
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        refresh_token: session.refresh_token,
      }),
    },
  );

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
    storeSession(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEYS.pkceVerifier);
    }
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
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

export async function handleSupabaseAuthRedirect() {
  if (typeof window === "undefined") {
    return { changed: false, session: null as StoredSupabaseSession | null, error: null as string | null };
  }

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const errorDescription = url.searchParams.get("error_description");
  const authCode = url.searchParams.get("code");
  const hashAccessToken = hashParams.get("access_token");
  const hashRefreshToken = hashParams.get("refresh_token");

  if (hashAccessToken && hashRefreshToken) {
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
    return { changed: true, session: hydratedSession, error: null };
  }

  if (errorDescription) {
    clearAuthParamsFromUrl();
    return { changed: false, session: null, error: decodeURIComponent(errorDescription) };
  }

  if (authCode) {
    if (!getStoredPkceVerifier()) {
      clearAuthParamsFromUrl();
      return { changed: false, session: null, error: null };
    }

    const session = await exchangeCodeForSession(authCode);
    clearAuthParamsFromUrl();
    return { changed: true, session, error: null };
  }

  return { changed: false, session: null, error: null };
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
