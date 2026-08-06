// Strict response parser for the update_daily_goal RPC — kept separate from
// userProfile.ts the same way userProfileTimezone.ts is kept separate from
// initializeUserTimezone's call site: one small file that only knows how to
// turn the RPC's snake_case row into a typed, validated result, reused by
// nothing else.
import { ClassifiedSupabaseError } from "./supabaseError.ts";

const STAT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The only supported daily-goal values — DailyGoalSelector's five presets
// (src/features/user-profile/sections/learning/DailyGoalSelector.tsx). Not a
// numeric range: an in-range value like 25 or 199 is just as invalid as 0 or
// 999. Kept here (rather than imported from DailyGoalSelector) to avoid a
// component -> lib circular dependency; the database CHECK constraints in
// supabase/migrations/20260806190000_add_daily_goal_snapshot_and_update_rpc.sql
// are the source of truth this set must stay in sync with.
export const SUPPORTED_DAILY_GOAL_VALUES = [10, 15, 20, 30, 50] as const;
export type SupportedDailyGoalValue = (typeof SUPPORTED_DAILY_GOAL_VALUES)[number];

export function isSupportedDailyGoalValue(value: unknown): value is SupportedDailyGoalValue {
  return (
    typeof value === "number" &&
    (SUPPORTED_DAILY_GOAL_VALUES as readonly number[]).includes(value)
  );
}

interface UpdateDailyGoalRpcRow {
  daily_goal?: unknown;
  stat_date?: unknown;
  updated_daily_stats_rows?: unknown;
}

export interface UpdateDailyGoalResult {
  dailyGoal: SupportedDailyGoalValue;
  statDateISO: string;
  updatedDailyStatsRows: number;
}

function requireSupportedDailyGoal(value: unknown): SupportedDailyGoalValue {
  if (!isSupportedDailyGoalValue(value)) {
    throw new ClassifiedSupabaseError(
      `update_daily_goal returned a malformed row: daily_goal must be one of ${SUPPORTED_DAILY_GOAL_VALUES.join(", ")}.`,
      "unexpected_response",
    );
  }
  return value;
}

function requireStatDate(value: unknown): string {
  if (typeof value !== "string" || !STAT_DATE_PATTERN.test(value)) {
    throw new ClassifiedSupabaseError(
      "update_daily_goal returned a malformed row: stat_date must be a YYYY-MM-DD string.",
      "unexpected_response",
    );
  }
  return value;
}

function requireNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new ClassifiedSupabaseError(
      "update_daily_goal returned a malformed row: updated_daily_stats_rows must be a non-negative integer.",
      "unexpected_response",
    );
  }
  return value;
}

export function parseUpdateDailyGoalRow(row: unknown): UpdateDailyGoalResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError("update_daily_goal returned a malformed row.", "unexpected_response");
  }

  const rpcRow = row as UpdateDailyGoalRpcRow;
  return {
    dailyGoal: requireSupportedDailyGoal(rpcRow.daily_goal),
    statDateISO: requireStatDate(rpcRow.stat_date),
    updatedDailyStatsRows: requireNonNegativeInteger(rpcRow.updated_daily_stats_rows),
  };
}
