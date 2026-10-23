// Learning Resources registry: the launched, indexable educational pages for
// one (UI language, learning language) pair, read from each page family's
// own canonical route builder and launch flag. It deliberately holds no URLs
// of its own, so a page family that publishes, unpublishes, or renames a
// route shows up here without edits.
//
// Lives in src/app/ rather than src/data/seo/ because it reads the launch
// flags owned by src/seo/, and src/data/seo/ must not import from src/seo/.
//
// Inclusion rule: a resource appears only when its page family is launched
// (launched pages are indexable and in the XML sitemap) and its route
// builder returns a path for this UI language. That is what keeps the
// directory free of broken, noindex, or unpublished links.
import { getLevelTestContent, getLevelTestSeoPath } from "../../../data/seo/levelTests";
import {
  getFullVocabularyListContent,
  getFullVocabularyListPath,
} from "../../../data/seo/listPages/fullVocabularyList";
import {
  getConjugatedVerbFormsContent,
  getConjugatedVerbFormsPath,
  getPastVerbFormsContent,
  getPastVerbFormsPath,
  getVerbListPath,
  getVerbListTitle,
} from "../../../data/seo/listPages/verbLists";
import {
  SUPPORTED_LEVELS,
  SUPPORTED_TARGET_LANGUAGES,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../../data/seo/shared/slugs";
import { buildLocalizedVocabularyPath } from "../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import { getWordSeoHubSummaryPath } from "../../../data/seo/wordPages/wordHubRoutes";
import { FULL_VOCABULARY_LIST_LAUNCHED } from "../../../seo/listPages/fullVocabularyList/fullVocabularyListLaunchStatus";
import { CONJUGATED_VERB_FORMS_LAUNCHED } from "../../../seo/listPages/verbLists/conjugated100Verbs/conjugatedVerbFormsLaunchStatus";
import { PAST_VERB_FORMS_LAUNCHED } from "../../../seo/listPages/verbLists/pastForms100Verbs/pastVerbFormsLaunchStatus";

export type LearningResourceKind =
  | "fullVocabularyList"
  | "commonVerbs"
  | "conjugations"
  | "pastForms"
  | "levelTest";

export type LearningResourceGroup = "wordLists" | "verbs" | "levelCheck";

export interface LearningResourceLink {
  kind: LearningResourceKind;
  group: LearningResourceGroup;
  href: string;
  label: string;
}

export interface LevelResourceLink {
  level: Level;
  href: string;
}

export interface LanguageLearningResources {
  targetLanguage: TargetLanguageSlug;
  levels: LevelResourceLink[];
  resources: LearningResourceLink[];
  wordIndexHref: string;
}

function toLink(
  kind: LearningResourceKind,
  group: LearningResourceGroup,
  href: string | null | undefined,
  label: string | null | undefined,
): LearningResourceLink | null {
  return href && label ? { kind, group, href, label } : null;
}

export function getLanguageLearningResources(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): LanguageLearningResources {
  const levels = SUPPORTED_LEVELS.flatMap((level) => {
    const href = buildLocalizedVocabularyPath(uiLang, targetLanguage, level);
    return href ? [{ level, href }] : [];
  });

  // Order is user-visible: word lists, then verbs from base forms to
  // tenses, then the level test.
  const resources = [
    FULL_VOCABULARY_LIST_LAUNCHED
      ? toLink(
          "fullVocabularyList",
          "wordLists",
          getFullVocabularyListPath(targetLanguage, uiLang),
          getFullVocabularyListContent(targetLanguage, uiLang)?.entryButtonLabel,
        )
      : null,
    toLink(
      "commonVerbs",
      "verbs",
      getVerbListPath(targetLanguage, uiLang),
      getVerbListTitle(targetLanguage, uiLang),
    ),
    CONJUGATED_VERB_FORMS_LAUNCHED
      ? toLink(
          "conjugations",
          "verbs",
          getConjugatedVerbFormsPath(targetLanguage, uiLang),
          getConjugatedVerbFormsContent(targetLanguage, uiLang)?.entryButtonLabel,
        )
      : null,
    PAST_VERB_FORMS_LAUNCHED
      ? toLink(
          "pastForms",
          "verbs",
          getPastVerbFormsPath(targetLanguage, uiLang),
          getPastVerbFormsContent(targetLanguage, uiLang)?.entryButtonLabel,
        )
      : null,
    toLink(
      "levelTest",
      "levelCheck",
      getLevelTestSeoPath(uiLang, targetLanguage),
      getLevelTestContent(uiLang, targetLanguage)?.title,
    ),
  ].filter((link): link is LearningResourceLink => Boolean(link));

  return {
    targetLanguage,
    levels,
    resources,
    wordIndexHref: getWordSeoHubSummaryPath(uiLang, targetLanguage),
  };
}

export function getAllLanguageLearningResources(uiLang: UiLanguageCode): LanguageLearningResources[] {
  return SUPPORTED_TARGET_LANGUAGES.map((targetLanguage) =>
    getLanguageLearningResources(uiLang, targetLanguage),
  );
}

// Same-language resources for contextual "related" blocks on the resource
// pages themselves, minus the page being viewed and any links the caller
// already renders.
export function getRelatedLearningResources(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  excludeHrefs: Iterable<string | null | undefined> = [],
): LearningResourceLink[] {
  const excluded = new Set(Array.from(excludeHrefs).filter(Boolean));
  return getLanguageLearningResources(uiLang, targetLanguage).resources.filter(
    (link) => !excluded.has(link.href),
  );
}
