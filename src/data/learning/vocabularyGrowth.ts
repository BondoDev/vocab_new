// Pure history-reconstruction and aggregation engine for the Progress
// page's "Vocabulary Growth" chart. Wired to real Supabase data via
// src/features/user-profile/sections/progress/loadVocabularyGrowthHistory.ts
// and the new src/lib/newWordProgress.ts:readVocabularyGrowthEvents, which
// calls the new read_vocabulary_growth_events RPC
// (supabase/migrations/20260808130000_add_vocabulary_growth_events_rpc.sql)
// — see that migration for why a narrow RPC was required: review_events
// has RLS enabled with zero policies and no client table grant (baseline
// migration + 20260805170000_revoke_review_events_client_privileges.sql),
// so a SECURITY DEFINER RPC scoped to the caller's own rows is the
// smallest fix, not a broad SELECT policy.
//
// CATEGORY MODEL — reused, not reinvented: every state is mapped through
// vocabularyCategory.ts's own mapWordStateToVocabularyCategory (the exact
// function the Vocabulary page's summary cards already use). This module
// introduces no new state model — "seen"/"learning" -> Learning,
// "familiar"/"strong" -> Known, "mastered" -> Mastered, precisely as
// already defined there.
//
// DATE/TIMEZONE CONVENTION — this module operates entirely on already-
// resolved YYYY-MM-DD calendar dates; it does no timestamp parsing itself.
// Callers are responsible for resolving each row's authoritative day
// *before* calling in, following the same precedence used everywhere else
// in this codebase's learning system:
//   - events: review_events.stat_date (the server-derived learning date,
//     via resolve_authenticated_learning_date — the exact same function
//     complete_word_review/complete_new_word_study already use for
//     user_daily_stats.stat_date) when present, falling back to a UTC
//     calendar-date slice of review_events.last_practiced_at for legacy
//     rows written before stat_date existed (nullable there — see
//     20260806150000_add_server_derived_learning_dates.sql). The new RPC
//     resolves this server-side via COALESCE, so every event this module
//     ever receives already carries a single, always-non-null
//     `eventDateISO`.
//   - words: user_word_progress.first_studied_stat_date (same
//     resolve_authenticated_learning_date convention) when present,
//     falling back to a UTC slice of created_at for legacy rows — see
//     resolveWordCreatedDateISO below, which the loader calls per row
//     (this one is resolved client-side, not by an RPC, since
//     user_word_progress is already directly readable by its owner).
// KNOWN LIMITATION: resolve_authenticated_learning_date derives "today"
// from the user_profiles.timezone column with a UTC fallback when that
// column is missing/blank/invalid — this is the same profile-timezone
// system (and the same fallback) getCurrentLearningDate() and
// milestoneStreak.ts already document as incomplete; a legacy row's UTC-
// slice fallback here can differ from that by up to a day near midnight
// in either direction. Both are pre-existing, already-documented
// limitations, not new ones introduced by this module.
import { mapWordStateToVocabularyCategory, type VocabularyCategory } from "./vocabularyCategory.ts";
import { addDaysISO } from "./dailyStreak.ts";
import type { WordState } from "./wordReviewSchedule";

const VALID_WORD_STATES: ReadonlySet<WordState> = new Set([
  "seen",
  "learning",
  "familiar",
  "strong",
  "mastered",
]);

function isWordState(value: unknown): value is WordState {
  return typeof value === "string" && VALID_WORD_STATES.has(value as WordState);
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnlyISO(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value);
}

// One persisted user_word_progress row's identity/creation, scoped to a
// single user + target language by the caller before this is ever
// invoked — this module has no notion of "user" or "language" itself.
export interface VocabularyGrowthWordInput {
  wordProgressId: string;
  // Already-resolved YYYY-MM-DD — see resolveWordCreatedDateISO.
  createdDateISO: string;
}

// One persisted review_events row, as returned by read_vocabulary_growth_events
// (already resolved server-side to a single authoritative day — see this
// file's header).
export interface VocabularyGrowthEventInput {
  wordProgressId: string;
  previousState: WordState;
  newState: WordState;
  // Already-resolved YYYY-MM-DD.
  eventDateISO: string;
}

export interface VocabularyGrowthDayCounts {
  dateISO: string;
  learning: number;
  known: number;
  mastered: number;
  // Sum of the three above. Tooltip-only, per the task brief — never a
  // fourth plotted series.
  total: number;
}

// user_word_progress.first_studied_stat_date is nullable (legacy rows
// written before it existed — see 20260806150000_add_server_derived_learning_dates.sql).
// When present, it is authoritative and used as-is; otherwise this falls
// back to a UTC calendar-date slice of created_at (always present, never
// null on this table). Exported so the loader can call it once per row
// without duplicating the fallback rule.
export function resolveWordCreatedDateISO(
  firstStudiedStatDate: string | null | undefined,
  createdAtISO: string,
): string | null {
  if (isValidDateOnlyISO(firstStudiedStatDate)) {
    return firstStudiedStatDate;
  }
  const date = new Date(createdAtISO);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

interface CategoryBreakpoint {
  dateISO: string;
  category: VocabularyCategory;
}

// Reconstructs one word's sparse "category breakpoint" timeline: the
// dates on which its user-facing category actually changed, starting from
// its creation (always "Learning", since every word begins as "seen").
// Events are trusted verbatim for `newState` (this replays the recorded
// log; it does not re-derive the state machine) and applied in ascending
// eventDateISO order regardless of input order (chronological
// processing). Skipped reviews (previousState === newState) and any
// event whose resulting category doesn't actually differ from the
// currently-running one (e.g. seen -> learning, familiar -> strong) never
// produce a new breakpoint — matching "transitions within the same
// user-facing category should not change aggregate category counts".
// Malformed events (invalid date/state, or a date before the word's own
// creation) are silently skipped rather than corrupting the timeline.
function buildWordBreakpoints(
  word: VocabularyGrowthWordInput,
  events: readonly VocabularyGrowthEventInput[],
): CategoryBreakpoint[] | null {
  if (!isValidDateOnlyISO(word.createdDateISO)) {
    return null;
  }
  const createdDateISO = word.createdDateISO;

  const ownEvents = events
    .filter(
      (event) =>
        event.wordProgressId === word.wordProgressId &&
        isValidDateOnlyISO(event.eventDateISO) &&
        event.eventDateISO >= createdDateISO &&
        isWordState(event.previousState) &&
        isWordState(event.newState) &&
        event.previousState !== event.newState,
    )
    // Stable sort — ties (same-day events) keep the caller's own relative
    // order, which for a real RPC response is itself chronological (the
    // RPC orders by event_date, then last_practiced_at).
    .sort((a, b) => (a.eventDateISO < b.eventDateISO ? -1 : a.eventDateISO > b.eventDateISO ? 1 : 0));

  const breakpoints: CategoryBreakpoint[] = [
    { dateISO: createdDateISO, category: mapWordStateToVocabularyCategory("seen") },
  ];

  let runningCategory = breakpoints[0].category;
  for (const event of ownEvents) {
    const nextCategory = mapWordStateToVocabularyCategory(event.newState);
    if (nextCategory === runningCategory) {
      continue;
    }
    breakpoints.push({ dateISO: event.eventDateISO, category: nextCategory });
    runningCategory = nextCategory;
  }

  return breakpoints;
}

function categoryOnDate(breakpoints: readonly CategoryBreakpoint[], dateISO: string): VocabularyCategory | null {
  // Breakpoints are already in ascending date order (construction order
  // above) — the word's category on `dateISO` is whichever breakpoint is
  // the last one at or before that date. `null` means the word did not
  // exist yet on `dateISO` (its own creation breakpoint is later).
  if (dateISO < breakpoints[0].dateISO) {
    return null;
  }
  let current = breakpoints[0].category;
  for (const breakpoint of breakpoints) {
    if (breakpoint.dateISO > dateISO) {
      break;
    }
    current = breakpoint.category;
  }
  return current;
}

// Reconstructs the full available history (every calendar day from the
// earliest word's creation date through todayISO, inclusive) and
// aggregates end-of-day Learning/Known/Mastered counts across every word.
// Returns [] when there are no words at all (the caller renders the empty
// state in that case — this function never fabricates a non-empty result
// out of nothing). Time-range filtering (7/30/90/all) is a separate, cheap
// slice over this result — see filterVocabularyGrowthByRange — so
// changing the selected range never needs to re-run reconstruction.
export function computeVocabularyGrowthHistory(
  words: readonly VocabularyGrowthWordInput[],
  events: readonly VocabularyGrowthEventInput[],
  todayISO: string,
): VocabularyGrowthDayCounts[] {
  if (words.length === 0) {
    return [];
  }

  const wordBreakpoints = words
    .map((word) => buildWordBreakpoints(word, events))
    .filter((breakpoints): breakpoints is CategoryBreakpoint[] => breakpoints !== null);

  if (wordBreakpoints.length === 0) {
    return [];
  }

  const earliestDateISO = wordBreakpoints.reduce(
    (earliest, breakpoints) => (breakpoints[0].dateISO < earliest ? breakpoints[0].dateISO : earliest),
    wordBreakpoints[0][0].dateISO,
  );

  // A day before the earliest word existed would just be an all-zero row
  // by construction (every word's categoryOnDate returns null there) —
  // excluding it here is the same thing as "not fabricating earlier
  // zero-history": the range this function ever returns starts exactly at
  // the first real day something existed, never before.
  const days: VocabularyGrowthDayCounts[] = [];
  for (let dateISO = earliestDateISO; dateISO <= todayISO; dateISO = addDaysISO(dateISO, 1)) {
    let learning = 0;
    let known = 0;
    let mastered = 0;

    for (const breakpoints of wordBreakpoints) {
      const category = categoryOnDate(breakpoints, dateISO);
      if (category === "learning") learning += 1;
      else if (category === "known") known += 1;
      else if (category === "mastered") mastered += 1;
    }

    days.push({ dateISO, learning, known, mastered, total: learning + known + mastered });

    // Guards against an unreachable infinite loop if todayISO is somehow
    // malformed/earlier than earliestDateISO — never trust caller input to
    // guarantee loop termination on its own.
    if (days.length > 20000) {
      break;
    }
  }

  return days;
}

export type VocabularyGrowthRange = "7d" | "30d" | "90d" | "all";

// Cheap slice over an already-reconstructed history — never re-walks
// events. "all" returns the full history unchanged; the day-bounded
// ranges keep only the last N calendar days up to and including todayISO,
// clamped to whatever history actually exists (never padded with
// fabricated earlier zero-days beyond what computeVocabularyGrowthHistory
// itself already produced).
export function filterVocabularyGrowthByRange(
  history: readonly VocabularyGrowthDayCounts[],
  range: VocabularyGrowthRange,
  todayISO: string,
): VocabularyGrowthDayCounts[] {
  if (range === "all") {
    return [...history];
  }

  const rangeDays = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const startDateISO = addDaysISO(todayISO, -(rangeDays - 1));

  return history.filter((day) => day.dateISO >= startDateISO && day.dateISO <= todayISO);
}

// The current-day accuracy requirement: "do not rely solely on
// review_events for the latest state — use user_word_progress.word_state
// as authoritative for current state". Overwrites (or appends, if
// reconstruction didn't reach todayISO for some reason) the final day's
// counts with an independently-computed current snapshot, so the chart's
// rightmost point is always exactly correct regardless of any
// reconstruction imprecision in the historical portion before it.
export function applyCurrentDayOverride(
  history: readonly VocabularyGrowthDayCounts[],
  todayISO: string,
  currentCounts: { learning: number; known: number; mastered: number },
): VocabularyGrowthDayCounts[] {
  const todayRow: VocabularyGrowthDayCounts = {
    dateISO: todayISO,
    learning: currentCounts.learning,
    known: currentCounts.known,
    mastered: currentCounts.mastered,
    total: currentCounts.learning + currentCounts.known + currentCounts.mastered,
  };

  if (history.length === 0) {
    return [todayRow];
  }

  const lastIndex = history.length - 1;
  if (history[lastIndex].dateISO === todayISO) {
    return [...history.slice(0, lastIndex), todayRow];
  }
  if (history[lastIndex].dateISO < todayISO) {
    return [...history, todayRow];
  }
  // Defensive: history somehow extends past todayISO (malformed input) —
  // never trust it over the authoritative snapshot.
  return [...history.filter((day) => day.dateISO < todayISO), todayRow];
}
