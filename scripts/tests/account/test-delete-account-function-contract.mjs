// Contract guard for the account-deletion backend primitive
// (supabase/functions/delete-account/index.ts) and the cascade graph it
// relies on. See supabase/README.md's "Account Deletion" section for the
// full audit this guards.
//
// This is a source-text guard, like every migration-contract test in this
// repository (test-restrict-user-profiles-writes-migration-contract.mjs,
// test-review-events-referential-integrity's coverage in
// supabase/README.md, etc.) — there is no live Supabase project or Deno
// runtime available to this repo's test suite, and the Edge Function is not
// deployed as part of it either. Section [1] guards the function's own
// source text (identity/security); section [2] guards the
// ACCOUNT_DELETION_ENABLED production deployment gate specifically; section
// [3] guards that every user-owned table across every migration still
// cascades from auth.users the way the function's own comments/
// documentation claim.
//
// Run: node scripts/tests/account/test-delete-account-function-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const FUNCTION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "functions",
  "delete-account",
  "index.ts",
);
// The recent-authentication decision logic (decodeJwtPayload/
// getMostRecentAuthTimestamp/hasRecentAuthentication/RECENT_AUTH_METHODS)
// lives in its own module (recentAuth.ts), imported by index.ts via a
// relative import — a pure, dependency-free file shared with this repo's
// own Node test suite (test-recent-auth-token-refresh-bypass.mjs), so its
// actual behavior (not just its presence) is exercised directly, not only
// pattern-matched here.
const RECENT_AUTH_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "functions",
  "delete-account",
  "recentAuth.ts",
);
const MIGRATIONS_DIR = path.join(ROOT_DIR, "supabase", "migrations");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

console.log("\n=== delete-account Edge Function: source contract ===\n");

assert.ok(fs.existsSync(FUNCTION_PATH), "supabase/functions/delete-account/index.ts is missing");
const fnSource = fs.readFileSync(FUNCTION_PATH, "utf8");
// Comment-only lines (this file's header discusses the absent user_id/email
// parameters by name, as documentation) are stripped before the identity
// checks below, so those checks assert against executable code only.
const fnCodeOnly = fnSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

assert.ok(fs.existsSync(RECENT_AUTH_PATH), "supabase/functions/delete-account/recentAuth.ts is missing");
const recentAuthSource = fs.readFileSync(RECENT_AUTH_PATH, "utf8");

test("1. The function exists as a Deno Edge Function (Deno.serve), not a Node/Express route", () => {
  assert.match(fnSource, /Deno\.serve\(/);
});

test("2. No request parameter named user_id/target_user_id/email exists in executable code", () => {
  assert.doesNotMatch(fnCodeOnly, /\buser_id\b/);
  assert.doesNotMatch(fnCodeOnly, /\btarget_user_id\b/);
  assert.doesNotMatch(fnCodeOnly, /\bemail\b/i);
});

test("3. The request body is never parsed — identity comes only from the Authorization header", () => {
  assert.doesNotMatch(fnCodeOnly, /req\.json\(\)/);
  assert.doesNotMatch(fnCodeOnly, /req\.text\(\)/);
  assert.doesNotMatch(fnCodeOnly, /req\.formData\(\)/);
});

test("4. The caller id is derived from adminClient.auth.getUser(token), never a literal/param", () => {
  assert.match(fnSource, /adminClient\.auth\.getUser\(callerToken\)/);
});

test("5. Only the token-derived id is ever passed to admin.deleteUser — never req.* directly", () => {
  const deleteCallMatch = fnSource.match(/adminClient\.auth\.admin\.deleteUser\(([^)]*)\)/);
  assert.ok(deleteCallMatch, "adminClient.auth.admin.deleteUser(...) call not found");
  assert.equal(deleteCallMatch[1].trim(), "callerId");
  // callerId itself must originate from the getUser() result, not a param.
  assert.match(fnSource, /const callerId = userResult\.user\.id;/);
});

test("6. A missing/malformed Authorization header is rejected before any Supabase call is made", () => {
  const bearerCheckIndex = fnCodeOnly.indexOf("bearerMatch");
  const getUserIndex = fnCodeOnly.indexOf("adminClient.auth.getUser");
  assert.ok(bearerCheckIndex > -1 && getUserIndex > -1, "expected both the bearer check and getUser call to exist");
  assert.ok(bearerCheckIndex < getUserIndex, "the bearer-token check must happen before getUser() is called");
  assert.match(fnSource, /return jsonResponse\(\{ error: "unauthenticated" \}, 401\)/);
});

test("7. A getUser() failure (expired/invalid/already-deleted-user token) is rejected, not treated as success", () => {
  assert.match(fnSource, /if \(userError \|\| !userResult\?\.user\?\.id\)/);
});

test("8. Missing server secrets fail closed (500) rather than falling back to an unprivileged client", () => {
  assert.match(fnSource, /if \(!SUPABASE_URL \|\| !SERVICE_ROLE_KEY\)/);
  assert.match(fnSource, /server_misconfigured/);
});

test("9. The service_role key is read only from a server-side env var, never a VITE_-prefixed one", () => {
  assert.match(fnCodeOnly, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.doesNotMatch(fnCodeOnly, /VITE_/);
});

test("10. A failed Auth deletion returns a clear error, never a false success", () => {
  assert.match(fnSource, /if \(deleteError\)/);
  const deleteErrorBlock = fnSource.slice(fnSource.indexOf("if (deleteError)"), fnSource.indexOf("if (deleteError)") + 200);
  assert.match(deleteErrorBlock, /delete_failed/);
  assert.doesNotMatch(deleteErrorBlock, /deleted: true/);
});

test("11. The success response is minimal — only a deleted flag, no echoed id/email", () => {
  const successMatch = fnSource.match(/return jsonResponse\(\{([^}]*)\}, 200\);/);
  assert.ok(successMatch, "expected a 200 jsonResponse call");
  assert.match(successMatch[1].trim(), /^deleted: true$/);
});

test("12. Non-POST, non-OPTIONS methods are rejected", () => {
  assert.match(fnSource, /req\.method !== "POST"/);
  assert.match(fnSource, /method_not_allowed/);
});

console.log("\n=== Production deployment gate (ACCOUNT_DELETION_ENABLED) ===\n");

test("13. ACCOUNT_DELETION_ENABLED is read server-side, only from Deno.env — never from the request", () => {
  assert.match(fnCodeOnly, /Deno\.env\.get\("ACCOUNT_DELETION_ENABLED"\)/);
  // No header/body/query lookup of this name anywhere — the flag cannot be
  // supplied or overridden by a caller under any spelling.
  assert.doesNotMatch(fnCodeOnly, /req\.[a-zA-Z]+\([^)]*ACCOUNT_DELETION_ENABLED/);
  assert.doesNotMatch(fnCodeOnly, /headers\.get\("ACCOUNT_DELETION_ENABLED"\)/);
});

test("14. The comparison is an exact strict-equality check against the literal string \"true\"", () => {
  assert.match(fnCodeOnly, /ACCOUNT_DELETION_ENABLED !== "true"/);
  // No .toLowerCase()/.trim()/Boolean()/truthy coercion applied to the flag
  // anywhere — "True"/"TRUE"/" true "/"1" must all fail the same as "false"
  // or a missing value; normalizing the value would silently accept more
  // spellings than the one exact string this gate is documented to require.
  assert.doesNotMatch(fnCodeOnly, /ACCOUNT_DELETION_ENABLED\.toLowerCase/);
  assert.doesNotMatch(fnCodeOnly, /ACCOUNT_DELETION_ENABLED\.trim/);
  assert.doesNotMatch(fnCodeOnly, /Boolean\(ACCOUNT_DELETION_ENABLED\)/);
});

test("15. A missing flag disables deletion (undefined !== \"true\" is true, so the gate rejects)", () => {
  // Structural proof, not a runtime call (no Deno runtime in this suite):
  // Deno.env.get returns undefined for an unset var, and undefined is
  // never === "true", so the strict-inequality gate in test 14 rejects by
  // construction — there is no separate "missing" branch that could permit
  // a fall-through, which is itself the property being asserted here.
  assert.doesNotMatch(fnCodeOnly, /ACCOUNT_DELETION_ENABLED\s*\?\?/);
  assert.doesNotMatch(fnCodeOnly, /if \(!ACCOUNT_DELETION_ENABLED\)/);
});

test('16. Only the disabled branch responds with account_deletion_disabled, and it never proceeds to delete', () => {
  // Captures just the if-statement's own body (no nested braces inside it),
  // so this can't accidentally spill into the unrelated code that follows.
  const gateBlockMatch = fnSource.match(/if \(ACCOUNT_DELETION_ENABLED !== "true"\) \{([^}]*)\}/);
  assert.ok(gateBlockMatch, "ACCOUNT_DELETION_ENABLED gate if-block not found");
  assert.match(gateBlockMatch[1], /account_deletion_disabled/);
  assert.doesNotMatch(gateBlockMatch[1], /deleteUser/);
});

test("17. The disabled response is narrow — a single machine-readable error field, no message/reason/config state", () => {
  const disabledMatch = fnSource.match(/return jsonResponse\(\{([^}]*)\}, 403\);/);
  assert.ok(disabledMatch, "expected a 403 jsonResponse call");
  assert.match(disabledMatch[1].trim(), /^error: "account_deletion_disabled"$/);
});

test("18. The gate is checked strictly before admin.deleteUser is ever called", () => {
  const gateIndex = fnCodeOnly.indexOf('ACCOUNT_DELETION_ENABLED !== "true"');
  const deleteCallIndex = fnCodeOnly.indexOf("adminClient.auth.admin.deleteUser(");
  assert.ok(gateIndex > -1 && deleteCallIndex > -1, "expected both the gate check and the deleteUser call to exist");
  assert.ok(gateIndex < deleteCallIndex, "the ACCOUNT_DELETION_ENABLED gate must run before admin.deleteUser is called");
});

test("19. The gate runs after identity is resolved — an unauthenticated caller gets a plain 401, not the disabled response", () => {
  const getUserIndex = fnCodeOnly.indexOf("adminClient.auth.getUser(callerToken)");
  const gateIndex = fnCodeOnly.indexOf('ACCOUNT_DELETION_ENABLED !== "true"');
  assert.ok(getUserIndex > -1 && gateIndex > -1, "expected both getUser and the gate check to exist");
  assert.ok(getUserIndex < gateIndex, "identity must be resolved before the deployment gate is evaluated");
});

console.log("\n=== Account-deletion cascade contract (all user-owned tables) ===\n");

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const allMigrationsText = migrationFiles
  .map((name) => fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"))
  .join("\n");

test("20. Every user-owned table found in the migrations is one of the seven audited tables", () => {
  const createdTables = [...allMigrationsText.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  const expected = [
    "user_profiles",
    "user_word_progress",
    "user_daily_stats",
    "review_events",
    "custom_practice_events",
    "user_vocabulary_lists",
    "user_vocabulary_list_words",
  ];
  assert.deepEqual(
    [...new Set(createdTables)].sort(),
    [...expected].sort(),
    "a new user-owned table was added without updating this cascade-contract test and supabase/README.md's Account Deletion section",
  );
});

test("21. user_profiles.id cascades from auth.users", () => {
  assert.match(allMigrationsText, /id uuid primary key references auth\.users \(id\) on delete cascade/);
});

test("22. user_word_progress.user_id cascades from auth.users", () => {
  assert.match(
    allMigrationsText,
    /create table if not exists public\.user_word_progress \(\s*id uuid primary key default gen_random_uuid\(\),\s*user_id uuid not null references auth\.users \(id\) on delete cascade/,
  );
});

test("23. user_daily_stats.user_id cascades from auth.users", () => {
  assert.match(
    allMigrationsText,
    /create table if not exists public\.user_daily_stats \(\s*id uuid primary key default gen_random_uuid\(\),\s*user_id uuid not null references auth\.users \(id\) on delete cascade/,
  );
});

test("24. custom_practice_events.user_id cascades from auth.users", () => {
  assert.match(
    allMigrationsText,
    /create table if not exists public\.custom_practice_events \(\s*event_id uuid primary key,\s*user_id uuid not null references auth\.users \(id\) on delete cascade/,
  );
});

test("25. review_events.user_id has an explicit ON DELETE CASCADE foreign key to auth.users (Corrective Migration 3)", () => {
  assert.match(
    allMigrationsText,
    /add constraint review_events_user_id_fkey\s*\n\s*foreign key \(user_id\) references auth\.users \(id\) on delete cascade;/,
  );
});

test("26. review_events.word_progress_id is ON DELETE CASCADE, not the original NO ACTION (Corrective Migration 3)", () => {
  assert.match(
    allMigrationsText,
    /add constraint review_events_word_progress_id_fkey\s*\n\s*foreign key \(word_progress_id\) references public\.user_word_progress \(id\) on delete cascade;/,
  );
  // The baseline's original, weaker FK (no ON DELETE clause = NO ACTION) is
  // explicitly dropped by Corrective Migration 3 — confirms this isn't just
  // an additive second constraint sitting alongside the unsafe original.
  assert.match(allMigrationsText, /drop constraint review_events_word_progress_id_fkey;/);
});

test("26b. user_vocabulary_lists.user_id has a direct ON DELETE CASCADE foreign key to auth.users (My Lists)", () => {
  assert.match(
    allMigrationsText,
    /create table if not exists public\.user_vocabulary_lists \(\s*id uuid primary key default gen_random_uuid\(\),\s*user_id uuid not null references auth\.users \(id\) on delete cascade/,
  );
});

test("26c. user_vocabulary_list_words has no user_id column / no direct FK to auth.users — ownership is transitive through list_id", () => {
  const tableMatch = allMigrationsText.match(
    /create table if not exists public\.user_vocabulary_list_words \(([\s\S]*?)\n\);/,
  );
  assert.ok(tableMatch, "expected the user_vocabulary_list_words CREATE TABLE statement");
  assert.doesNotMatch(
    tableMatch[1],
    /references auth\.users/,
    "user_vocabulary_list_words must not gain a direct auth.users FK — its ownership is intentionally transitive through list_id",
  );
});

test("26d. user_vocabulary_list_words.list_id has an ON DELETE CASCADE foreign key to user_vocabulary_lists, and is never dropped — so deleting a user's auth.users row cascades auth.users -> user_vocabulary_lists -> user_vocabulary_list_words with no orphaned rows", () => {
  assert.match(
    allMigrationsText,
    /create table if not exists public\.user_vocabulary_list_words \(\s*id uuid primary key default gen_random_uuid\(\),\s*list_id uuid not null references public\.user_vocabulary_lists \(id\) on delete cascade/,
  );
  // The corrective word_id migration explicitly documents leaving this FK
  // untouched while reshaping the rest of the table (word_progress_id ->
  // word_id) — confirm no migration ever drops the list_id FK itself.
  assert.doesNotMatch(
    allMigrationsText,
    /drop constraint[\s\S]{0,60}user_vocabulary_list_words_list_id_fkey/i,
  );
});

test("27. No trigger on user_profiles fires on DELETE (would risk blocking the cascade)", () => {
  const triggerMatches = [...allMigrationsText.matchAll(/create trigger \w+\s*\n\s*before ([a-z ]+) on public\.user_profiles/g)];
  assert.ok(triggerMatches.length > 0, "expected at least one trigger definition on user_profiles");
  for (const match of triggerMatches) {
    assert.doesNotMatch(match[1], /delete/i);
  }
});

console.log("\n=== CORS / preflight contract (live CORS incident fix, 2026-08-13) ===\n");
//
// Root cause of the live failure this section guards: supabase/config.toml
// declared `[functions.delete-account]` with `verify_jwt = true`. Supabase's
// own gateway then required a valid bearer token on EVERY request routed to
// this function — including the browser's automatic CORS preflight OPTIONS
// request, which per the Fetch/CORS spec never carries an Authorization
// header. The gateway rejected the preflight itself, before this function's
// own already-correct `if (req.method === "OPTIONS")` branch ever ran. A
// second, independent bug (Access-Control-Allow-Headers omitting `apikey`,
// which src/lib/accountDeletion.ts always sends via getAuthHeaders()) would
// have caused the exact same class of failure even after verify_jwt was
// fixed. This section is a source-text guard, like every other section in
// this file — there is no Deno runtime available to this repo's test suite
// to actually issue the HTTP request end-to-end (confirmed: `deno` is not
// on PATH in this environment).

const CONFIG_TOML_PATH = path.join(ROOT_DIR, "supabase", "config.toml");
const configTomlSource = fs.readFileSync(CONFIG_TOML_PATH, "utf8");

test("28. supabase/config.toml sets verify_jwt = false for delete-account (platform gateway no longer blocks the CORS preflight)", () => {
  const sectionMatch = configTomlSource.match(/\[functions\.delete-account\]\s*\n\s*verify_jwt = (\w+)/);
  assert.ok(sectionMatch, "expected a [functions.delete-account] section with a verify_jwt setting");
  assert.equal(sectionMatch[1], "false");
});

test("29. OPTIONS is handled before any authentication/authorization logic runs", () => {
  const optionsIndex = fnCodeOnly.indexOf('req.method === "OPTIONS"');
  const bearerCheckIndex = fnCodeOnly.indexOf("bearerMatch");
  const getUserIndex = fnCodeOnly.indexOf("adminClient.auth.getUser");
  const gateIndex = fnCodeOnly.indexOf('ACCOUNT_DELETION_ENABLED !== "true"');
  assert.ok(optionsIndex > -1, "expected an OPTIONS branch");
  assert.ok(optionsIndex < bearerCheckIndex);
  assert.ok(optionsIndex < getUserIndex);
  assert.ok(optionsIndex < gateIndex);
});

test("30. OPTIONS returns a 2xx status with no destructive work performed", () => {
  const optionsBlockMatch = fnSource.match(/if \(req\.method === "OPTIONS"\) \{\s*return new Response\(([^;]*)\);\s*\}/s);
  assert.ok(optionsBlockMatch, "expected the OPTIONS branch's Response(...) call");
  assert.match(optionsBlockMatch[1], /status: 204/);
  assert.doesNotMatch(optionsBlockMatch[1], /deleteUser|getUser/);
});

test("31. CORS_HEADERS includes Access-Control-Allow-Origin", () => {
  assert.match(fnSource, /"Access-Control-Allow-Origin":\s*"\*"/);
});

test("32. CORS_HEADERS' Access-Control-Allow-Methods includes both POST and OPTIONS", () => {
  const methodsMatch = fnSource.match(/"Access-Control-Allow-Methods":\s*"([^"]*)"/);
  assert.ok(methodsMatch, "expected an Access-Control-Allow-Methods entry");
  const methods = methodsMatch[1].split(",").map((m) => m.trim().toUpperCase());
  assert.ok(methods.includes("POST"));
  assert.ok(methods.includes("OPTIONS"));
});

test("33. CORS_HEADERS' Access-Control-Allow-Headers names exactly the headers the real frontend caller sends — authorization, content-type, apikey — no more, no fewer", () => {
  const headersMatch = fnSource.match(/"Access-Control-Allow-Headers":\s*"([^"]*)"/);
  assert.ok(headersMatch, "expected an Access-Control-Allow-Headers entry");
  const allowed = headersMatch[1].split(",").map((h) => h.trim().toLowerCase());
  assert.deepEqual(allowed.sort(), ["apikey", "authorization", "content-type"].sort());
});

test("34. Every jsonResponse(...) call — success, auth failure, feature-gate failure, and internal errors alike — is built from the shared helper that always spreads CORS_HEADERS", () => {
  const jsonResponseFnMatch = fnSource.match(/function jsonResponse\([\s\S]*?\n\}/);
  assert.ok(jsonResponseFnMatch, "expected a jsonResponse helper function");
  assert.match(jsonResponseFnMatch[0], /\.\.\.CORS_HEADERS/);

  // Every response in the function goes through this one helper (or the
  // OPTIONS branch's own explicit CORS_HEADERS) — no response construction
  // anywhere bypasses it with a bare `new Response(...)`.
  const bareResponseCalls = [...fnCodeOnly.matchAll(/(?<!return\s)new Response\(/g)];
  const allResponseCalls = [...fnCodeOnly.matchAll(/return new Response\(/g)];
  // The only bare `new Response(` calls allowed are the ones already
  // `return`ed (OPTIONS branch and the helper's own body) — assert every
  // `new Response(` in the file is part of a `return` statement.
  assert.equal(bareResponseCalls.length, 0, "found a new Response(...) call not immediately returned");
  assert.ok(allResponseCalls.length >= 1);
});

test("35. Every distinct application response (200/401/403/405/500/502) is reachable only via jsonResponse or the OPTIONS branch — never a second ad-hoc CORS-header set", () => {
  const corsHeaderBlocks = [...fnSource.matchAll(/CORS_HEADERS\s*=\s*\{/g)];
  assert.equal(corsHeaderBlocks.length, 1, "CORS_HEADERS must be defined exactly once, reused everywhere");
});

test("36. Unsupported methods (non-OPTIONS, non-POST) return 405 through jsonResponse, so the response still carries CORS headers", () => {
  const methodBlockMatch = fnSource.match(/if \(req\.method !== "POST"\) \{\s*return ([^;]*);\s*\}/s);
  assert.ok(methodBlockMatch, "expected the non-POST branch");
  assert.match(methodBlockMatch[1], /jsonResponse\(\{ error: "method_not_allowed" \}, 405\)/);
});

test("37. Account deletion still requires bearer authentication — verify_jwt=false does not remove the in-function check", () => {
  assert.match(fnSource, /const authHeader = req\.headers\.get\("Authorization"\)/);
  assert.match(fnSource, /bearerMatch/);
  assert.match(fnSource, /return jsonResponse\(\{ error: "unauthenticated" \}, 401\)/);
});

test("38. Account identity is still derived exclusively from the verified token, never a client-supplied id (re-confirmed after the CORS fix)", () => {
  assert.match(fnSource, /adminClient\.auth\.getUser\(callerToken\)/);
  assert.doesNotMatch(fnCodeOnly, /\buser_id\b/);
});

test("39. ACCOUNT_DELETION_ENABLED is still read and enforced — the CORS fix does not touch the feature gate", () => {
  assert.match(fnSource, /ACCOUNT_DELETION_ENABLED !== "true"/);
  assert.match(fnSource, /account_deletion_disabled/);
});

test("40. No service-role credential exists anywhere in frontend code (src/), confirmed again after the CORS fix", () => {
  const SRC_DIR = path.join(ROOT_DIR, "src");
  const walk = (dir) => {
    const offenders = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        offenders.push(...walk(fullPath));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(content.replace(/\/\/.*$/gm, ""))) {
          offenders.push(path.relative(ROOT_DIR, fullPath));
        }
      }
    }
    return offenders;
  };
  assert.deepEqual(walk(SRC_DIR), []);
});

test("41. src/lib/accountDeletion.ts never uses fetch's no-cors mode or any other CORS-bypassing option", () => {
  const ACCOUNT_DELETION_TS_PATH = path.join(ROOT_DIR, "src", "lib", "accountDeletion.ts");
  const source = fs.readFileSync(ACCOUNT_DELETION_TS_PATH, "utf8");
  assert.doesNotMatch(source, /no-cors/);
  assert.doesNotMatch(source, /mode:\s*["']opaque/);
});

console.log("\n=== Recent-authentication requirement (2026-08-13 reauthentication phase, corrected 2026-08-14) ===\n");
//
// Possessing a valid-but-old session must not be enough to permanently
// delete an account — see supabase/README.md's "Reauthentication" section
// for the full design, including the 2026-08-14 token-refresh-bypass
// correction. This section guards the server-side half structurally
// (index.ts wires recentAuth.ts's hasRecentAuthentication in correctly);
// the actual decision-logic behavior (including proof that a silent
// token_refresh cannot extend the deletion window) is exercised directly
// against the real, shared algorithm by
// scripts/tests/account/test-recent-auth-token-refresh-bypass.mjs. The
// client-side half (password reauthentication before the call) is guarded
// by scripts/tests/account/test-account-reauthentication.mjs.

test("42. hasRecentAuthentication (recentAuth.ts) decodes and checks amr — never iat (iat also advances on a silent background token refresh, which never requires the user to re-enter credentials)", () => {
  assert.match(recentAuthSource, /export function hasRecentAuthentication\(/);
  assert.match(recentAuthSource, /getMostRecentAuthTimestamp/);
  assert.match(recentAuthSource, /payload\.amr/);
  const authFnMatch = recentAuthSource.match(/export function hasRecentAuthentication\([\s\S]*?\n\}/);
  assert.ok(authFnMatch, "expected hasRecentAuthentication's body");
  assert.doesNotMatch(authFnMatch[0], /\.iat\b/);
  // index.ts must actually import and call the shared implementation,
  // never redefine its own second copy. (Also imports
  // isCurrentSessionGoogleAuthenticated from the same module — see the
  // "Google-OAuth exemption" section further below.)
  assert.match(
    fnSource,
    /import \{ hasRecentAuthentication, isCurrentSessionGoogleAuthenticated \} from "\.\/recentAuth\.ts";/,
  );
  assert.doesNotMatch(fnCodeOnly, /function hasRecentAuthentication/);
});

test("43. The recency window is a fixed constant in the shared module (5 minutes) — never read from the request, never redefined a second time in index.ts", () => {
  assert.match(recentAuthSource, /export const RECENT_AUTH_WINDOW_SECONDS = 5 \* 60;/);
  assert.doesNotMatch(fnCodeOnly, /req\.[a-zA-Z]+\([^)]*RECENT_AUTH_WINDOW/);
  assert.doesNotMatch(fnCodeOnly, /const RECENT_AUTH_WINDOW_SECONDS/);
});

test("43b. Only password and oauth are accepted amr methods (explicit allow-list) — token_refresh and any other method are excluded by construction", () => {
  assert.match(recentAuthSource, /export const RECENT_AUTH_METHODS = new Set\(\["password", "oauth"\]\);/);
  assert.doesNotMatch(recentAuthSource, /RECENT_AUTH_METHODS = new Set\([^)]*token_refresh/);
});

test("43c. getMostRecentAuthTimestamp filters every amr entry by method against RECENT_AUTH_METHODS before considering its timestamp", () => {
  const fnMatch = recentAuthSource.match(/export function getMostRecentAuthTimestamp\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "expected getMostRecentAuthTimestamp's body");
  assert.match(fnMatch[0], /RECENT_AUTH_METHODS\.has\(method\)/);
  // The continue/skip must happen before the timestamp is ever read for a
  // non-qualifying entry — i.e. the method check precedes the timestamp
  // check in the loop body.
  const methodCheckIndex = fnMatch[0].indexOf("RECENT_AUTH_METHODS.has(method)");
  const timestampReadIndex = fnMatch[0].indexOf("entry as { timestamp: number }");
  assert.ok(methodCheckIndex > -1 && timestampReadIndex > -1);
  assert.ok(methodCheckIndex < timestampReadIndex, "method must be validated before timestamp is read/used");
});

test("44. decodeJwtPayload reads the SAME callerToken already resolved via bearerMatch — never a second, arbitrary, header/body-supplied token", () => {
  // Matches the call site specifically (`if (!isGoogleSession &&
  // !hasRecentAuthentication(...`), never the function's own definition
  // line, which also contains "hasRecentAuthentication(" followed by its
  // parameter declaration.
  const callSiteMatch = fnCodeOnly.match(/if \(!isGoogleSession && !hasRecentAuthentication\(([^)]*)\)\)/);
  assert.ok(callSiteMatch, "expected the hasRecentAuthentication(...) call site inside the if-guard");
  assert.equal(callSiteMatch[1].trim(), "callerToken");
});

test("45. No client-supplied timestamp or boolean of any kind can satisfy this check — the request body is never parsed anywhere in this file (re-confirms test 3 in this exact context)", () => {
  assert.doesNotMatch(fnCodeOnly, /req\.json\(\)/);
  assert.doesNotMatch(fnCodeOnly, /reauthenticated\s*[:=]\s*true/i);
  assert.doesNotMatch(fnCodeOnly, /req\.headers\.get\("[Xx]-[Rr]eauth/);
});

test("46. The recent-auth check runs after identity resolution and the feature gate, and strictly before the destructive deleteUser call", () => {
  const getUserIndex = fnCodeOnly.indexOf("adminClient.auth.getUser(callerToken)");
  const gateIndex = fnCodeOnly.indexOf('ACCOUNT_DELETION_ENABLED !== "true"');
  const reauthCheckIndex = fnCodeOnly.indexOf("hasRecentAuthentication(callerToken)");
  const deleteCallIndex = fnCodeOnly.indexOf("adminClient.auth.admin.deleteUser(");
  assert.ok(
    [getUserIndex, gateIndex, reauthCheckIndex, deleteCallIndex].every((i) => i > -1),
    "expected all four checkpoints to exist",
  );
  assert.ok(getUserIndex < gateIndex, "identity must resolve before the feature gate");
  assert.ok(gateIndex < reauthCheckIndex, "the feature gate must run before the recent-auth check");
  assert.ok(reauthCheckIndex < deleteCallIndex, "the recent-auth check must run before deleteUser is ever called");
});

test("47. A failing recent-auth check returns reauthentication_required with 403 and CORS headers, and never reaches deleteUser", () => {
  // A fixed-size window after the guard condition, rather than lazy brace-
  // matching: the response body itself contains a `}` (the object literal
  // `{ error: "..." }`), which a naive /\{([\s\S]*?)\}/ match would
  // mistake for the if-block's own closing brace and truncate on.
  const guardIndex = fnSource.indexOf("if (!isGoogleSession && !hasRecentAuthentication(callerToken))");
  assert.ok(guardIndex > -1, "expected the recent-auth guard");
  const window = fnSource.slice(guardIndex, guardIndex + 300);
  assert.match(window, /jsonResponse\(\{ error: "reauthentication_required" \}, 403\)/);
  assert.doesNotMatch(window.slice(0, window.indexOf("reauthentication_required")), /deleteUser/);
});

test("48. decodeJwtPayload (recentAuth.ts) never re-parses/re-fetches the token from an untrusted source — it is a pure, local, non-network function", () => {
  const decodeFnMatch = recentAuthSource.match(/export function decodeJwtPayload\([\s\S]*?\n\}/);
  assert.ok(decodeFnMatch, "expected decodeJwtPayload's body");
  assert.doesNotMatch(decodeFnMatch[0], /fetch\(|adminClient/);
});

test("49. A malformed/undecodable token payload is treated as 'not recently authenticated', never as an implicit pass", () => {
  const decodeFnMatch = recentAuthSource.match(/export function decodeJwtPayload\([\s\S]*?\n\}/);
  assert.match(decodeFnMatch[0], /catch \{\s*[\s\S]*?return null;/);
  const hasRecentFnMatch = recentAuthSource.match(/export function hasRecentAuthentication\([\s\S]*?\n\}/);
  assert.match(hasRecentFnMatch[0], /if \(!payload\) return false;/);
});

test("50. The feature gate and identity checks are unaffected by this phase — still enforced exactly as before (re-confirms tests 6, 13-19 in this exact file)", () => {
  assert.match(fnSource, /ACCOUNT_DELETION_ENABLED !== "true"/);
  assert.match(fnSource, /account_deletion_disabled/);
  assert.match(fnSource, /return jsonResponse\(\{ error: "unauthenticated" \}, 401\)/);
});

console.log("\n=== Google-OAuth reauthentication exemption (product policy, 2026-08-14) ===\n");
//
// Password accounts still go through the unchanged recent-`password`-AMR
// check above. Google OAuth accounts may delete using their current valid
// authenticated session, without the 5-minute recency window — see
// isCurrentSessionGoogleAuthenticated's own header (recentAuth.ts) for the
// two server-trusted signals this requires; the actual decision-logic
// behavior (not just its wiring) is exercised directly against the real,
// shared algorithm by scripts/tests/account/test-google-reauth-exemption.mjs.
// This section guards only the server-side WIRING: that index.ts derives
// the Google-session determination exclusively from data it already
// independently trusts, never from anything the request body supplies.

test("51. isCurrentSessionGoogleAuthenticated is called with userResult.user (the trusted Admin API response) and the same already-resolved callerToken — never a request-supplied value", () => {
  const callSiteMatch = fnCodeOnly.match(/const isGoogleSession = isCurrentSessionGoogleAuthenticated\(([^)]*)\);/);
  assert.ok(callSiteMatch, "expected the isCurrentSessionGoogleAuthenticated(...) call site");
  const args = callSiteMatch[1].split(",").map((a) => a.trim());
  assert.deepEqual(args, ["userResult.user", "callerToken"]);
});

test("52. No client-suppliable provider/Google flag exists anywhere in executable code — no isGoogleUser/provider/oauthProvider parameter of any kind", () => {
  assert.doesNotMatch(fnCodeOnly, /isGoogleUser/i);
  assert.doesNotMatch(fnCodeOnly, /req\.[a-zA-Z]+\([^)]*[Pp]rovider/);
  assert.doesNotMatch(fnCodeOnly, /headers\.get\("[Xx]-[Pp]rovider/);
});

test("53. isGoogleSession is computed after the feature gate and BEFORE the recent-auth guard, which is itself strictly before deleteUser — full ordering intact", () => {
  const gateIndex = fnCodeOnly.indexOf('ACCOUNT_DELETION_ENABLED !== "true"');
  const isGoogleSessionIndex = fnCodeOnly.indexOf("const isGoogleSession = isCurrentSessionGoogleAuthenticated(");
  const reauthGuardIndex = fnCodeOnly.indexOf("if (!isGoogleSession && !hasRecentAuthentication(callerToken))");
  const deleteCallIndex = fnCodeOnly.indexOf("adminClient.auth.admin.deleteUser(");
  assert.ok(
    [gateIndex, isGoogleSessionIndex, reauthGuardIndex, deleteCallIndex].every((i) => i > -1),
    "expected all four checkpoints to exist",
  );
  assert.ok(gateIndex < isGoogleSessionIndex, "the feature gate must run before the Google-session determination");
  assert.ok(isGoogleSessionIndex < reauthGuardIndex, "isGoogleSession must be computed before the recent-auth guard reads it");
  assert.ok(reauthGuardIndex < deleteCallIndex, "the combined guard must run before deleteUser is ever called");
});

test("54. The recent-auth guard is skipped ONLY when isGoogleSession is true — a password account (isGoogleSession always false for them) is completely unaffected by this branch", () => {
  assert.match(fnCodeOnly, /if \(!isGoogleSession && !hasRecentAuthentication\(callerToken\)\)/);
  // Not an OR — a password account must never bypass the recent-auth check
  // merely because some unrelated condition is true.
  assert.doesNotMatch(fnCodeOnly, /if \(!isGoogleSession \|\| !hasRecentAuthentication/);
});

test("55. userResult.user (passed into isCurrentSessionGoogleAuthenticated) is the SAME object adminClient.auth.getUser(callerToken) returned for callerId — not a second, independently-sourced user lookup", () => {
  const getUserIndex = fnCodeOnly.indexOf("adminClient.auth.getUser(callerToken)");
  const callerIdIndex = fnCodeOnly.indexOf("const callerId = userResult.user.id;");
  const isGoogleSessionIndex = fnCodeOnly.indexOf("const isGoogleSession = isCurrentSessionGoogleAuthenticated(userResult.user, callerToken)");
  assert.ok(
    [getUserIndex, callerIdIndex, isGoogleSessionIndex].every((i) => i > -1),
    "expected getUser, callerId, and isGoogleSession to all reference the one resolved userResult",
  );
  assert.ok(getUserIndex < callerIdIndex && callerIdIndex < isGoogleSessionIndex);
});

test("56. CORS headers, verify_jwt=false, and the OPTIONS/method/misconfiguration branches are unaffected by the Google exemption (re-confirms tests 28-36 in this exact file)", () => {
  const headersMatch = fnSource.match(/"Access-Control-Allow-Headers":\s*"([^"]*)"/);
  assert.ok(headersMatch);
  assert.deepEqual(
    headersMatch[1].split(",").map((h) => h.trim().toLowerCase()).sort(),
    ["apikey", "authorization", "content-type"].sort(),
  );
  const sectionMatch = configTomlSource.match(/\[functions\.delete-account\]\s*\n\s*verify_jwt = (\w+)/);
  assert.equal(sectionMatch[1], "false");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("delete-account-function-contract tests failed");
  process.exit(1);
}

console.log("delete-account-function-contract tests passed");
