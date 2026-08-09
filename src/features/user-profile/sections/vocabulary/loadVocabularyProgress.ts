// Orchestrates Phase 4's Vocabulary page data: (1) the full set of a user's
// user_word_progress rows for one target language — as of Phase 1 of the
// profile-section data optimization, passed in already-loaded from
// UserProfileDashboardPage's shared useProfileSharedProgressData rather
// than fetched here (see that hook's own header) — (2) the per-language
// vocabulary.json data, and (3) Study New Words' own concept-resolution
// utility, into one ready-to-render result. Read-only; Favorites writes go
// through updateWordProgressFavorite in lib/newWordProgress.ts instead.
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import {
  computeVocabularyCounts,
  mapWordStateToVocabularyCategory,
  type VocabularyCategory,
  type VocabularyCounts,
} from "../../../../data/learning/vocabularyCategory";
import { buildVocabularyConceptResolver } from "../../../../data/vocabulary/resolveVocabularyWordData";

// Same per-UI-code dynamic-import map loadNewWordStudyQueue.ts (Study New
// Words) and VocabularyPractice.tsx (ordinary practice) each already keep as
// their own private module-level constant — duplicated here rather than
// imported/shared for the same reason loadNewWordStudyQueue.ts's own header
// comment gives: each is a private constant in its own file, not a shared
// utility, and a third small copy is simpler than introducing a new shared
// module for it.
const VOCABULARY_IMPORTERS: Record<string, () => Promise<{ default: unknown[] }>> = {
  en: () => import("../../../../data/vocabulary/english/vocabulary.json"),
  es: () => import("../../../../data/vocabulary/spanish/vocabulary.json"),
  fr: () => import("../../../../data/vocabulary/french/vocabulary.json"),
  de: () => import("../../../../data/vocabulary/german/vocabulary.json"),
  it: () => import("../../../../data/vocabulary/italian/vocabulary.json"),
  pt: () => import("../../../../data/vocabulary/portuguese/vocabulary.json"),
  ru: () => import("../../../../data/vocabulary/russian/vocabulary.json"),
};

export interface ResolvedVocabularyRow {
  // user_word_progress.id — used as the row key and as the target of
  // favorite updates.
  id: string;
  conceptId: string;
  targetWord: string;
  translation: string;
  level?: string;
  category: VocabularyCategory;
  isFavorite: boolean;
  lastPracticedAt: string | null;
}

export interface LoadVocabularyProgressParams {
  // Already-loaded rows for the active target language — see this file's
  // own header. Callers must not pass rows for a different language than
  // targetLanguage below; UserProfileDashboardPage's shared hook already
  // guarantees this (it resets the rows on a target-language change), so
  // this function itself performs no cross-check.
  progressRows: UserWordProgressFullRow[];
  targetLanguage: string;
  nativeLanguage: string;
}

export interface VocabularyProgressResult {
  rows: ResolvedVocabularyRow[];
  counts: VocabularyCounts;
}

// Missing-concept handling: counts are computed from every persisted
// progress row (see computeVocabularyCounts) before any vocabulary.json
// resolution happens, so an unresolved concept still counts toward its
// category/favorites. Only the *visible list* skips it, with a development
// warning naming the progress row id, concept id, and target language.
export async function loadVocabularyProgress({
  progressRows,
  targetLanguage,
  nativeLanguage,
}: LoadVocabularyProgressParams): Promise<VocabularyProgressResult> {
  if (!VOCABULARY_IMPORTERS[targetLanguage] || !VOCABULARY_IMPORTERS[nativeLanguage]) {
    throw new Error(`loadVocabularyProgress: unsupported language pair "${targetLanguage}"/"${nativeLanguage}".`);
  }

  const counts = computeVocabularyCounts(progressRows);

  // Skip the vocabulary.json import entirely when there is nothing to
  // resolve (new user / new language, zero progress rows) — counts are
  // already all-zero from the empty input above.
  if (progressRows.length === 0) {
    return { rows: [], counts };
  }

  const [targetModule, nativeModule] = await Promise.all([
    VOCABULARY_IMPORTERS[targetLanguage](),
    VOCABULARY_IMPORTERS[nativeLanguage](),
  ]);

  const resolveConcept = buildVocabularyConceptResolver(
    Array.isArray(targetModule.default) ? targetModule.default : [],
    Array.isArray(nativeModule.default) ? nativeModule.default : [],
  );

  const rows: ResolvedVocabularyRow[] = [];
  for (const progressRow of progressRows) {
    const resolved = resolveConcept(progressRow.wordId);
    if (!resolved) {
      console.warn(
        `loadVocabularyProgress: skipped unresolved concept for progress row "${progressRow.id}" (word_id "${progressRow.wordId}", target language "${targetLanguage}").`,
      );
      continue;
    }

    rows.push({
      id: progressRow.id,
      conceptId: progressRow.wordId,
      targetWord: resolved.targetWord,
      translation: resolved.translation,
      level: resolved.level,
      category: mapWordStateToVocabularyCategory(progressRow.wordState),
      isFavorite: progressRow.isFavorite,
      lastPracticedAt: progressRow.lastPracticedAt,
    });
  }

  return { rows, counts };
}
