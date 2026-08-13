import { useCallback, useEffect, useState } from "react";

import {
  getStoredSupabaseSession,
  subscribeToSupabaseSessionChanges,
  type StoredSupabaseSession,
} from "../../lib/supabaseAuth";

function getSessionUserId(
  session: StoredSupabaseSession | null,
): string | null {
  return typeof session?.user?.id === "string" && session.user.id.trim()
    ? session.user.id
    : null;
}

export function useAuthSession() {
  const [authSession, setAuthSession] = useState<StoredSupabaseSession | null>(
    null,
  );
  // False until the initial storage read below has run at least once -
  // authSession starts null to match SSR output, which is indistinguishable
  // from "confirmed signed out" until this flips true. Consumers that must
  // never flash signed-in-only or signed-out-only UI (e.g. the anonymous
  // account-intro popup) gate on this instead of trusting authUserId alone.
  const [isAuthResolved, setIsAuthResolved] = useState(false);

  useEffect(() => {
    // Initialize auth session from storage on client side only (after hydration)
    setAuthSession(getStoredSupabaseSession());
    setIsAuthResolved(true);

    const unsubscribe = subscribeToSupabaseSessionChanges(setAuthSession);
    return unsubscribe;
  }, []);

  const handleAuthSessionChange = useCallback(
    (session: StoredSupabaseSession | null) => {
      setAuthSession(session);
    },
    [],
  );

  return {
    authSession,
    authUserId: getSessionUserId(authSession),
    isAuthResolved,
    handleAuthSessionChange,
  };
}
