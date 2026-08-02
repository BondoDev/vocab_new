// Pure queue-selection logic for the "Study New Words" flow. Deliberately
// import-free (like practiceRouteCanonicalizationPolicy.ts) so it can be
// loaded directly by scripts/tests/learning/test-new-word-study-queue.mjs via
// `node --experimental-strip-types`, and so it stays testable without
// Supabase, React, or dynamic vocabulary imports.

export interface ArrangedVocabularyEntry {
  // Learning-order position from vocabulary_aranged.json's `id` field. Named
  // `learningOrder` here (not "id") because it is order, not a word
  // identifier — `conceptId` is the identifier.
  learningOrder: number;
  conceptId: string;
}

export interface ParseArrangedVocabularyResult {
  entries: ArrangedVocabularyEntry[];
  warnings: string[];
}

// Sorting by learningOrder is required even though the source file currently
// appears pre-sorted: nothing about the JSON's on-disk order is a load-bearing
// contract, and an out-of-order edit must not silently break study order.
// Duplicate concept_id entries keep only the earliest learningOrder
// occurrence (a concept must not be scheduled twice), and malformed entries
// (non-finite id, empty/non-string concept_id) are dropped rather than
// crashing the queue-selection pipeline.
export function parseArrangedVocabulary(raw: unknown): ParseArrangedVocabularyResult {
  const warnings: string[] = [];

  if (!Array.isArray(raw)) {
    warnings.push("parseArrangedVocabulary: input is not an array; returning an empty queue source.");
    return { entries: [], warnings };
  }

  const candidates: ArrangedVocabularyEntry[] = [];
  raw.forEach((item, index) => {
    const learningOrder = (item as { id?: unknown })?.id;
    const conceptId = (item as { concept_id?: unknown })?.concept_id;

    if (typeof learningOrder !== "number" || !Number.isFinite(learningOrder)) {
      warnings.push(`parseArrangedVocabulary: dropped entry at index ${index} with non-finite id.`);
      return;
    }
    if (typeof conceptId !== "string" || conceptId.trim().length === 0) {
      warnings.push(
        `parseArrangedVocabulary: dropped entry at index ${index} (id ${learningOrder}) with empty/non-string concept_id.`,
      );
      return;
    }

    candidates.push({ learningOrder, conceptId });
  });

  candidates.sort((a, b) => a.learningOrder - b.learningOrder);

  const seenConceptIds = new Set<string>();
  const entries: ArrangedVocabularyEntry[] = [];
  for (const entry of candidates) {
    if (seenConceptIds.has(entry.conceptId)) {
      warnings.push(
        `parseArrangedVocabulary: dropped duplicate concept_id "${entry.conceptId}" at learningOrder ${entry.learningOrder} (earliest occurrence kept).`,
      );
      continue;
    }
    seenConceptIds.add(entry.conceptId);
    entries.push(entry);
  }

  return { entries, warnings };
}

export function computeRemainingDailyTarget(
  dailyGoal: number,
  wordsCompletedToday: number,
): number {
  return Math.max(dailyGoal - wordsCompletedToday, 0);
}

export interface ResolvedConceptWordData {
  targetWord: string;
  translation: string;
  definition?: string;
  grammarType?: string;
  level?: string;
  // Only populated when the target-language vocabulary.json entry already
  // has one — Phase 2's word-info step must never fabricate an example.
  exampleSentence?: string;
}

export interface ResolvedStudyQueueItem extends ResolvedConceptWordData {
  conceptId: string;
  learningOrder: number;
}

export interface NewWordStudyQueueResult {
  selectedQueue: ResolvedStudyQueueItem[];
  dailyGoal: number;
  wordsCompletedToday: number;
  remainingToday: number;
  eligibleUnseenConceptsRemaining: number;
  selectedQueueLength: number;
  firstSelectedLearningOrder: number | null;
  lastSelectedLearningOrder: number | null;
  isArrangedVocabularyExhausted: boolean;
}

// Exposed separately (not just inlined in selectNewWordStudyQueue) so a
// caller can cheaply decide whether resolving language-specific word data is
// worth doing at all — e.g. skipping the vocabulary.json import entirely
// when the daily goal is already met or the language is fully exhausted —
// without duplicating the "already studied" filter in two places.
export function filterEligibleArrangedEntries(
  arrangedEntries: ArrangedVocabularyEntry[],
  studiedConceptIds: ReadonlySet<string>,
): ArrangedVocabularyEntry[] {
  return arrangedEntries.filter((entry) => !studiedConceptIds.has(entry.conceptId));
}

export interface SelectNewWordStudyQueueParams {
  arrangedEntries: ArrangedVocabularyEntry[];
  // The source of truth for "already studied" is the caller-supplied set of
  // concept ids already present in user_word_progress for this user AND this
  // target language — never a stored cursor. A cursor would break the moment
  // a user abandons a session, studies multiple languages, or progress has
  // gaps; re-deriving "unseen" from actual progress rows on every load is
  // correct in all of those cases. Passing a set scoped to one target
  // language (and not others) is what keeps different languages' progress
  // isolated from each other — this function never sees or needs to know the
  // language itself, only the set the caller already filtered.
  studiedConceptIds: ReadonlySet<string>;
  dailyGoal: number;
  wordsCompletedToday: number;
  // Injected rather than imported so this module stays Supabase/vocabulary-
  // data-free; return null when a concept can't be resolved for the active
  // target/native language pair.
  resolveConcept: (conceptId: string) => ResolvedConceptWordData | null;
  onUnresolvedConcept?: (entry: ArrangedVocabularyEntry) => void;
}

// Concepts that fail resolution are skipped rather than surfaced as broken
// queue entries: a learner should never see a session blocked by one bad
// data row. The scan keeps walking later ordered entries (bounded by the
// already-finite eligible-entries list, so it can never loop unboundedly)
// until either remainingToday usable words are collected or eligible entries
// run out.
export function selectNewWordStudyQueue(
  params: SelectNewWordStudyQueueParams,
): NewWordStudyQueueResult {
  const { arrangedEntries, studiedConceptIds, dailyGoal, wordsCompletedToday, resolveConcept, onUnresolvedConcept } =
    params;

  const remainingToday = computeRemainingDailyTarget(dailyGoal, wordsCompletedToday);
  const eligibleEntries = filterEligibleArrangedEntries(arrangedEntries, studiedConceptIds);
  const eligibleUnseenConceptsRemaining = eligibleEntries.length;
  const isArrangedVocabularyExhausted = eligibleUnseenConceptsRemaining === 0;

  const selectedQueue: ResolvedStudyQueueItem[] = [];
  if (remainingToday > 0) {
    for (const entry of eligibleEntries) {
      if (selectedQueue.length >= remainingToday) {
        break;
      }

      const resolved = resolveConcept(entry.conceptId);
      if (!resolved) {
        onUnresolvedConcept?.(entry);
        continue;
      }

      selectedQueue.push({
        conceptId: entry.conceptId,
        learningOrder: entry.learningOrder,
        ...resolved,
      });
    }
  }

  return {
    selectedQueue,
    dailyGoal,
    wordsCompletedToday,
    remainingToday,
    eligibleUnseenConceptsRemaining,
    selectedQueueLength: selectedQueue.length,
    firstSelectedLearningOrder: selectedQueue[0]?.learningOrder ?? null,
    lastSelectedLearningOrder:
      selectedQueue.length > 0 ? selectedQueue[selectedQueue.length - 1].learningOrder : null,
    isArrangedVocabularyExhausted,
  };
}
