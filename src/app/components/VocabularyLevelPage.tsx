import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { SUPPORTED_LEVELS, SUPPORTED_TARGET_LANGUAGES, buildLocalizedVocabularyPath } from "../../data/seo/slugs";
import { getLevelTestSeoPath } from "../../data/seo/levelTests";
import { getSeoHubPath } from "../../data/seo/hub";
import {
  getVocabularyLevelContent,
  loadVocabularyLevelContent,
  type CefrLevelCode,
  type TargetLanguageSlug,
  type UiLanguageCode,
  type VocabularyLevelContent,
} from "../../data/seo/vocabularyLevels";
import { buildVocabularySeoMetadata, buildVocabularyFaqSection } from "../../seo/metadata";
import { SEOHead, useSeoSiteOrigin, type SeoMetadata } from "../../seo/SeoContext";
import { buildWordPath } from "../../data/seo/wordPages/wordSlugs";
import { isValidBrowseWordLemma } from "../../data/seo/browseWordValidation";
import type { LevelBrowsePreviewData } from "../../data/seo/levelBrowseWords";

interface VocabularyLevelPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: CefrLevelCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
  contentOverride?: {
    file: {
      targetLanguage: TargetLanguageSlug;
      targetLanguageDisplayName: string;
    };
    levelContent: VocabularyLevelContent;
  };
  seoMetadataOverride?: SeoMetadata | null;
  heroTitleOverride?: string | null;
  browseLanguageNameOverride?: string | null;
  faqLanguageNameOverride?: string | null;
  initialBrowsePreview?: LevelBrowsePreviewData | null;
}

type VocabEntry = { concept_id: string; word_lemma: string; level: string };
type BrowsePreviewData = LevelBrowsePreviewData;
const vocabModules = import.meta.glob("../../data/vocabulary/*/vocabulary.json") as Record<
  string,
  () => Promise<{ default: VocabEntry[] }>
>;

const WORDS_PER_PAGE = 54;

function getPaginationRange(current: number, total: number): (number | "…")[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i);
  const result: (number | "…")[] = [];
  let prev = -1;
  for (let i = 0; i < total; i++) {
    if (i === 0 || i === total - 1 || (i >= current - 2 && i <= current + 2)) {
      if (prev !== -1 && i - prev > 1) result.push("…");
      result.push(i);
      prev = i;
    }
  }
  return result;
}

const LEVEL_DISPLAY: Record<CefrLevelCode, string> = {
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
};

const WORD_MAP: Record<string, number> = {
  A1: 500,
  A2: 1500,
  B1: 2500,
  B2: 4000,
  C1: 8000,
  C2: 10000,
};

interface CuriosityArgs {
  language: string;
  level: string;
  words: number;
}

const CURIOSITY_TRANSLATIONS: Record<
  UiLanguageCode,
  {
    h1: (args: CuriosityArgs) => string;
    h2: (args: Pick<CuriosityArgs, "language" | "level">) => string;
    description: (args: Pick<CuriosityArgs, "level" | "words">) => string;
    cta: string;
  }
> = {
  en: {
    h1: ({ language, level, words }) =>
      `${language} ${level} Vocabulary: Mastering the ${words} Essential Words`,
    h2: ({ language, level }) => `How many words are in ${language} ${level}?`,
    description: ({ level, words }) =>
      `To reach ${level} proficiency, you need approximately ${words} words. However, simply knowing the list isn't enough—you need to master the usage and pronunciation.`,
    cta: "Start Practice",
  },
  ru: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Как освоить необходимые ${words} слов`,
    h2: ({ language, level }) => `Сколько слов в ${language} ${level}?`,
    description: ({ level, words }) =>
      `Для достижения уровня ${level} вам нужно примерно ${words} слов. Однако просто знать список недостаточно — нужно освоить употребление и произношение.`,
    cta: "Начать практику",
  },
  es: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Domina las ${words} palabras esenciales`,
    h2: ({ language, level }) => `¿Cuántas palabras tiene el ${language} ${level}?`,
    description: ({ level, words }) =>
      `Para alcanzar el nivel ${level} necesitas aproximadamente ${words} palabras. Sin embargo, no basta con conocer la lista — debes dominar el uso y la pronunciación.`,
    cta: "Comenzar práctica",
  },
  fr: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Maîtrisez les ${words} mots essentiels`,
    h2: ({ language, level }) => `Combien de mots contient le ${language} ${level} ?`,
    description: ({ level, words }) =>
      `Pour atteindre le niveau ${level}, vous avez besoin d'environ ${words} mots. Cependant, connaître la liste ne suffit pas — vous devez maîtriser l'usage et la prononciation.`,
    cta: "Commencer la pratique",
  },
  de: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Beherrschen Sie die ${words} wichtigsten Wörter`,
    h2: ({ language, level }) => `Wie viele Wörter hat ${language} ${level}?`,
    description: ({ level, words }) =>
      `Um das ${level}-Niveau zu erreichen, benötigen Sie etwa ${words} Wörter. Aber es reicht nicht, die Liste zu kennen — Sie müssen Verwendung und Aussprache meistern.`,
    cta: "Übung starten",
  },
  it: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Padroneggia le ${words} parole essenziali`,
    h2: ({ language, level }) => `Quante parole ha ${language} ${level}?`,
    description: ({ level, words }) =>
      `Per raggiungere il livello ${level}, hai bisogno di circa ${words} parole. Tuttavia, conoscere la lista non è sufficiente — devi padroneggiare l'uso e la pronuncia.`,
    cta: "Inizia la pratica",
  },
  pt: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Domine as ${words} palavras essenciais`,
    h2: ({ language, level }) => `Quantas palavras tem o ${language} ${level}?`,
    description: ({ level, words }) =>
      `Para alcançar o nível ${level}, você precisa de aproximadamente ${words} palavras. No entanto, apenas conhecer a lista não é suficiente — você precisa dominar o uso e a pronúncia.`,
    cta: "Iniciar prática",
  },
};

const HERO_TITLE_SUFFIX: Record<
  UiLanguageCode,
  (args: CuriosityArgs) => string
> = {
  en: ({ language, words }) => `Mastering ${words} ${language} words`,
  es: ({ language, words }) => `domina ${words} palabras de ${language}`,
  fr: ({ language, words }) => `maitrisez ${words} mots de ${language}`,
  de: ({ language, words }) => `${words} ${language} Worter meistern`,
  it: ({ language, words }) => `padroneggia ${words} parole di ${language}`,
  pt: ({ language, words }) => `domine ${words} palavras de ${language}`,
  ru: ({ language, level, words }) =>
    `освойте ${words} слов уровня ${level} по ${language}`,
};

const WORDS_UNIT_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "words",
  es: "palabras",
  de: "Wörter",
  fr: "mots",
  it: "parole",
  pt: "palavras",
  ru: "слов",
};

const TARGET_LANGUAGE_DISPLAY_FALLBACKS: Record<TargetLanguageSlug, string> = {
  english: "English",
  german: "German",
  spanish: "Spanish",
  french: "French",
  italian: "Italian",
  portuguese: "Portuguese",
  russian: "Russian",
};

const HERO_SUFFIX_LANGUAGE_NAMES: Record<
  UiLanguageCode,
  Record<TargetLanguageSlug, string>
> = {
  en: {
    english: "English",
    german: "German",
    spanish: "Spanish",
    french: "French",
    italian: "Italian",
    portuguese: "Portuguese",
    russian: "Russian",
  },
  es: {
    english: "inglés",
    german: "alemán",
    spanish: "español",
    french: "francés",
    italian: "italiano",
    portuguese: "portugués",
    russian: "ruso",
  },
  de: {
    english: "Englisch",
    german: "Deutsch",
    spanish: "Spanisch",
    french: "Französisch",
    italian: "Italienisch",
    portuguese: "Portugiesisch",
    russian: "Russisch",
  },
  fr: {
    english: "anglais",
    german: "allemand",
    spanish: "espagnol",
    french: "français",
    italian: "italien",
    portuguese: "portugais",
    russian: "russe",
  },
  it: {
    english: "inglese",
    german: "tedesco",
    spanish: "spagnolo",
    french: "francese",
    italian: "italiano",
    portuguese: "portoghese",
    russian: "russo",
  },
  pt: {
    english: "inglês",
    german: "alemão",
    spanish: "espanhol",
    french: "francês",
    italian: "italiano",
    portuguese: "português",
    russian: "russo",
  },
  ru: {
    english: "английскому",
    german: "немецкому",
    spanish: "испанскому",
    french: "французскому",
    italian: "итальянскому",
    portuguese: "португальскому",
    russian: "русскому",
  },
};

const TARGET_LANGUAGE_CODE_TO_SLUG: Record<UiLanguageCode, TargetLanguageSlug> = {
  en: "english",
  es: "spanish",
  de: "german",
  fr: "french",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

function resolveTargetLanguageDisplayName(
  targetLanguage: TargetLanguageSlug,
  rawDisplayName: string,
): string {
  const trimmed = rawDisplayName.trim();
  const normalized = trimmed.toLowerCase();
  const slugFromCode = TARGET_LANGUAGE_CODE_TO_SLUG[normalized as UiLanguageCode];

  if (slugFromCode) {
    return TARGET_LANGUAGE_DISPLAY_FALLBACKS[slugFromCode];
  }

  if (trimmed.length > 0) {
    return trimmed;
  }

  return TARGET_LANGUAGE_DISPLAY_FALLBACKS[targetLanguage];
}

function resolveHeroSuffixLanguageName(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  displayName: string,
): string {
  return HERO_SUFFIX_LANGUAGE_NAMES[uiLang]?.[targetLanguage] ?? displayName;
}

const SAMPLE_TABLE_HEADERS_BY_UI_LANG: Record<
  UiLanguageCode,
  { word: string; meaning: string }
> = {
  en: { word: "Word", meaning: "Meaning" },
  es: { word: "Palabra", meaning: "Significado" },
  de: { word: "Wort", meaning: "Bedeutung" },
  fr: { word: "Mot", meaning: "Signification" },
  it: { word: "Parola", meaning: "Significato" },
  pt: { word: "Palavra", meaning: "Significado" },
  ru: { word: "Слово", meaning: "Значение" },
};

const CROSS_LANGUAGE_COPY: Record<
  UiLanguageCode,
  { heading: (level: string) => string; linkSuffix: string }
> = {
  en: {
    heading: (level) => `Practice ${level} vocabulary in other languages`,
    linkSuffix: "vocabulary list",
  },
  es: {
    heading: (level) => `Practica vocabulario ${level} en otros idiomas`,
    linkSuffix: "lista de vocabulario",
  },
  fr: {
    heading: (level) => `Pratiquez le vocabulaire ${level} dans d'autres langues`,
    linkSuffix: "liste de vocabulaire",
  },
  de: {
    heading: (level) => `${level} Vokabular in anderen Sprachen üben`,
    linkSuffix: "Wortliste",
  },
  it: {
    heading: (level) => `Pratica il vocabolario ${level} in altre lingue`,
    linkSuffix: "lista di vocabolario",
  },
  pt: {
    heading: (level) => `Pratique vocabulário ${level} em outros idiomas`,
    linkSuffix: "lista de vocabulário",
  },
  ru: {
    heading: (level) => `Практикуйте словарный запас ${level} на других языках`,
    linkSuffix: "список слов",
  },
};

const BROWSE_WORDS_COPY: Record<
  UiLanguageCode,
  {
    heading: (args: { level: string; language: string }) => string;
    description: string;
    searchPlaceholder: (level: string) => string;
  }
> = {
  en: {
    heading: ({ level, language }) => `Browse ${level} ${language} Words`,
    description:
      "Explore common vocabulary words for this level. Click a word to learn its meaning, see example sentences, and practice it with exercises.",
    searchPlaceholder: (level) => `Search ${level} words...`,
  },
  es: {
    heading: ({ level, language }) => `Explorar palabras ${level} de ${language}`,
    description:
      "Explora las palabras de vocabulario más comunes para este nivel. Haz clic en una palabra para ver su significado, ejemplos de oraciones y practicar con ejercicios.",
    searchPlaceholder: (level) => `Buscar palabras ${level}...`,
  },
  fr: {
    heading: ({ level, language }) => `Explorer les mots ${language} de niveau ${level}`,
    description:
      "Découvrez les mots de vocabulaire courants pour ce niveau. Cliquez sur un mot pour en apprendre le sens, voir des exemples de phrases et vous entraîner avec des exercices.",
    searchPlaceholder: (level) => `Rechercher des mots ${level}...`,
  },
  de: {
    heading: ({ level, language }) => `${level} ${language} Wörter durchsuchen`,
    description:
      "Erkunden Sie häufige Vokabeln für dieses Niveau. Klicken Sie auf ein Wort, um seine Bedeutung zu erfahren, Beispielsätze zu sehen und es mit Übungen zu üben.",
    searchPlaceholder: (level) => `${level}-Wörter suchen...`,
  },
  it: {
    heading: ({ level, language }) => `Esplora le parole ${language} di livello ${level}`,
    description:
      "Esplora le parole di vocabolario più comuni per questo livello. Clicca su una parola per impararne il significato, vedere frasi di esempio e praticare con gli esercizi.",
    searchPlaceholder: (level) => `Cerca parole ${level}...`,
  },
  pt: {
    heading: ({ level, language }) => `Explorar palavras ${language} de nível ${level}`,
    description:
      "Explore as palavras de vocabulário mais comuns para este nível. Clique em uma palavra para aprender seu significado, ver exemplos de frases e praticar com exercícios.",
    searchPlaceholder: (level) => `Pesquisar palavras ${level}...`,
  },
  ru: {
    heading: ({ level, language }) => `Слова ${language} уровня ${level}`,
    description:
      "Изучайте распространённые слова для этого уровня. Нажмите на слово, чтобы узнать его значение, увидеть примеры предложений и потренироваться с упражнениями.",
    searchPlaceholder: (level) => `Поиск слов уровня ${level}...`,
  },
};


const RELATED_LINKS_COPY: Record<
  UiLanguageCode,
  {
    heading: string;
    seoHubLabel: string;
    levelTestLabel: (languageName: string) => string;
  }
> = {
  en: {
    heading: "Related pages",
    seoHubLabel: "Browse all pages",
    levelTestLabel: (languageName) => `Take the ${languageName} level test`,
  },
  es: {
    heading: "Páginas relacionadas",
    seoHubLabel: "Ver todas las páginas",
    levelTestLabel: (languageName) => `Haz el test de nivel de ${languageName}`,
  },
  fr: {
    heading: "Pages associées",
    seoHubLabel: "Voir toutes les pages",
    levelTestLabel: (languageName) => `Passez le test de niveau de ${languageName}`,
  },
  de: {
    heading: "Verwandte Seiten",
    seoHubLabel: "Alle Seiten ansehen",
    levelTestLabel: (languageName) => `${languageName} Niveau-Test machen`,
  },
  it: {
    heading: "Pagine correlate",
    seoHubLabel: "Vedi tutte le pagine",
    levelTestLabel: (languageName) => `Fai il test di livello di ${languageName}`,
  },
  pt: {
    heading: "Páginas relacionadas",
    seoHubLabel: "Ver todas as páginas",
    levelTestLabel: (languageName) => `Faça o teste de nível de ${languageName}`,
  },
  ru: {
    heading: "Связанные страницы",
    seoHubLabel: "Посмотреть все страницы",
    levelTestLabel: (languageName) => `Тест уровня ${languageName}`,
  },
};

function buildVocabularyUrl(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: CefrLevelCode,
): string {
  return buildLocalizedVocabularyPath(uiLang, targetLanguage, level) ?? "/";
}

export function VocabularyLevelPage({
  uiLang,
  targetLanguage,
  level,
  onStartPractice,
  contentOverride,
  seoMetadataOverride,
  heroTitleOverride,
  browseLanguageNameOverride,
  faqLanguageNameOverride,
  initialBrowsePreview,
}: VocabularyLevelPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const wordsUnit = WORDS_UNIT_BY_UI_LANG[uiLang] ?? WORDS_UNIT_BY_UI_LANG.en;
  const initialContentBundle =
    contentOverride ?? getVocabularyLevelContent(uiLang, targetLanguage, level);
  const [contentBundle, setContentBundle] = useState(initialContentBundle);
  const [isContentLoading, setIsContentLoading] = useState(
    () => !initialContentBundle,
  );
  const [contentLoadFailed, setContentLoadFailed] = useState(false);

  useEffect(() => {
    if (contentOverride) {
      setContentBundle(contentOverride);
      setIsContentLoading(false);
      setContentLoadFailed(false);
      return;
    }

    const cachedContent = getVocabularyLevelContent(uiLang, targetLanguage, level);
    if (cachedContent) {
      setContentBundle(cachedContent);
      setIsContentLoading(false);
      setContentLoadFailed(false);
      return;
    }

    let cancelled = false;
    setIsContentLoading(true);
    setContentLoadFailed(false);

    void loadVocabularyLevelContent(uiLang, targetLanguage, level).then((nextContent) => {
      if (!cancelled) {
        setContentBundle(nextContent);
        setIsContentLoading(false);
        setContentLoadFailed(!nextContent);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [contentOverride, level, targetLanguage, uiLang]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const levelDisplay = LEVEL_DISPLAY[level];
  const [browseWords, setBrowseWords] = useState<VocabEntry[]>([]);
  const [browsePage, setBrowsePage] = useState(0);
  const [browseSearch, setBrowseSearch] = useState("");
  const [isBrowseLoading, setIsBrowseLoading] = useState(false);
  const browseLoadPromiseRef = useRef<Promise<VocabEntry[]> | null>(null);
  const [browsePreview, setBrowsePreview] = useState<BrowsePreviewData | null>(
    initialBrowsePreview ?? null,
  );

  useEffect(() => {
    setBrowsePage(0);
    setBrowseSearch("");
    setBrowseWords([]);
    setBrowsePreview(initialBrowsePreview ?? null);
    setIsBrowseLoading(false);
    browseLoadPromiseRef.current = null;
  }, [initialBrowsePreview, targetLanguage, level]);

  useEffect(() => {
    const activeInitialBrowsePreview =
      initialBrowsePreview?.targetLanguage === targetLanguage &&
      initialBrowsePreview.level === levelDisplay
        ? initialBrowsePreview
        : null;
    const hasFullInitialBrowseData = Boolean(
      activeInitialBrowsePreview &&
      activeInitialBrowsePreview.words.length >= activeInitialBrowsePreview.totalWords,
    );
    if (hasFullInitialBrowseData) {
      setBrowseWords(activeInitialBrowsePreview?.words as VocabEntry[]);
      setIsBrowseLoading(false);
      return;
    }

    const key = `../../data/vocabulary/${targetLanguage}/vocabulary.json`;
    const loader = vocabModules[key];
    if (!loader) {
      setBrowseWords([]);
      setIsBrowseLoading(false);
      return;
    }
    let cancelled = false;
    setIsBrowseLoading(true);
    const loadPromise = loader()
      .then((mod) => {
        if (cancelled) {
          return [];
        }
        const seen = new Set<string>();
        const words: VocabEntry[] = [];
        for (const w of mod.default) {
          if (w.level !== levelDisplay) continue;
          if (!isValidBrowseWordLemma(w.word_lemma) || seen.has(w.concept_id)) continue;
          seen.add(w.concept_id);
          words.push(w);
        }
        setBrowseWords(words);
        setBrowsePreview({
          targetLanguage,
          level: levelDisplay,
          totalWords: words.length,
          totalPages: Math.max(1, Math.ceil(words.length / WORDS_PER_PAGE)),
          words,
        });
        return words;
      })
      .finally(() => {
        if (!cancelled) {
          setIsBrowseLoading(false);
        }
        browseLoadPromiseRef.current = null;
      });

    browseLoadPromiseRef.current = loadPromise;
    return () => {
      cancelled = true;
    };
  }, [initialBrowsePreview, levelDisplay, targetLanguage]);

  if (!contentBundle) {
    if (isContentLoading) {
      return (
        <div className="flex-1 flex items-center justify-center px-6 py-12 text-sm text-muted-foreground">
          Loading...
        </div>
      );
    }

    if (contentLoadFailed) {
      return (
        <div className="flex-1 flex items-center justify-center px-6 py-12 text-sm text-muted-foreground">
          Content unavailable.
        </div>
      );
    }

    return null;
  }

  const { levelContent } = contentBundle;
  const wordMapCount = WORD_MAP[levelDisplay] ?? levelContent.wordCount.value;
  const curiosityT = CURIOSITY_TRANSLATIONS[uiLang] ?? CURIOSITY_TRANSLATIONS.en;
  const seoMetadata =
    seoMetadataOverride ??
    buildVocabularySeoMetadata({
      uiLang,
      targetLanguage,
      level,
      pathname: location.pathname,
      siteOrigin,
    });
  const ctaText = levelContent.ctaText || `Start ${levelDisplay} Practice`;
  const relatedCopy = RELATED_LINKS_COPY[uiLang] ?? RELATED_LINKS_COPY.en;
  const localizedHeaders =
    SAMPLE_TABLE_HEADERS_BY_UI_LANG[uiLang] ?? SAMPLE_TABLE_HEADERS_BY_UI_LANG.en;
  const wordHeader =
    levelContent.sampleVocabulary.columns.word === "Word"
      ? localizedHeaders.word
      : levelContent.sampleVocabulary.columns.word;
  const meaningHeader =
    levelContent.sampleVocabulary.columns.meaning === "Meaning"
      ? localizedHeaders.meaning
      : levelContent.sampleVocabulary.columns.meaning;
  const introParagraphs =
    levelContent.introParagraphs && levelContent.introParagraphs.length > 0
      ? levelContent.introParagraphs
      : [levelContent.intro];
  const targetLanguageDisplayName = resolveTargetLanguageDisplayName(
    targetLanguage,
    contentBundle.file.targetLanguageDisplayName,
  );
  const internalNavigationLinks = SUPPORTED_LEVELS.filter((item) => item !== level).map(
    (nextLevel) => ({
      level: nextLevel,
      href: buildVocabularyUrl(uiLang, targetLanguage, nextLevel),
      label: `${targetLanguageDisplayName} ${LEVEL_DISPLAY[nextLevel]}`,
    }),
  );
  const levelTestHref = getLevelTestSeoPath(uiLang, targetLanguage);
  const seoHubHref = getSeoHubPath(uiLang);
  const crossLangCopy = CROSS_LANGUAGE_COPY[uiLang] ?? CROSS_LANGUAGE_COPY.en;
  const browseWordsCopy = BROWSE_WORDS_COPY[uiLang] ?? BROWSE_WORDS_COPY.en;
  const crossLanguageLinks = SUPPORTED_TARGET_LANGUAGES.filter((lang) => lang !== targetLanguage)
    .map((lang) => {
      const href = buildLocalizedVocabularyPath(uiLang, lang, level);
      if (!href) return null;
      const languageLabel =
        HERO_SUFFIX_LANGUAGE_NAMES[uiLang]?.[lang] ??
        TARGET_LANGUAGE_DISPLAY_FALLBACKS[lang];
      return {
        lang,
        href,
        label: `${languageLabel} ${levelDisplay} ${crossLangCopy.linkSuffix}`,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const faqSection = buildVocabularyFaqSection(
    uiLang,
    faqLanguageNameOverride ?? targetLanguageDisplayName,
    levelDisplay,
    levelContent,
    wordsUnit,
  );
  const heroTitleSuffix = "";
  const heroTitleSuffixWithoutLevel = heroTitleSuffix
    .replace(` ${levelDisplay} `, " ")
    .replace(`${levelDisplay} `, "")
    .replace(` ${levelDisplay}`, "")
    .replace(`уровня ${levelDisplay} `, "")
    .replace("уровня ", "");
  const heroTitle = levelContent.title.includes(String(wordMapCount))
    ? levelContent.title
    : `${levelContent.title} - ${heroTitleSuffixWithoutLevel}`;
  const normalizedSearch = browseSearch.trim().toLowerCase();
  const activeBrowsePreview =
    browsePreview?.targetLanguage === targetLanguage &&
    browsePreview.level === levelDisplay
      ? browsePreview
      : null;
  const previewBrowseWords = (activeBrowsePreview?.words ?? []).filter((word) =>
    isValidBrowseWordLemma(word.word_lemma),
  );
  const currentBrowseWords = browseWords.length > 0 ? browseWords : previewBrowseWords;
  const canFilterFullBrowseWords =
    browseWords.length > 0 ||
    (activeBrowsePreview?.words.length ?? 0) >= (activeBrowsePreview?.totalWords ?? 0);
  const filteredBrowseWords =
    normalizedSearch && canFilterFullBrowseWords
      ? currentBrowseWords.filter((word) =>
        word.word_lemma.toLowerCase().includes(normalizedSearch),
      )
      : currentBrowseWords;
  const totalBrowseWords = canFilterFullBrowseWords
    ? currentBrowseWords.length
    : (activeBrowsePreview?.totalWords ?? currentBrowseWords.length);
  const totalBrowsePages = Math.max(
    1,
    normalizedSearch && canFilterFullBrowseWords
      ? Math.ceil(filteredBrowseWords.length / WORDS_PER_PAGE)
      : (activeBrowsePreview?.totalPages ?? Math.ceil(totalBrowseWords / WORDS_PER_PAGE) ?? 1),
  );
  const safeBrowsePage = Math.min(browsePage, Math.max(totalBrowsePages - 1, 0));
  const pageWords = filteredBrowseWords.slice(
    safeBrowsePage * WORDS_PER_PAGE,
    (safeBrowsePage + 1) * WORDS_PER_PAGE,
  );

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">
            {heroTitleOverride ??
              curiosityT.h1({
                language: targetLanguageDisplayName,
                level: levelDisplay,
                words: wordMapCount,
              })}
          </h1>

          <div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">
              {curiosityT.h2({ language: targetLanguageDisplayName, level: levelDisplay })}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {curiosityT.description({ level: levelDisplay, words: wordMapCount })}
            </p>
            <button
              type="button"
              className="mt-4 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
              onClick={() => onStartPractice(targetLanguage, levelDisplay)}
            >
              {curiosityT.cta}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {introParagraphs.map((paragraph) => (
              <p key={paragraph} className="text-base text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.levelExplanation.heading}</h2>
          <p className="mt-3 text-muted-foreground">{levelContent.levelExplanation.paragraph}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-muted-foreground">
            {levelContent.levelExplanation.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.vocabularyScope.heading}</h2>

          {levelContent.vocabularyScope.groups && levelContent.vocabularyScope.groups.length > 0 ? (
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              {levelContent.vocabularyScope.groups.map((group) => (
                <div key={group.heading}>
                  <h3 className="text-lg text-foreground">{group.heading}</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg text-foreground">Topics</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {levelContent.vocabularyScope.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-lg text-foreground">Word Types</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {levelContent.vocabularyScope.wordTypes.map((type) => (
                    <li key={type}>{type}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.wordCount.heading}</h2>
          <p className="mt-3 text-muted-foreground">{levelContent.wordCount.text}</p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {levelContent.wordCount.value.toLocaleString(uiLang)} {wordsUnit}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.sampleVocabulary.heading}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th className="border-b border-border py-2 pr-4 text-sm text-foreground">
                    {wordHeader}
                  </th>
                  <th className="border-b border-border py-2 text-sm text-foreground">
                    {meaningHeader}
                  </th>
                </tr>
              </thead>
              <tbody>
                {levelContent.sampleVocabulary.rows.slice(0, 10).map((row) => (
                  <tr key={`${row.word}-${row.meaning}`}>
                    <td className="border-b border-border/70 py-2 pr-4 text-sm text-foreground">
                      {row.word}
                    </td>
                    <td className="border-b border-border/70 py-2 text-sm text-muted-foreground">
                      {row.meaning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">
            {browseWordsCopy.heading({
              level: levelDisplay,
              language: browseLanguageNameOverride ?? targetLanguageDisplayName,
            })}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{browseWordsCopy.description}</p>
          <input
            type="text"
            value={browseSearch}
            onChange={(e) => {
              setBrowseSearch(e.target.value);
              setBrowsePage(0);
            }}
            placeholder={browseWordsCopy.searchPlaceholder(levelDisplay)}
            className="mt-4 w-full rounded-xl border-2 border-primary/35 bg-primary/[0.06] px-4 py-3 text-base font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
          />
          <div className="mt-2 h-4">
            {isBrowseLoading ? (
              <p className="text-xs text-muted-foreground">
                Loading full word list...
              </p>
            ) : null}
          </div>
          {pageWords.length > 0 ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {pageWords.map((word) => (
                  <Link
                    key={word.concept_id}
                    to={buildWordPath(
                      uiLang,
                      targetLanguage,
                      word.word_lemma,
                      word.concept_id,
                    )}
                    className="rounded-lg border border-border px-3 py-1.5 text-center text-sm text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    {word.word_lemma}
                  </Link>
                ))}
              </div>
              {totalBrowsePages > 1 && (
                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {getPaginationRange(safeBrowsePage, totalBrowsePages).map((item, idx) =>
                    item === "…" ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 py-1 text-sm text-muted-foreground"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setBrowsePage(item);
                        }}
                        disabled={isBrowseLoading && item !== safeBrowsePage}
                        className={
                          item === safeBrowsePage
                            ? "min-w-8 rounded-lg border border-primary bg-primary/10 px-2 py-1 text-sm text-primary"
                            : "min-w-8 rounded-lg border border-border px-2 py-1 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                        }
                      >
                        {item + 1}
                      </button>
                    ),
                  )}
                </div>
              )}
            </>
          ) : currentBrowseWords.length > 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              No words found for this search.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded-lg border border-border bg-border/30"
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.internalNavigation.heading}</h2>

          <div className="mt-2 flex flex-wrap gap-2">
            {internalNavigationLinks.map((item) => (
              <Link
                key={item.level}
                className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm text-primary transition hover:bg-primary/10"
                to={item.href}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        {crossLanguageLinks.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-2xl text-foreground">
              {crossLangCopy.heading(levelDisplay)}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {crossLanguageLinks.map((item) => (
                <Link
                  key={item.lang}
                  className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm text-primary transition hover:bg-primary/10"
                  to={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{relatedCopy.heading}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            {levelTestHref ? (
              <li>
                <Link className="text-primary transition hover:underline" to={levelTestHref}>
                  {relatedCopy.levelTestLabel(targetLanguageDisplayName)}
                </Link>
              </li>
            ) : null}
            <li>
              <Link className="text-primary transition hover:underline" to={seoHubHref}>
                {relatedCopy.seoHubLabel}
              </Link>
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{faqSection.heading}</h2>
          <div className="mt-4 space-y-5">
            {faqSection.items.map((item) => (
              <div key={item.question}>
                <h3 className="text-base font-semibold text-foreground">{item.question}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-4">
          {levelContent.bottomCta?.heading ? (
            <h2 className="text-2xl text-foreground">{levelContent.bottomCta.heading}</h2>
          ) : null}
          {levelContent.bottomCta?.text ? (
            <p className="mt-3 text-muted-foreground">{levelContent.bottomCta.text}</p>
          ) : null}
          <button
            type="button"
            className="mt-4 rounded-xl border border-primary/45 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/15"
            onClick={() => onStartPractice(targetLanguage, levelDisplay)}
          >
            {ctaText}
          </button>
        </section>
      </div>
    </main>
  );
}
