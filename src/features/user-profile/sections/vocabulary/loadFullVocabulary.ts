// Resolves the FULL vocabulary set for a target/native language pair —
// every concept the target language's vocabulary.json knows about that also
// has a matching native-language entry — independent of any
// user_word_progress row. This is the corrective My Lists phase's
// counterpart to loadVocabularyProgress.ts: that module resolves only the
// concepts a user has *already studied* (filtered by their progress rows);
// this one resolves every concept the language *has*, because a list must
// be able to contain any vocabulary word, studied or not (see
// supabase/README.md's "My Lists Corrective Phase" section).
//
// Deliberately reuses the exact same dynamic-import map shape and
// buildVocabularyConceptResolver call loadVocabularyProgress.ts already
// uses — no second vocabulary source, no second resolution algorithm, only
// a different enumeration of which concept ids to resolve (every concept
// the target language's vocabulary.json has, via listResolvableConceptIds,
// instead of a caller-supplied progress-row set).
import { buildVocabularyConceptResolver, listResolvableConceptIds } from "../../../../data/vocabulary/resolveVocabularyWordData";

// Same per-UI-code dynamic-import map loadVocabularyProgress.ts,
// loadNewWordStudyQueue.ts, and VocabularyPractice.tsx each already keep as
// their own private module-level constant — duplicated here rather than
// imported/shared for the same reason those files' own header comments
// give: each is a private constant in its own file, not a shared utility.
const VOCABULARY_IMPORTERS: Record<string, () => Promise<{ default: unknown[] }>> = {
  en: () => import("../../../../data/vocabulary/english/vocabulary.json"),
  es: () => import("../../../../data/vocabulary/spanish/vocabulary.json"),
  fr: () => import("../../../../data/vocabulary/french/vocabulary.json"),
  de: () => import("../../../../data/vocabulary/german/vocabulary.json"),
  it: () => import("../../../../data/vocabulary/italian/vocabulary.json"),
  pt: () => import("../../../../data/vocabulary/portuguese/vocabulary.json"),
  ru: () => import("../../../../data/vocabulary/russian/vocabulary.json"),
};

export interface FullVocabularyConceptRow {
  conceptId: string;
  targetWord: string;
  translation: string;
  level?: string;
  grammarType?: string;
}

export interface LoadFullVocabularyParams {
  // Always the LIST's own target_language, never necessarily "whatever
  // language is currently active elsewhere in the app" — see this file's
  // own callers (ListDetailView) and the README's "language isolation"
  // note for why that distinction matters even though the two happen to
  // coincide for every list visible today.
  targetLanguage: string;
  nativeLanguage: string;
}

// Returns every resolvable concept for the language pair, in the target
// language's own vocabulary.json order. A concept missing a native-language
// entry is skipped (never partially resolved) — the exact same rule
// buildVocabularyConceptResolver already enforces for every other caller.
export async function loadFullVocabularyForLanguagePair({
  targetLanguage,
  nativeLanguage,
}: LoadFullVocabularyParams): Promise<FullVocabularyConceptRow[]> {
  if (!VOCABULARY_IMPORTERS[targetLanguage] || !VOCABULARY_IMPORTERS[nativeLanguage]) {
    throw new Error(`loadFullVocabularyForLanguagePair: unsupported language pair "${targetLanguage}"/"${nativeLanguage}".`);
  }

  const [targetModule, nativeModule] = await Promise.all([
    VOCABULARY_IMPORTERS[targetLanguage](),
    VOCABULARY_IMPORTERS[nativeLanguage](),
  ]);

  const targetEntries = Array.isArray(targetModule.default) ? targetModule.default : [];
  const nativeEntries = Array.isArray(nativeModule.default) ? nativeModule.default : [];

  const resolveConcept = buildVocabularyConceptResolver(targetEntries, nativeEntries);
  const conceptIds = listResolvableConceptIds(targetEntries);

  const rows: FullVocabularyConceptRow[] = [];
  for (const conceptId of conceptIds) {
    const resolved = resolveConcept(conceptId);
    // Only reachable when the native-language side lacks this concept
    // (the target side already has it, by construction of conceptIds) —
    // silently skipped, no console warning: unlike loadVocabularyProgress's
    // per-progress-row skip (a persisted row referencing an unresolvable
    // concept is a genuine data anomaly worth logging), this is simply "the
    // language pair's shared vocabulary is smaller than one side alone,"
    // an ordinary and expected outcome, not a warning-worthy one.
    if (!resolved) continue;

    rows.push({
      conceptId,
      targetWord: resolved.targetWord,
      translation: resolved.translation,
      level: resolved.level,
      grammarType: resolved.grammarType,
    });
  }

  return rows;
}
