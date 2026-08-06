// Regression guard for the Languages-page vs. signed-in-profile language
// conflict fix (2026-07-18):
//
// - src/app/hooks/useUserProfileSync.ts used to auto-write yourLanguage/
//   practiceLanguage to Supabase on every change while onboardingCompleted
//   was true, with no distinction between "profile just loaded" and "user
//   explicitly changed languages" - and its lastSyncedLanguagesRef was set
//   before the write resolved, silently swallowing failures and blocking
//   retry of the identical pair. It has been deleted; nothing now writes to
//   Supabase except explicit onboarding submission and the new
//   Save-to-account popup action.
// - src/app/utils/languageProfileSyncPolicy.ts now decides (a) whether a
//   freshly loaded Supabase profile pair should override the live app
//   language state, and (b) whether the Languages page's Continue button
//   needs to show the account-language confirmation popup.
// - src/app/utils/accountLanguageSave.ts is the generic, dependency-injected
//   save/retry orchestration used by the popup's "Save to account" action.
//
// Behavioral, not source-text, for the two pure policy files and the
// generic save function: this imports and exercises the real production
// code via Node's native TypeScript stripping (--experimental-strip-types).
// Both are import-free at runtime by design (see
// storedLanguagePreferencePolicy.ts for why - this project's other .ts
// modules use extensionless relative imports Node's ESM resolver cannot
// follow without a bundler), so they load directly here.
//
// src/app/hooks/useAccountLanguageConfirm.ts (the React hook wiring the
// above into real Supabase/storage calls) and
// src/app/utils/accountOnboarding.ts / useAccountOnboarding.ts (onboarding,
// deliberately untouched by this task) both pull in that import chain and
// so cannot be loaded directly by this script without a bundler. For those,
// this file falls back to source-text presence checks proving the expected
// wiring exists - the same tradeoff scripts/tests/practice/test-practice-route-sync.mjs
// and scripts/tests/routing/test-interactive-contracts.mjs document for the same reason.
//
// Run: node --experimental-strip-types scripts/tests/account/test-account-language-sync.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasCompleteLanguagePair,
  resolveHydratedLanguagePair,
  shouldConfirmAccountLanguageChange,
} from "../../../src/app/utils/languageProfileSyncPolicy.ts";
import { saveAccountLanguagePair } from "../../../src/app/utils/accountLanguageSave.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

async function main() {
  console.log("\n[1] shouldConfirmAccountLanguageChange - Languages-page Continue popup gate");

  await test("signed-out: never shows the account popup, regardless of pair state", () => {
    assert.equal(
      shouldConfirmAccountLanguageChange({
        isSignedIn: false,
        isProfileLoaded: true,
        profileLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
        selectedLanguages: { nativeLanguage: "fr", practiceLanguage: "de" },
      }),
      false,
    );
  });

  await test("signed-in, profile not yet loaded: never shows the popup", () => {
    assert.equal(
      shouldConfirmAccountLanguageChange({
        isSignedIn: true,
        isProfileLoaded: false,
        profileLanguages: { nativeLanguage: "", practiceLanguage: "" },
        selectedLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
      }),
      false,
    );
  });

  await test("signed-in, profile loaded, no valid saved pair: preserves fallback behavior (no popup)", () => {
    assert.equal(
      shouldConfirmAccountLanguageChange({
        isSignedIn: true,
        isProfileLoaded: true,
        profileLanguages: { nativeLanguage: "", practiceLanguage: "" },
        selectedLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
      }),
      false,
    );
  });

  await test("signed-in, unchanged pair: continues without a popup", () => {
    assert.equal(
      shouldConfirmAccountLanguageChange({
        isSignedIn: true,
        isProfileLoaded: true,
        profileLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
        selectedLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
      }),
      false,
    );
  });

  await test("signed-in, native-language-only change: shows the popup", () => {
    assert.equal(
      shouldConfirmAccountLanguageChange({
        isSignedIn: true,
        isProfileLoaded: true,
        profileLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
        selectedLanguages: { nativeLanguage: "fr", practiceLanguage: "es" },
      }),
      true,
    );
  });

  await test("signed-in, practice-language-only change: shows the popup", () => {
    assert.equal(
      shouldConfirmAccountLanguageChange({
        isSignedIn: true,
        isProfileLoaded: true,
        profileLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
        selectedLanguages: { nativeLanguage: "en", practiceLanguage: "fr" },
      }),
      true,
    );
  });

  await test("signed-in, both languages changed: shows the popup", () => {
    assert.equal(
      shouldConfirmAccountLanguageChange({
        isSignedIn: true,
        isProfileLoaded: true,
        profileLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
        selectedLanguages: { nativeLanguage: "fr", practiceLanguage: "de" },
      }),
      true,
    );
  });

  console.log("\n[2] resolveHydratedLanguagePair - profile-load hydration priority");

  await test("complete saved Supabase pair overrides a different, non-empty current selection (stale anonymous value)", () => {
    const result = resolveHydratedLanguagePair({
      supabaseLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
      mergedLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
      currentLanguages: { nativeLanguage: "fr", practiceLanguage: "de" },
    });
    assert.deepEqual(result, { nativeLanguage: "en", practiceLanguage: "es" });
  });

  await test("complete saved Supabase pair is applied even when current selection is already identical (idempotent)", () => {
    const result = resolveHydratedLanguagePair({
      supabaseLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
      mergedLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
      currentLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
    });
    assert.deepEqual(result, { nativeLanguage: "en", practiceLanguage: "es" });
  });

  await test("no valid Supabase pair + empty current selection: falls back to merged/anonymous values (fill-blanks-only)", () => {
    const result = resolveHydratedLanguagePair({
      supabaseLanguages: { nativeLanguage: "", practiceLanguage: "" },
      mergedLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
      currentLanguages: { nativeLanguage: "", practiceLanguage: "" },
    });
    assert.deepEqual(result, { nativeLanguage: "en", practiceLanguage: "es" });
  });

  await test("no valid Supabase pair + non-empty current selection (stale anonymous value): leaves it untouched", () => {
    const result = resolveHydratedLanguagePair({
      supabaseLanguages: { nativeLanguage: "", practiceLanguage: "" },
      mergedLanguages: { nativeLanguage: "fr", practiceLanguage: "de" },
      currentLanguages: { nativeLanguage: "en", practiceLanguage: "es" },
    });
    assert.deepEqual(result, { nativeLanguage: null, practiceLanguage: null });
  });

  await test("hasCompleteLanguagePair requires both languages", () => {
    assert.equal(hasCompleteLanguagePair({ nativeLanguage: "en", practiceLanguage: "" }), false);
    assert.equal(hasCompleteLanguagePair({ nativeLanguage: "", practiceLanguage: "es" }), false);
    assert.equal(hasCompleteLanguagePair({ nativeLanguage: "en", practiceLanguage: "es" }), true);
  });

  console.log("\n[3] saveAccountLanguagePair - explicit Save-to-account write/retry/error contract");

  await test("calls the Supabase write exactly once with the patched profile, then the storage write", async () => {
    let supabaseCalls = 0;
    let storageCalls = 0;
    let lastSupabasePatch = null;
    let lastStoragePatch = null;

    const result = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "fr", practiceLanguage: "de", nickname: "Al" }),
      writeSupabaseUserProfile: async (profile) => {
        supabaseCalls += 1;
        lastSupabasePatch = profile;
        return { updatedAt: "2026-07-18T00:00:00.000Z" };
      },
      writeStoredUserProfile: (profile) => {
        storageCalls += 1;
        lastStoragePatch = profile;
        return profile;
      },
    });

    assert.equal(supabaseCalls, 1);
    assert.equal(storageCalls, 1);
    assert.equal(lastSupabasePatch.nativeLanguage, "fr");
    assert.equal(lastSupabasePatch.practiceLanguage, "de");
    assert.equal(lastStoragePatch.updatedAt, "2026-07-18T00:00:00.000Z");
    assert.equal(result.ok, true);
  });

  await test("successful save returns the merged profile for the caller to adopt as the new in-memory state", async () => {
    const result = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => ({ onboardingCompleted: true }),
      writeStoredUserProfile: (profile) => profile,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.profile, {
      nativeLanguage: "en",
      practiceLanguage: "es",
      onboardingCompleted: true,
    });
  });

  await test("failed Supabase write is classified instead of surfacing the raw error message (Phase 1 fix)", async () => {
    let storageCalls = 0;
    const result = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => {
        throw new Error("Network unreachable");
      },
      writeStoredUserProfile: (profile) => {
        storageCalls += 1;
        return profile;
      },
    });
    assert.equal(result.ok, false);
    assert.notEqual(
      result.error,
      "Network unreachable",
      "the raw Supabase/PostgreSQL error message must never be returned",
    );
    // "Network unreachable" has no code/status and doesn't match any of
    // classifySupabaseError's recognized message patterns (it isn't a
    // TypeError, and doesn't match NETWORK_MESSAGE_PATTERN), so it
    // classifies as "unknown" - not one of the four universal categories -
    // and falls back to this operation's own translation key.
    assert.equal(result.error, "accountLanguageConfirm.saveError");
    assert.equal(storageCalls, 0);
  });

  await test("an unauthenticated (401) failure resolves to the shared session-expired translation key", async () => {
    const authError = new Error("Unauthorized");
    authError.status = 401;
    const result = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => {
        throw authError;
      },
      writeStoredUserProfile: (profile) => profile,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "supabaseErrors.sessionExpired");
  });

  await test("a forbidden (42501) failure resolves to the shared forbidden translation key", async () => {
    const forbiddenError = new Error("permission denied for table user_profiles");
    forbiddenError.code = "42501";
    const result = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => {
        throw forbiddenError;
      },
      writeStoredUserProfile: (profile) => profile,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "supabaseErrors.forbidden");
  });

  await test("a missing_rpc (PGRST202) failure resolves to the shared temporarily-unavailable translation key", async () => {
    const missingRpcError = new Error("Could not find the function in the schema cache");
    missingRpcError.code = "PGRST202";
    const result = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => {
        throw missingRpcError;
      },
      writeStoredUserProfile: (profile) => profile,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "supabaseErrors.temporarilyUnavailable");
  });

  await test("a bare network TypeError resolves to the shared network translation key", async () => {
    const result = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => {
        throw new TypeError("Failed to fetch");
      },
      writeStoredUserProfile: (profile) => profile,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "supabaseErrors.network");
  });

  await test("validation (23514) and conflict (23505) failures both fall back to this operation's own translation key (not a universal message)", async () => {
    const validationError = new Error("new row violates check constraint");
    validationError.code = "23514";
    const validationResult = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => {
        throw validationError;
      },
      writeStoredUserProfile: (profile) => profile,
    });
    assert.equal(validationResult.ok, false);
    assert.equal(validationResult.error, "accountLanguageConfirm.saveError");

    const conflictError = new Error("duplicate key value violates unique constraint");
    conflictError.code = "23505";
    const conflictResult = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => {
        throw conflictError;
      },
      writeStoredUserProfile: (profile) => profile,
    });
    assert.equal(conflictResult.ok, false);
    assert.equal(conflictResult.error, "accountLanguageConfirm.saveError");
  });

  await test("failure with a non-Error throw still surfaces a clear, non-empty translation key (no silent swallow)", async () => {
    const result = await saveAccountLanguagePair({
      buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
      writeSupabaseUserProfile: async () => {
        throw "boom";
      },
      writeStoredUserProfile: (profile) => profile,
    });
    assert.equal(result.ok, false);
    assert.ok(result.error && result.error.trim().length > 0);
    assert.equal(result.error, "accountLanguageConfirm.saveError");
  });

  await test("a caught failure logs exactly one structured diagnostic via console.warn, never the raw error object", async () => {
    const originalWarn = console.warn;
    const calls = [];
    console.warn = (...args) => calls.push(args);
    try {
      await saveAccountLanguagePair({
        buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
        writeSupabaseUserProfile: async () => {
          throw new Error("duplicate key value violates unique constraint \"user_profiles_pkey\"");
        },
        writeStoredUserProfile: (profile) => profile,
      });
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(calls.length, 1, "must log exactly once per failure");
    const [message, diagnostics] = calls[0];
    assert.match(message, /save account language pair/);
    assert.equal(typeof diagnostics, "object");
    assert.equal(diagnostics.operation, "save account language pair");
    assert.ok("category" in diagnostics, "diagnostics must carry the classified category");
    assert.ok(
      !("stack" in diagnostics) && !(diagnostics instanceof Error),
      "must log the describeSupabaseError() diagnostic object, never the raw Error instance",
    );
  });

  await test("retrying the identical pair after a failure performs another Supabase request (no de-dup blocking retry)", async () => {
    let supabaseCalls = 0;
    let shouldFail = true;
    const attempt = () =>
      saveAccountLanguagePair({
        buildPatchedProfile: () => ({ nativeLanguage: "en", practiceLanguage: "es" }),
        writeSupabaseUserProfile: async (profile) => {
          supabaseCalls += 1;
          if (shouldFail) {
            throw new Error("transient failure");
          }
          return profile;
        },
        writeStoredUserProfile: (profile) => profile,
      });

    const firstResult = await attempt();
    assert.equal(firstResult.ok, false);
    assert.equal(supabaseCalls, 1);

    shouldFail = false;
    const secondResult = await attempt();
    assert.equal(secondResult.ok, true);
    assert.equal(supabaseCalls, 2, "retry with the identical pair must issue a new Supabase request");
  });

  console.log("\n[4] useUserProfileSync removal - no automatic write-back survives");

  await test("src/app/hooks/useUserProfileSync.ts no longer exists", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, "src/app/hooks/useUserProfileSync.ts")),
      false,
    );
  });

  await test("src/app/App.tsx no longer imports or calls useUserProfileSync", () => {
    const appSource = readFile("src/app/App.tsx");
    assert.doesNotMatch(appSource, /useUserProfileSync/);
  });

  await test("src/app/App.tsx wires the new useAccountLanguageConfirm hook", () => {
    const appSource = readFile("src/app/App.tsx");
    assert.match(appSource, /useAccountLanguageConfirm\(/);
  });

  await test("languageProfileSyncPolicy.ts contains no network/Supabase write call (pure hydration/decision logic only)", () => {
    const source = readFile("src/app/utils/languageProfileSyncPolicy.ts");
    assert.doesNotMatch(source, /writeSupabase|supabaseRequest|fetch\(/);
  });

  console.log("\n[5] Popup action wiring - source-text checks (module-boundary tradeoff, see file header)");

  const hookSource = readFile("src/app/hooks/useAccountLanguageConfirm.ts");

  await test("handleUseSelectedLanguages never calls the Supabase save path", () => {
    const match = hookSource.match(
      /const handleUseSelectedLanguages = \(\) => \{([\s\S]*?)\n  \};/,
    );
    assert.ok(match, "could not locate handleUseSelectedLanguages body");
    assert.doesNotMatch(match[1], /saveAccountLanguagePair/);
    assert.match(match[1], /proceed\(\)/);
  });

  await test("handleCancel never calls the Supabase save path and never calls proceed()", () => {
    const match = hookSource.match(/const handleCancel = \(\) => \{([\s\S]*?)\n  \};/);
    assert.ok(match, "could not locate handleCancel body");
    assert.doesNotMatch(match[1], /saveAccountLanguagePair/);
    assert.doesNotMatch(match[1], /proceed\(\)/);
  });

  await test("handleSaveToAccount guards against concurrent submissions and calls saveAccountLanguagePair", () => {
    const match = hookSource.match(/const handleSaveToAccount = \(\) => \{([\s\S]*?)\n  \};/);
    assert.ok(match, "could not locate handleSaveToAccount body");
    assert.match(match[1], /if \(isSaving/);
    assert.match(match[1], /saveAccountLanguagePair/);
  });

  await test("successful save path adopts the returned profile, closes the popup, and continues", () => {
    const match = hookSource.match(/const handleSaveToAccount = \(\) => \{([\s\S]*?)\n  \};/);
    assert.match(match[1], /setUserProfile\(result\.profile\)/);
    assert.match(match[1], /setIsOpen\(false\)/);
    assert.match(match[1], /proceed\(\)/);
  });

  await test("failed save path surfaces the error and leaves the popup open (no setIsOpen(false), no proceed())", () => {
    const match = hookSource.match(/const handleSaveToAccount = \(\) => \{([\s\S]*?)\n  \};/);
    const failureBranch = match[1].match(/if \(result\.ok === false\) \{([\s\S]*?)\n {6}\}/);
    assert.ok(failureBranch, "could not locate the failure branch");
    // Phase 1 fix: result.error is now a translation key (see
    // accountLanguageSave.ts), translated via t() before being stored -
    // never the bare key and never a raw Supabase message.
    assert.match(failureBranch[1], /setSaveError\(t\(result\.error\)\)/);
    assert.doesNotMatch(failureBranch[1], /setIsOpen\(false\)/);
    assert.doesNotMatch(failureBranch[1], /proceed\(\)/);
  });

  await test("useAccountLanguageConfirm imports useLanguage to translate the classified error key", () => {
    assert.match(hookSource, /import \{ useLanguage \} from "\.\.\/\.\.\/contexts\/LanguageContext"/);
    assert.match(hookSource, /const \{ t \} = useLanguage\(\)/);
  });

  console.log("\n[6] Onboarding prefill/save wiring - source-text checks (module-boundary tradeoff, see file header)");

  // useAccountOnboarding.ts and accountOnboarding.ts both pull in
  // lib/userProfile.ts (a real runtime import), so they cannot be loaded
  // directly by this script without a bundler - same constraint documented
  // in the file header. Non-error-path behavior below is untouched by the
  // Phase 1 Supabase-error-classification fix (2026-08-06) and stays
  // source-text-checked here; that fix's own catch-block behavior is
  // covered instead by scripts/tests/architecture/test-supabase-error-handling.mjs,
  // since it's a structural/classification concern, not language-sync
  // wiring.
  const onboardingHookSource = readFile("src/app/hooks/useAccountOnboarding.ts");

  await test("editing the onboarding form's native language still updates live app state directly (no extra confirmation)", () => {
    assert.match(onboardingHookSource, /patch\.nativeLanguage !== undefined/);
    assert.match(onboardingHookSource, /setYourLanguage\(patch\.nativeLanguage\)/);
  });

  await test("editing the onboarding form's practice language still updates live app state directly (no extra confirmation)", () => {
    assert.match(onboardingHookSource, /patch\.practiceLanguage !== undefined/);
    assert.match(onboardingHookSource, /setPracticeLanguage\(patch\.practiceLanguage\)/);
  });

  await test("submitting onboarding still validates and saves the final submitted values to Supabase and local storage", () => {
    assert.match(onboardingHookSource, /prepareAccountOnboardingSubmit/);
    assert.match(onboardingHookSource, /writeSupabaseUserProfile\(authSession, profileToSave\)/);
    assert.match(onboardingHookSource, /writeStoredUserProfile\(/);
  });

  await test("useUserProfileLoad still merges from anonymous yourLanguage/practiceLanguage when no stored/Supabase profile exists", () => {
    const loadSource = readFile("src/app/hooks/useUserProfileLoad.ts");
    assert.match(loadSource, /buildMergedUserProfile\(/);
  });

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("account language sync tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
