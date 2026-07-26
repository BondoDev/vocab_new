// Centralized per-target-language readiness for the past-verb-forms table.
// Column identity, order, and localized labels are NOT owned here — that
// responsibility belongs to each content record's own `pastForms`/
// `tableColumns` fields (see pastForms100VerbRouteHelpers.ts), since those
// are localized per (targetLanguage, uiLanguage) combination. isTableReady
// is instead derived automatically from whether a target language has a row
// dataset in ./pastForms/ (see pastForms100VerbFormsData.ts) — a language
// becomes ready the moment its pastForms/{targetLanguage}.json file is
// added, with no manual flag to flip.
import { type TargetLanguageSlug } from "../../shared/slugs";
import { getPastVerbFormsRowsById } from "./pastForms100VerbFormsData";

export interface PastVerbFormsTableConfig {
  isTableReady: boolean;
  supportsRegularIrregularSplit: boolean;
}

export function getPastVerbFormsTableConfig(targetLanguage: TargetLanguageSlug): PastVerbFormsTableConfig {
  return {
    isTableReady: getPastVerbFormsRowsById(targetLanguage) !== null,
    supportsRegularIrregularSplit: false,
  };
}
