import { useCallback, useEffect, useState } from "react";

import {
  handleSupabaseAuthRedirect,
  type StoredSupabaseSession,
} from "../../lib/supabaseAuth";

// Single owner of "did this page load just consume a Supabase auth
// redirect" for the whole app. AppContent calls this exactly once,
// unconditionally (every route, including practice/exam where Header isn't
// mounted) - replacing the previous split ownership where Header ran its
// own handleSupabaseAuthRedirect() effect for most routes and AppContent
// ran a second, route-scoped copy for practice/exam. handleSupabaseAuthRedirect
// itself still only ever processes the redirect once per page load (guarded
// internally), so consolidating the *call site* here removes the ambiguity
// of "whichever component mounts first wins" without changing that
// single-use guarantee.
//
// Ordinary login/signup/OAuth sessions and password-recovery sessions both
// flow through onSessionEstablished (a recovery redirect still establishes
// a real, valid authenticated session - see supabaseAuth.ts). The
// `isPasswordRecoveryActive` flag is the one extra bit callers need to know
// "show the Set new password screen instead of treating this as an
// ordinary sign-in."
export function useSupabaseAuthRedirect({
  onSessionEstablished,
}: {
  onSessionEstablished: (
    session: StoredSupabaseSession,
    context: { recovery: boolean },
  ) => void;
}) {
  const [isPasswordRecoveryActive, setIsPasswordRecoveryActive] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void handleSupabaseAuthRedirect()
      .then((result) => {
        if (cancelled) return;

        if (result.session) {
          onSessionEstablished(result.session, { recovery: Boolean(result.recovery) });
          if (result.recovery) {
            setIsPasswordRecoveryActive(true);
          }
        }

        if (result.error) {
          setRedirectError(result.error);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setRedirectError(
          error instanceof Error ? error.message : "Google sign-in failed.",
        );
      });

    return () => {
      cancelled = true;
    };
    // Intentionally runs once per mount: handleSupabaseAuthRedirect() is
    // itself single-use per page load, so re-running this effect can never
    // produce a second result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearRedirectError = useCallback(() => {
    setRedirectError(null);
  }, []);

  const exitPasswordRecovery = useCallback(() => {
    setIsPasswordRecoveryActive(false);
  }, []);

  return {
    isPasswordRecoveryActive,
    redirectError,
    clearRedirectError,
    exitPasswordRecovery,
  };
}
