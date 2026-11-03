import type { VocabularyLevelPageModel } from "../../data/seo/vocabularyLevels/levelContent";
import type { FaqItem } from "./seoTemplates";

// The one list of FAQ items a vocabulary-level page shows. Both the visible
// FAQ section and the FAQPage JSON-LD read it, so the structured data can
// never describe questions the page does not display.
//
// Only editorial FAQ content counts (the v2 schema's `faq` array). Legacy
// entries have none, so they render no FAQ section and no FAQPage node; the
// former generated questions merely repeated other paragraphs of the page.
export function getVocabularyFaqItems(model: VocabularyLevelPageModel): FaqItem[] {
  return model.faq
    .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0);
}
