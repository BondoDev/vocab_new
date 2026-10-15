// Contract guard for Settings' inline nickname edit row (SettingsSection.tsx)
// — source/AST guards plus executed isolated nickname handlers:
// SettingsSection.tsx is not mounted because this repository has no
// component renderer. normalizeNicknameInput's own logic is covered independently and more
// thoroughly by test-settings-nickname.mjs.
//
// Run: node scripts/tests/learning/test-settings-nickname-ui-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateInitializer, initializer, nodesMatching, ts } from "../../lib/component-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const SETTINGS_SECTION_PATH = path.join(
  ROOT_DIR,
  "src",
  "features",
  "user-profile",
  "sections",
  "settings",
  "SettingsSection.tsx",
);
const USER_PROFILE_LIB_PATH = path.join(ROOT_DIR, "src", "lib", "userProfile.ts");
const APP_TSX_PATH = path.join(ROOT_DIR, "src", "app", "App.tsx");
const DASHBOARD_PAGE_PATH = path.join(
  ROOT_DIR,
  "src",
  "features",
  "user-profile",
  "sections",
  "UserProfileDashboardPage.tsx",
);

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`  ✓  ${name}`);
        passed++;
      }, (err) => {
        console.error(`  ✗  ${name}`);
        console.error(`       ${err.message}`);
        failed++;
      });
    }
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

const source = fs.readFileSync(SETTINGS_SECTION_PATH, "utf8");
const userProfileSource = fs.readFileSync(USER_PROFILE_LIB_PATH, "utf8");
const appSource = fs.readFileSync(APP_TSX_PATH, "utf8");
const dashboardPageSource = fs.readFileSync(DASHBOARD_PAGE_PATH, "utf8");

console.log("\n=== Settings nickname edit row: display/edit shape ===\n");

test("1. The Account section renders userProfile.nickname (never a second, independently-owned nickname value)", () => {
  assert.match(source, /userProfile\.nickname \|\| "—"/);
});

test("2. An Edit action exists and is disabled without a session", () => {
  assert.match(source, /onClick=\{handleStartEditNickname\}/);
  assert.match(source, /disabled=\{!authSession\}/);
});

test("3. Edit mode prefills the input with the current confirmed nickname, not a stale/empty draft", () => {
  assert.match(source, /const handleStartEditNickname = \(\) => \{\s*\n\s*setNicknameDraft\(userProfile\.nickname\);/);
});

test("4. The input is a real, labeled form control (not a bare div) associated with the row's own label", () => {
  assert.match(source, /aria-labelledby="settings-nickname-label"/);
  assert.match(source, /id="settings-nickname-label"/);
});

console.log("\n=== Cancel restores display mode without a backend call ===\n");

test("5. Cancel resets the draft to the confirmed nickname and exits edit mode — no RPC call in its own handler", () => {
  const cancelMatch = source.match(/const handleCancelEditNickname = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(cancelMatch, "handleCancelEditNickname must exist");
  assert.match(cancelMatch[1], /setIsEditingNickname\(false\)/);
  assert.match(cancelMatch[1], /setNicknameDraft\(userProfile\.nickname\)/);
  assert.doesNotMatch(cancelMatch[1], /updateUserNickname/);
});

console.log("\n=== Save is disabled when unchanged, invalid, or pending; enabled only for a real, valid change ===\n");

test("6. canSaveNickname requires editing + loaded profile + session + valid draft + a real change + not already saving", () => {
  assert.match(
    source,
    /const canSaveNickname =\s*\n\s*isEditingNickname && isProfileLoaded && Boolean\(authSession\) && nicknameValidation\.ok &&\s*\n\s*!isNicknameUnchanged && !isSavingNickname;/,
  );
});

test("7. isNicknameUnchanged compares the normalized draft against the confirmed profile value", () => {
  assert.match(
    source,
    /const isNicknameUnchanged = nicknameValidation\.ok && nicknameValidation\.value === userProfile\.nickname;/,
  );
});

test("8. The Save button's disabled prop is wired to canSaveNickname", () => {
  assert.match(source, /onClick=\{handleSaveNickname\} disabled=\{!canSaveNickname\}/);
});

test("9. normalizeNicknameInput (not a second, ad hoc validation rule) governs validity", () => {
  assert.match(source, /import \{ normalizeNicknameInput \} from "\.\.\/\.\.\/\.\.\/\.\.\/app\/utils\/settingsNickname"/);
  assert.match(source, /const nicknameValidation = normalizeNicknameInput\(nicknameDraft\);/);
});

console.log("\n=== Save calls the narrow nickname RPC and updates shared profile state ===\n");

test("10. handleSaveNickname calls updateUserNickname with the normalized value, not the raw draft", () => {
  assert.match(source, /import \{[\s\S]*?\bupdateUserNickname\b[\s\S]*?\} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/userProfile"/);
  assert.match(source, /updateUserNickname\(authSession, nicknameValidation\.value\)/);
});

test("11. On success, the shared profile state is updated via writeStoredUserProfile + onNicknameChange from the parsed RPC result (never re-derived from the raw draft)", () => {
  const saveMatch = source.match(/void updateUserNickname\(authSession, nicknameValidation\.value\)([\s\S]*?)\.finally\(/);
  assert.ok(saveMatch, "handleSaveNickname's save chain must exist");
  const body = saveMatch[1];
  assert.match(body, /writeStoredUserProfile\(authUserId, \{\s*\n\s*\.\.\.userProfile,\s*\n\s*nickname: result\.nickname,\s*\n\s*updatedAt: result\.updatedAt,\s*\n\s*\}\)/);
  assert.match(body, /onNicknameChange\?\.\(\{/);
  assert.match(body, /setIsEditingNickname\(false\)/);
});

test("12. onNicknameChange is threaded from App.tsx through UserProfileDashboardPage into SettingsSection, mirroring onProfileLanguagesChange/onTimezoneChange's own wiring", () => {
  assert.match(appSource, /onNicknameChange=\{handleProfileNicknameChange\}/);
  assert.match(appSource, /const handleProfileNicknameChange = \(change: \{ nickname: string; updatedAt: string \}\) => \{/);
  assert.match(dashboardPageSource, /onNicknameChange=\{onNicknameChange\}/);
  assert.match(source, /onNicknameChange\?: \(change: ProfileNicknameChange\) => void;/);
});

console.log("\n=== Failure preserves the confirmed nickname; duplicate submission is prevented ===\n");

test("13. A failed save shows a sanitized error and never marks the row as saved (edit mode stays open; userProfile is not touched in the .catch branch)", () => {
  const catchMatch = source.match(/\.catch\(\(error\) => \{([\s\S]*?)\}\)\s*\n\s*\.finally\(\(\) => \{\s*\n\s*setIsSavingNickname\(false\);/);
  assert.ok(catchMatch, "handleSaveNickname's .catch branch must exist");
  const body = catchMatch[1];
  assert.match(body, /setNicknameSaveError\(/);
  assert.doesNotMatch(body, /writeStoredUserProfile/);
  assert.doesNotMatch(body, /setIsEditingNickname\(false\)/);
  assert.doesNotMatch(body, /onNicknameChange/);
});

test("14. Errors are sanitized through describeSupabaseError/resolveSupabaseErrorMessageKey — never a raw Supabase/Postgres message shown to the user", () => {
  assert.match(source, /describeSupabaseError\("updateUserNickname", error\)/);
  assert.match(
    source,
    /resolveSupabaseErrorMessageKey\(\s*\n\s*diagnostics\.category,\s*\n\s*"userProfile\.settingsSection\.account\.nicknameSaveError",\s*\n\s*\)/,
  );
});

test("15. Duplicate submission is prevented: handleSaveNickname bails out while already saving, and Save/Cancel/input are disabled while saving", () => {
  assert.match(source, /if \(!canSaveNickname \|\| !authSession \|\| !authUserId \|\| !nicknameValidation\.ok \|\| isSavingNickname\) \{/);
  assert.match(source, /setIsSavingNickname\(true\)/);
  assert.match(source, /disabled=\{isSavingNickname\}/);
});

test("16. No automatic retry loop exists around the nickname save (a single .catch, never a retry/setTimeout re-invocation)", () => {
  const saveFnMatch = source.match(/const handleSaveNickname = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(saveFnMatch, "handleSaveNickname must exist");
  assert.doesNotMatch(saveFnMatch[0], /setTimeout\(/);
  assert.doesNotMatch(saveFnMatch[0], /retry/i);
});

console.log("\n=== Nickname handlers leave the independent email-change flow untouched ===\n");

await test("17. Starting, cancelling, and saving a nickname never mutate the independent confirmed/pending email state", async () => {
  const handlers = ["handleStartEditNickname", "handleCancelEditNickname", "handleSaveNickname"];
  for (const name of handlers) {
    const emailReferences = nodesMatching(initializer(source, name), (node) =>
      ts.isIdentifier(node) && /email|adoptSupabaseSession|updateSupabaseAuthUser/i.test(node.text));
    assert.equal(emailReferences.length, 0, `${name} must not access or mutate email/session state`);
  }
  for (const outcome of ["success", "failure"]) {
    const user = Object.freeze({ email: "confirmed@example.test", new_email: "pending@example.test" });
    const authSession = Object.freeze({ user });
    const calls = [];
    const pending = [];
    const bindings = {
      authSession, authUserId: "user", userProfile: { nickname: "Before" },
      canSaveNickname: true, nicknameValidation: { ok: true, value: "After" }, isSavingNickname: false,
      setIsEditingNickname: (value) => calls.push(["editing", value]),
      setNicknameDraft: (value) => calls.push(["draft", value]),
      setNicknameSaveError: (value) => calls.push(["error", value]),
      setIsSavingNickname: (value) => calls.push(["saving", value]),
      nicknameEditButtonRef: { current: { focus() {} } },
      updateUserNickname(session, nickname) {
        assert.equal(session, authSession);
        assert.equal(nickname, "After");
        const request = outcome === "success"
          ? Promise.resolve({ nickname, updatedAt: "2026-08-19" })
          : Promise.reject(new Error("sanitized test failure"));
        pending.push(request);
        return request;
      },
      writeStoredUserProfile: (_userId, profile) => profile,
      onNicknameChange: (value) => calls.push(["profile", value.nickname]),
      showNicknameToast() {}, t: (key) => key,
      describeSupabaseError: () => ({ category: "unknown" }),
      resolveSupabaseErrorMessageKey: (_category, fallback) => fallback,
      console: { warn() {} },
    };
    evaluateInitializer(source, "handleStartEditNickname", bindings)();
    evaluateInitializer(source, "handleCancelEditNickname", bindings)();
    assert.ok(calls.some(([name, value]) => name === "draft" && value === "Before"));
    calls.length = 0;
    evaluateInitializer(source, "handleSaveNickname", bindings)();
    await Promise.allSettled(pending);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(user, { email: "confirmed@example.test", new_email: "pending@example.test" });
    assert.equal(calls.some(([name]) => name === "profile"), outcome === "success");
    assert.ok(calls.some(([name, value]) => name === "saving" && value === false));
    if (outcome === "failure") {
      assert.ok(calls.some(([name, value]) => name === "error" && typeof value === "string"));
      assert.ok(!calls.some(([name, value]) => name === "editing" && value === false));
    }
  }
});

test("18. Nothing in this component ever forces a page reload/navigation as part of the nickname flow", () => {
  assert.doesNotMatch(source, /window\.location/);
  assert.doesNotMatch(source, /location\.reload/);
});

test("19. This flow never mints a second nickname state source — the only state holding a nickname value is nicknameDraft (a local draft), never a second one initialized independently of userProfile.nickname", () => {
  const stateDecls = [...source.matchAll(/const \[(\w+), set\w+\]\s*=\s*useState[^;]*;/g)]
    .map((m) => m[0])
    .filter((decl) => /nickname/i.test(decl) && !/isEditingNickname|isSavingNickname|nicknameSaveError/.test(decl));
  assert.equal(stateDecls.length, 1, `expected exactly one nickname-value state declaration, found: ${stateDecls.join(" | ")}`);
  assert.match(stateDecls[0], /const \[nicknameDraft, setNicknameDraft\] = useState\(userProfile\.nickname\);/);
});

test("20. No Settings component issues a direct REST write against user_profiles for the nickname flow — updateUserNickname is the only path (already covered generally by test-settings-security-boundary.mjs, re-asserted narrowly here)", () => {
  assert.doesNotMatch(source, /\/rest\/v1\/user_profiles["'`]/);
});

test("21. userProfile.ts's updateUserNickname sends only p_nickname to the RPC — no other field, no user id", () => {
  const fnMatch = userProfileSource.match(/export async function updateUserNickname\(([\s\S]*?)\r?\n\}/);
  assert.ok(fnMatch, "updateUserNickname must exist in userProfile.ts");
  assert.match(fnMatch[1], /\/rest\/v1\/rpc\/update_user_nickname/);
  const bodyMatch = fnMatch[1].match(/body:\s*JSON\.stringify\(([^)]*)\)/);
  assert.ok(bodyMatch, "updateUserNickname must send a JSON body");
  assert.match(bodyMatch[1].trim(), /^\{\s*p_nickname:\s*nickname,?\s*\}$/, "request body must contain only p_nickname");
  assert.doesNotMatch(fnMatch[1], /p_user_id/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("settings-nickname-ui-contract tests failed");
  process.exit(1);
} else {
  console.log("Settings nickname edit row UI contract passed");
}
