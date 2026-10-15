// Contract guard for Settings' account-deletion reauthentication phase —
// the client-side half. See supabase/README.md's "Reauthentication"
// section for the full design and
// scripts/tests/account/test-delete-account-function-contract.mjs's
// "Recent-authentication requirement" section for the server-side half.
//
// Source-text guard, matching every other architecture/contract test in
// this repository — there is no component-rendering test runner (RTL/
// vitest) in this project, and no live Supabase project reachable from
// this environment.
//
// Run: node scripts/tests/account/test-account-reauthentication.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

// Normalized to LF: this repo's source files use CRLF line endings, and a
// pattern like /\n}\n/ (closing brace on its own line) never matches
// "}\r\n" — the character right after "}" is "\r", not "\n". Stripping "\r"
// once here keeps every pattern below simple instead of needing "\r?\n"
// everywhere.
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8").replace(/\r\n/g, "\n");
}

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

const accountDeletionSource = read("src/lib/accountDeletion.ts");
const supabaseAuthSource = read("src/lib/supabaseAuth.ts");
const settingsSectionSource = read("src/features/user-profile/sections/settings/SettingsSection.tsx");
const deleteDialogSource = read("src/features/user-profile/sections/settings/DeleteAccountDialog.tsx");

function extractFunctionBody(source, startPattern, endPattern) {
  const startIndex = source.search(startPattern);
  assert.ok(startIndex > -1, `expected to find ${startPattern}`);
  const rest = source.slice(startIndex);
  const endMatch = rest.match(endPattern);
  return endMatch ? rest.slice(0, endMatch.index) : rest;
}

console.log("\n=== accountDeletion.ts: reauthentication primitives ===\n");

test("1. isPasswordAccount checks app_metadata.provider === 'email' — the real GoTrue value for a password account", () => {
  assert.match(accountDeletionSource, /session\?\.user\?\.app_metadata\?\.provider === "email"/);
});

test("2. reauthenticateForAccountDeletion never accepts an email parameter — it always uses the current session's own trusted email", () => {
  const fnMatch = accountDeletionSource.match(/export async function reauthenticateForAccountDeletion\(([\s\S]*?)\): Promise<StoredSupabaseSession> \{/);
  assert.ok(fnMatch, "expected to find reauthenticateForAccountDeletion's signature");
  assert.doesNotMatch(fnMatch[1], /email/i);
  const body = extractFunctionBody(
    accountDeletionSource,
    /export async function reauthenticateForAccountDeletion/,
    /\n}\n\n\/\/ "email" is|\nexport (function|class|interface|type)/,
  );
  assert.match(body, /const email = currentSession\.user\?\.email/);
});

test("3. A returned session for a DIFFERENT user id is rejected and never adopted (cross-account protection)", () => {
  const body = extractFunctionBody(
    accountDeletionSource,
    /export async function reauthenticateForAccountDeletion/,
    /\n}\n\n\/\/ "email" is|\nexport (function|class|interface|type)/,
  );
  const identityCheckIndex = body.search(/freshSession\.user\?\.id !== currentUserId/);
  const adoptIndex = body.search(/adoptSupabaseSession\(freshSession\)/);
  assert.ok(identityCheckIndex > -1, "expected an identity-match check");
  assert.ok(adoptIndex > -1, "expected an adoptSupabaseSession call");
  assert.ok(identityCheckIndex < adoptIndex, "the identity check must run before the session is ever adopted");
  // The mismatch branch must throw, not merely warn/continue.
  const mismatchBlockMatch = body.match(/if \(freshSession\.user\?\.id !== currentUserId\) \{([\s\S]*?)\}/);
  assert.ok(mismatchBlockMatch, "expected an if-block for the mismatch case");
  assert.match(mismatchBlockMatch[1], /throw new ReauthenticationError\("identity_mismatch"/);
});

test("4. Reauthentication uses reauthenticateWithPassword (no storeSession side effect) — never signInWithPassword directly, which would adopt a wrong-account session before the identity check ever runs", () => {
  assert.match(accountDeletionSource, /reauthenticateWithPassword\(email, password\)/);
  assert.doesNotMatch(accountDeletionSource, /\bsignInWithPassword\(/);
});

test("5. A wrong-password / non-network HTTP failure is classified as invalid_credentials, never silently treated as success", () => {
  const body = extractFunctionBody(
    accountDeletionSource,
    /export async function reauthenticateForAccountDeletion/,
    /\n}\n\n\/\/ "email" is|\nexport (function|class|interface|type)/,
  );
  assert.match(body, /error instanceof SupabaseRequestError/);
  assert.match(body, /throw new ReauthenticationError\("invalid_credentials"/);
});

test("6. deleteAccount() re-throws the backend's reauthentication_required rejection as a distinct ReauthenticationError (never silently retried, never conflated with a generic delete failure)", () => {
  const fnMatch = accountDeletionSource.match(/export async function deleteAccount\([\s\S]*?\n}\n/);
  assert.ok(fnMatch, "expected to find deleteAccount's body");
  assert.match(fnMatch[0], /error\.code === "reauthentication_required"/);
  assert.match(fnMatch[0], /throw new ReauthenticationError\(\s*"backend_rejected"/);
  assert.doesNotMatch(fnMatch[0], /setTimeout|retry/i);
});

console.log("\n=== supabaseAuth.ts: session-adoption safety ===\n");

test("7. reauthenticateWithPassword never calls storeSession — the caller decides whether to adopt the returned session", () => {
  const fnMatch = supabaseAuthSource.match(/export async function reauthenticateWithPassword\([\s\S]*?\n}\n/);
  assert.ok(fnMatch, "expected to find reauthenticateWithPassword's body");
  assert.doesNotMatch(fnMatch[0], /storeSession\(/);
});

test("8. adoptSupabaseSession is the only public entry point that persists an externally-obtained session", () => {
  assert.match(supabaseAuthSource, /export function adoptSupabaseSession\(session: StoredSupabaseSession\): void \{/);
  const fnMatch = supabaseAuthSource.match(/export function adoptSupabaseSession\([\s\S]*?\n}\n/);
  assert.match(fnMatch[0], /storeSession\(session\)/);
});

console.log("\n=== SettingsSection.tsx: orchestration and duplicate-submission guard ===\n");

function handleConfirmDeleteBody() {
  const match = settingsSectionSource.match(/const handleConfirmDelete = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(match, "expected to find handleConfirmDelete");
  return match[0];
}

test("9. handleConfirmDelete is guarded by isDeleting at the top (duplicate submissions prevented)", () => {
  const body = handleConfirmDeleteBody();
  assert.match(body, /if \(isDeleting \|\| !authSession\) \{\s*return;\s*\}/);
});

test("10. Delete remains impossible without typed DELETE — the dialog's own canConfirm requires isDeleteConfirmationValid regardless of reauthentication state", () => {
  assert.match(deleteDialogSource, /isDeleteConfirmationValid\(confirmationText\)/);
  const canConfirmMatch = deleteDialogSource.match(/const canConfirm =([\s\S]*?);/);
  assert.ok(canConfirmMatch, "expected a canConfirm expression");
  assert.match(canConfirmMatch[1], /isDeleteConfirmationValid\(confirmationText\)/);
});

test("11. Delete remains impossible without a non-empty password for password accounts (required reauthentication)", () => {
  const canConfirmMatch = deleteDialogSource.match(/const canConfirm =([\s\S]*?);/);
  assert.match(canConfirmMatch[1], /!requiresPassword \|\| password\.length > 0/);
});

test("12. For password accounts, reauthentication happens strictly before the delete-account call is ever made", () => {
  const body = handleConfirmDeleteBody();
  const reauthIndex = body.search(/reauthenticateForAccountDeletion\(authSession, deletePassword\)/);
  const deleteIndex = body.search(/await deleteAccount\(sessionForDeletion\)/);
  assert.ok(reauthIndex > -1 && deleteIndex > -1, "expected both calls to exist");
  assert.ok(reauthIndex < deleteIndex, "reauthentication must be awaited before deleteAccount is ever called");
});

test("13. The delete-account call uses the freshly-reauthenticated session (sessionForDeletion), never the possibly-stale authSession prop directly", () => {
  const body = handleConfirmDeleteBody();
  assert.match(body, /await deleteAccount\(sessionForDeletion\)/);
  assert.doesNotMatch(body, /await deleteAccount\(authSession\)/);
});

test("14. ReauthenticationError is caught and mapped to its own sanitized message per reason — never mislabeled as a generic delete failure, and the account-deleted callback is never invoked on this path", () => {
  const body = handleConfirmDeleteBody();
  const reauthCatchMatch = body.match(/if \(error instanceof ReauthenticationError\) \{([\s\S]*?)\n        \}/);
  assert.ok(reauthCatchMatch, "expected a dedicated ReauthenticationError branch");
  assert.match(reauthCatchMatch[1], /REAUTHENTICATION_ERROR_MESSAGE_KEYS\[error\.reason\]/);
  assert.doesNotMatch(reauthCatchMatch[1], /onAccountDeleted/);
});

test("15. Every ReauthenticationErrorReason maps to a translation key — none silently falls through to a raw/undefined message", () => {
  const mapMatch = settingsSectionSource.match(/const REAUTHENTICATION_ERROR_MESSAGE_KEYS[\s\S]*?= \{([\s\S]*?)\};/);
  assert.ok(mapMatch, "expected the REAUTHENTICATION_ERROR_MESSAGE_KEYS map");
  for (const reason of ["invalid_credentials", "identity_mismatch", "network", "backend_rejected"]) {
    assert.match(mapMatch[1], new RegExp(`${reason}:`));
  }
});

test("16. The typed password is cleared in the finally block of every delete attempt (success or failure alike)", () => {
  const body = handleConfirmDeleteBody();
  const finallyMatch = body.match(/\} finally \{([\s\S]*?)\}\s*\}\)\(\);/);
  assert.ok(finallyMatch, "expected a finally block");
  assert.match(finallyMatch[1], /setDeletePassword\(""\)/);
});

test("17. The typed password is also cleared when the dialog is closed via Cancel/Escape/backdrop (onOpenChange), not only after a submit attempt", () => {
  const wiringMatch = settingsSectionSource.match(/<DeleteAccountDialog[\s\S]*?\/>/);
  assert.ok(wiringMatch, "expected the <DeleteAccountDialog ... /> usage");
  const onOpenChangeMatch = wiringMatch[0].match(/onOpenChange=\{\(open\) => \{([\s\S]*?)\}\}/);
  assert.ok(onOpenChangeMatch, "expected an onOpenChange handler");
  assert.match(onOpenChangeMatch[1], /if \(!open\) \{[\s\S]*?setDeletePassword\(""\);/);
});

test("18. The password is never written to localStorage/sessionStorage anywhere in the delete-account flow", () => {
  for (const source of [accountDeletionSource, settingsSectionSource, deleteDialogSource, supabaseAuthSource]) {
    assert.doesNotMatch(source, /localStorage\.setItem\([^)]*password/i);
    assert.doesNotMatch(source, /sessionStorage\.setItem\([^)]*password/i);
  }
});

function findCredentialLogs(source) {
  const filename = "credential-logging.tsx";
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const host = ts.createCompilerHost({});
  host.getSourceFile = (name) => name === filename ? sourceFile : undefined;
  const program = ts.createProgram([filename], { noLib: true, noResolve: true, types: [] }, host);
  const checker = program.getTypeChecker();
  const tainted = new Set();
  const loggers = new Set();
  const sensitiveName = (name) => /password|credential|secret|authorization|session|(?:access|refresh|auth|id)[_-]?token|^token$/i.test(name);
  const symbol = (node) => checker.getSymbolAtLocation(node);
  const propertyName = (node) => ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : "";
  const isConsoleMethod = (node) =>
    ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      ts.isIdentifier(node.expression) && node.expression.text === "console") ||
    (ts.isIdentifier(node) && loggers.has(symbol(node)));

  function containsCredential(node) {
    if (!node || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return false;
    if (ts.isIdentifier(node)) return sensitiveName(node.text) || tainted.has(symbol(node));
    if (ts.isPropertyAccessExpression(node)) {
      return sensitiveName(node.name.text) || containsCredential(node.expression);
    }
    if (ts.isElementAccessExpression(node)) {
      return sensitiveName(propertyName(node.argumentExpression)) || containsCredential(node.expression) ||
        containsCredential(node.argumentExpression);
    }
    if (ts.isPropertyAssignment(node)) {
      return sensitiveName(propertyName(node.name)) || containsCredential(node.initializer);
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      return sensitiveName(node.name.text) || tainted.has(checker.getShorthandAssignmentValueSymbol(node));
    }
    let found = false;
    ts.forEachChild(node, (child) => { if (containsCredential(child)) found = true; });
    return found;
  }

  function markBinding(node, destination) {
    if (ts.isIdentifier(node)) {
      const binding = symbol(node);
      if (binding) destination.add(binding);
    } else if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
      for (const element of node.elements) {
        if (ts.isBindingElement(element)) markBinding(element.name, destination);
      }
    } else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      markBinding(node.expression, destination);
    }
  }

  // Follow aliases to a fixed point; symbols keep unrelated lexical scopes separate.
  let changed;
  do {
    const previousSize = tainted.size + loggers.size;
    function trace(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (containsCredential(node.initializer)) markBinding(node.name, tainted);
        if (isConsoleMethod(node.initializer)) markBinding(node.name, loggers);
      }
      if (ts.isBindingElement(node) && node.propertyName && sensitiveName(propertyName(node.propertyName))) {
        markBinding(node.name, tainted);
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (containsCredential(node.right) ||
            ((ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)) && containsCredential(node.left))) {
          markBinding(node.left, tainted);
        }
        if (isConsoleMethod(node.right)) markBinding(node.left, loggers);
      }
      ts.forEachChild(node, trace);
    }
    trace(sourceFile);
    changed = previousSize !== tainted.size + loggers.size;
  } while (changed);

  const violations = [];
  function visit(node) {
    if (ts.isCallExpression(node) && isConsoleMethod(node.expression) && node.arguments.some(containsCredential)) {
      violations.push(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

test("19. Credential values never reach console calls in the account flow", () => {
  for (const [name, source] of Object.entries({ accountDeletionSource, settingsSectionSource, deleteDialogSource, supabaseAuthSource })) {
    assert.deepEqual(findCredentialLogs(source), [], `${name}: credential logging detected`);
  }
});

test("19a. Static password messages and non-sensitive diagnostic objects are allowed", () => {
  for (const fixture of [
    'console.warn("password change failed", { reason: error.reason });',
    'console.warn(`Password recovery failed`, { status: 403 });',
    'const details = { reason: "invalid_credentials" }; console.warn(details);',
    'const details = { password: input.value }; function report() { const details = { reason: "network" }; console.warn(details); }',
  ]) {
    assert.deepEqual(findCredentialLogs(fixture), [], fixture);
  }
});

test("19b. Direct, interpolated, nested, aliased and serialized credentials are rejected", () => {
  for (const fixture of [
    'console.warn(password);',
    'console.warn(deletePassword);',
    'console.warn(authSession);',
    'console.warn(token);',
    'console.warn(`failed: ${newPasswordDraft}`);',
    'console.warn({ nested: { password: input.value } });',
    'console.warn({ credentials });',
    'console.warn(form.password);',
    'console.warn(form["password"]);',
    'const value = deletePassword; const details = { value }; console.warn(details);',
    'let details; details = { access_token: sessionValue }; console.warn(details);',
    'const details = {}; details.password = input.value; console.warn(details);',
    'const { password: value } = form; console.warn(value);',
    'console.warn(JSON.stringify({ ...credentials }));',
    'const log = console.warn; log(refreshToken);',
    'console["warn"]({ authorization: headers });',
  ]) {
    assert.ok(findCredentialLogs(fixture).length > 0, fixture);
  }
});

console.log("\n=== DeleteAccountDialog.tsx: password field semantics ===\n");

test("20. The password input uses type=\"password\" and autoComplete=\"current-password\"", () => {
  const inputMatch = deleteDialogSource.match(/<Input\s+id=\{passwordInputId\}[\s\S]*?\/>/);
  assert.ok(inputMatch, "expected the password <Input>");
  assert.match(inputMatch[0], /type="password"/);
  assert.match(inputMatch[0], /autoComplete="current-password"/);
});

test("21. Non-password (e.g. Google OAuth) accounts see neither a password field nor any reauthentication warning — no in-dialog reauthentication step exists for them at all (product policy, 2026-08-14)", () => {
  const fieldMatch = deleteDialogSource.match(/\{requiresPassword \? \(([\s\S]*?)\) : null\}/);
  assert.ok(fieldMatch, "expected the requiresPassword ? (...) : null conditional");
  assert.doesNotMatch(deleteDialogSource, /nonPasswordReauthHelper/);
});

console.log("\n=== Google-OAuth exemption (product policy, 2026-08-14) ===\n");

test("22. Non-password accounts send the existing session as-is (sessionForDeletion === authSession) — no in-dialog reauthentication step runs for them", () => {
  const body = handleConfirmDeleteBody();
  const ternaryMatch = body.match(/const sessionForDeletion = requiresPasswordReauth\s*\n\s*\? await reauthenticateForAccountDeletion\(authSession, deletePassword\)\s*\n\s*: authSession;/);
  assert.ok(ternaryMatch, "expected the non-password branch to use authSession directly, unmodified");
});

test("23. deleteAccount never receives a client-supplied provider/Google flag — its only parameter is the session itself", () => {
  const fnMatch = accountDeletionSource.match(/export async function deleteAccount\(session: StoredSupabaseSession\): Promise<void> \{/);
  assert.ok(fnMatch, "expected deleteAccount's exact signature to take only a session");
  const body = accountDeletionSource.match(/export async function deleteAccount\([\s\S]*?\n}\n/)[0];
  assert.doesNotMatch(body, /isGoogleUser|isGoogle|googleFlag|provider:/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("account-reauthentication guard failed");
  process.exit(1);
}

console.log("account-reauthentication guard passed");
