import type { TargetLanguageSlug, UiLanguageCode } from "./slugs";
import type { CefrLevelCode } from "../vocabularyLevels";
import { buildWordPath } from "./wordSlugs";
import { isValidBrowseWordLemma } from "./browseWordValidation";

interface VocabEntry {
  concept_id: string;
  word_lemma: string;
  level: string;
}

const vocabularyModules = import.meta.glob("../vocabulary/*/vocabulary.json", {
  eager: true,
}) as Record<string, { default: VocabEntry[] }>;

export interface BrowseWordLink {
  conceptId: string;
  href: string;
  word: string;
}

export function getLevelBrowseWordLinks(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: CefrLevelCode,
  limit = 0,
): BrowseWordLink[] {
  const key = `../vocabulary/${targetLanguage}/vocabulary.json`;
  const entries = vocabularyModules[key]?.default;
  if (!entries) {
    return [];
  }

  const normalizedLevel = level.toUpperCase();
  const seen = new Set<string>();
  const links: BrowseWordLink[] = [];

  for (const entry of entries) {
    if (entry.level !== normalizedLevel) continue;
    if (!isValidBrowseWordLemma(entry.word_lemma)) continue;
    if (typeof entry.concept_id !== "string" || seen.has(entry.concept_id)) continue;

    seen.add(entry.concept_id);
    links.push({
      conceptId: entry.concept_id,
      href: buildWordPath(uiLang, targetLanguage, entry.word_lemma, entry.concept_id),
      word: entry.word_lemma,
    });

    if (limit > 0 && links.length >= limit) {
      break;
    }
  }

  return links;
}
