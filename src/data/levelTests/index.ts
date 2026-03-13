import { buildLocalizedVocabularyPath, type TargetLanguageSlug, type UiLanguageCode } from "../seo/slugs";

export interface LevelTestContentSection {
  heading: string;
  paragraphs: string[];
}

export interface LevelTestContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  introParagraphs: string[];
  sections: LevelTestContentSection[];
  practiceLinksHeading: string;
  startButtonLabel: string;
}

const ENGLISH_UI_ENGLISH_LEVEL_TEST: LevelTestContent = {
  title: "English Level Test",
  metaTitle: "English Level Test – Check Your CEFR Level (A1–C2)",
  metaDescription:
    "Take the English Level Test to estimate your CEFR level from A1 to C2 and start practicing English vocabulary that matches your current ability.",
  introParagraphs: [
    "The English Level Test helps you discover your current English proficiency according to the CEFR language scale from A1 to C2. By taking the test, you can quickly understand how well you recognize and understand English vocabulary used in everyday communication.",
    "Knowing your level is an important step in language learning. Many learners study materials that are either too easy or too difficult, which slows down progress. This English level test helps identify the vocabulary range you already know and the level that best represents your current ability.",
    "Once you know your CEFR level, you can begin practicing English vocabulary that matches your knowledge. Learning words appropriate to your level helps build confidence, improves comprehension, and supports steady progress toward higher proficiency.",
  ],
  sections: [
    {
      heading: "What Is the English Level Test?",
      paragraphs: [
        "The English Level Test helps you discover your current English proficiency according to the CEFR language scale from A1 to C2. By taking the test, you can quickly understand how well you recognize and understand English vocabulary used in everyday communication.",
        "Knowing your level is an important step in language learning. Many learners study materials that are either too easy or too difficult, which slows down progress. This English level test helps identify the vocabulary range you already know and the level that best represents your current ability.",
        "Once you know your CEFR level, you can begin practicing English vocabulary that matches your knowledge. Learning words appropriate to your level helps build confidence, improves comprehension, and supports steady progress toward higher proficiency.",
      ],
    },
    {
      heading: "How to Test Your English Level",
      paragraphs: [
        "Testing your English level is a simple way to evaluate your current vocabulary knowledge. The test is designed to estimate which CEFR level best reflects your ability to recognize and understand common English words used in real communication.",
        "The CEFR system divides language proficiency into six levels, from beginner to highly proficient. These levels are used internationally to describe language ability in a clear and consistent way. By identifying your level, you gain a better understanding of your current vocabulary capacity.",
        "After discovering your level, you can focus on practicing vocabulary designed for that stage. This targeted learning approach allows you to improve more efficiently, expanding your vocabulary step by step while strengthening your overall language skills.",
      ],
    },
    {
      heading: "CEFR Language Levels Explained",
      paragraphs: [
        "A1 – Beginner: At the A1 level, learners understand and use very basic English words and expressions related to everyday situations. Vocabulary includes simple greetings, common objects, numbers, and basic actions used in familiar contexts.",
        "A2 – Elementary: A2 learners can understand frequently used vocabulary connected with daily activities such as shopping, travel, family, and work. Communication is still simple but more flexible than at the beginner stage.",
        "B1 – Intermediate: At the B1 level, learners can understand common English vocabulary used in conversations, media, and everyday texts. They can communicate about experiences, plans, opinions, and familiar topics with reasonable clarity.",
        "B2 – Upper Intermediate: B2 learners possess a broad vocabulary that allows them to understand complex texts and participate actively in discussions. They can express ideas clearly and understand a wide range of topics in spoken and written English.",
        "C1 – Advanced: At the C1 level, learners understand sophisticated vocabulary and complex language structures. They can follow demanding texts, express ideas fluently, and communicate effectively in academic or professional environments.",
        "C2 – Proficient: C2 represents near-native proficiency. Learners can understand almost all forms of English, including subtle meanings and complex vocabulary. Communication is precise, natural, and highly flexible in any context.",
      ],
    },
    {
      heading: "Why Knowing Your English Level Matters",
      paragraphs: [
        "Understanding your English level helps you learn more efficiently. When study materials match your ability, learning becomes more effective and motivating. Vocabulary that is too easy does not expand your skills, while vocabulary that is too advanced can feel overwhelming.",
        "By identifying your CEFR level, you can choose the right vocabulary difficulty and follow a structured learning path. Each level introduces words that gradually increase in complexity, helping you build knowledge step by step.",
        "This structured approach makes language learning clearer and more productive. As your vocabulary grows, your reading, listening, speaking, and writing abilities improve together, allowing you to progress naturally toward higher proficiency levels.",
      ],
    },
    {
      heading: "Start the English Level Test",
      paragraphs: [
        "Take the English Level Test to discover your current CEFR level from A1 to C2. Once you know your level, you can begin practicing vocabulary that matches your ability and continue building your English skills step by step.",
        "Understanding where you stand is the first step toward improvement. Start the test now and move forward with vocabulary practice designed for your level.",
      ],
    },
  ],
  practiceLinksHeading: "Practice English Vocabulary by Level",
  startButtonLabel: "Start the English Level Test",
};

const LEVEL_TEST_CONTENT: Partial<
  Record<UiLanguageCode, Partial<Record<TargetLanguageSlug, LevelTestContent>>>
> = {
  en: {
    english: ENGLISH_UI_ENGLISH_LEVEL_TEST,
  },
};

export function getLevelTestContent(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): LevelTestContent | null {
  return LEVEL_TEST_CONTENT[uiLang]?.[targetLanguage] ?? null;
}

export function getEnglishLevelPracticeLinks(uiLang: UiLanguageCode) {
  const levels = ["a1", "a2", "b1", "b2", "c1", "c2"] as const;

  return levels
    .map((level) => ({
      level: level.toUpperCase(),
      href: buildLocalizedVocabularyPath(uiLang, "english", level),
      label: `English ${level.toUpperCase()} Vocabulary Practice`,
    }))
    .filter((item) => Boolean(item.href));
}
