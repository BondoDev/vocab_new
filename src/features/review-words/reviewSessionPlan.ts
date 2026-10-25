// Pure session-plan builder for Review Words Phase 2: turns a resolved
// review queue's length into an ordered sequence of 4-word blocks, each with
// a randomly-assigned typing exercise per word and (for full 4-word blocks
// only) one randomly-assigned group exercise. This is planning only — it
// knows nothing about React, Supabase, or the exercise components
// themselves, and never touches the Review Words queue-selection engine
// (src/data/learning/reviewQueue.ts, unmodified by this phase).
//
// Only a value import of the generic shuffle helper reviewQueue.ts's own
// weighted-sampling module already exports (not the queue-selection
// algorithm itself), so this stays loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-review-session.mjs.
import { shuffleWithRandomFn } from "../../data/learning/reviewQueueWeights.ts";

export type TypingExerciseId = "brokenWord" | "halfWritten" | "wordTyping";
export type GroupExerciseId = "connectWords" | "listening";

export const TYPING_EXERCISE_POOL: readonly TypingExerciseId[] = ["brokenWord", "halfWritten", "wordTyping"];
export const GROUP_EXERCISE_POOL: readonly GroupExerciseId[] = ["connectWords", "listening"];

// Words per block — the fixed size the group exercises are built for.
// Never modify the group components to accept fewer than this many words;
// a trailing remainder below this size gets typing-only treatment instead
// (see buildReviewSessionPlan below).
export const REVIEW_BLOCK_SIZE = 4;

export interface ReviewWordAssignment {
  // Position in the original (already-selected, already-shuffled) review
  // queue — the stable link back to the actual word data, since this module
  // never sees the queue items themselves, only its length.
  queueIndex: number;
  typingExerciseId: TypingExerciseId;
  // Stable per-word-encounter id for Review Words Phase 3's
  // complete_word_review RPC — generated exactly once, here, when the plan
  // is built. Every retry (network failure, expired auth, component error)
  // must reuse this same id rather than minting a new one; that is what
  // makes the RPC call idempotent (see src/lib/newWordProgress.ts's
  // completeWordReview and its CompleteWordReviewParams.eventId comment).
  eventId: string;
}

export interface ReviewBlockPlan {
  // 4 entries for a full block, 1-3 for the trailing remainder (only ever
  // the last block — see buildReviewSessionPlan).
  words: ReviewWordAssignment[];
  // Non-null only when words.length === REVIEW_BLOCK_SIZE.
  groupExerciseId: GroupExerciseId | null;
}

export interface ReviewSessionPlan {
  blocks: ReviewBlockPlan[];
  totalWords: number;
}

function pickRandom<T>(pool: readonly T[], randomFn: () => number): T {
  const index = Math.min(Math.floor(randomFn() * pool.length), pool.length - 1);
  return pool[index];
}

// Builds a "shuffle the pool, drain it, reshuffle" sequence of length
// `count` from `pool` — this is the "lightweight shuffle exercise pool then
// reuse" approach: still genuinely random (each refill is an independent
// shuffle), but avoids the same option coming up many times in a row the
// way independent per-slot random picks eventually would. A small swap
// guards the one seam where two shuffles meet (the last item of one batch
// and the first item of the next) from repeating back-to-back.
export function buildBalancedSequence<T>(count: number, pool: readonly T[], randomFn: () => number): T[] {
  if (count <= 0 || pool.length === 0) {
    return [];
  }

  const sequence: T[] = [];
  let batch: T[] = [];

  while (sequence.length < count) {
    if (batch.length === 0) {
      batch = shuffleWithRandomFn(pool, randomFn);
      const previous = sequence[sequence.length - 1];
      if (previous !== undefined && batch.length > 1 && batch[0] === previous) {
        [batch[0], batch[1]] = [batch[1], batch[0]];
      }
    }
    sequence.push(batch.shift() as T);
  }

  return sequence;
}

// Default event-id generator — the Web Crypto API's randomUUID, available
// as a global in both browsers (secure contexts) and modern Node (used by
// the `node --experimental-strip-types` test scripts). Tests inject a
// deterministic generator instead so event ids are assertable.
function defaultGenerateEventId(): string {
  return crypto.randomUUID();
}

// Blocks for queue indexes [startIndex, startIndex + count): full 4-word
// blocks get a group exercise, a trailing 1-3 word remainder does not.
// `previousTypingExerciseId` is the last typing exercise already planned
// (when extending a plan), so the first new word doesn't repeat it.
function buildBlocks(
  startIndex: number,
  count: number,
  randomFn: () => number,
  generateEventId: () => string,
  previousTypingExerciseId?: TypingExerciseId,
): ReviewBlockPlan[] {
  const typingSequence = buildBalancedSequence(count, TYPING_EXERCISE_POOL, randomFn);
  if (previousTypingExerciseId !== undefined && typingSequence.length > 1 && typingSequence[0] === previousTypingExerciseId) {
    [typingSequence[0], typingSequence[1]] = [typingSequence[1], typingSequence[0]];
  }

  const blocks: ReviewBlockPlan[] = [];
  for (let offset = 0; offset < count; offset += REVIEW_BLOCK_SIZE) {
    const end = Math.min(offset + REVIEW_BLOCK_SIZE, count);
    const words: ReviewWordAssignment[] = [];
    for (let i = offset; i < end; i++) {
      words.push({ queueIndex: startIndex + i, typingExerciseId: typingSequence[i], eventId: generateEventId() });
    }

    const isFullBlock = words.length === REVIEW_BLOCK_SIZE;
    blocks.push({
      words,
      groupExerciseId: isFullBlock ? pickRandom(GROUP_EXERCISE_POOL, randomFn) : null,
    });
  }
  return blocks;
}

// The main entrypoint. `queueLength` is the count of already-selected,
// already-resolved review-queue items (see loadReviewQueue.ts) — this
// function has no opinion on which words those are, only how many.
export function buildReviewSessionPlan(
  queueLength: number,
  randomFn: () => number = Math.random,
  generateEventId: () => string = defaultGenerateEventId,
): ReviewSessionPlan {
  if (!Number.isFinite(queueLength) || queueLength <= 0) {
    return { blocks: [], totalWords: 0 };
  }

  const totalWords = Math.floor(queueLength);
  return { blocks: buildBlocks(0, totalWords, randomFn, generateEventId), totalWords };
}

// Continuous reviewing: appends blocks for `additionalCount` more queue
// items (the next batch, already appended to the session's queue) after the
// existing plan, continuing its queue indexes. Existing blocks — including a
// short remainder block that used to be the plan's last — are kept as-is; a
// remainder block simply no longer ends the session (see
// reviewSessionState.ts's advance logic).
export function extendReviewSessionPlan(
  plan: ReviewSessionPlan,
  additionalCount: number,
  randomFn: () => number = Math.random,
  generateEventId: () => string = defaultGenerateEventId,
): ReviewSessionPlan {
  if (!Number.isFinite(additionalCount) || additionalCount <= 0) {
    return plan;
  }
  const count = Math.floor(additionalCount);
  const lastBlock = plan.blocks[plan.blocks.length - 1];
  const previousTypingExerciseId = lastBlock?.words[lastBlock.words.length - 1]?.typingExerciseId;
  return {
    blocks: [...plan.blocks, ...buildBlocks(plan.totalWords, count, randomFn, generateEventId, previousTypingExerciseId)],
    totalWords: plan.totalWords + count,
  };
}
