// Orchestrates Review Words Phase 1: combines (1) a read-only
// user_word_progress load, (2) the pure hybrid selection engine in
// src/data/learning/reviewQueue.ts, and (3) per-language vocabulary.json
// resolution into one ready-to-render queue. Read-only — this module
// performs no Supabase writes (no insert/update/upsert/RPC calls).
import type { StoredSupabaseSession } from "../../lib/supabaseAuth";
import { readUserWordProgressForReview, type UserWordProgressReviewRow } from "../../lib/newWordProgress";
import {
  selectReviewQueueWithResolution,
  type ReviewQueueMetadata,
  type ReviewQueueProgressRow,
  type ReviewSelectionSource,
} from "../../data/learning/reviewQueue";
import { REVIEW_SESSION_SIZE_DEFAULT } from "../../data/learning/reviewQueueConfig";
import { buildVocabularyConceptResolver } from "../../data/vocabulary/resolveVocabularyWordData";
import type { ResolvedConceptWordData } from "../../data/learning/newWordStudyQueue";
import type { WordState } from "../../data/learning/wordReviewSchedule";

// Same per-UI-code dynamic-import map loadNewWordStudyQueue.ts and
// VocabularyPractice.tsx each already keep as their own private
// module-level constant — duplicated here for the same reason
// loadNewWordStudyQueue.ts duplicates it rather than importing either of
// theirs (see that module's own header comment).
const VOCABULARY_IMPORTERS: Record<string, () => Promise<{ default: unknown[] }>> = {
  en: () => import("../../data/vocabulary/english/vocabulary.json"),
  es: () => import("../../data/vocabulary/spanish/vocabulary.json"),
  fr: () => import("../../data/vocabulary/french/vocabulary.json"),
  de: () => import("../../data/vocabulary/german/vocabulary.json"),
  it: () => import("../../data/vocabulary/italian/vocabulary.json"),
  pt: () => import("../../data/vocabulary/portuguese/vocabulary.json"),
  ru: () => import("../../data/vocabulary/russian/vocabulary.json"),
};

export interface ResolvedReviewQueueItem extends ResolvedConceptWordData {
  progressRowId: string;
  conceptId: string;
  wordState: WordState;
  correctStreak: number;
  lastPracticedAt: string | null;
  nextReviewAt: string | null;
  selectionSource: ReviewSelectionSource;
}

export interface LoadReviewQueueParams {
  session: StoredSupabaseSession;
  targetLanguage: string;
  nativeLanguage: string;
  sessionSize?: number;
  // Injectable for tests; defaults to the real current time.
  now?: Date;
}

export interface LoadReviewQueueResult {
  queue: ResolvedReviewQueueItem[];
  metadata: ReviewQueueMetadata;
}

function toEngineRow(row: UserWordProgressReviewRow): ReviewQueueProgressRow {
  return {
    id: row.id,
    wordId: row.wordId,
    wordState: row.wordState,
    correctStreak: row.correctStreak,
    lastPracticedAt: row.lastPracticedAt,
    nextReviewAt: row.nextReviewAt,
    createdAt: row.createdAt,
  };
}

export async function loadReviewQueue({
  session,
  targetLanguage,
  nativeLanguage,
  sessionSize = REVIEW_SESSION_SIZE_DEFAULT,
  now,
}: LoadReviewQueueParams): Promise<LoadReviewQueueResult> {
  if (!VOCABULARY_IMPORTERS[targetLanguage] || !VOCABULARY_IMPORTERS[nativeLanguage]) {
    throw new Error(`loadReviewQueue: unsupported language pair "${targetLanguage}"/"${nativeLanguage}".`);
  }

  const effectiveNow = now ?? new Date();
  const progressRows = await readUserWordProgressForReview(session, targetLanguage);

  if (progressRows.length === 0) {
    const emptyResult = selectReviewQueueWithResolution({
      progressRows: [],
      sessionSize,
      now: effectiveNow,
      resolveConcept: () => null,
    });
    return { queue: [], metadata: emptyResult.metadata };
  }

  const [targetModule, nativeModule] = await Promise.all([
    VOCABULARY_IMPORTERS[targetLanguage](),
    VOCABULARY_IMPORTERS[nativeLanguage](),
  ]);

  const resolveVocabularyConcept = buildVocabularyConceptResolver(
    Array.isArray(targetModule.default) ? targetModule.default : [],
    Array.isArray(nativeModule.default) ? nativeModule.default : [],
  );

  const engineRows = progressRows.map(toEngineRow);

  const { items, metadata } = selectReviewQueueWithResolution({
    progressRows: engineRows,
    sessionSize,
    now: effectiveNow,
    resolveConcept: resolveVocabularyConcept,
    onUnresolvedRow: (row) => {
      console.warn(
        `loadReviewQueue: skipped unresolved concept for progress row "${row.id}" (word "${row.wordId}", target language "${targetLanguage}").`,
      );
    },
  });

  const queue: ResolvedReviewQueueItem[] = items.map(({ row, source, resolved }) => ({
    ...resolved,
    progressRowId: row.id,
    conceptId: row.wordId,
    wordState: row.wordState,
    correctStreak: row.correctStreak,
    lastPracticedAt: row.lastPracticedAt,
    nextReviewAt: row.nextReviewAt,
    selectionSource: source,
  }));

  return { queue, metadata };
}
