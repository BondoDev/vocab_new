// Source-text security guard for Settings Phase 1 — same style as
// test-user-profiles-narrow-write-boundary.mjs/test-delete-account-function-
// contract.mjs: there is no live Supabase project available to this repo's
// test suite, so this guards the *shape* of the frontend code that was
// added, not a live database.
//
// Run: node scripts/tests/architecture/test-settings-security-boundary.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const SETTINGS_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "settings");
const USER_PROFILE_LIB = path.join(ROOT_DIR, "src", "lib", "userProfile.ts");
const LEARNING_PROGRESS_RESET_LIB = path.join(ROOT_DIR, "src", "lib", "learningProgressReset.ts");
const ACCOUNT_DELETION_LIB = path.join(ROOT_DIR, "src", "lib", "accountDeletion.ts");
const APP_TSX = path.join(ROOT_DIR, "src", "app", "App.tsx");
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

// This repo's source files use CRLF line endings — splitting on a bare
// "\n" leaves a trailing "\r" on each line, and JavaScript's `$` anchor
// (without the `m` flag) only matches the true end of a string, never
// "just before a trailing terminator" the way some other regex engines
// treat it. `//.*$` against "...text\r" therefore silently fails to match
// at all. Splitting on /\r?\n/ (dropping the \r) avoids that trap.
function stripLineComments(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function readAllFiles(dir, extension) {
  return fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => ({ name: entry, content: fs.readFileSync(path.join(dir, entry), "utf8") }));
}

console.log("\n=== Settings Phase 1: security-boundary source guard ===\n");

const settingsFiles = readAllFiles(SETTINGS_DIR, ".tsx").map((file) => ({
  ...file,
  code: stripLineComments(file.content),
}));

test("1. No Settings component issues a direct REST write against user_profiles (PATCH/POST /rest/v1/user_profiles)", () => {
  const offenders = settingsFiles.filter((file) => /rest\/v1\/user_profiles/.test(file.code));
  assert.deepEqual(
    offenders.map((file) => file.name),
    [],
    "user_profiles must only ever be written through a narrow RPC",
  );
});

test("2. No Settings component or new lib file references service_role/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEYS/sb_secret_ in executable code (comments documenting the backend's own grant model don't count)", () => {
  const libFiles = [
    { name: "userProfile.ts", content: stripLineComments(fs.readFileSync(USER_PROFILE_LIB, "utf8")) },
    {
      name: "learningProgressReset.ts",
      content: stripLineComments(fs.readFileSync(LEARNING_PROGRESS_RESET_LIB, "utf8")),
    },
    { name: "accountDeletion.ts", content: stripLineComments(fs.readFileSync(ACCOUNT_DELETION_LIB, "utf8")) },
    ...settingsFiles.map((file) => ({ name: file.name, content: file.code })),
  ];
  for (const file of libFiles) {
    assert.doesNotMatch(file.content, /service_role/i, `${file.name} must never reference service_role`);
    assert.doesNotMatch(
      file.content,
      /SUPABASE_SERVICE_ROLE_KEY/,
      `${file.name} must never reference the legacy service-role secret`,
    );
    // Credential-source migration (2026-08-19): the same boundary applies to
    // the new secret-key model — a Settings/lib file has no more business
    // holding an sb_secret_... key or the platform's SUPABASE_SECRET_KEYS
    // env var than it ever had holding the legacy service_role JWT.
    assert.doesNotMatch(
      file.content,
      /SUPABASE_SECRET_KEYS|sb_secret_/,
      `${file.name} must never reference the server-side secret key`,
    );
  }
});

test("3. resetLearningLanguageProgress sends only p_target_language — no p_user_id/p_target_user_id parameter", () => {
  const content = stripLineComments(fs.readFileSync(USER_PROFILE_LIB, "utf8"));
  const fnMatch = content.match(/export async function resetLearningLanguageProgress[\s\S]*?\r?\n\}\r?\n/);
  assert.ok(fnMatch, "resetLearningLanguageProgress function body must exist in userProfile.ts");
  const fnBody = fnMatch[0];
  assert.doesNotMatch(fnBody, /p_user_id/);
  assert.doesNotMatch(fnBody, /p_target_user_id/);
  assert.match(fnBody, /p_target_language/);
});

test("4. deleteAccount identifies the caller only via the Authorization bearer header — no user id/email in the request body", () => {
  const content = stripLineComments(fs.readFileSync(ACCOUNT_DELETION_LIB, "utf8"));
  assert.match(content, /Authorization:\s*`Bearer \$\{session\.access_token\}`/);
  assert.doesNotMatch(content, /p_user_id/);
  assert.doesNotMatch(content, /body:\s*JSON\.stringify/, "delete-account takes no request body at all");
});

// Originally "No migration in this change set grants EXECUTE... (the
// deployment gate stays untouched)" — Settings Phase 1's own trip-wire for
// exactly the activation this backend follow-up task performs (see that
// migration's own security-audit header). Superseded once for activation
// (grant-only, exactly one dedicated migration), and superseded again here
// for the 42702 column-ambiguity corrective fix
// (20260813120000_fix_learning_progress_reset_column_ambiguity.sql), which
// legitimately re-asserts the same grant alongside replacing this one
// function's body (CREATE OR REPLACE FUNCTION preserves ACL automatically
// when the signature is unchanged — the re-assertion is an explicit,
// auditable confirmation of that, not a new grant decision; see that
// migration's own header). The boundary that actually matters is
// unchanged: every migration that ever mentions this grant is dedicated
// to this one RPC (either activating it, or replacing its own body) —
// never smuggled into a migration that also touches an unrelated table
// grant/policy/other function.
test("5. EXECUTE on reset_learning_language_progress is granted to authenticated only by migrations dedicated to this one function — never bundled with unrelated scope creep", () => {
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((entry) => entry.endsWith(".sql"));
  const grantingFiles = migrationFiles.filter((entry) => {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, entry), "utf8");
    return /grant execute on function public\.reset_learning_language_progress\(text\)\s+to authenticated/i.test(
      content,
    );
  });
  assert.ok(grantingFiles.length >= 1, "expected at least one migration granting EXECUTE to authenticated");

  for (const fileName of grantingFiles) {
    const content = stripLineComments(fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8"));
    const redefinesThisFunction = /create or replace function public\.reset_learning_language_progress\(/i.test(
      content,
    );
    // Every function this migration creates/replaces must be
    // reset_learning_language_progress itself — never a second, unrelated
    // function riding along with this grant.
    const allFunctionDefs = [...content.matchAll(/create or replace function public\.(\w+)/gi)].map((m) => m[1]);
    assert.deepEqual(
      [...new Set(allFunctionDefs)],
      redefinesThisFunction ? ["reset_learning_language_progress"] : [],
      `${fileName}: must define no function, or only reset_learning_language_progress itself`,
    );
    // No table grant/revoke or policy anywhere in the file — a corrective
    // fix to this one function's body/grants must never widen anything
    // table-level.
    assert.doesNotMatch(
      content,
      /create policy|drop policy|alter table|grant (insert|select|update|delete|truncate|references|trigger|maintain)/i,
      `${fileName}: must not touch any table grant or policy`,
    );
    assert.doesNotMatch(
      content,
      /^\s*revoke insert, select, update, delete/im,
      `${fileName}: must not touch table-level revokes`,
    );
    // Every GRANT EXECUTE statement in the file (there may be more than
    // one — e.g. a corrective migration re-asserting the full postgres/
    // authenticated/service_role set alongside its own function
    // redefinition) must target this one function and grant only to
    // roles already part of its established access model — never a
    // stray grant to anon/public, and never a grant naming any other
    // function.
    const grantStatements = [...content.matchAll(/^\s*grant execute on function public\.(\w+)\(text\) to (\w+);/gim)];
    assert.ok(grantStatements.length >= 1, `${fileName}: expected at least one GRANT EXECUTE statement`);
    for (const [, grantedFunction, grantedRole] of grantStatements) {
      assert.equal(grantedFunction, "reset_learning_language_progress", `${fileName}: grant must target this one function`);
      assert.ok(
        ["postgres", "authenticated", "service_role"].includes(grantedRole),
        `${fileName}: grant to "${grantedRole}" is outside the established access model`,
      );
    }
  }
});

test("6. The original reset_learning_language_progress migration still revokes EXECUTE from authenticated (untouched by this change)", () => {
  const migrationPath = path.join(MIGRATIONS_DIR, "20260808120000_add_learning_language_progress_reset_rpc.sql");
  assert.ok(fs.existsSync(migrationPath), "the reset RPC migration must still exist");
  const content = fs.readFileSync(migrationPath, "utf8");
  assert.match(
    content,
    /revoke execute on function public\.reset_learning_language_progress\(text\) from authenticated/i,
  );
});

test("7. Duplicate-submission guards exist for both destructive dialogs (isResetting/isDeleting gate their own confirm handlers)", () => {
  const resetDialog = settingsFiles.find((file) => file.name === "ResetProgressDialog.tsx");
  const deleteDialog = settingsFiles.find((file) => file.name === "DeleteAccountDialog.tsx");
  assert.ok(resetDialog && deleteDialog, "both dialog files must exist");
  assert.match(resetDialog.code, /isResetting/);
  assert.match(deleteDialog.code, /isDeleting/);

  const settingsSection = settingsFiles.find((file) => file.name === "SettingsSection.tsx");
  assert.ok(settingsSection, "SettingsSection.tsx must exist");
  assert.match(settingsSection.code, /if \(!resetTargetLanguage \|\| isResetting/);
  assert.match(settingsSection.code, /if \(isDeleting \|\| !authSession\)/);
});

test("8. No automatic retry loop exists around the reset or delete calls (a single .catch, never a retry/setTimeout re-invocation)", () => {
  const settingsSection = settingsFiles.find((file) => file.name === "SettingsSection.tsx");
  assert.doesNotMatch(settingsSection.code, /setTimeout\(/);
  assert.doesNotMatch(settingsSection.code, /retry/i);
});

// Originally "No frontend re-authentication (password/credential) field was
// added..., matching the real backend's own contract" — a trip-wire from
// before the backend enforced anything, guarding against exactly the
// "fake password field the server never checks" anti-pattern the task
// briefs for every Settings phase explicitly warned against. The
// reauthentication phase (2026-08-13) is what makes a password field
// legitimate: the delete-account Edge Function now independently enforces
// its own recent-authentication requirement
// (hasRecentAuthentication/reauthentication_required), so the frontend
// field's whole job is producing real evidence that check can verify, not
// standing in for it. This test now guards the new, real boundary: the
// field only exists alongside matching backend enforcement, and it is
// verified through Supabase Auth (a fresh sign-in), never compared
// in-frontend.
test("9. The delete-account password field corresponds to real, independent backend enforcement — never a frontend-only reauthentication step", () => {
  const deleteDialog = settingsFiles.find((file) => file.name === "DeleteAccountDialog.tsx");
  const accountDeletionLib = { name: "accountDeletion.ts", content: fs.readFileSync(ACCOUNT_DELETION_LIB, "utf8") };
  const deleteAccountFn = fs.readFileSync(
    path.join(ROOT_DIR, "supabase", "functions", "delete-account", "index.ts"),
    "utf8",
  );
  // hasRecentAuthentication's own definition lives in recentAuth.ts (a
  // pure module shared with this repo's own Node test suite — see
  // scripts/tests/account/test-recent-auth-token-refresh-bypass.mjs, which
  // exercises its actual behavior); index.ts only imports and calls it.
  const recentAuthLib = fs.readFileSync(
    path.join(ROOT_DIR, "supabase", "functions", "delete-account", "recentAuth.ts"),
    "utf8",
  );

  // The field exists...
  assert.match(deleteDialog.code, /type="password"/);
  // ...but nothing in the frontend ever compares a password value itself —
  // verification happens exclusively through a real Supabase Auth sign-in
  // call, never a local `password === ...` / hardcoded-secret check.
  assert.doesNotMatch(deleteDialog.code, /password\s*===/);
  assert.doesNotMatch(accountDeletionLib.content, /password\s*===\s*["']/);
  // ...and the backend independently enforces its own recent-authentication
  // requirement, never trusting that the frontend performed reauthentication.
  assert.match(
    deleteAccountFn,
    /import \{ hasRecentAuthentication, isCurrentSessionGoogleAuthenticated \} from "\.\/recentAuth\.ts";/,
  );
  assert.match(recentAuthLib, /export function hasRecentAuthentication\(/);
  assert.match(deleteAccountFn, /reauthentication_required/);
  // Google accounts are exempted from the above (product policy,
  // 2026-08-14 — see scripts/tests/account/test-google-reauth-exemption.mjs
  // for the exemption's own decision-logic tests), but never via anything
  // the client could spoof: no isGoogleUser-style request flag exists, and
  // the determination is derived only from userResult.user (the trusted
  // Admin API response already resolved above in this same function) plus
  // the same already-validated bearer token.
  assert.match(recentAuthLib, /export function isCurrentSessionGoogleAuthenticated\(/);
  assert.doesNotMatch(deleteAccountFn.replace(/\r\n/g, "\n").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"), /isGoogleUser/i);
  assert.match(deleteAccountFn, /isCurrentSessionGoogleAuthenticated\(userResult\.user, callerToken\)/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("Settings Phase 1 security-boundary guard passed");
}
