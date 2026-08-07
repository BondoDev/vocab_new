// Privileged (service-role) post-deletion verification — confirms the live
// cascade architecture documented in supabase/README.md's "Account
// Deletion" section actually removed every user-owned row, not just the
// auth.users row itself. Every table here is one this repository's
// migrations authored an ON DELETE CASCADE foreign key to auth.users(id)
// for (directly, or transitively through user_word_progress for
// review_events) — see that section's own "User-data ownership map".
import { restGet } from "./liveHttp.mjs";

const USER_OWNED_TABLES = [
  { table: "user_profiles", column: "id" },
  { table: "user_word_progress", column: "user_id" },
  { table: "user_daily_stats", column: "user_id" },
  { table: "review_events", column: "user_id" },
  { table: "custom_practice_events", column: "user_id" },
];

// Returns a list of {table, count} for any table that still has rows for
// this user id — an empty array means cleanup is fully verified.
export async function verifyNoRemainingRows(config, userId) {
  const leftovers = [];

  for (const { table, column } of USER_OWNED_TABLES) {
    const response = await restGet(
      config,
      `/rest/v1/${table}?${column}=eq.${encodeURIComponent(userId)}&select=${column}`,
      { useServiceRole: true },
    );

    if (!response.ok) {
      leftovers.push({ table, count: null, error: `status ${response.status}` });
      continue;
    }

    const rows = Array.isArray(response.json) ? response.json : [];
    if (rows.length > 0) {
      leftovers.push({ table, count: rows.length });
    }
  }

  return leftovers;
}
