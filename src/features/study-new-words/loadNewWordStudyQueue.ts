// Orchestrates Phase 1 of Study New Words: combines (1) Supabase progress/
// stats reads, (2) the arranged-vocabulary + per-language vocabulary.json
// data, and (3) the pure selection logic into one ready-to-render queue.
// Read-only — this module performs no Supabase writes.
import type { StoredSupabaseSession } from "../../lib/supabaseAuth";
import type { LanguageLevelCode } from "../../lib/userProfile";
import { readStudiedConceptIds, readTodayNewWordsCompleted } from "../../lib/newWordProgress";
import { getCurrentLearningDate } from "../../lib/learningDate";
import {
  computeRemainingDailyTarget,
  filterEligibleArrangedEntries,
  parseArrangedVocabulary,
  selectNewWordStudyQueue,
  type ArrangedVocabularyEntry,
  type NewWordStudyQueueResult,
} from "../../data/learning/newWordStudyQueue";
import { buildVocabularyConceptResolver } from "../../data/vocabulary/resolveVocabularyWordData";
import arrangedVocabularyRaw from "../../data/learning/vocabulary_aranged.json";

// Same per-UI-code dynamic-import map VocabularyPractice.tsx uses for the
// ordinary practice flow — duplicated (not imported) because that map is a
// private module-level constant there, not an exported utility.
const VOCABULARY_IMPORTERS: Record<string, () => Promise<{ default: unknown[] }>> = {
  en: () => import("../../data/vocabulary/english/vocabulary.json"),
  es: () => import("../../data/vocabulary/spanish/vocabulary.json"),
  fr: () => import("../../data/vocabulary/french/vocabulary.json"),
  de: () => import("../../data/vocabulary/german/vocabulary.json"),
  it: () => import("../../data/vocabulary/italian/vocabulary.json"),
  pt: () => import("../../data/vocabulary/portuguese/vocabulary.json"),
  ru: () => import("../../data/vocabulary/russian/vocabulary.json"),
};

// Same per-UI-code dynamic-import map VocabularyPractice.tsx uses to look up
// each concept's inflected/separable word forms for its own target language
// — duplicated for the same reason VOCABULARY_IMPORTERS above is.
const INFLECTED_IMPORTERS: Record<string, () => Promise<{ default: unknown[] }>> = {
  en: () => import("../../data/inflected/english/inflected.json"),
  es: () => import("../../data/inflected/spanish/inflected.json"),
  fr: () => import("../../data/inflected/french/inflected.json"),
  de: () => import("../../data/inflected/german/inflected.json"),
  it: () => import("../../data/inflected/italian/inflected.json"),
  pt: () => import("../../data/inflected/portuguese/inflected.json"),
  ru: () => import("../../data/inflected/russian/inflected.json"),
};

// Parsed/sorted/deduped once per module load (the arranged file doesn't
// change at runtime) instead of on every call, to avoid re-sorting ~10k
// entries on each queue load.
let cachedArrangedEntries: ArrangedVocabularyEntry[] | null = null;
function getArrangedEntries(): ArrangedVocabularyEntry[] {
  if (!cachedArrangedEntries) {
    const { entries, warnings } = parseArrangedVocabulary(arrangedVocabularyRaw);
    warnings.forEach((warning) => console.warn(warning));
    cachedArrangedEntries = entries;
  }
  return cachedArrangedEntries;
}

export interface LoadNewWordStudyQueueParams {
  session: StoredSupabaseSession;
  targetLanguage: string;
  nativeLanguage: string;
  dailyGoal: number;
  // The learner's user_profiles.current_level (already resolved/normalized
  // by the caller — see src/lib/userProfile.ts's normalizeLanguageLevel).
  // Determines the minimum CEFR level this default new-word queue selects
  // from; missing/"" fails safe to no threshold inside
  // filterEligibleArrangedEntries/selectNewWordStudyQueue (equivalent to
  // A1 — see that module's resolveMinLevelRank).
  currentLevel?: LanguageLevelCode | "" | null;
}

export async function loadNewWordStudyQueue({
  session,
  targetLanguage,
  nativeLanguage,
  dailyGoal,
  currentLevel,
}: LoadNewWordStudyQueueParams): Promise<NewWordStudyQueueResult> {
  if (!VOCABULARY_IMPORTERS[targetLanguage] || !VOCABULARY_IMPORTERS[nativeLanguage]) {
    throw new Error(`loadNewWordStudyQueue: unsupported language pair "${targetLanguage}"/"${nativeLanguage}".`);
  }

  const statDateISO = await getCurrentLearningDate(session);
  const arrangedEntries = getArrangedEntries();
  // "" (profile loaded but no valid level, which the DB's NOT NULL + CHECK
  // constraint should already prevent post-onboarding) normalizes to null
  // here so downstream code has one "no value" representation, not two.
  const resolvedCurrentLevel = currentLevel ? currentLevel : null;

  const [studiedConceptIds, wordsCompletedToday] = await Promise.all([
    readStudiedConceptIds(session, targetLanguage),
    readTodayNewWordsCompleted(session, targetLanguage, statDateISO),
  ]);

  const remainingToday = computeRemainingDailyTarget(dailyGoal, wordsCompletedToday);
  const eligibleEntries = filterEligibleArrangedEntries(arrangedEntries, studiedConceptIds, resolvedCurrentLevel);

  // Skip the vocabulary.json import entirely when there is nothing to
  // resolve — either today's goal is already met or this language's
  // arranged sequence is exhausted. selectNewWordStudyQueue still computes
  // the correct metadata (remainingToday / eligibleUnseenConceptsRemaining /
  // isArrangedVocabularyExhausted) from arrangedEntries + studiedConceptIds
  // alone, so the fallback resolver below is guaranteed to never be called.
  if (remainingToday === 0 || eligibleEntries.length === 0) {
    return selectNewWordStudyQueue({
      arrangedEntries,
      studiedConceptIds,
      dailyGoal,
      wordsCompletedToday,
      currentLevel: resolvedCurrentLevel,
      resolveConcept: () => null,
    });
  }

  const [targetModule, nativeModule, targetInflectedModule] = await Promise.all([
    VOCABULARY_IMPORTERS[targetLanguage](),
    VOCABULARY_IMPORTERS[nativeLanguage](),
    // Optional: not every target language has an inflected.json, and a
    // missing/failed import must not block the word-info card from
    // rendering — it only loses the highlighted-word forms in that case.
    INFLECTED_IMPORTERS[targetLanguage]?.().catch(() => ({ default: [] })) ??
      Promise.resolve({ default: [] }),
  ]);

  const resolveConcept = buildVocabularyConceptResolver(
    Array.isArray(targetModule.default) ? targetModule.default : [],
    Array.isArray(nativeModule.default) ? nativeModule.default : [],
    Array.isArray(targetInflectedModule.default) ? targetInflectedModule.default : [],
  );

  return selectNewWordStudyQueue({
    arrangedEntries,
    studiedConceptIds,
    dailyGoal,
    wordsCompletedToday,
    currentLevel: resolvedCurrentLevel,
    resolveConcept,
    onUnresolvedConcept: (entry) => {
      console.warn(
        `loadNewWordStudyQueue: skipped unresolved concept "${entry.conceptId}" (learningOrder ${entry.learningOrder}) for target language "${targetLanguage}".`,
      );
    },
  });
}
