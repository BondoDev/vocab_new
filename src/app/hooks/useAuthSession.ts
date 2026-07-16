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

  useEffect(() => {
    // Initialize auth session from storage on client side only (after hydration)
    setAuthSession(getStoredSupabaseSession());

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
    handleAuthSessionChange,
  };
}
