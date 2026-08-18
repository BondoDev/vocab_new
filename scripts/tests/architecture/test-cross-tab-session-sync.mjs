// Focused guard for cross-tab Auth session synchronization (native
// `storage` event -> re-read persisted session -> existing
// AUTH_SESSION_CHANGED_EVENT notification path).
//
// Source-text, not runtime: src/lib/supabaseAuth.ts reads
// import.meta.env.VITE_SUPABASE_URL at module load, a Vite-only global
// TypeScript refuses to compile under CommonJS ("import.meta" is ESM-only) -
// the same constraint documented in test-password-recovery-completion.mjs
// and test-auth-dialog-hardening.mjs. This guard follows their precedent:
// a precise source-text check rather than a behavioral/DOM one.
//
// Run: node scripts/tests/architecture/test-cross-tab-session-sync.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

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

// Normalizes CRLF to LF - see the same helper in
// test-password-recovery-completion.mjs / test-auth-dialog-hardening.mjs for
// why this matters for `\n\n`-anchored regexes in this CRLF-checked-out repo.
function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8").replace(/\r\n/g, "\n");
}

// Strips `//` line comments before matching - used only where a pattern must
// prove something about *live code*, not about what an explanatory comment
// happens to mention in prose. Same precedent as test-auth-dialog-hardening.mjs.
function stripLineComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

console.log("\n=== Cross-tab session sync guards ===\n");

const supabaseAuth = read("src/lib/supabaseAuth.ts");

console.log("--- Existing same-tab notification path is reused, not duplicated ---\n");

test("1. A single notifySessionChanged helper dispatches AUTH_SESSION_CHANGED_EVENT - the only window.dispatchEvent(...AUTH_SESSION_CHANGED_EVENT...) call site in the file", () => {
  const dispatchCount = (supabaseAuth.match(/new CustomEvent<StoredSupabaseSession \| null>\(AUTH_SESSION_CHANGED_EVENT/g) ?? []).length;
  assert.equal(dispatchCount, 1, "AUTH_SESSION_CHANGED_EVENT must be constructed in exactly one place (notifySessionChanged), not duplicated per call site");
  assert.match(
    supabaseAuth,
    /function notifySessionChanged\(session: StoredSupabaseSession \| null\) \{\s*window\.dispatchEvent\(\s*new CustomEvent<StoredSupabaseSession \| null>\(AUTH_SESSION_CHANGED_EVENT, \{\s*detail: session,\s*\}\),\s*\);\s*\}/,
  );
});

test("2. storeSession (same-tab writes) still persists to localStorage exactly as before, then funnels through notifySessionChanged - same-tab behavior is unchanged", () => {
  const fnMatch = supabaseAuth.match(/function storeSession\(session: StoredSupabaseSession \| null\) \{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "storeSession must be found");
  const body = fnMatch[1];
  assert.match(body, /window\.localStorage\.removeItem\(STORAGE_KEYS\.session\)/);
  assert.match(body, /window\.localStorage\.setItem\(STORAGE_KEYS\.session, JSON\.stringify\(session\)\)/);
  assert.match(body, /notifySessionChanged\(session\);/);
  assert.doesNotMatch(body, /dispatchEvent/, "storeSession must not dispatch directly anymore - it must go through notifySessionChanged");
});

test("3. subscribeToSupabaseSessionChanges (the same-tab consumer contract every useAuthSession relies on) is unchanged - still listens for AUTH_SESSION_CHANGED_EVENT and returns an unsubscribe function", () => {
  const fnMatch = supabaseAuth.match(/export function subscribeToSupabaseSessionChanges\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "subscribeToSupabaseSessionChanges must exist");
  const body = fnMatch[1];
  assert.match(body, /window\.addEventListener\(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged\)/);
  assert.match(body, /window\.removeEventListener\(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged\)/);
});

console.log("\n--- Cross-tab listener: exact key filtering ---\n");

test("4. handleCrossTabStorageEvent filters on the exact persisted session key before doing anything else - the STORAGE_KEYS.session comparison is the function's first statement", () => {
  const fnMatch = supabaseAuth.match(/function handleCrossTabStorageEvent\(event: StorageEvent\) \{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "handleCrossTabStorageEvent must exist");
  const body = fnMatch[1];
  const keyCheckIdx = body.indexOf('if (event.key !== STORAGE_KEYS.session) return;');
  assert.ok(keyCheckIdx !== -1, "must early-return on any key other than STORAGE_KEYS.session");
  const notifyIdx = body.indexOf("notifySessionChanged(");
  assert.ok(keyCheckIdx < notifyIdx, "the key filter must run before any re-read/notify work");
});

test("5. STORAGE_KEYS.pkceVerifier is never treated as a session key inside the cross-tab handler's live code - the PKCE verifier is a distinct, unrelated storage key (a prose comment explaining that exclusion is fine; live code referencing it would not be)", () => {
  const fnMatch = supabaseAuth.match(/function handleCrossTabStorageEvent\(event: StorageEvent\) \{([\s\S]*?)\n\}/);
  assert.doesNotMatch(stripLineComments(fnMatch[1]), /pkceVerifier/, "no live code in the cross-tab handler may reference the PKCE verifier key");
  assert.notEqual(
    supabaseAuth.match(/session: "([^"]+)"/)[1],
    supabaseAuth.match(/pkceVerifier: "([^"]+)"/)[1],
    "sanity check: the two storage keys must actually be distinct strings",
  );
});

test("6. The handler also checks event.storageArea against window.localStorage, scoping it defensively to the same storage the session is actually persisted in", () => {
  const fnMatch = supabaseAuth.match(/function handleCrossTabStorageEvent\(event: StorageEvent\) \{([\s\S]*?)\n\}/);
  assert.match(fnMatch[1], /if \(event\.storageArea !== window\.localStorage\) return;/);
});

console.log("\n--- Cross-tab listener: reuses the canonical session reader, no second parser ---\n");

test("7. handleCrossTabStorageEvent re-reads through getStoredSupabaseSession() - the same parse-or-fail-safe helper used everywhere else - rather than trusting event.newValue directly", () => {
  const fnMatch = supabaseAuth.match(/function handleCrossTabStorageEvent\(event: StorageEvent\) \{([\s\S]*?)\n\}/);
  assert.match(fnMatch[1], /notifySessionChanged\(getStoredSupabaseSession\(\)\);/);
  assert.doesNotMatch(fnMatch[1], /event\.newValue/, "must not trust event.newValue directly - re-read via the canonical helper instead");
  assert.doesNotMatch(fnMatch[1], /JSON\.parse/, "must not re-implement its own JSON parsing - getStoredSupabaseSession already owns that, including its malformed-JSON fallback");
});

test("8. getStoredSupabaseSession's malformed-JSON fallback (fail safe, never throw, never treat malformed data as authenticated) is untouched and is the only place that logic lives", () => {
  const fnMatch = supabaseAuth.match(/export function getStoredSupabaseSession\(\): StoredSupabaseSession \| null \{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "getStoredSupabaseSession must exist");
  const body = fnMatch[1];
  assert.match(body, /try \{\s*return JSON\.parse\(raw\) as StoredSupabaseSession;\s*\} catch \{\s*window\.localStorage\.removeItem\(STORAGE_KEYS\.session\);\s*return null;\s*\}/);
  const parseCatchCount = (supabaseAuth.match(/catch \{\s*window\.localStorage\.removeItem\(STORAGE_KEYS\.session\)/g) ?? []).length;
  assert.equal(parseCatchCount, 1, "the malformed-session fallback must exist in exactly one place - not duplicated for the cross-tab path");
});

console.log("\n--- No persistence loop / no redundant refresh ---\n");

test("9. handleCrossTabStorageEvent never writes to localStorage - it only reads (via getStoredSupabaseSession) and notifies (via notifySessionChanged)", () => {
  const fnMatch = supabaseAuth.match(/function handleCrossTabStorageEvent\(event: StorageEvent\) \{([\s\S]*?)\n\}/);
  const body = fnMatch[1];
  assert.doesNotMatch(body, /localStorage\.setItem/, "must never write the session back to localStorage - that would risk a storage-event loop across tabs");
  assert.doesNotMatch(body, /localStorage\.removeItem/, "must never remove the session key itself here - only getStoredSupabaseSession's own internal malformed-value cleanup may do that");
  assert.doesNotMatch(body, /storeSession\(/, "must not call storeSession - storeSession both writes localStorage and notifies, which would re-trigger a write this handler must avoid");
});

test("10. handleCrossTabStorageEvent never calls refreshSupabaseSession or ensureFreshSupabaseSession - receiving a cross-tab session change must never itself kick off a refresh and race D-2's single-flight rotation", () => {
  const fnMatch = supabaseAuth.match(/function handleCrossTabStorageEvent\(event: StorageEvent\) \{([\s\S]*?)\n\}/);
  const body = fnMatch[1];
  assert.doesNotMatch(body, /refreshSupabaseSession/);
  assert.doesNotMatch(body, /ensureFreshSupabaseSession/);
});

test("11. D-2's single-flight refresh coordinator itself is untouched by this task", () => {
  assert.match(supabaseAuth, /const refreshSingleFlight = createSingleFlight<StoredSupabaseSession>\(\);/);
  assert.match(
    supabaseAuth,
    /export function refreshSupabaseSession\(\s*session: StoredSupabaseSession,\s*\): Promise<StoredSupabaseSession> \{\s*[\s\S]*?return refreshSingleFlight\.run\(\(\) => performSupabaseSessionRefresh\(session\)\);\s*\}/,
  );
});

console.log("\n--- Listener lifecycle: exactly one registration, no cleanup leak ---\n");

test("12. window.addEventListener(\"storage\", ...) appears exactly once in the whole file - a single module-scope registration, not one per hook/component/render", () => {
  const registrationCount = (supabaseAuth.match(/window\.addEventListener\("storage",/g) ?? []).length;
  assert.equal(registrationCount, 1, "expected exactly one storage-event listener registration in supabaseAuth.ts");
});

test("13. The registration is guarded by typeof window !== \"undefined\" (SSR-safe) and wired to handleCrossTabStorageEvent, at module scope - not inside any exported function", () => {
  assert.match(
    supabaseAuth,
    /if \(typeof window !== "undefined"\) \{\s*window\.addEventListener\("storage", handleCrossTabStorageEvent\);\s*\}/,
  );
});

test("14. The registration site sits after handleCrossTabStorageEvent's own definition, directly inside a bare top-level `if (typeof window !== \"undefined\")` guard (2-space indent) - not nested inside subscribeToSupabaseSessionChanges, storeSession, or any other function - confirming it runs once at module evaluation, not per-call", () => {
  const registrationIdx = supabaseAuth.indexOf('window.addEventListener("storage", handleCrossTabStorageEvent);');
  const handlerDeclIdx = supabaseAuth.indexOf("function handleCrossTabStorageEvent(event: StorageEvent) {");
  assert.ok(handlerDeclIdx !== -1 && registrationIdx !== -1);
  assert.ok(handlerDeclIdx < registrationIdx, "handler must be declared before it is registered");

  // The registration line must sit at exactly 2-space indent (directly
  // inside the module-top-level if-guard), not deeper-nested inside some
  // other function body (which in this file's style would be 4+ spaces).
  const registrationLine = supabaseAuth.slice(0, registrationIdx).split("\n").pop();
  assert.equal(registrationLine, "  ", "expected the addEventListener call to be indented exactly 2 spaces - directly inside the top-level if-guard");

  const precedingLine = supabaseAuth
    .slice(0, supabaseAuth.lastIndexOf("\n", registrationIdx - registrationLine.length - 1))
    .split("\n")
    .pop();
  assert.equal(precedingLine, 'if (typeof window !== "undefined") {', "the line immediately before registration must be the bare module-scope if-guard, not a function signature");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("cross-tab-session-sync guard passed");
}
