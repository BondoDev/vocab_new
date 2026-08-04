// Pure hybrid review-queue selection engine for Review Words Phase 1. Given
// a user's already-persisted user_word_progress rows for one target
// language, decides which words go into the next review session and in
// what order — nothing else. This module never touches Supabase, React,
// routing, or vocabulary-data imports (see src/data/learning/README.md's
// ownership rules); vocabulary resolution happens one layer up, in
// src/features/review-words/loadReviewQueue.ts.
//
// Crucially, this module never recalculates next_review_at. It only reads
// the already-persisted deadline to decide overdue-ness and how close a
// word is to its deadline — recomputing that timestamp is a write-side
// concern for a future phase (state promotion/demotion), not a
// queue-selection concern.
//
// Only a type-only import (erased at runtime) plus the two sibling
// data-only modules below, so — like newWordStudySessionState.ts — this
// stays loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-review-queue.mjs.
import type { WordState } from "./wordReviewSchedule";
import {
  REVIEW_DEADLINE_APPROACH_BASE,
  REVIEW_DEADLINE_APPROACH_NEUTRAL,
  REVIEW_DEADLINE_APPROACH_RANGE,
  REVIEW_MIN_OVERDUE_DAYS,
  REVIEW_OVERDUE_SESSION_SHARE,
  REVIEW_OVERDUE_URGENCY_MULTIPLIER,
  REVIEW_RECENCY_COOLDOWN_FACTORS,
  REVIEW_RECENCY_COOLDOWN_THRESHOLDS_HOURS,
  REVIEW_SESSION_SIZE_DEFAULT,
  REVIEW_SMALL_LIBRARY_WORD_COUNT_THRESHOLD,
  REVIEW_STATE_WEIGHT,
} from "./reviewQueueConfig.ts";
import { shuffleWithRandomFn, weightedSampleWithoutReplacement } from "./reviewQueueWeights.ts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const VALID_WORD_STATES = new Set<WordState>(Object.keys(REVIEW_STATE_WEIGHT) as WordState[]);

export interface ReviewQueueProgressRow {
  id: string;
  wordId: string;
  wordState: WordState;
  correctStreak: number;
  // ISO timestamps (or null when absent) — never a Date, so this stays a
  // plain-data contract callers can pass straight from a JSON-shaped
  // Supabase read without constructing Date objects themselves.
  lastPracticedAt: string | null;
  nextReviewAt: string | null;
  createdAt: string | null;
}

export type ReviewSelectionSource = "overdue" | "weighted_random";

export interface ReviewQueueSelection {
  row: ReviewQueueProgressRow;
  source: ReviewSelectionSource;
}

export interface ReviewQueueMetadata {
  requestedSessionSize: number;
  actualQueueSize: number;
  totalLearnedWordsConsidered: number;
  overdueCandidateCount: number;
  randomCandidateCount: number;
  overdueSelectedCount: number;
  randomSelectedCount: number;
  hasFewerWordsThanRequested: boolean;
  hasNoReviewableVocabulary: boolean;
}

export interface SelectReviewQueueResult {
  selections: ReviewQueueSelection[];
  metadata: ReviewQueueMetadata;
}

export interface SelectReviewQueueParams {
  progressRows: ReviewQueueProgressRow[];
  sessionSize?: number;
  now?: Date;
  randomFn?: () => number;
}

function isValidProgressRow(row: ReviewQueueProgressRow): boolean {
  return (
    typeof row?.id === "string" &&
    row.id.length > 0 &&
    typeof row?.wordId === "string" &&
    row.wordId.length > 0 &&
    VALID_WORD_STATES.has(row.wordState)
  );
}

// Parses an ISO timestamp into epoch ms, returning null for anything
// missing/malformed instead of NaN — every date-based calculation below
// treats null as "no usable timestamp" rather than propagating NaN.
export function parseDateSafe(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export interface OverduePriorityResult {
  overdueDays: number;
  priority: number;
}

// Returns null when the row isn't overdue at all (no usable next_review_at,
// or the deadline hasn't passed yet) — the caller uses null to mean "not an
// overdue candidate", not "priority zero".
export function computeOverduePriority(
  row: Pick<ReviewQueueProgressRow, "nextReviewAt" | "wordState">,
  nowMs: number,
): OverduePriorityResult | null {
  const nextReviewAtMs = parseDateSafe(row.nextReviewAt);
  if (nextReviewAtMs === null || nextReviewAtMs > nowMs) {
    return null;
  }

  const overdueDaysRaw = (nowMs - nextReviewAtMs) / ONE_DAY_MS;
  // Safe minimum so a word that became overdue moments ago still carries its
  // urgencyMultiplier's effect on priority, instead of computing to ~0.
  const overdueDaysFloored = Math.max(overdueDaysRaw, REVIEW_MIN_OVERDUE_DAYS);
  const urgency = REVIEW_OVERDUE_URGENCY_MULTIPLIER[row.wordState];
  return { overdueDays: overdueDaysRaw, priority: overdueDaysFloored * urgency };
}

// Recency-cooldown factor for the weighted-random pool. `referenceMs` should
// be last_practiced_at, falling back to created_at (the caller resolves that
// fallback — see buildRandomCandidate below). A null/invalid/future
// reference is treated as "not recently practiced" (factor 1) rather than
// excluded, since an unusable timestamp must never silently suppress a
// word's eligibility.
//
// `bypassVeryRecentCooldown` (default false) skips the veryRecent tier's
// hard exclusion, treating it as `distant` (fully eligible) instead — used
// when the learner's total learned-word count is below
// REVIEW_SMALL_LIBRARY_WORD_COUNT_THRESHOLD, so a learner who just finished
// an early Study New Words session can immediately review what they just
// learned instead of seeing an empty queue. See that constant's own comment
// in reviewQueueConfig.ts for the full rationale.
export function computeRecencyFactor(
  referenceMs: number | null,
  nowMs: number,
  bypassVeryRecentCooldown = false,
): number {
  if (referenceMs === null) {
    return REVIEW_RECENCY_COOLDOWN_FACTORS.distant;
  }
  const hoursSince = (nowMs - referenceMs) / ONE_HOUR_MS;
  if (hoursSince < 0) {
    return REVIEW_RECENCY_COOLDOWN_FACTORS.distant;
  }
  const { veryRecent, recent, sameDay, extended } = REVIEW_RECENCY_COOLDOWN_THRESHOLDS_HOURS;
  if (hoursSince < veryRecent) {
    return bypassVeryRecentCooldown ? REVIEW_RECENCY_COOLDOWN_FACTORS.distant : REVIEW_RECENCY_COOLDOWN_FACTORS.veryRecent;
  }
  if (hoursSince <= recent) return REVIEW_RECENCY_COOLDOWN_FACTORS.recent;
  if (hoursSince <= sameDay) return REVIEW_RECENCY_COOLDOWN_FACTORS.sameDay;
  if (hoursSince <= extended) return REVIEW_RECENCY_COOLDOWN_FACTORS.extended;
  return REVIEW_RECENCY_COOLDOWN_FACTORS.distant;
}

// Deadline-approach factor for words not yet overdue — gradually raises a
// word's random-selection weight as next_review_at approaches. Missing or
// invalid dates (either side) fall back to the neutral factor rather than
// biasing the word up or down.
export function computeDeadlineApproachFactor(
  lastPracticedAtMs: number | null,
  nextReviewAtMs: number | null,
  nowMs: number,
): number {
  if (lastPracticedAtMs === null || nextReviewAtMs === null) {
    return REVIEW_DEADLINE_APPROACH_NEUTRAL;
  }
  const totalIntervalMs = nextReviewAtMs - lastPracticedAtMs;
  if (!Number.isFinite(totalIntervalMs) || totalIntervalMs <= 0) {
    return REVIEW_DEADLINE_APPROACH_NEUTRAL;
  }
  const elapsedMs = nowMs - lastPracticedAtMs;
  const progress = Math.min(Math.max(elapsedMs / totalIntervalMs, 0), 1);
  return REVIEW_DEADLINE_APPROACH_BASE + progress * REVIEW_DEADLINE_APPROACH_RANGE;
}

interface OverdueCandidate {
  row: ReviewQueueProgressRow;
  priority: number;
  nextReviewAtMs: number;
  lastPracticedAtMs: number | null;
}

// Ranks by priority descending; ties break by earlier next_review_at, then
// earlier last_practiced_at (missing last_practiced_at sorts after any
// present value), then the progress row id for full determinism.
function compareOverdueCandidates(a: OverdueCandidate, b: OverdueCandidate): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.nextReviewAtMs !== b.nextReviewAtMs) return a.nextReviewAtMs - b.nextReviewAtMs;
  const aLast = a.lastPracticedAtMs ?? Number.POSITIVE_INFINITY;
  const bLast = b.lastPracticedAtMs ?? Number.POSITIVE_INFINITY;
  if (aLast !== bLast) return aLast - bLast;
  if (a.row.id < b.row.id) return -1;
  if (a.row.id > b.row.id) return 1;
  return 0;
}

interface RandomCandidate {
  row: ReviewQueueProgressRow;
  weight: number;
}

function buildRandomCandidate(
  row: ReviewQueueProgressRow,
  nowMs: number,
  bypassVeryRecentCooldown: boolean,
): RandomCandidate {
  const lastPracticedAtMs = parseDateSafe(row.lastPracticedAt);
  const createdAtMs = parseDateSafe(row.createdAt);
  const recencyReferenceMs = lastPracticedAtMs ?? createdAtMs;
  const recencyFactor = computeRecencyFactor(recencyReferenceMs, nowMs, bypassVeryRecentCooldown);

  const nextReviewAtMs = parseDateSafe(row.nextReviewAt);
  const deadlineApproachFactor = computeDeadlineApproachFactor(lastPracticedAtMs, nextReviewAtMs, nowMs);

  const weight = REVIEW_STATE_WEIGHT[row.wordState] * recencyFactor * deadlineApproachFactor;
  return { row, weight };
}

function emptyMetadata(requestedSessionSize: number, hasNoReviewableVocabulary: boolean): ReviewQueueMetadata {
  return {
    requestedSessionSize,
    actualQueueSize: 0,
    totalLearnedWordsConsidered: 0,
    overdueCandidateCount: 0,
    randomCandidateCount: 0,
    overdueSelectedCount: 0,
    randomSelectedCount: 0,
    hasFewerWordsThanRequested: true,
    hasNoReviewableVocabulary,
  };
}

function resolveRequestedSessionSize(sessionSize: number | undefined): number {
  return Number.isFinite(sessionSize) && (sessionSize as number) > 0
    ? Math.floor(sessionSize as number)
    : REVIEW_SESSION_SIZE_DEFAULT;
}

// The main selection entrypoint. Builds two candidate pools (overdue,
// weighted-random), takes a target share from each (expanding overdue to
// fill any shortfall the random pool can't cover), then shuffles the
// combined result with the injected random source so overdue words don't
// visibly cluster as one block at the front of the session.
export function selectReviewQueue(params: SelectReviewQueueParams): SelectReviewQueueResult {
  const { progressRows, now = new Date(), randomFn = Math.random } = params;
  const requestedSessionSize = resolveRequestedSessionSize(params.sessionSize);
  const nowMs = now.getTime();

  const validRows = progressRows.filter(isValidProgressRow);
  const totalLearnedWordsConsidered = validRows.length;

  if (totalLearnedWordsConsidered === 0) {
    return { selections: [], metadata: emptyMetadata(requestedSessionSize, true) };
  }

  // See REVIEW_SMALL_LIBRARY_WORD_COUNT_THRESHOLD's own comment: a small
  // enough library means the learner is very likely reviewing right after
  // an early study session, so the two-hour "just practiced" cooldown is
  // bypassed entirely rather than leaving them with an empty queue.
  const bypassVeryRecentCooldown = totalLearnedWordsConsidered < REVIEW_SMALL_LIBRARY_WORD_COUNT_THRESHOLD;

  // --- Overdue pool -----------------------------------------------------
  const overdueCandidates: OverdueCandidate[] = [];
  for (const row of validRows) {
    const overduePriority = computeOverduePriority(row, nowMs);
    if (!overduePriority) continue;
    overdueCandidates.push({
      row,
      priority: overduePriority.priority,
      nextReviewAtMs: parseDateSafe(row.nextReviewAt) as number,
      lastPracticedAtMs: parseDateSafe(row.lastPracticedAt),
    });
  }
  overdueCandidates.sort(compareOverdueCandidates);

  const targetOverdueCount = Math.round(requestedSessionSize * REVIEW_OVERDUE_SESSION_SHARE);
  const initialOverdueTake = Math.min(targetOverdueCount, overdueCandidates.length, requestedSessionSize);
  const initiallySelectedOverdue = overdueCandidates.slice(0, initialOverdueTake);

  const selectedRowIds = new Set<string>(initiallySelectedOverdue.map((candidate) => candidate.row.id));

  // --- Weighted-random pool ---------------------------------------------
  const remainingAfterOverdue = requestedSessionSize - initiallySelectedOverdue.length;

  const randomPool: RandomCandidate[] = [];
  for (const row of validRows) {
    if (selectedRowIds.has(row.id)) continue;
    randomPool.push(buildRandomCandidate(row, nowMs, bypassVeryRecentCooldown));
  }
  const randomCandidateCount = randomPool.filter(
    (candidate) => Number.isFinite(candidate.weight) && candidate.weight > 0,
  ).length;

  const randomSelectedCandidates = weightedSampleWithoutReplacement(
    randomPool,
    (candidate) => candidate.weight,
    Math.max(remainingAfterOverdue, 0),
    randomFn,
  );
  randomSelectedCandidates.forEach((candidate) => selectedRowIds.add(candidate.row.id));

  // --- Expand overdue if the random pool couldn't fill the remainder ----
  let finalOverdueRows = initiallySelectedOverdue.map((candidate) => candidate.row);
  const shortfall = remainingAfterOverdue - randomSelectedCandidates.length;
  if (shortfall > 0) {
    const additionalOverdue = overdueCandidates
      .slice(initialOverdueTake)
      .filter((candidate) => !selectedRowIds.has(candidate.row.id))
      .slice(0, shortfall);
    additionalOverdue.forEach((candidate) => selectedRowIds.add(candidate.row.id));
    finalOverdueRows = finalOverdueRows.concat(additionalOverdue.map((candidate) => candidate.row));
  }

  const overdueSelections: ReviewQueueSelection[] = finalOverdueRows.map((row) => ({ row, source: "overdue" }));
  const randomSelections: ReviewQueueSelection[] = randomSelectedCandidates.map((candidate) => ({
    row: candidate.row,
    source: "weighted_random",
  }));

  const shuffled = shuffleWithRandomFn([...overdueSelections, ...randomSelections], randomFn);

  return {
    selections: shuffled,
    metadata: {
      requestedSessionSize,
      actualQueueSize: shuffled.length,
      totalLearnedWordsConsidered,
      overdueCandidateCount: overdueCandidates.length,
      randomCandidateCount,
      overdueSelectedCount: overdueSelections.length,
      randomSelectedCount: randomSelections.length,
      hasFewerWordsThanRequested: shuffled.length < requestedSessionSize,
      hasNoReviewableVocabulary: false,
    },
  };
}

// ---------------------------------------------------------------------
// Resolution orchestration — still resolver-injected DI (like
// newWordStudyQueue.ts's selectNewWordStudyQueue), so this module still
// never imports vocabulary data itself. Kept separate from selectReviewQueue
// above (which stays exactly the "progress rows in, selections +
// metadata out" shape the spec calls for) because resolving vocabulary can
// require re-running selection against a shrinking candidate pool: a
// selected row that fails to resolve must not just vanish from the
// session — a later candidate should be able to take its place, up to the
// requested session size or until candidates run out.
// ---------------------------------------------------------------------

export interface ReviewQueueResolvedItem<TResolved> {
  row: ReviewQueueProgressRow;
  source: ReviewSelectionSource;
  resolved: TResolved;
}

export interface SelectReviewQueueWithResolutionParams<TResolved> {
  progressRows: ReviewQueueProgressRow[];
  sessionSize?: number;
  now?: Date;
  randomFn?: () => number;
  // Injected rather than imported so this function stays free of vocabulary
  // imports; return null when a word id can't be resolved for the active
  // target/native language pair.
  resolveConcept: (wordId: string) => TResolved | null;
  onUnresolvedRow?: (row: ReviewQueueProgressRow) => void;
  // Bounds the "try more candidates" loop below — each round re-runs
  // selectReviewQueue against only the not-yet-tried rows, requesting
  // exactly the still-missing count. Capped so a pathological data set
  // (e.g. almost nothing resolves) can never loop unboundedly; the loop
  // also stops on its own once candidates are exhausted (see the
  // `availableRows.length === 0` check below).
  maxResolutionRounds?: number;
}

export interface SelectReviewQueueWithResolutionResult<TResolved> {
  items: ReviewQueueResolvedItem<TResolved>[];
  metadata: ReviewQueueMetadata;
}

const DEFAULT_MAX_RESOLUTION_ROUNDS = 5;

// Runs selectReviewQueue, resolves each selected row, and — only if some
// selections failed to resolve and the requested size hasn't been reached
// yet — re-runs selection against the remaining untried rows to backfill
// the shortfall. Metadata (candidate counts, share targets, etc.) is taken
// from the first round, which always runs against the full input pool;
// later backfill rounds operate on a shrinking pool and would understate
// those figures if used instead. actualQueueSize/hasFewerWordsThanRequested
// are overridden at the end to reflect the final, fully-resolved item count.
export function selectReviewQueueWithResolution<TResolved>(
  params: SelectReviewQueueWithResolutionParams<TResolved>,
): SelectReviewQueueWithResolutionResult<TResolved> {
  const {
    progressRows,
    sessionSize,
    now = new Date(),
    randomFn = Math.random,
    resolveConcept,
    onUnresolvedRow,
    maxResolutionRounds = DEFAULT_MAX_RESOLUTION_ROUNDS,
  } = params;

  const requestedSessionSize = resolveRequestedSessionSize(sessionSize);
  const triedIds = new Set<string>();
  const items: ReviewQueueResolvedItem<TResolved>[] = [];
  let representativeMetadata: ReviewQueueMetadata | null = null;

  for (let round = 0; round < maxResolutionRounds; round++) {
    const stillNeeded = requestedSessionSize - items.length;
    if (stillNeeded <= 0) break;

    const availableRows = progressRows.filter((row) => !triedIds.has(row.id));
    if (availableRows.length === 0) break;

    const roundResult = selectReviewQueue({
      progressRows: availableRows,
      sessionSize: stillNeeded,
      now,
      randomFn,
    });
    if (round === 0) {
      representativeMetadata = roundResult.metadata;
    }
    if (roundResult.selections.length === 0) break;

    for (const selection of roundResult.selections) {
      triedIds.add(selection.row.id);
      const resolved = resolveConcept(selection.row.wordId);
      if (resolved === null) {
        onUnresolvedRow?.(selection.row);
        continue;
      }
      items.push({ row: selection.row, source: selection.source, resolved });
    }
  }

  const metadata =
    representativeMetadata ?? emptyMetadata(requestedSessionSize, progressRows.length === 0);

  return {
    items,
    metadata: {
      ...metadata,
      actualQueueSize: items.length,
      hasFewerWordsThanRequested: items.length < requestedSessionSize,
    },
  };
}
