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
}

export const ENGLISH_VERB_LIST_ITEMS = englishVerbListJson as EnglishVerbListItem[];
const ENGLISH_VOCABULARY_ITEMS = englishVocabularyJson as EnglishVocabularyItem[];
const UNRESOLVED_WORD_PAGE_IDS = new Set(["A1-00008", "A1-00021"]);
const definitionById = new Map(
  ENGLISH_VOCABULARY_ITEMS.map((item) => [
    String(item.concept_id ?? "").trim(),
    String(item.definiton ?? "").trim(),
  ]).filter(([conceptId]) => conceptId.length > 0),
);

export function canLinkEnglishVerbListItem(id: string): boolean {
  // These two source rows do not match a current English vocabulary concept_id,
  // so we intentionally avoid emitting broken word-page links for them.
  return !UNRESOLVED_WORD_PAGE_IDS.has(String(id).trim());
}

export function getEnglishVerbDefinition(id: string): string {
  return definitionById.get(String(id).trim()) ?? "";
}
