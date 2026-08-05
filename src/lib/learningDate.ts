import {
  ensureFreshSupabaseSession,
  getAuthHeaders,
  refreshSupabaseSession,
  supabaseRequest,
  type StoredSupabaseSession,
} from "./supabaseAuth";
import { ClassifiedSupabaseError } from "./supabaseError";
import { parseCurrentLearningDateRpcResponse } from "./learningDateValidation";

function getAuthorizedHeaders(session: StoredSupabaseSession) {
  return {
    ...getAuthHeaders(),
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function getCurrentLearningDate(session: StoredSupabaseSession): Promise<string> {
  if (!session.access_token || !session.user?.id) {
    throw new ClassifiedSupabaseError("Missing authenticated session.", "unauthenticated");
  }

  const freshSession = await ensureFreshSupabaseSession(session);
  const requestInit: RequestInit = {
    method: "POST",
    body: JSON.stringify({}),
  };

  let rows: unknown;
  try {
    rows = await supabaseRequest<unknown>(
      "/rest/v1/rpc/get_current_learning_date",
      {
        ...requestInit,
        headers: getAuthorizedHeaders(freshSession),
      },
    );
  } catch (error) {
    if (!(error instanceof Error) || !/jwt expired/i.test(error.message)) {
      throw error;
    }

    const refreshedSession = await refreshSupabaseSession(freshSession);
    rows = await supabaseRequest<unknown>(
      "/rest/v1/rpc/get_current_learning_date",
      {
        ...requestInit,
        headers: getAuthorizedHeaders(refreshedSession),
      },
    );
  }

  return parseCurrentLearningDateRpcResponse(rows);
}
