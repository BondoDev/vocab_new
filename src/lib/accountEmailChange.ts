// Client caller for Settings' Account-section email change — the Auth
// half, deliberately separate from src/lib/userProfile.ts (which owns only
// the public.user_profiles table). Email belongs to Supabase Auth
// (auth.users), never to user_profiles: this file never adds an email
// column, never touches auth.users directly, and never uses the Admin API
// or a service-role key — the only write path is GoTrue's own supported
// "Update user" endpoint (updateSupabaseAuthUserEmail, src/lib/
// supabaseAuth.ts), the same one updateSupabaseAuthUserPassword already
// uses for password changes.
//
// Source-text tested only (scripts/tests/architecture/
// test-settings-email-ui-contract.mjs) — this file imports supabaseAuth.ts,
// which reads import.meta.env at module load and therefore can't be loaded
// directly by a bundler-free Node script (same documented constraint as
// src/lib/accountDeletion.ts). The genuinely pure logic this file depends on
// (duplicate-email detection, pending-email parsing) lives in src/app/utils/
// settingsEmail.ts specifically so THAT logic stays real-assertion-testable
// (scripts/tests/account/test-settings-email.mjs) despite this wrapper not
// being importable itself.
import { adoptSupabaseSession, updateSupabaseAuthUserEmail, type StoredSupabaseSession } from "./supabaseAuth";
import { getPendingEmailFromUser } from "../app/utils/settingsEmail";

export interface AccountEmailChangeResult {
  // The caller's confirmed email after this call. Under this project's
  // actual configuration (supabase/config.toml's
  // `[auth.email] double_confirm_changes = true`), this is always still the
  // OLD email immediately after a successful call — GoTrue does not apply
  // the change until both the current and new addresses confirm it. Kept as
  // its own field (rather than assumed unchanged) so this wrapper stays
  // correct if that project configuration is ever relaxed to immediate
  // replacement.
  email: string;
  // The still-unconfirmed new address, read from GoTrue's own `new_email`
  // field on the response (see getPendingEmailFromUser) — null once there is
  // no pending change.
  pendingEmail: string | null;
}

// Requests the email change and, on success, folds GoTrue's returned user
// object back into the app's own session state via adoptSupabaseSession —
// the same session/event architecture every other auth mutation in this app
// already uses (storeSession's AUTH_SESSION_CHANGED_EVENT, subscribed to by
// useAuthSession). No second, Settings-local "confirmed email" state is
// created: SettingsSection reads the confirmed email from authSession.user.
// email (via useAuthSession) exactly as it already did before this task,
// and reads the pending address from authSession.user.new_email through the
// same hook — both refresh automatically the moment this call adopts the
// updated session, no reload required.
export async function updateAccountEmail(
  session: StoredSupabaseSession,
  email: string,
): Promise<AccountEmailChangeResult> {
  const updatedUser = await updateSupabaseAuthUserEmail(session, email);

  const nextSession: StoredSupabaseSession = {
    ...session,
    user: { ...session.user, ...updatedUser },
  };
  adoptSupabaseSession(nextSession);

  return {
    email: updatedUser.email || session.user?.email || "",
    pendingEmail: getPendingEmailFromUser(updatedUser),
  };
}
