import { type TargetLanguageSlug } from "../../shared/slugs";
import { getConjugatedVerbFormsRowsById } from "./conjugated100VerbFormsData";

export interface ConjugatedVerbFormsTableConfig {
  isTableReady: boolean;
}

export function getConjugatedVerbFormsTableConfig(
  targetLanguage: TargetLanguageSlug,
): ConjugatedVerbFormsTableConfig {
  return {
    isTableReady: getConjugatedVerbFormsRowsById(targetLanguage) !== null,
  };
}
