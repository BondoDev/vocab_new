// Centralized per-target-language configuration for the future past-verb-
// forms table's linguistic-dataset readiness. Column identity, order, and
// localized labels are NOT owned here — that responsibility belongs to each
// content record's own `pastForms`/`tableColumns` fields (see
// pastForms100VerbRouteHelpers.ts), since those are localized per
// (targetLanguage, uiLanguage) combination, not per target language alone.
// This module only tracks whether a target language's actual verb-form row
// dataset exists yet — a separate, non-localized, linguistic-domain concern.
import { SUPPORTED_TARGET_LANGUAGES, type TargetLanguageSlug } from "../../shared/slugs";

export interface PastVerbFormsTableConfig {
  isTableReady: boolean;
  supportsRegularIrregularSplit: boolean;
}

function createDefaultTableConfig(): PastVerbFormsTableConfig {
  return {
    isTableReady: false,
    supportsRegularIrregularSplit: false,
  };
}

export const PAST_VERB_FORMS_TABLE_CONFIG: Record<TargetLanguageSlug, PastVerbFormsTableConfig> =
  Object.fromEntries(
    SUPPORTED_TARGET_LANGUAGES.map((targetLanguage) => [targetLanguage, createDefaultTableConfig()]),
  ) as Record<TargetLanguageSlug, PastVerbFormsTableConfig>;

export function getPastVerbFormsTableConfig(targetLanguage: TargetLanguageSlug): PastVerbFormsTableConfig {
  return PAST_VERB_FORMS_TABLE_CONFIG[targetLanguage];
}
