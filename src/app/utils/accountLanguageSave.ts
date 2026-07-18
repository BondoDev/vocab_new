// Deliberately import-free and fully generic (no dependency on
// lib/userProfile.ts or accountProfile.ts, both of which pull in
// extensionless relative imports that Node's native TypeScript stripping
// cannot resolve without a bundler - see storedLanguagePreferencePolicy.ts).
// This is what lets scripts/test-account-language-sync.mjs exercise the real
// save/retry/error-surfacing contract directly, with fake write functions
// standing in for the real Supabase/localStorage calls.
//
// src/app/hooks/useAccountLanguageConfirm.ts is the thin wrapper that calls
// this with the real writeSupabaseUserProfile/writeStoredUserProfile.

export type AccountLanguageSaveResult<TProfile> =
  | { ok: true; profile: TProfile }
  | { ok: false; error: string };

export interface SaveAccountLanguagePairParams<TProfile, TSupabaseResult> {
  buildPatchedProfile: () => TProfile;
  writeSupabaseUserProfile: (profile: TProfile) => Promise<TSupabaseResult>;
  writeStoredUserProfile: (profile: TProfile & TSupabaseResult) => TProfile;
}

const FALLBACK_ERROR_MESSAGE =
  "We could not save your languages to your account. Please try again.";

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
    const supabaseResult = await params.writeSupabaseUserProfile(patchedProfile);
    const nextProfile = params.writeStoredUserProfile({
      ...patchedProfile,
      ...supabaseResult,
    });
    return { ok: true, profile: nextProfile };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : FALLBACK_ERROR_MESSAGE;
    return { ok: false, error: message };
  }
}
