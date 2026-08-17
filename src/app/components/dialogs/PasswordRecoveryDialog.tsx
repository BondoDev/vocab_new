import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  updateSupabaseAuthUserPassword,
  type StoredSupabaseSession,
} from "../../../lib/supabaseAuth";
// Single source of truth for FluentStellar's live password-length policy —
// see settingsPassword.ts's own header for why this is imported (not
// re-declared) and how it's kept in sync with the live Supabase minimum. A
// project can always raise this further live, in which case GoTrue's own
// rejection message - surfaced via the catch block below - is still the
// authoritative error regardless of what this constant says.
import { PASSWORD_MIN_LENGTH } from "../../utils/settingsPassword";

interface PasswordRecoveryDialogProps {
  open: boolean;
  session: StoredSupabaseSession | null;
  onSuccess: () => void;
}

// The dedicated "complete password recovery" screen. Deliberately its own
// Dialog instance (not a mode of Header's login/signup dialog) so it can be
// rendered by AppContent on every route - including practice/exam, where
// Header isn't mounted at all - and so completing a Google OAuth login or
// closing the ordinary auth dialog can never be confused with dismissing an
// in-progress recovery. There is no close button and outside-click/Escape
// are ignored (see onOpenChange below): the only way out is a successful
// password update, which is the one obvious completion path this flow is
// required to have.
export function PasswordRecoveryDialog({
  open,
  session,
  onSuccess,
}: PasswordRecoveryDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Guards against duplicate submission (double Enter, double-click while
    // the request is in flight) in addition to the button's own `disabled`.
    if (isSubmitting) {
      return;
    }

    setError(null);

    if (!newPassword || !confirmPassword) {
      setError("Enter and confirm your new password.");
      return;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!session?.access_token) {
      setError("Your recovery link has expired. Request a new password reset email.");
      return;
    }

    try {
      setIsSubmitting(true);
      await updateSupabaseAuthUserPassword(session, newPassword);
      setIsSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      // Recovery mode and the underlying session are deliberately left
      // intact here - a failed update (e.g. a rejected password) must let
      // the user try again, not silently drop them out of recovery.
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not update your password. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        // Intentionally ignored: see the component doc comment above.
      }}
    >
      <DialogContent
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        // Hides the default X close button (same technique
        // AccountOnboardingDialog uses) - no close affordance at all while
        // recovery is required to complete.
        className="w-[min(92vw,28rem)] max-w-none rounded-3xl border-white/15 bg-[#fffdfd] p-0 shadow-[0_24px_80px_rgba(18,12,38,0.32)] sm:w-[26rem] [&_[data-slot=dialog-close]]:hidden"
      >
        <div className="overflow-hidden rounded-3xl">
          <div className="bg-[radial-gradient(circle_at_top,rgba(120,90,255,0.18),rgba(255,255,255,0)_58%),linear-gradient(135deg,#ffffff_0%,#f7f2ff_100%)] px-6 pb-6 pt-7">
            <DialogHeader className="gap-2 text-left">
              <DialogTitle className="text-2xl font-semibold tracking-tight text-[#261943]">
                Set new password
              </DialogTitle>
              <DialogDescription className="sr-only">
                Choose a new password to finish recovering your FluentStellar account.
              </DialogDescription>
            </DialogHeader>

            {isSuccess ? (
              <div className="mt-6 space-y-4">
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                >
                  Your password has been updated.
                </div>
                <Button
                  type="button"
                  onClick={onSuccess}
                  className="h-11 w-full rounded-xl bg-[#6558f5] text-base font-semibold text-white hover:bg-[#5647f0]"
                >
                  Continue
                </Button>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                {error ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label
                    htmlFor="recovery-new-password"
                    className="text-sm font-medium text-[#342456]"
                  >
                    New password
                  </label>
                  <Input
                    id="recovery-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Enter your new password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className="h-11 rounded-xl border-[#ded7ef] bg-white/90 px-4 text-[#24163d] placeholder:text-[#8f85a8]"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="recovery-confirm-password"
                    className="text-sm font-medium text-[#342456]"
                  >
                    Confirm new password
                  </label>
                  <Input
                    id="recovery-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className="h-11 rounded-xl border-[#ded7ef] bg-white/90 px-4 text-[#24163d] placeholder:text-[#8f85a8]"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 h-11 w-full rounded-xl bg-[#6558f5] text-base font-semibold text-white hover:bg-[#5647f0]"
                >
                  {isSubmitting ? "Saving..." : "Save password"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
