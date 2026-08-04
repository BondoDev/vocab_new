// Focused, reusable weighted-sampling helpers for the Review Words engine
// (reviewQueue.ts). Zero imports, so — like newWordStudyQueue.ts and
// wordReviewSchedule.ts — this stays loadable directly via
// `node --experimental-strip-types` for scripts/tests/learning/test-review-queue.mjs,
// with no Supabase, React, or vocabulary-data dependency.

// Weighted random sampling without replacement (Efraimidis-Spirakis A-ES
// algorithm): each eligible candidate draws exactly one key = u^(1/weight)
// from the injected random source, and the top `count` keys win. This is a
// single pass over the candidates with one random draw each — no repeated
// picks, no cumulative-weight rebuilding per draw, and no risk of an
// unbounded retry loop on duplicate picks.
//
// Candidates with a non-finite or non-positive weight are ignored entirely
// (never selected, never consume a random draw). Requesting more than the
// number of eligible candidates simply returns all of them. An empty
// candidate list or a non-positive count returns an empty array.
export function weightedSampleWithoutReplacement<T>(
  candidates: readonly T[],
  getWeight: (item: T) => number,
  count: number,
  randomFn: () => number = Math.random,
): T[] {
  if (count <= 0 || candidates.length === 0) {
    return [];
  }

  const keyed: { item: T; key: number }[] = [];
  for (const item of candidates) {
    const weight = getWeight(item);
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    const key = Math.pow(randomFn(), 1 / weight);
    keyed.push({ item, key });
  }

  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, count).map((entry) => entry.item);
}

// Fisher-Yates shuffle using an injected random source (unlike
// src/utils/shuffleArray.ts, which always uses Math.random and can't be
// driven deterministically in tests). Returns a new array; never mutates
// `items`.
export function shuffleWithRandomFn<T>(items: readonly T[], randomFn: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
