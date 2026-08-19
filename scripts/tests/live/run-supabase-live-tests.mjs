// Live Supabase E2E suite — entry point.
//
// Run: npm run test:supabase-live
//
// Requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY (see
// supabase/README.md's "Live Supabase E2E tests" section for the full
// list, how to set them, and the safety model). Fails immediately with a
// clear message if any are missing — never silently skips or fakes a
// result.
//
// NOT part of `npm test`, `test:feature-contracts`, `test:architecture-
// guards`, or any CI run — this suite needs real network access, creates
// and deletes real Supabase Auth users, and mutates real rows against
// whatever project SUPABASE_URL points at. Opt-in only, by design.
//
// This file deliberately never imports src/lib/supabaseAuth.ts (or
// anything that transitively imports it, e.g. src/lib/newWordProgress.ts,
// src/lib/customPracticeProgress.ts, src/lib/learningDate.ts,
// src/lib/userProfile.ts). That module reads `import.meta.env` at module
// load time — a Vite-only global this suite's bare
// `node --experimental-strip-types` process never provides, so importing
// it here would crash immediately. This suite ships its own minimal HTTP
// client (lib/liveHttp.mjs) instead, and reuses only the dependency-free
// response-parser modules directly where it can (see each scenario's own
// header for which ones and why) — matching the same constraint every
// existing scripts/tests/account/*.mjs and scripts/tests/learning/*.mjs
// contract test that imports from src/lib already works within.
//
// Safety model (task brief sections 3-5, 19-21):
//   - Two disposable, admin-created, pre-confirmed Auth users (A and B) are
//     created fresh for every run — never an existing personal account,
//     never a shared long-lived fixture account.
//   - Every scenario scopes its assertions to these two users' own data.
//   - Cleanup (deleting both Auth users, then privileged-verifying no rows
//     remain in any of the five user-owned tables) always runs, via
//     try/finally, even if a scenario throws.
//   - If cleanup itself fails, this script exits non-zero and prints the
//     disposable user id/email that needs manual removal — it never fails
//     silently.
//   - Never touches the delete-account Edge Function or
//     ACCOUNT_DELETION_ENABLED — see disposableUser.mjs's own header.
//     reset_learning_language_progress IS now reachable by `authenticated`
//     (Settings backend follow-up,
//     supabase/migrations/20260812130000_activate_learning_progress_reset_rpc.sql)
//     — see scenarios/progressResetActivated.mjs, which exercises it
//     end-to-end against both disposable users instead of merely proving it
//     stays unreachable.

import { loadLiveConfig, MissingLiveConfigError } from "./lib/liveConfig.mjs";
import { LiveTestReporter } from "./lib/liveTestRunner.mjs";
import {
  createDisposableUser,
  signInDisposableUser,
  deleteDisposableUser,
} from "./lib/disposableUser.mjs";
import { verifyNoRemainingRows } from "./lib/liveCleanupVerify.mjs";

import * as authScenario from "./scenarios/auth.mjs";
import * as onboardingScenario from "./scenarios/onboarding.mjs";
import * as directWriteRejectionScenario from "./scenarios/directWriteRejection.mjs";
import * as rlsOwnershipScenario from "./scenarios/rlsOwnership.mjs";
import * as languageUpdateScenario from "./scenarios/languageUpdate.mjs";
import * as dailyGoalScenario from "./scenarios/dailyGoal.mjs";
import * as timezoneScenario from "./scenarios/timezone.mjs";
import * as learningDateScenario from "./scenarios/learningDate.mjs";
import * as learningRpcsScenario from "./scenarios/learningRpcs.mjs";
import * as progressResetActivatedScenario from "./scenarios/progressResetActivated.mjs";

// Order matters: onboarding must run before every scenario that depends on
// a user_profiles row already existing (language update, daily goal,
// timezone — update_user_profile_languages/update_daily_goal/
// initialize_user_timezone all reject a caller with no profile row), and
// timezone must run before learningDate so the "stored timezone determines
// the date" assertion exercises a real non-UTC-fallback path.
const SCENARIOS = [
  authScenario,
  onboardingScenario,
  directWriteRejectionScenario,
  rlsOwnershipScenario,
  languageUpdateScenario,
  dailyGoalScenario,
  timezoneScenario,
  learningDateScenario,
  learningRpcsScenario,
  progressResetActivatedScenario,
];

async function main() {
  let config;
  try {
    config = loadLiveConfig();
  } catch (error) {
    if (error instanceof MissingLiveConfigError) {
      console.error(`\n[test:supabase-live] ${error.message}\n`);
      console.error(
        'See supabase/README.md\'s "Live Supabase E2E tests" section for every required environment variable and how to set them.\n',
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  console.log("\n=== Live Supabase E2E suite ===");
  console.log(`Target: ${config.supabaseUrl}`);
  console.log("This suite creates disposable Auth users, mutates only their data, and deletes them when done.\n");

  const reporter = new LiveTestReporter();

  let userACreds = null;
  let userBCreds = null;

  try {
    userACreds = await createDisposableUser(config, "a");
    userBCreds = await createDisposableUser(config, "b");
    console.log(`Created disposable users: ${userACreds.email} (A), ${userBCreds.email} (B)`);

    const userA = { session: await signInDisposableUser(config, userACreds) };
    const userB = { session: await signInDisposableUser(config, userBCreds) };
    console.log("Signed in as both disposable users.");

    const ctx = {
      config,
      userA,
      userB,
      // A single shared target_language keeps the learning-RPC and
      // daily-goal fixtures from colliding with each other across
      // scenarios while staying simple — every learning RPC scopes its own
      // rows by (user_id, target_language), so scenarios never interfere.
      targetLanguage: "es",
      state: {},
    };

    for (const scenario of SCENARIOS) {
      await scenario.run(ctx, reporter);
    }
  } catch (error) {
    reporter.fatal("suite setup/execution", error);
  } finally {
    console.log("\n=== Cleanup ===");
    const cleanupFailures = [];

    for (const [label, creds] of [
      ["A", userACreds],
      ["B", userBCreds],
    ]) {
      if (!creds) continue;
      try {
        await deleteDisposableUser(config, creds.id);
        console.log(`Deleted disposable user ${label} (${creds.email}).`);
      } catch (error) {
        cleanupFailures.push({ label, creds, error });
      }
    }

    for (const [label, creds] of [
      ["A", userACreds],
      ["B", userBCreds],
    ]) {
      if (!creds) continue;
      if (cleanupFailures.some((failure) => failure.label === label)) continue; // deletion itself already failed
      try {
        const leftovers = await verifyNoRemainingRows(config, creds.id);
        if (leftovers.length > 0) {
          cleanupFailures.push({
            label,
            creds,
            error: new Error(`Rows remain after deletion: ${JSON.stringify(leftovers)}`),
          });
        } else {
          console.log(`Verified no remaining rows for user ${label} (${creds.email}) across all five user-owned tables.`);
        }
      } catch (error) {
        cleanupFailures.push({ label, creds, error });
      }
    }

    if (cleanupFailures.length > 0) {
      console.error("\n[test:supabase-live] CLEANUP FAILED — manual cleanup required:");
      for (const failure of cleanupFailures) {
        console.error(`  - User ${failure.label}: id=${failure.creds.id} email=${failure.creds.email}`);
        console.error(`    ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`);
      }
      process.exitCode = 1;
    }
  }

  const allPassed = reporter.summary();
  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\n[test:supabase-live] Fatal error:");
  console.error(error);
  process.exitCode = 1;
});
