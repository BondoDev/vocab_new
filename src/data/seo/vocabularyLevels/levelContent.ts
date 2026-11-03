// Editorial-content compatibility layer for the CEFR vocabulary-level pages.
//
// seo-cefr-content.json holds one hand-authored `content` object per page
// (UI language x target language x level). Two shapes are supported side by
// side so entries can be replaced one at a time:
//   - "legacy": the original shape (`VocabularyLevelContent`, recognised by
//     its `levelExplanation` object). Every current entry uses it.
//   - "v2": the new editorial schema (recognised by its `hero` object).
// An object carrying both markers is rejected as ambiguous.
//
// resolveVocabularyLevelPageModel() maps either shape onto the one model the
// page renders. The legacy mapping only *places* existing fields; it never
// rewrites or invents copy. Legacy fields with no faithful place in the new
// layout are deliberately not shown:
//   - wordCount (inflated estimates that contradict the real word list),
//   - sampleVocabulary (hand-picked rows that often sit at another CEFR level
//     in FluentStellar's own data; the explorer shows the real list instead),
//   - internalNavigation.heading and ctaText (replaced by shared, localized
//     labels — see cefrPageCopy.ts),
// and the FAQ section stays empty for legacy entries, because their only
// "answers" were copies of other paragraphs on the same page.
//
// Free of import.meta so validation runs directly under Node
// (scripts/tests/architecture/test-vocabulary-level-content-coverage.mjs).
import type { VocabularyLevelContent as LegacyVocabularyLevelContent } from "./index";

export type { LegacyVocabularyLevelContent };

export interface VocabularyLevelContentV2 {
  metaTitle: string;
  metaDescription: string;
  hero: {
    title: string;
    introduction: string;
  };
  levelGuide: {
    heading: string;
    paragraphs: string[];
    learningOutcomes: string[];
  };
  topicGuide: {
    heading: string;
    introduction: string;
    topics: Array<{ name: string; description: string }>;
  };
  studyAdvice: {
    heading: string;
    tips: string[];
  };
  // May be empty: the FAQ section and its FAQPage schema are then omitted.
  faq: Array<{ question: string; answer: string }>;
  finalCta: {
    heading: string;
    description: string;
  };
}

export type VocabularyLevelEditorialContent = LegacyVocabularyLevelContent | VocabularyLevelContentV2;
export type VocabularyLevelContentFormat = "legacy" | "v2";

export interface VocabularyLevelPageModel {
  format: VocabularyLevelContentFormat;
  metaTitle: string;
  metaDescription: string;
  hero: {
    title: string;
    introduction: string;
  };
  levelGuide: {
    heading: string;
    // Legacy only: the entry's one-sentence `levelDescription`, shown as a
    // lead above the paragraphs. Null for v2 (its paragraphs cover it).
    lead: string | null;
    paragraphs: string[];
    learningOutcomes: string[];
  };
  topicGuide: {
    heading: string;
    introduction: string[];
    // v2: named topics with a description each.
    topics: Array<{ name: string; description: string }>;
    // Legacy: headed groups of short items (vocabularyScope.groups).
    groups: Array<{ heading: string; items: string[] }>;
  };
  studyAdvice: { heading: string; tips: string[] } | null;
  faq: Array<{ question: string; answer: string }>;
  finalCta: {
    heading: string | null;
    description: string | null;
  };
}

type Problems = string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkText(problems: Problems, value: unknown, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    problems.push(`${path} must be a non-empty string`);
  }
}

function checkTextList(problems: Problems, value: unknown, path: string, { allowEmpty = false } = {}): void {
  if (!Array.isArray(value)) {
    problems.push(`${path} must be an array of strings`);
    return;
  }
  if (!allowEmpty && value.length === 0) {
    problems.push(`${path} must not be empty`);
  }
  value.forEach((item, index) => checkText(problems, item, `${path}[${index}]`));
}

export function detectVocabularyLevelContentFormat(content: unknown): VocabularyLevelContentFormat | null {
  if (!isRecord(content)) {
    return null;
  }
  const isV2 = isRecord(content.hero);
  const isLegacy = isRecord(content.levelExplanation);
  if (isV2 === isLegacy) {
    return null;
  }
  return isV2 ? "v2" : "legacy";
}

function validateLegacy(content: Record<string, unknown>, problems: Problems): void {
  checkText(problems, content.title, "title");
  checkText(problems, content.metaTitle, "metaTitle");
  checkText(problems, content.metaDescription, "metaDescription");
  checkText(problems, content.intro, "intro");
  checkText(problems, content.levelDescription, "levelDescription");
  if (content.introParagraphs !== undefined) {
    checkTextList(problems, content.introParagraphs, "introParagraphs", { allowEmpty: true });
  }

  const levelExplanation = content.levelExplanation as Record<string, unknown>;
  checkText(problems, levelExplanation.heading, "levelExplanation.heading");
  checkText(problems, levelExplanation.paragraph, "levelExplanation.paragraph");
  checkTextList(problems, levelExplanation.bullets, "levelExplanation.bullets");

  const scope = content.vocabularyScope;
  if (!isRecord(scope)) {
    problems.push("vocabularyScope must be an object");
  } else {
    checkText(problems, scope.heading, "vocabularyScope.heading");
    if (scope.groups !== undefined) {
      if (!Array.isArray(scope.groups) || scope.groups.length === 0) {
        problems.push("vocabularyScope.groups must be a non-empty array when present");
      } else {
        scope.groups.forEach((group, index) => {
          if (!isRecord(group)) {
            problems.push(`vocabularyScope.groups[${index}] must be an object`);
            return;
          }
          checkText(problems, group.heading, `vocabularyScope.groups[${index}].heading`);
          checkTextList(problems, group.items, `vocabularyScope.groups[${index}].items`);
        });
      }
    } else {
      checkTextList(problems, scope.topics, "vocabularyScope.topics");
    }
  }

  if (content.bottomCta !== undefined) {
    if (!isRecord(content.bottomCta)) {
      problems.push("bottomCta must be an object when present");
    } else {
      if (content.bottomCta.heading !== undefined) checkText(problems, content.bottomCta.heading, "bottomCta.heading");
      if (content.bottomCta.text !== undefined) checkText(problems, content.bottomCta.text, "bottomCta.text");
    }
  }
}

function validateV2(content: Record<string, unknown>, problems: Problems): void {
  checkText(problems, content.metaTitle, "metaTitle");
  checkText(problems, content.metaDescription, "metaDescription");

  const hero = content.hero as Record<string, unknown>;
  checkText(problems, hero.title, "hero.title");
  checkText(problems, hero.introduction, "hero.introduction");

  if (!isRecord(content.levelGuide)) {
    problems.push("levelGuide must be an object");
  } else {
    checkText(problems, content.levelGuide.heading, "levelGuide.heading");
    checkTextList(problems, content.levelGuide.paragraphs, "levelGuide.paragraphs");
    checkTextList(problems, content.levelGuide.learningOutcomes, "levelGuide.learningOutcomes");
  }

  if (!isRecord(content.topicGuide)) {
    problems.push("topicGuide must be an object");
  } else {
    checkText(problems, content.topicGuide.heading, "topicGuide.heading");
    checkText(problems, content.topicGuide.introduction, "topicGuide.introduction");
    const topics = content.topicGuide.topics;
    if (!Array.isArray(topics) || topics.length === 0) {
      problems.push("topicGuide.topics must be a non-empty array");
    } else {
      topics.forEach((topic, index) => {
        if (!isRecord(topic)) {
          problems.push(`topicGuide.topics[${index}] must be an object`);
          return;
        }
        checkText(problems, topic.name, `topicGuide.topics[${index}].name`);
        checkText(problems, topic.description, `topicGuide.topics[${index}].description`);
      });
    }
  }

  if (!isRecord(content.studyAdvice)) {
    problems.push("studyAdvice must be an object");
  } else {
    checkText(problems, content.studyAdvice.heading, "studyAdvice.heading");
    checkTextList(problems, content.studyAdvice.tips, "studyAdvice.tips");
  }

  if (!Array.isArray(content.faq)) {
    problems.push("faq must be an array (use [] until answers are written)");
  } else {
    const questions = new Set<string>();
    content.faq.forEach((item, index) => {
      if (!isRecord(item)) {
        problems.push(`faq[${index}] must be an object`);
        return;
      }
      checkText(problems, item.question, `faq[${index}].question`);
      checkText(problems, item.answer, `faq[${index}].answer`);
      if (typeof item.question === "string") {
        if (questions.has(item.question.trim())) problems.push(`faq[${index}].question is duplicated`);
        questions.add(item.question.trim());
      }
    });
  }

  if (!isRecord(content.finalCta)) {
    problems.push("finalCta must be an object");
  } else {
    checkText(problems, content.finalCta.heading, "finalCta.heading");
    checkText(problems, content.finalCta.description, "finalCta.description");
  }
}

export interface VocabularyLevelContentValidation {
  format: VocabularyLevelContentFormat | null;
  problems: string[];
}

// Validates one entry's `content` against whichever schema it declares by
// shape. An empty `problems` list means resolveVocabularyLevelPageModel()
// will render it.
export function validateVocabularyLevelContent(content: unknown): VocabularyLevelContentValidation {
  const format = detectVocabularyLevelContentFormat(content);
  if (!format) {
    return {
      format: null,
      problems: [
        "content must be an object with exactly one of `hero` (v2 schema) or `levelExplanation` (legacy schema)",
      ],
    };
  }
  const problems: Problems = [];
  if (format === "v2") {
    validateV2(content as Record<string, unknown>, problems);
  } else {
    validateLegacy(content as Record<string, unknown>, problems);
  }
  return { format, problems };
}

function fromLegacy(content: LegacyVocabularyLevelContent): VocabularyLevelPageModel {
  const groups =
    content.vocabularyScope.groups && content.vocabularyScope.groups.length > 0
      ? content.vocabularyScope.groups
      : [{ heading: "", items: content.vocabularyScope.topics }];
  return {
    format: "legacy",
    metaTitle: content.metaTitle ?? content.title,
    metaDescription: content.metaDescription ?? "",
    hero: {
      title: content.title,
      introduction: content.intro,
    },
    levelGuide: {
      heading: content.levelExplanation.heading,
      lead: content.levelDescription || null,
      paragraphs: [content.levelExplanation.paragraph],
      learningOutcomes: content.levelExplanation.bullets,
    },
    topicGuide: {
      heading: content.vocabularyScope.heading,
      // The longer introduction paragraphs describe which vocabulary the
      // level focuses on, so they introduce the topic section rather than
      // sitting above the word list.
      introduction: content.introParagraphs ?? [],
      topics: [],
      groups,
    },
    studyAdvice: null,
    faq: [],
    finalCta: {
      heading: content.bottomCta?.heading ?? null,
      description: content.bottomCta?.text ?? null,
    },
  };
}

function fromV2(content: VocabularyLevelContentV2): VocabularyLevelPageModel {
  return {
    format: "v2",
    metaTitle: content.metaTitle,
    metaDescription: content.metaDescription,
    hero: content.hero,
    levelGuide: { ...content.levelGuide, lead: null },
    topicGuide: {
      heading: content.topicGuide.heading,
      introduction: [content.topicGuide.introduction],
      topics: content.topicGuide.topics,
      groups: [],
    },
    studyAdvice: content.studyAdvice,
    faq: content.faq,
    finalCta: content.finalCta,
  };
}

// Returns null for content that fails validation, so a malformed entry
// renders the existing "content unavailable" page instead of a broken one.
export function resolveVocabularyLevelPageModel(content: unknown): VocabularyLevelPageModel | null {
  const { format, problems } = validateVocabularyLevelContent(content);
  if (!format || problems.length > 0) {
    return null;
  }
  return format === "v2"
    ? fromV2(content as VocabularyLevelContentV2)
    : fromLegacy(content as LegacyVocabularyLevelContent);
}
