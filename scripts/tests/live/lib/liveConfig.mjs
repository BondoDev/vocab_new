// Environment/config loader for the live Supabase E2E suite
// (scripts/tests/live/). Fails fast and loudly if required credentials are
// missing — this suite mutates real data against a real Supabase project,
// so silently falling back to a default/empty value (the way
// src/lib/supabaseAuth.ts's `?.trim() ?? ""` safely does for the browser,
// where "not configured yet" is a normal state) is never acceptable here.
//
// Deliberately reads plain process.env, not import.meta.env (Vite-only,
// resolved at build time) — this whole suite runs as a bare Node process
// via `node --experimental-strip-types`, the same way every existing
// scripts/tests/**/*.mjs contract test that imports from src/lib already
// does. See run-supabase-live-tests.mjs's own header for the corollary:
// why this suite never imports src/lib/supabaseAuth.ts itself.
//
// No fallback to VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY on purpose: this
// repository's .env already has those set to what is presumably the real
// production project (no staging project exists in this repository, see
// supabase/README.md). Falling back to them would let `npm run
// test:supabase-live` silently run destructive tests against production
// the first time someone forgets to set SUPABASE_URL explicitly. Requiring
// a distinctly-named, deliberately-set variable is the whole point of "the
// live suite must require explicit environment configuration."
//
// Run via `npm run test:supabase-live`, which is wired to
// `node --env-file-if-exists=.env.supabase-live ...` — an optional,
// gitignored (`.env.*` in .gitignore) local file for these credentials, so
// nothing here is ever loaded from a committed file. Exporting the same
// variables in your shell instead works identically; the env-file is pure
// convenience.

export class MissingLiveConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "MissingLiveConfigError";
  }
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requireEnv(name, describe) {
  const value = readEnv(name);
  if (!value) {
    throw new MissingLiveConfigError(`Missing required environment variable ${name}. ${describe}`);
  }
  return value;
}

export function loadLiveConfig() {
  const supabaseUrl = requireEnv(
    "SUPABASE_URL",
    "Set it to the target Supabase project's REST URL (e.g. https://xxxx.supabase.co). Not read from VITE_SUPABASE_URL on purpose — see this file's own header.",
  ).replace(/\/+$/, "");

  if (!/^https?:\/\/.+/.test(supabaseUrl)) {
    throw new MissingLiveConfigError(
      `SUPABASE_URL does not look like a valid URL: "${supabaseUrl}".`,
    );
  }

  const anonKey = requireEnv(
    "SUPABASE_ANON_KEY",
    "Set it to the target Supabase project's anon public API key.",
  );

  // Credential-source migration (2026-08-19): this suite used to require
  // SUPABASE_SERVICE_ROLE_KEY (the legacy service_role JWT). It now requires
  // SUPABASE_SECRET_KEY instead — a single developer-provided sb_secret_...
  // value from the project's newer secret-key model. Deliberately a single
  // scalar env var here, not a JSON dictionary like the Edge Function's
  // platform-injected SUPABASE_SECRET_KEYS (supabase/functions/delete-
  // account/index.ts): this suite has exactly one privileged caller
  // (liveHttp.mjs's useSecretKey path below), never a multi-key selection
  // need, so mirroring that JSON-dictionary shape here would only add a
  // parsing step with no corresponding benefit.
  const secretKey = requireEnv(
    "SUPABASE_SECRET_KEY",
    "This suite needs privileged access to create/confirm/delete disposable test users and to verify cleanup and historical-data fixtures — it is read only by this Node test process, never by any frontend code path. Get an sb_secret_... key from Supabase dashboard > Project Settings > API Keys. Never commit it, never add a VITE_-prefixed copy of it.",
  );

  const timeoutMs = (() => {
    const raw = process.env.SUPABASE_LIVE_TEST_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
  })();

  return { supabaseUrl, anonKey, secretKey, timeoutMs };
}
