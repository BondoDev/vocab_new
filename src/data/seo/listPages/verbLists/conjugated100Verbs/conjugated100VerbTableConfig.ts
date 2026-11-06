import { type TargetLanguageSlug } from "../../../shared/slugs";
import { hasConjugatedVerbFormsData } from "./conjugated100VerbFormsData";

export interface ConjugatedVerbFormsTableConfig {
  isTableReady: boolean;
}

export function getConjugatedVerbFormsTableConfig(
  targetLanguage: TargetLanguageSlug,
): ConjugatedVerbFormsTableConfig {
  return {
    // From the data file's existence, not its loaded rows, so this stays
    // synchronous and never triggers the per-language download.
    isTableReady: hasConjugatedVerbFormsData(targetLanguage),
  };
}
