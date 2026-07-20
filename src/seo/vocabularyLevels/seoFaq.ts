import type { UiLanguageCode } from "../../data/seo/shared/slugs";
import type { VocabularyLevelContent } from "../../data/seo/vocabularyLevels";
import { FAQ_QUESTION_TEMPLATES, FAQ_SECTION_HEADING, type FaqItem } from "../seoTemplates";

export function buildVocabularyFaqSection(
  uiLang: UiLanguageCode,
  languageName: string,
  levelDisplay: string,
  levelContent: VocabularyLevelContent,
  wordsUnit: string,
): { heading: string; items: FaqItem[] } {
  const templates = FAQ_QUESTION_TEMPLATES[uiLang] ?? FAQ_QUESTION_TEMPLATES.en;
  const topics = levelContent.vocabularyScope.groups
    ? levelContent.vocabularyScope.groups.flatMap((g) => g.items)
    : levelContent.vocabularyScope.topics;

  return {
    heading: FAQ_SECTION_HEADING[uiLang] ?? FAQ_SECTION_HEADING.en,
    items: [
      {
        question: templates.whatVocab(languageName, levelDisplay),
        answer: levelContent.levelExplanation.paragraph,
      },
      {
        question: templates.howManyWords(languageName, levelDisplay),
        answer: `${levelContent.wordCount.text} ${levelContent.wordCount.value}+ ${wordsUnit}.`,
      },
      {
        question: templates.whatTopics(languageName, levelDisplay),
        answer: topics.join(", ") + ".",
      },
    ],
  };
}
