// Pure explore-topic data builders extracted from App.tsx.
//
// These are plain functions of (uiLanguage, t) — no React state, no
// browser globals — so App.tsx can keep its existing useMemo calls (and
// their exact dependency arrays) while the data construction lives here.
//
// Auditability over deduplication: each target language keeps its own
// explicit builder with per-UI-language branches. The labels are
// human-reviewed SEO/UX copy in seven languages — every string must remain
// byte-for-byte exact, so prefer this repetitive-but-greppable layout over
// clever table-driven abstractions that would obscure a translation change
// in review.
//
// Item ordering is user-visible and must be preserved: level topics appear
// A1→C2, then the level-test entry, then (in App.tsx) the verb-list entry.
import type { UILanguage } from "../../contexts/LanguageContext";
import { buildLocalizedVocabularyPath } from "../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import {
  type Level as CefrLevelCode,
  type TargetLanguageSlug,
} from "../../data/seo/shared/slugs";
import { getLevelTestContent, getLevelTestSeoPath } from "../../data/seo/levelTests";
import { TARGET_LANGUAGE_TO_UI_CODE } from "./pageRouting";

export type TranslateFn = (key: string) => string;

export interface ExploreTopic {
  id: string;
  level: CefrLevelCode | "test" | "verbs";
  label: string;
  path: string;
  kind: "level" | "test" | "custom";
  targetLanguage: TargetLanguageSlug;
}

// Fallback phrase used only for UI languages without a dedicated branch in
// buildEnglishExploreTopics. Exact translated strings — do not "fix" casing.
const vocabularyPracticeByUiLanguage: Record<string, string> = {
  en: "Vocabulary Practice",
  es: "práctica de vocabulario",
  fr: "Pratique du vocabulaire",
  de: "Wortschatzubung",
  it: "Pratica del vocabolario",
  pt: "Pratica de vocabulario",
  ru: "Практика словарного запаса",
};

export function buildExploreLevelTestLabel(
  uiLanguage: UILanguage,
  t: TranslateFn,
  targetLanguage: TargetLanguageSlug,
): string {
  const seoContent = getLevelTestContent(uiLanguage, targetLanguage);
  if (seoContent?.title) {
    return seoContent.title;
  }

  const languageCode = TARGET_LANGUAGE_TO_UI_CODE[targetLanguage];
  const languageName = t(`languageNames.${languageCode}`);
  const levelTestLabel = t("header.levelTest");

  switch (uiLanguage) {
    case "en":
    case "de":
      return `${languageName} ${levelTestLabel}`;
    default:
      return `${levelTestLabel}: ${languageName.toLowerCase()}`;
  }
}

// Appends the level-test topic after the CEFR level topics (ordering is
// user-visible). `examFallbackPath` is App.tsx's ROUTES.exam — passed in
// rather than imported so this module never depends on App.tsx.
export function withLevelTestExploreTopic(
  topics: Array<{
    level: CefrLevelCode;
    label: string;
    path: string | null | undefined;
  }>,
  targetLanguage: TargetLanguageSlug,
  uiLanguage: UILanguage,
  t: TranslateFn,
  examFallbackPath: string,
): ExploreTopic[] {
  return [
    ...topics.map((topic) => ({
      id: topic.level,
      level: topic.level,
      label: topic.label,
      path: topic.path ?? "#",
      kind: "level" as const,
      targetLanguage,
    })),
    {
      id: "test",
      level: "test",
      label: buildExploreLevelTestLabel(uiLanguage, t, targetLanguage),
      path: getLevelTestSeoPath(uiLanguage, targetLanguage) ?? examFallbackPath,
      kind: "test",
      targetLanguage,
    },
  ];
}

// The only builder that needs `t`: its generic fallbacks localize the
// target-language name through the translation table.
export function buildEnglishExploreTopics(uiLanguage: UILanguage, t: TranslateFn) {
  const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

  if (uiLanguage === "fr") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulaire d’anglais ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "de") {
    return levels
      .map((level) => ({
        level,
        label: `Englisch Wortschatz ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "it") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabolario di inglese ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "pt") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulário de inglês ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "ru") {
    return levels
      .map((level) => ({
        level,
        label: `Словарный запас английского ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }

  const englishLabel = t("languageNames.en");

  if (uiLanguage === "en") {
    return levels
      .map((level) => ({
        level,
        label: `${englishLabel} ${level.toUpperCase()} Vocabulary`,
        path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }

  const practiceLabel =
    vocabularyPracticeByUiLanguage[uiLanguage] ??
    vocabularyPracticeByUiLanguage.en;

  return levels
    .map((level) => ({
      level,
      label: `${englishLabel} ${level.toUpperCase()} ${practiceLabel}`,
      path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
    }))
    .filter((topic) => Boolean(topic.path));
}

export function buildSpanishExploreTopics(uiLanguage: UILanguage) {
  const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

  if (uiLanguage === "es") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulario de español ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "de") {
    return levels
      .map((level) => ({
        level,
        label: `Spanisch Wortschatz ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "fr") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulaire d’espagnol ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "pt") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulário de espanhol ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "it") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabolario di spagnolo ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "ru") {
    return levels
      .map((level) => ({
        level,
        label: `Словарный запас испанского ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }

  return levels
    .map((level) => ({
      level,
      label: `Spanish Vocabulary ${level.toUpperCase()}`,
      path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
    }))
    .filter((topic) => Boolean(topic.path));
}

export function buildFrenchExploreTopics(uiLanguage: UILanguage) {
  const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

  if (uiLanguage === "es") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulario de francés ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "de") {
    return levels
      .map((level) => ({
        level,
        label: `Französisch Wortschatz ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "ru") {
    return levels
      .map((level) => ({
        level,
        label: `Словарный запас французского ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "fr") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulaire de français ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "pt") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulário de francês ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "it") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabolario di francese ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }

  return levels
    .map((level) => ({
      level,
      label: `French Vocabulary ${level.toUpperCase()}`,
      path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
    }))
    .filter((topic) => Boolean(topic.path));
}

export function buildGermanExploreTopics(uiLanguage: UILanguage) {
  const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

  if (uiLanguage === "es") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulario de alemán ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "de") {
    return levels
      .map((level) => ({
        level,
        label: `Deutsch Wortschatz ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "ru") {
    return levels
      .map((level) => ({
        level,
        label: `Словарный запас немецкого ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "fr") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulaire d’allemand ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "pt") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulário de alemão ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "it") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabolario di tedesco ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }

  return levels
    .map((level) => ({
      level,
      label: `German Vocabulary ${level.toUpperCase()}`,
      path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
    }))
    .filter((topic) => Boolean(topic.path));
}

export function buildItalianExploreTopics(uiLanguage: UILanguage) {
  const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

  if (uiLanguage === "es") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulario de italiano ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "de") {
    return levels
      .map((level) => ({
        level,
        label: `Italienisch Wortschatz ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "ru") {
    return levels
      .map((level) => ({
        level,
        label: `Словарный запас итальянского ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "fr") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulaire d’italien ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "pt") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulário de italiano ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "it") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabolario di italiano ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }

  return levels
    .map((level) => ({
      level,
      label: `Italian Vocabulary ${level.toUpperCase()}`,
      path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
    }))
    .filter((topic) => Boolean(topic.path));
}

export function buildPortugueseExploreTopics(uiLanguage: UILanguage) {
  const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

  if (uiLanguage === "es") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulario de portugués ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "de") {
    return levels
      .map((level) => ({
        level,
        label: `Portugiesisch Wortschatz ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "ru") {
    return levels
      .map((level) => ({
        level,
        label: `Словарный запас португальского ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "fr") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulaire de portugais ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "pt") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulário de português ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "it") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabolario di portoghese ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }

  return levels
    .map((level) => ({
      level,
      label: `Portuguese Vocabulary ${level.toUpperCase()}`,
      path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
    }))
    .filter((topic) => Boolean(topic.path));
}

export function buildRussianExploreTopics(uiLanguage: UILanguage) {
  const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

  if (uiLanguage === "es") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulario de ruso ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "de") {
    return levels
      .map((level) => ({
        level,
        label: `Russisch Wortschatz ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "ru") {
    return levels
      .map((level) => ({
        level,
        label: `Словарный запас русского ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "fr") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulaire de russe ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "pt") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabulário de russo ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }
  if (uiLanguage === "it") {
    return levels
      .map((level) => ({
        level,
        label: `Vocabolario di russo ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }

  return levels
    .map((level) => ({
      level,
      label: `Russian Vocabulary ${level.toUpperCase()}`,
      path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
    }))
    .filter((topic) => Boolean(topic.path));
}
