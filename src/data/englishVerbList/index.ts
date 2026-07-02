import englishVerbListJson from "../lists/list_of_100_most_used_verb.json";
import englishVocabularyJson from "../vocabulary/english/vocabulary.json";

export {
  getAllEnglishVerbListPaths,
  getEnglishVerbListContent,
  getEnglishVerbListPath,
  resolveEnglishVerbListRoute,
  type EnglishVerbListContent,
  type EnglishVerbListFaqItem,
} from "./routes";

export interface EnglishVerbListItem {
  id: string;
  verb: string;
}

interface EnglishVocabularyItem {
  concept_id?: string | null;
  definiton?: string | null;
  word_lemma?: string | null;
}

export const ENGLISH_VERB_LIST_ITEMS = englishVerbListJson as EnglishVerbListItem[];
const ENGLISH_VOCABULARY_ITEMS = englishVocabularyJson as EnglishVocabularyItem[];
const vocabularyById = new Map(
  ENGLISH_VOCABULARY_ITEMS.map((item) => [
    String(item.concept_id ?? "").trim(),
    {
      definition: String(item.definiton ?? "").trim(),
      wordLemma: String(item.word_lemma ?? "").trim(),
    },
  ]).filter(([conceptId]) => conceptId.length > 0),
);
const definitionById = new Map(
  Array.from(vocabularyById.entries(), ([conceptId, item]) => [conceptId, item.definition]),
);

export function canLinkEnglishVerbListItem(id: string): boolean {
  return Boolean(vocabularyById.get(String(id).trim())?.wordLemma);
}

export function getEnglishVerbDefinition(id: string): string {
  return definitionById.get(String(id).trim()) ?? "";
}

export function getEnglishVerbWordLemma(id: string): string {
  return vocabularyById.get(String(id).trim())?.wordLemma ?? "";
}
