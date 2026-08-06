// Deliberately import-free and fully generic (no dependency on
// lib/userProfile.ts or accountProfile.ts, both of which pull in
// extensionless relative imports that Node's native TypeScript stripping
// cannot resolve without a bundler - see storedLanguagePreferencePolicy.ts).
// The one exception is src/lib/supabaseError.ts: it has no imports of its
// own (confirmed by scripts/tests/lib/test-supabase-error-classification.mjs,
// which already loads it directly the same way), so pulling in its
// classifier here does not reintroduce the bundler dependency this file's
// Node-testability otherwise avoids. Imported with an explicit .ts
// extension (tsconfig's allowImportingTsExtensions) so Node's own
// --experimental-strip-types resolution keeps working without a bundler,
// matching src/lib/dailyGoalUpdate.ts's/userProfileTimezone.ts's own
// precedent for the same module.
//
// This is what lets scripts/tests/account/test-account-language-sync.mjs exercise the real
// save/retry/error-surfacing contract directly, with fake write functions
// standing in for the real Supabase/localStorage calls.
//
// src/app/hooks/useAccountLanguageConfirm.ts is the thin wrapper that calls
// this with the real updateUserProfileLanguages (Profile Phase 1's narrow
// language-change RPC — see
// supabase/migrations/20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql)
// /writeStoredUserProfile, and is also the one that translates the returned
// key into display text (see ACCOUNT_LANGUAGE_SAVE_FALLBACK_KEY below) —
// this module stays React-free.
import {
  classifySupabaseError,
  describeSupabaseError,
  resolveSupabaseErrorMessageKey,
} from "../../lib/supabaseError.ts";

export type AccountLanguageSaveResult<TProfile> =
  | { ok: true; profile: TProfile }
  | { ok: false; error: string };

export interface SaveAccountLanguagePairParams<TProfile, TSupabaseResult> {
  buildPatchedProfile: () => TProfile;
  // Named generically (not writeSupabaseUserProfile) because the real
  // injected implementation is the narrow updateUserProfileLanguages RPC
  // call, not a broad profile upsert — see useAccountLanguageConfirm.ts.
  writeLanguagesToSupabase: (profile: TProfile) => Promise<TSupabaseResult>;
  writeStoredUserProfile: (profile: TProfile & TSupabaseResult) => TProfile;
}

// `error` on failure is a translation KEY, not final display text —
// resolveSupabaseErrorMessageKey's contract (src/lib/supabaseError.ts)
// always returns a key, matching every other classified call site in the
// app (DailyGoalSelector.tsx, VocabularySection.tsx, ...).
// useAccountLanguageConfirm.ts (the only caller) translates this via
// useLanguage()'s t() before storing it in saveError state — this module
// itself never touches React/i18n, preserving its Node-testability.
// Carries the exact English text this catch block already showed before
// this fix, now reached deliberately via classification instead of as the
// unconditional fallback for every error.
const ACCOUNT_LANGUAGE_SAVE_FALLBACK_KEY = "accountLanguageConfirm.saveError";

// Only reports success once the Supabase write has actually resolved -
// never marks anything "synced" ahead of the network call (the earlier bug:
// a last-synced ref was set before the write succeeded, silently blocking
// retry of the exact same pair after a transient failure). Every call is an
// independent attempt; there is no internal "already tried this" state, so
// the identical pair can always be retried.
export async function saveAccountLanguagePair<TProfile, TSupabaseResult>(
  params: SaveAccountLanguagePairParams<TProfile, TSupabaseResult>,
): Promise<AccountLanguageSaveResult<TProfile>> {
  try {
    const patchedProfile = params.buildPatchedProfile();
    const supabaseResult = await params.writeLanguagesToSupabase(patchedProfile);
    const nextProfile = params.writeStoredUserProfile({
      ...patchedProfile,
      ...supabaseResult,
    });
    return { ok: true, profile: nextProfile };
  } catch (error) {
    const category = classifySupabaseError(error);
    // Structured, privacy-safe diagnostics only — never the raw error
    // object (see src/lib/supabaseError.ts's own header for what this
    // deliberately excludes: tokens, session objects, email).
    console.warn(
      "accountLanguageSave: failed to save account language pair.",
      describeSupabaseError("save account language pair", error),
    );
    // Never error.message: a raw Supabase/PostgreSQL string must never
    // reach the account-language confirmation popup.
    return {
      ok: false,
      error: resolveSupabaseErrorMessageKey(category, ACCOUNT_LANGUAGE_SAVE_FALLBACK_KEY),
    };
  }
}
