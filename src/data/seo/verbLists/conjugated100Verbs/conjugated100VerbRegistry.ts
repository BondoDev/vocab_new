import conjugatedVerbFormsContentJson from "./conjugated100VerbsContent.json";
import {
  getUiVocabularyLanguage,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../shared/slugs";
import {
  buildConjugatedVerbFormsContentLookup,
  getConjugatedVerbFormsContentEntry,
  type ConjugatedVerbFormsContentEntry,
} from "./conjugated100VerbRouteHelpers";

const CONJUGATED_VERB_FORMS_CONTENT_LOOKUP =
  buildConjugatedVerbFormsContentLookup(conjugatedVerbFormsContentJson);

export function getConjugatedVerbFormsContent(
  targetLanguage: TargetLanguageSlug,
  uiLanguage: UiLanguageCode,
): ConjugatedVerbFormsContentEntry | null {
  const targetLanguageCode = TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage];
  return getConjugatedVerbFormsContentEntry(
    CONJUGATED_VERB_FORMS_CONTENT_LOOKUP,
    targetLanguageCode,
    uiLanguage,
  );
}

export function getConjugatedVerbFormsPath(
  targetLanguage: TargetLanguageSlug,
  uiLanguage: UiLanguageCode,
): string | null {
  const content = getConjugatedVerbFormsContent(targetLanguage, uiLanguage);
  return content?.urlSlug ? `/${uiLanguage}/${content.urlSlug}` : null;
}

export function getAllConjugatedVerbFormsPaths(): string[] {
  const paths: string[] = [];

  for (const entry of CONJUGATED_VERB_FORMS_CONTENT_LOOKUP.values()) {
    if (entry.urlSlug) {
      paths.push(`/${entry.uiLanguage}/${entry.urlSlug}`);
    }
  }

  return paths;
}

export function resolveConjugatedVerbFormsRoute(
  path: string,
): { uiLang: UiLanguageCode; targetLanguage: TargetLanguageSlug } | null {
  for (const entry of CONJUGATED_VERB_FORMS_CONTENT_LOOKUP.values()) {
    if (entry.urlSlug && `/${entry.uiLanguage}/${entry.urlSlug}` === path) {
      return {
        uiLang: entry.uiLanguage,
        targetLanguage: getUiVocabularyLanguage(entry.targetLanguage),
      };
    }
  }

  return null;
}
