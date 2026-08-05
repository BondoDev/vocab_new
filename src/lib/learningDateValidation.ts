import { ClassifiedSupabaseError } from "./supabaseError.ts";

const LEARNING_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CurrentLearningDateRpcRow {
  stat_date?: unknown;
}

function isRealCalendarDate(dateISO: string): boolean {
  const match = LEARNING_DATE_PATTERN.exec(dateISO);
  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() + 1 === month &&
    utcDate.getUTCDate() === day
  );
}

function parseCurrentLearningDateRow(row: unknown): string {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError("get_current_learning_date returned a malformed row.", "unexpected_response");
  }

  const statDate = (row as CurrentLearningDateRpcRow).stat_date;
  if (typeof statDate !== "string" || !isRealCalendarDate(statDate)) {
    throw new ClassifiedSupabaseError("get_current_learning_date returned a malformed date.", "unexpected_response");
  }

  return statDate;
}

export function parseCurrentLearningDateRpcResponse(rows: unknown): string {
  if (!Array.isArray(rows)) {
    throw new ClassifiedSupabaseError("get_current_learning_date returned a non-array response.", "unexpected_response");
  }
  if (rows.length !== 1) {
    throw new ClassifiedSupabaseError("get_current_learning_date returned an unexpected row count.", "unexpected_response");
  }
  return parseCurrentLearningDateRow(rows[0]);
}
