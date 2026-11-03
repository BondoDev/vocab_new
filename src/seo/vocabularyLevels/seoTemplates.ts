// Vocabulary-level SEO types. The generated FAQ question templates, the
// "{count}+ words" title/description templates, and their unit tables were
// removed with the page redesign: the FAQ they produced only repeated other
// paragraphs of the same page, and the count claims contradicted the real
// word list. FAQ content now comes from editorial JSON only (see seoFaq.ts),
// and localized page labels live in src/data/seo/vocabularyLevels/cefrPageCopy.ts.

export interface FaqItem {
  question: string;
  answer: string;
}
