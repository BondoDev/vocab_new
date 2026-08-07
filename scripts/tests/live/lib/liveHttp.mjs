// Minimal REST/RPC/Auth HTTP client for the live Supabase E2E suite.
//
// Deliberately NOT src/lib/supabaseAuth.ts's supabaseRequest — that module
// reads import.meta.env at import time (Vite-only) and throws immediately
// under a bare Node process. This is a small, independent client instead,
// scoped to exactly what the live suite needs: explicit timeouts, and a
// response shape ({status, ok, json}) that lets a test inspect an error
// response directly rather than only via a thrown exception, since most
// scenarios in this suite need to assert on *rejections* (invalid input,
// missing auth, blocked direct writes) as much as on successes.
//
// A thrown error from these helpers always means a genuine network/DNS/
// timeout/configuration failure (see LiveNetworkError below) — never a
// non-2xx HTTP response, which is returned normally for the caller to
// assert on.

export class LiveNetworkError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "LiveNetworkError";
    this.cause = cause;
  }
}

function headersFor(config, { accessToken, useServiceRole } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (useServiceRole) {
    headers.apikey = config.serviceRoleKey;
    headers.Authorization = `Bearer ${config.serviceRoleKey}`;
    return headers;
  }

  // Always send the anon key as `apikey` (required by Supabase's gateway to
  // route the request at all), and only add an Authorization bearer token
  // when one was supplied. Omitting it entirely — never substituting the
  // anon key as a fake bearer token — is what makes the "no Authorization
  // token" unauthenticated-request scenarios in this suite genuine: this is
  // exactly the shape src/lib/supabaseAuth.ts's own getAuthHeaders() +
  // conditional Authorization spread produces for a signed-out caller.
  headers.apikey = config.anonKey;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

async function rawRequest(config, path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response;
  try {
    response = await fetch(`${config.supabaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new LiveNetworkError(`Network/DNS/timeout error calling ${path}: ${reason}`, error);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON body (rare for this API) — status/ok/raw remain usable.
      json = null;
    }
  }

  return { status: response.status, ok: response.ok, json, raw: text };
}

export async function restGet(config, path, options = {}) {
  return rawRequest(config, path, { method: "GET", headers: headersFor(config, options) });
}

export async function restMutate(config, path, method, body, options = {}) {
  const headers = headersFor(config, options);
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }
  return rawRequest(config, path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function callRpc(config, rpcName, body, options = {}) {
  return restMutate(config, `/rest/v1/rpc/${rpcName}`, "POST", body ?? {}, options);
}
