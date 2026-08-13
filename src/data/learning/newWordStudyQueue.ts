// Pure queue-selection logic for the "Study New Words" flow. Deliberately
// import-free (like practiceRouteCanonicalizationPolicy.ts) so it can be
// loaded directly by scripts/tests/learning/test-new-word-study-queue.mjs via
// `node --experimental-strip-types`, and so it stays testable without
// Supabase, React, or dynamic vocabulary imports. The one exception is the
// `LanguageLevelCode` import directly below: it is `import type`-only, so it
// is fully erased at both build time and by Node's TypeScript stripping —
// it never causes src/lib/userProfile.ts (which is NOT import-free) to
// actually load. Same pattern reviewOutcomeTransition.ts already uses for
// `WordState`.
import type { LanguageLevelCode } from "../../lib/userProfile";

// Canonical CEFR ordering for this module's own threshold comparisons.
// Reuses the existing six-code `LanguageLevelCode` union (also the type
// user_profiles.current_level normalizes to — see src/lib/userProfile.ts and
// its CHECK constraint in supabase/migrations) as the Record key type, so
// this stays exhaustive at compile time instead of inventing a second CEFR
// vocabulary. Never compare CEFR levels alphabetically — always through this
// rank.
export const CEFR_LEVEL_RANK: Record<LanguageLevelCode, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
};

// vocabulary_aranged.json's concept_id values already encode their CEFR
// level as a leading "A1-"/"A2-"/.../"C2-" prefix (confirmed: all 10,572
// current entries match one of the six codes, zero exceptions) — the same
// contract WORD_ROUTE_CONCEPT_ID_PATTERN enforces in
// src/data/seo/wordPages/wordRouteManifest.ts for word SEO routes. That
// means concept level never needs a second, separately-maintained CEFR
// mapping or a vocabulary.json import just to filter by level: it is read
// directly off the id already present in the arranged-vocabulary source.
// Deliberately looser than WORD_ROUTE_CONCEPT_ID_PATTERN (no digit-count
// requirement) so it stays tolerant of any conceptId shape a caller/test
// fixture supplies — entries with no recognizable CEFR prefix simply resolve
// to `null` rather than being rejected.
const CONCEPT_LEVEL_PREFIX_PATTERN = /^(A1|A2|B1|B2|C1|C2)-/;

export function resolveConceptLevelFromId(conceptId: string): LanguageLevelCode | null {
  const match = CONCEPT_LEVEL_PREFIX_PATTERN.exec(conceptId);
  return match ? (match[1] as LanguageLevelCode) : null;
}

export interface ArrangedVocabularyEntry {
  // Learning-order position from vocabulary_aranged.json's `id` field. Named
  // `learningOrder` here (not "id") because it is order, not a word
  // identifier — `conceptId` is the identifier.
  learningOrder: number;
  conceptId: string;
  // Resolved once here (at parse time, not on every filter/selection call)
  // from conceptId's own CEFR prefix — see resolveConceptLevelFromId above.
  // `null` when conceptId has no recognizable CEFR prefix (never happens for
  // the real vocabulary_aranged.json today, but kept nullable so malformed/
  // synthetic data fails safe instead of crashing).
  level: LanguageLevelCode | null;
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

    candidates.push({ learningOrder, conceptId, level: resolveConceptLevelFromId(conceptId) });
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
  // The same concept_id's `sentence` field read from the native-language
  // vocabulary.json instead of the target-language one — i.e. the existing
  // example sentence's own translation, not a generated one. Only populated
  // when both exampleSentence and its native-language counterpart exist.
  exampleSentenceTranslation?: string;
  // Raw inflected/separable word forms (e.g. ["Hör", "zu"] for "zuhören")
  // read from the target language's inflected.json for this concept_id —
  // the same source VocabularyPractice.tsx already uses to bold a word's
  // conjugated/separated forms inside its example sentence. Only populated
  // when exampleSentence exists and a matching inflected.json entry exists.
  exampleSentenceInflectedForms?: string[];
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

// Resolves the caller's current_level into a minimum CEFR rank threshold.
// Missing/unrecognized values (profile row not yet loaded, or — should the
// database's own NOT NULL + CHECK constraint on user_profiles.current_level
// ever be bypassed — a corrupt value) fail safe to rank 0 (A1), which is
// equivalent to "no threshold": every level is >= A1, so filtering is a
// no-op rather than blocking the queue. This is also the product's stated
// fallback (see current-level task spec item 10/11) and never needs its own
// separate "is this valid" branch — the same clamp expresses both.
function resolveMinLevelRank(currentLevel: LanguageLevelCode | null | undefined): number {
  if (!currentLevel) {
    return CEFR_LEVEL_RANK.A1;
  }
  return CEFR_LEVEL_RANK[currentLevel] ?? CEFR_LEVEL_RANK.A1;
}

// Exposed separately (not just inlined in selectNewWordStudyQueue) so a
// caller can cheaply decide whether resolving language-specific word data is
// worth doing at all — e.g. skipping the vocabulary.json import entirely
// when the daily goal is already met or the language is fully exhausted —
// without duplicating the "already studied"/CEFR-threshold filters in two
// places.
//
// `currentLevel` is the learner's user_profiles.current_level: when
// provided, concepts below it in CEFR_LEVEL_RANK are excluded from the
// default Study New Words queue (the selected level itself is eligible —
// see the current-level task spec's "CURRENT LEVEL SEMANTICS"). This never
// touches studiedConceptIds/user_word_progress — a lower-level concept a
// learner already has real progress on was already filtered out by the
// studiedConceptIds check above, not by this threshold, so existing
// lower-level progress is never altered by changing currentLevel. A concept
// whose level can't be resolved (entry.level === null) is excluded once a
// threshold is active, rather than guessed into eligibility.
export function filterEligibleArrangedEntries(
  arrangedEntries: ArrangedVocabularyEntry[],
  studiedConceptIds: ReadonlySet<string>,
  currentLevel?: LanguageLevelCode | null,
): ArrangedVocabularyEntry[] {
  const minLevelRank = resolveMinLevelRank(currentLevel);
  return arrangedEntries.filter((entry) => {
    if (studiedConceptIds.has(entry.conceptId)) {
      return false;
    }
    if (minLevelRank === CEFR_LEVEL_RANK.A1) {
      // No effective threshold (missing/A1 current_level) — never reject on
      // level, including entries with an unresolvable level. Preserves
      // pre-existing behavior for callers that don't pass currentLevel.
      return true;
    }
    return entry.level !== null && CEFR_LEVEL_RANK[entry.level] >= minLevelRank;
  });
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
  // The learner's user_profiles.current_level — see
  // filterEligibleArrangedEntries's own doc comment for the full threshold
  // contract. Optional/nullable so every existing caller/test that predates
  // this filter keeps its exact prior behavior unchanged.
  currentLevel?: LanguageLevelCode | null;
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
  const {
    arrangedEntries,
    studiedConceptIds,
    dailyGoal,
    wordsCompletedToday,
    currentLevel,
    resolveConcept,
    onUnresolvedConcept,
  } = params;

  const remainingToday = computeRemainingDailyTarget(dailyGoal, wordsCompletedToday);
  const eligibleEntries = filterEligibleArrangedEntries(arrangedEntries, studiedConceptIds, currentLevel);
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
