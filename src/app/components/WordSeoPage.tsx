import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { Volume2 } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/seo/slugs";
import { buildWordPath } from "../../data/seo/wordSlugs";
import {
  WORD_PAGE_BROWSE_WORDS_PER_PAGE,
  buildResolvedWordPageData,
  getUiVocabularyLanguage,
  type HydrationWordPageData,
  type ResolvedWordPageData,
  type WordPageVocabEntry,
} from "../../data/seo/wordPageData";
import { buildWordSeoMetadata } from "../../seo/metadata";
import { SEOHead, useSeoSiteOrigin } from "../../seo/SeoContext";
import { fixMojibake } from "../../utils/fixMojibake";

type VocabEntry = WordPageVocabEntry;

interface WordPageHydrationPayload {
  pathname: string;
  data: HydrationWordPageData | null;
}

declare global {
  interface Window {
    __WORD_PAGE_DATA__?: WordPageHydrationPayload;
  }
}

const WORDS_PER_PAGE = WORD_PAGE_BROWSE_WORDS_PER_PAGE;

function getPaginationRange(current: number, total: number): (number | "...")[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i);
  const result: (number | "...")[] = [];
  let prev = -1;
  for (let i = 0; i < total; i++) {
    if (i === 0 || i === total - 1 || (i >= current - 2 && i <= current + 2)) {
      if (prev !== -1 && i - prev > 1) result.push("...");
      result.push(i);
      prev = i;
    }
  }
  return result;
}

const wordVocabModules = import.meta.glob(
  "../../data/vocabulary/*/vocabulary.json",
) as Record<string, () => Promise<{ default: VocabEntry[] }>>;

const SPEECH_LANG: Record<TargetLanguageSlug, string> = {
  english: "en-US",
  german: "de-DE",
  spanish: "es-ES",
  french: "fr-FR",
  italian: "it-IT",
  portuguese: "pt-BR",
  russian: "ru-RU",
};

const TARGET_LANG_NAMES: Record<
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
    english: "Inglés",
    german: "Alemán",
    spanish: "Español",
    french: "Francés",
    italian: "Italiano",
    portuguese: "Portugués",
    russian: "Ruso",
  },
  fr: {
    english: "Anglais",
    german: "Allemand",
    spanish: "Espagnol",
    french: "Français",
    italian: "Italien",
    portuguese: "Portugais",
    russian: "Russe",
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
  it: {
    english: "Inglese",
    german: "Tedesco",
    spanish: "Spagnolo",
    french: "Francese",
    italian: "Italiano",
    portuguese: "Portoghese",
    russian: "Russo",
  },
  pt: {
    english: "Inglês",
    german: "Alemão",
    spanish: "Espanhol",
    french: "Francês",
    italian: "Italiano",
    portuguese: "Português",
    russian: "Russo",
  },
  ru: {
    english: "Английский",
    german: "Немецкий",
    spanish: "Испанский",
    french: "Французский",
    italian: "Итальянский",
    portuguese: "Португальский",
    russian: "Русский",
  },
};

function sanitizeCopy(value: string): string {
  return fixMojibake(value);
}

function sanitizeWordPageTranslations(copy: WordPageT): WordPageT {
  return {
    h1: (word, targetLang) => sanitizeCopy(copy.h1(word, targetLang)),
    definitionHeading: sanitizeCopy(copy.definitionHeading),
    exampleSentenceHeading: sanitizeCopy(copy.exampleSentenceHeading),
    wordInfoHeading: sanitizeCopy(copy.wordInfoHeading),
    typeLabel: sanitizeCopy(copy.typeLabel),
    levelLabel: sanitizeCopy(copy.levelLabel),
    categoryLabel: sanitizeCopy(copy.categoryLabel),
    relatedWordsHeading: sanitizeCopy(copy.relatedWordsHeading),
    otherMeaningsHeading: sanitizeCopy(copy.otherMeaningsHeading),
    openWordPageCta: sanitizeCopy(copy.openWordPageCta),
    pronounceLabel: sanitizeCopy(copy.pronounceLabel),
    practiceHeading: sanitizeCopy(copy.practiceHeading),
    practiceInstruction: sanitizeCopy(copy.practiceInstruction),
    definitionLabel: sanitizeCopy(copy.definitionLabel),
    checkButtonLabel: sanitizeCopy(copy.checkButtonLabel),
    correctMessage: sanitizeCopy(copy.correctMessage),
    tryAgainMessage: sanitizeCopy(copy.tryAgainMessage),
    practiceCta: (level) => sanitizeCopy(copy.practiceCta(level)),
    browseMoreHeading: (level, targetLang) =>
      sanitizeCopy(copy.browseMoreHeading(level, targetLang)),
    levelQuestion: (word) => sanitizeCopy(copy.levelQuestion(word)),
    grammarQuestion: (word) => sanitizeCopy(copy.grammarQuestion(word)),
    topicQuestion: (word) => sanitizeCopy(copy.topicQuestion(word)),
    notFoundTitle: sanitizeCopy(copy.notFoundTitle),
    notFoundBody: sanitizeCopy(copy.notFoundBody),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatKeyLabel(value: string): string {
  return value
    .split(" ")
    .map((part) =>
      part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join(" ");
}

function slugToDisplayWord(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // Keep original slug when malformed escape sequences are present.
  }

  return decoded
    .replace(/-/g, " ")
    .trim();
}

function highlightWord(sentence: string, word: string): React.ReactNode {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "i");
  const parts = sentence.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function speakWord(word: string, speechLang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = speechLang;
  window.speechSynthesis.speak(utterance);
}

interface WordPageT {
  h1: (word: string, targetLang: string) => string;
  definitionHeading: string;
  exampleSentenceHeading: string;
  wordInfoHeading: string;
  typeLabel: string;
  levelLabel: string;
  categoryLabel: string;
  relatedWordsHeading: string;
  otherMeaningsHeading: string;
  openWordPageCta: string;
  pronounceLabel: string;
  practiceHeading: string;
  practiceInstruction: string;
  definitionLabel: string;
  checkButtonLabel: string;
  correctMessage: string;
  tryAgainMessage: string;
  practiceCta: (level: string) => string;
  browseMoreHeading: (level: string, targetLang: string) => string;
  levelQuestion: (word: string) => string;
  grammarQuestion: (word: string) => string;
  topicQuestion: (word: string) => string;
  notFoundTitle: string;
  notFoundBody: string;
}

const TRANSLATIONS: Record<UiLanguageCode, WordPageT> = {
  en: {
    h1: (word, lang) => `Meaning of the ${lang} Word "${capitalize(word)}"`,
    definitionHeading: "Definition",
    exampleSentenceHeading: "Example Sentence",
    wordInfoHeading: "Word Information",
    typeLabel: "Word type",
    levelLabel: "CEFR level",
    categoryLabel: "Category",
    relatedWordsHeading: "Related Words",
    otherMeaningsHeading: "Other Meanings of This Word",
    openWordPageCta: "Open Word Page",
    pronounceLabel: "Hear pronunciation",
    practiceHeading: "Practice This Word",
    practiceInstruction: "Type the correct word based on the definition.",
    definitionLabel: "Definition:",
    checkButtonLabel: "Check Answer",
    correctMessage: "Correct ✓",
    tryAgainMessage: "Try again",
    practiceCta: (level) => `Practice More ${level} Vocabulary`,
    browseMoreHeading: (level, lang) => `Browse More ${level} ${lang} Words`,
    levelQuestion: (w) => `What is the CEFR level of the word "${w}"?`,
    grammarQuestion: (w) => `What grammatical category does "${w}" have?`,
    topicQuestion: (w) => `Which vocabulary topic does "${w}" belong to?`,
    notFoundTitle: "Word not found",
    notFoundBody:
      "The requested word could not be found in our vocabulary database.",
  },
  es: {
    h1: (word, lang) =>
      `Significado de la palabra ${lang} "${capitalize(word)}"`,
    definitionHeading: "Definición",
    exampleSentenceHeading: "Frase de ejemplo",
    wordInfoHeading: "Información de la palabra",
    typeLabel: "Tipo de palabra",
    levelLabel: "Nivel MCER",
    categoryLabel: "Categoría",
    relatedWordsHeading: "Palabras relacionadas",
    otherMeaningsHeading: "Otros significados de esta palabra",
    openWordPageCta: "Abrir página de la palabra",
    pronounceLabel: "Escuchar pronunciación",
    practiceHeading: "Practica esta palabra",
    practiceInstruction: "Escribe la palabra correcta según la definición.",
    definitionLabel: "Definición:",
    checkButtonLabel: "Comprobar respuesta",
    correctMessage: "Correcto ✓",
    tryAgainMessage: "Inténtalo de nuevo",
    practiceCta: (level) => `Practica más vocabulario ${level}`,
    browseMoreHeading: (level, lang) =>
      `Explora más palabras ${lang} de nivel ${level}`,
    levelQuestion: (w) => `¿Qué nivel MCER tiene la palabra "${w}"?`,
    grammarQuestion: (w) => `¿Qué categoría gramatical tiene "${w}"?`,
    topicQuestion: (w) => `¿A qué tema de vocabulario pertenece "${w}"?`,
    notFoundTitle: "Palabra no encontrada",
    notFoundBody:
      "La palabra solicitada no se encontró en nuestra base de datos de vocabulario.",
  },
  fr: {
    h1: (word, lang) => `Signification du mot ${lang} "${capitalize(word)}"`,
    definitionHeading: "Définition",
    exampleSentenceHeading: "Exemple de phrase",
    wordInfoHeading: "Informations sur le mot",
    typeLabel: "Type de mot",
    levelLabel: "Niveau CECR",
    categoryLabel: "Catégorie",
    relatedWordsHeading: "Mots associés",
    otherMeaningsHeading: "Autres significations de ce mot",
    openWordPageCta: "Ouvrir la page du mot",
    pronounceLabel: "Écouter la prononciation",
    practiceHeading: "Pratiquer ce mot",
    practiceInstruction:
      "Tapez le mot correct en vous basant sur la définition.",
    definitionLabel: "Définition :",
    checkButtonLabel: "Vérifier la réponse",
    correctMessage: "Correct ✓",
    tryAgainMessage: "Réessayez",
    practiceCta: (level) => `Pratiquer plus de vocabulaire ${level}`,
    browseMoreHeading: (level, lang) =>
      `Explorer plus de mots ${lang} de niveau ${level}`,
    levelQuestion: (w) => `Quel est le niveau CECRL du mot « ${w} » ?`,
    grammarQuestion: (w) => `Quelle est la nature grammaticale de « ${w} » ?`,
    topicQuestion: (w) => `À quel thème de vocabulaire appartient « ${w} » ?`,
    notFoundTitle: "Mot introuvable",
    notFoundBody:
      "Le mot demandé n'a pas été trouvé dans notre base de données de vocabulaire.",
  },
  de: {
    h1: (word, lang) => `Bedeutung des ${lang}en Wortes "${capitalize(word)}"`,
    definitionHeading: "Definition",
    exampleSentenceHeading: "Beispielsatz",
    wordInfoHeading: "Wortinformationen",
    typeLabel: "Wortart",
    levelLabel: "GER-Niveau",
    categoryLabel: "Kategorie",
    relatedWordsHeading: "Verwandte Wörter",
    otherMeaningsHeading: "Andere Bedeutungen dieses Wortes",
    openWordPageCta: "Wortseite öffnen",
    pronounceLabel: "Aussprache anhören",
    practiceHeading: "Dieses Wort üben",
    practiceInstruction: "Tippe das richtige Wort anhand der Definition.",
    definitionLabel: "Definition:",
    checkButtonLabel: "Antwort prüfen",
    correctMessage: "Richtig ✓",
    tryAgainMessage: "Nochmal versuchen",
    practiceCta: (level) => `Mehr ${level} Vokabeln üben`,
    browseMoreHeading: (level, lang) =>
      `Mehr ${level}-Wörter auf ${lang} entdecken`,
    levelQuestion: (w) => `Welches GER-Niveau hat das Wort „${w}„?`,
    grammarQuestion: (w) => `Welche Wortart ist „${w}“?`,
    topicQuestion: (w) => `Zu welchem Wortschatzthema gehört „${w}“?`,
    notFoundTitle: "Wort nicht gefunden",
    notFoundBody:
      "Das angeforderte Wort wurde in unserer Vokabeldatenbank nicht gefunden.",
  },
  it: {
    h1: (word, lang) =>
      `Significato della parola ${lang} "${capitalize(word)}"`,
    definitionHeading: "Definizione",
    exampleSentenceHeading: "Frase di esempio",
    wordInfoHeading: "Informazioni sulla parola",
    typeLabel: "Tipo di parola",
    levelLabel: "Livello QCER",
    categoryLabel: "Categoria",
    relatedWordsHeading: "Parole correlate",
    otherMeaningsHeading: "Altri significati di questa parola",
    openWordPageCta: "Apri la pagina della parola",
    pronounceLabel: "Ascolta la pronuncia",
    practiceHeading: "Pratica questa parola",
    practiceInstruction: "Digita la parola corretta in base alla definizione.",
    definitionLabel: "Definizione:",
    checkButtonLabel: "Controlla risposta",
    correctMessage: "Corretto ✓",
    tryAgainMessage: "Riprova",
    practiceCta: (level) => `Pratica più vocabolario ${level}`,
    browseMoreHeading: (level, lang) =>
      `Scopri più parole ${lang} di livello ${level}`,
    levelQuestion: (w) => `Qual è il livello QCER della parola "${w}"?`,
    grammarQuestion: (w) => `Quale parte del discorso è "${w}"?`,
    topicQuestion: (w) => `A quale argomento di vocabolario appartiene "${w}"?`,
    notFoundTitle: "Parola non trovata",
    notFoundBody:
      "La parola richiesta non è stata trovata nel nostro database di vocabolario.",
  },
  pt: {
    h1: (word, lang) => `Significado da palavra ${lang} "${capitalize(word)}"`,
    definitionHeading: "Definição",
    exampleSentenceHeading: "Frase de exemplo",
    wordInfoHeading: "Informações da palavra",
    typeLabel: "Tipo de palavra",
    levelLabel: "Nível QECR",
    categoryLabel: "Categoria",
    relatedWordsHeading: "Palavras relacionadas",
    otherMeaningsHeading: "Outros significados desta palavra",
    openWordPageCta: "Abrir página da palavra",
    pronounceLabel: "Ouvir pronúncia",
    practiceHeading: "Pratique esta palavra",
    practiceInstruction: "Digite a palavra correta com base na definição.",
    definitionLabel: "Definição:",
    checkButtonLabel: "Verificar resposta",
    correctMessage: "Correto ✓",
    tryAgainMessage: "Tente novamente",
    practiceCta: (level) => `Pratique mais vocabulário ${level}`,
    browseMoreHeading: (level, lang) =>
      `Explore mais palavras ${lang} de nível ${level}`,
    levelQuestion: (w) => `Qual é o nível QECR da palavra "${w}"?`,
    grammarQuestion: (w) => `Qual é a classe gramatical de "${w}"?`,
    topicQuestion: (w) => `A que tema de vocabulário pertence "${w}"?`,
    notFoundTitle: "Palavra não encontrada",
    notFoundBody:
      "A palavra solicitada não foi encontrada em nosso banco de dados de vocabulário.",
  },
  ru: {
    h1: (word, lang) => `Значение слова "${capitalize(word)}" на ${lang}`,
    definitionHeading: "Определение",
    exampleSentenceHeading: "Пример предложения",
    wordInfoHeading: "Информация о слове",
    typeLabel: "Часть речи",
    levelLabel: "Уровень CEFR",
    categoryLabel: "Категория",
    relatedWordsHeading: "Связанные слова",
    otherMeaningsHeading: "Другие значения этого слова",
    openWordPageCta: "Открыть страницу слова",
    pronounceLabel: "Услышать произношение",
    practiceHeading: "Практикуйте это слово",
    practiceInstruction: "Введите правильное слово на основе определения.",
    definitionLabel: "Определение:",
    checkButtonLabel: "Проверить ответ",
    correctMessage: "Правильно ✓",
    tryAgainMessage: "Попробуйте снова",
    practiceCta: (level) => `Практикуйте больше слов уровня ${level}`,
    browseMoreHeading: (level, lang) =>
      `Изучайте больше ${lang} слов уровня ${level}`,
    levelQuestion: (w) => `Какой уровень CEFR у слова «${w}»?`,
    grammarQuestion: (w) => `Какая часть речи у слова «${w}»?`,
    topicQuestion: (w) => `К какой теме словарного запаса относится слово «${w}»?`,
    notFoundTitle: "Слово не найдено",
    notFoundBody:
      "Запрошенное слово не найдено в нашей базе данных словарного запаса.",
  },
};

interface WordSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId?: string | null;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
  initialData?: ResolvedWordPageData | null;
}

function getHydratedWordPageData(pathname: string): HydrationWordPageData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const payload = window.__WORD_PAGE_DATA__;
  if (!payload || payload.pathname !== pathname) {
    return null;
  }

  return payload.data ?? null;
}

export function WordSeoPage({
  uiLang,
  targetLanguage,
  wordSlug,
  conceptId,
  onStartPractice,
  initialData,
}: WordSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const { t: translateInterface } = useLanguage();
  const t = sanitizeWordPageTranslations(TRANSLATIONS[uiLang] ?? TRANSLATIONS.en);
  const targetLangName = sanitizeCopy(
    (TARGET_LANG_NAMES[uiLang] ?? TARGET_LANG_NAMES.en)[targetLanguage],
  );
  const hydratedData = useMemo(
    () => initialData ?? getHydratedWordPageData(location.pathname),
    [initialData, location.pathname],
  );
  const initialRouteKey = `${location.pathname}|${uiLang}|${targetLanguage}|${conceptId ?? ""}|${wordSlug}`;

  const exerciseInputRef = useRef<HTMLInputElement>(null);
  const hydratedRouteKeyRef = useRef(hydratedData ? initialRouteKey : null);
  const [wordEntry, setWordEntry] = useState<VocabEntry | null | undefined>(
    hydratedData ? hydratedData.wordEntry : undefined,
  );
  const [displayDefinition, setDisplayDefinition] = useState<string>(
    hydratedData?.displayDefinition ?? "",
  );
  const [displayWordLemma, setDisplayWordLemma] = useState<string>(
    hydratedData?.displayWordLemma ?? "",
  );
  const [displayWordType, setDisplayWordType] = useState<string>(
    hydratedData?.displayWordType ?? "",
  );
  const [displayCategory, setDisplayCategory] = useState<string>(
    hydratedData?.displayCategory ?? "",
  );
  const [relatedWords, setRelatedWords] = useState<VocabEntry[]>(
    hydratedData?.relatedWords ?? [],
  );
  const [browseWords, setBrowseWords] = useState<VocabEntry[]>(
    hydratedData?.browseWords ?? [],
  );
  const [browseWordsTotalCount, setBrowseWordsTotalCount] = useState(
    hydratedData?.browseWordsTotalCount ?? hydratedData?.browseWords.length ?? 0,
  );
  const [otherMeanings, setOtherMeanings] = useState<VocabEntry[]>(
    hydratedData?.otherMeanings ?? [],
  );
  const [browsePage, setBrowsePage] = useState(0);
  const [browseSearch, setBrowseSearch] = useState("");
  const [isBrowseLoading, setIsBrowseLoading] = useState(false);
  const [practiceInput, setPracticeInput] = useState("");
  const [practiceResult, setPracticeResult] = useState<
    "correct" | "incorrect" | null
  >(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    const isHydratedInitialRoute = hydratedRouteKeyRef.current === initialRouteKey;
    const shouldUpgradePartialHydration = Boolean(
      isHydratedInitialRoute && hydratedData?.browseWordsPartial,
    );

    if (isHydratedInitialRoute && !shouldUpgradePartialHydration) {
      hydratedRouteKeyRef.current = null;
      return;
    }
    hydratedRouteKeyRef.current = null;

    if (!shouldUpgradePartialHydration) {
      setWordEntry(undefined);
      setDisplayDefinition("");
      setDisplayWordLemma("");
      setDisplayWordType("");
      setDisplayCategory("");
      setRelatedWords([]);
      setBrowseWords([]);
      setBrowseWordsTotalCount(0);
      setOtherMeanings([]);
      setBrowsePage(0);
      setBrowseSearch("");
      setIsBrowseLoading(true);
      setPracticeInput("");
      setPracticeResult(null);
    }
    const key = `../../data/vocabulary/${targetLanguage}/vocabulary.json`;
    const loader = wordVocabModules[key];
    if (!loader) {
      setWordEntry(null);
      setBrowseWordsTotalCount(0);
      setIsBrowseLoading(false);
      return;
    }
    let cancelled = false;
    loader().then(async (mod) => {
      if (cancelled) return;
      const uiVocabLang = getUiVocabularyLanguage(uiLang);
      let uiVocabulary: VocabEntry[] | null = null;
      if (uiVocabLang !== targetLanguage) {
        const uiKey = `../../data/vocabulary/${uiVocabLang}/vocabulary.json`;
        const uiLoader = wordVocabModules[uiKey];
        if (uiLoader) {
          const uiMod = await uiLoader();
          if (cancelled) return;
          uiVocabulary = uiMod.default;
        }
      }

      const resolved = buildResolvedWordPageData({
        uiLang,
        targetLanguage,
        wordSlug,
        conceptId,
        vocabulary: mod.default,
        uiVocabulary,
      });

      setWordEntry(resolved.wordEntry);
      setDisplayDefinition(resolved.displayDefinition);
      setDisplayWordLemma(resolved.displayWordLemma);
      setDisplayWordType(resolved.displayWordType);
      setDisplayCategory(resolved.displayCategory);
      setOtherMeanings(resolved.otherMeanings);
      setRelatedWords(resolved.relatedWords);
      setBrowseWords(resolved.browseWords);
      setBrowseWordsTotalCount(resolved.browseWords.length);
      setIsBrowseLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setBrowseWords([]);
      setBrowseWordsTotalCount(0);
      setIsBrowseLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [conceptId, hydratedData?.browseWordsPartial, initialRouteKey, targetLanguage, uiLang, wordSlug]);

  const seoMetadata = useMemo(() => {
    if (!conceptId || !wordEntry) {
      return null;
    }

    return buildWordSeoMetadata({
      uiLang,
      targetLanguage,
      targetLanguageDisplayName: targetLangName,
      wordLemma: wordEntry.word_lemma,
      conceptId,
      definition: displayDefinition || wordEntry.definiton,
      wordType: displayWordType || wordEntry.type,
      cefrLevel: wordEntry.level,
      pathname: location.pathname,
      siteOrigin,
    });
  }, [
    conceptId,
    displayDefinition,
    displayWordType,
    wordEntry,
    wordSlug,
    uiLang,
    targetLanguage,
    targetLangName,
    location.pathname,
    siteOrigin,
  ]);

  if (wordEntry === undefined) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
        {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="h-6 w-2/4 animate-pulse rounded bg-border/40" />
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-border/30" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-border/30" />
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (wordEntry === null) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
        {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h1 className="text-2xl text-foreground">{t.notFoundTitle}</h1>
            <p className="mt-3 text-muted-foreground">{t.notFoundBody}</p>
          </div>
        </div>
      </main>
    );
  }

  const word = wordEntry.word_lemma;
  const localizedWordLemma = displayWordLemma || wordEntry.word_lemma;
  const definition = displayDefinition || wordEntry.definiton;
  const sentence = wordEntry.sentence;
  const wordType = displayWordType || wordEntry.type;
  const category = displayCategory || wordEntry.category;
  const level = wordEntry.level;
  const speechLang = SPEECH_LANG[targetLanguage] ?? "en-US";
  const translatedWordType = translateInterface(`wordTypes.${wordType}`);
  const localizedWordType =
    translatedWordType && translatedWordType !== `wordTypes.${wordType}`
      ? sanitizeCopy(translatedWordType)
      : sanitizeCopy(formatKeyLabel(wordType));
  const translatedLevel = translateInterface(`levels.${level.toLowerCase()}`);
  const localizedLevel =
    translatedLevel && translatedLevel !== `levels.${level.toLowerCase()}`
      ? sanitizeCopy(translatedLevel)
      : sanitizeCopy(level);
  const translatedCategory = category
    ? translateInterface(`levelCategory.topicNames.${category}`)
    : "";
  const localizedCategory =
    category &&
    translatedCategory &&
    translatedCategory !== `levelCategory.topicNames.${category}`
      ? sanitizeCopy(translatedCategory)
      : category
        ? sanitizeCopy(formatKeyLabel(category))
        : "";
  const levelQuestion = t.levelQuestion(word);
  const typeQuestion = t.grammarQuestion(word);
  const categoryQuestion = t.topicQuestion(word);
  const browseHeading = t.browseMoreHeading(level, targetLangName);
  const normalizedBrowseSearch = browseSearch.trim().toLowerCase();
  const filteredBrowseWords = normalizedBrowseSearch
    ? browseWords.filter((browseWord) =>
        browseWord.word_lemma.toLowerCase().includes(normalizedBrowseSearch),
      )
    : browseWords;
  const browseWordCountForPagination = normalizedBrowseSearch
    ? filteredBrowseWords.length
    : Math.max(browseWordsTotalCount, filteredBrowseWords.length);
  const totalBrowsePages = Math.max(
    1,
    Math.ceil(browseWordCountForPagination / WORDS_PER_PAGE),
  );
  const safeBrowsePage = Math.min(browsePage, Math.max(totalBrowsePages - 1, 0));
  const pageWords = filteredBrowseWords.slice(
    safeBrowsePage * WORDS_PER_PAGE,
    (safeBrowsePage + 1) * WORDS_PER_PAGE,
  );

  function checkAnswer() {
    const correct = practiceInput.trim().toLowerCase() === word.toLowerCase();
    setPracticeResult(correct ? "correct" : "incorrect");
  }

  function scrollToExercise() {
    exerciseInputRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    exerciseInputRef.current?.focus();
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-[1200px] space-y-6">
        {/* HERO — two-column card */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]">
            {/* LEFT: word + meta + definition + CTA */}
            <div className="flex h-full flex-col justify-center p-6 md:p-10">
              <h1 className="text-base font-medium text-muted-foreground md:text-lg">
                {t.h1(word, targetLangName)}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="break-words text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-7xl">
                  {word}
                </span>
                <button
                  type="button"
                  aria-label={t.pronounceLabel}
                  onClick={() => speakWord(word, speechLang)}
                  className="inline-flex flex-shrink-0 items-center justify-center rounded-full p-2 text-primary/80 transition hover:bg-primary/10 hover:text-primary translate-y-1"
                >
                  <Volume2 className="h-11 w-11 sm:h-12 sm:w-12" />
                </button>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-bold leading-tight tracking-tight text-primary/80 md:text-4xl">
                  {localizedWordLemma}
                </span>
              </div>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                {definition}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={scrollToExercise}
                  className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
                >
                  {t.practiceHeading}
                </button>
                <button
                  type="button"
                  onClick={() => onStartPractice(targetLanguage, level)}
                  className="rounded-xl border border-primary/45 bg-primary/10 px-6 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/15"
                >
                  {t.practiceCta(level)}
                </button>
              </div>
            </div>

            {/* RIGHT: example sentence */}
            <div className="flex flex-col border-t border-border bg-muted/20 p-6 lg:border-l lg:border-t-0 md:p-8 lg:p-10">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t.exampleSentenceHeading}
              </p>
              <div className="mt-4 flex flex-1 items-center">
                <p className="text-lg italic leading-relaxed text-foreground">
                  {highlightWord(sentence, word)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {otherMeanings.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-base font-semibold text-foreground">
              {t.otherMeaningsHeading}
            </h2>
            <div className="mt-4 divide-y divide-border rounded-xl border-2 border-primary/20 bg-primary/[0.03]">
              {otherMeanings.map((meaning) => {
                const translatedOtherType = translateInterface(`wordTypes.${meaning.type}`);
                const localizedOtherType =
                  translatedOtherType &&
                  translatedOtherType !== `wordTypes.${meaning.type}`
                    ? translatedOtherType
                    : formatKeyLabel(meaning.type);

                return (
                  <div
                    key={meaning.concept_id}
                    className="flex flex-col gap-3 bg-card/80 p-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <p className="min-w-0 flex-1 break-words text-sm text-foreground">
                      {meaning.definiton}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      <span className="rounded-full border border-primary/35 bg-primary/[0.14] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                        {meaning.level}
                      </span>
                      {meaning.type ? (
                        <span className="rounded-full border border-border/80 bg-muted/70 px-2 py-0.5 text-xs font-medium text-foreground/80">
                          {localizedOtherType}
                        </span>
                      ) : null}
                    </div>
                    <Link
                      to={buildWordPath(
                        uiLang,
                        targetLanguage,
                        meaning.word_lemma,
                        meaning.concept_id,
                      )}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary shadow-sm transition hover:bg-primary/25 hover:border-primary/70"
                    >
                      {t.openWordPageCta}
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* CONTENT GRID: exercise + info/related */}
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[3fr_2fr]">
          {/* LEFT — exercise */}
          <section className="h-full rounded-2xl border-2 border-primary/25 bg-primary/[0.04] p-6 md:p-8">
            <h2 className="text-base font-semibold text-foreground">
              {t.practiceHeading}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.practiceInstruction}
            </p>
            <div className="mt-5 space-y-4">
              <p className="rounded-lg border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t.definitionLabel}
                </span>{" "}
                {definition}
              </p>
              <input
                ref={exerciseInputRef}
                type="text"
                value={practiceInput}
                onChange={(e) => {
                  setPracticeInput(e.target.value);
                  setPracticeResult(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="..."
                aria-label={t.practiceInstruction}
              />
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={checkAnswer}
                  className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
                >
                  {t.checkButtonLabel}
                </button>
                {practiceResult === "correct" && (
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                    {t.correctMessage}
                  </span>
                )}
                {practiceResult === "incorrect" && (
                  <span className="text-sm font-semibold text-red-500">
                    {t.tryAgainMessage}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT — word info + related */}
          <section className="h-full rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-base font-semibold text-foreground">
              {t.wordInfoHeading}
            </h2>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                <h3 className="text-sm font-semibold leading-5 text-foreground">
                  {levelQuestion}
                </h3>
                <p className="mt-2 inline-flex rounded-md border border-primary/25 bg-background px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                  {localizedLevel}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <h3 className="text-sm font-semibold leading-5 text-foreground">
                  {typeQuestion}
                </h3>
                <p className="mt-2 text-sm font-semibold capitalize text-foreground">
                  {localizedWordType}
                </p>
              </div>
              {category ? (
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold leading-5 text-foreground">
                    {categoryQuestion}
                  </h3>
                  <p className="mt-2 text-sm font-semibold capitalize text-foreground">
                    {localizedCategory}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {relatedWords.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-base font-semibold text-foreground">
              {t.relatedWordsHeading}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {relatedWords.map((relWord) => (
                <Link
                  key={relWord.concept_id}
                  to={buildWordPath(uiLang, targetLanguage, relWord.word_lemma, relWord.concept_id)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  {relWord.word_lemma}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* BOTTOM CTA */}
        <div className="flex justify-center rounded-2xl border border-border bg-card p-6 md:p-8">
          <button
            type="button"
            onClick={() => onStartPractice(targetLanguage, level)}
            className="inline-block rounded-xl bg-primary px-7 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            {t.practiceCta(level)}
          </button>
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{browseHeading}</h2>
          <input
            type="text"
            value={browseSearch}
            onChange={(e) => {
              setBrowseSearch(e.target.value);
              setBrowsePage(0);
            }}
            placeholder={`Search ${level} words...`}
            className="mt-4 w-full rounded-xl border-2 border-primary/35 bg-primary/[0.06] px-4 py-3 text-base font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
          />
          {isBrowseLoading ? (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded-lg border border-border bg-border/30"
                />
              ))}
            </div>
          ) : pageWords.length > 0 ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {pageWords.map((browseWord) => (
                  <Link
                    key={browseWord.concept_id}
                    to={buildWordPath(uiLang, targetLanguage, browseWord.word_lemma, browseWord.concept_id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-center text-sm text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    {browseWord.word_lemma}
                  </Link>
                ))}
              </div>
              {totalBrowsePages > 1 && (
                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {getPaginationRange(safeBrowsePage, totalBrowsePages).map((item, idx) =>
                    item === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 py-1 text-sm text-muted-foreground"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setBrowsePage(item)}
                        className={
                          item === safeBrowsePage
                            ? "min-w-8 rounded-lg border border-primary bg-primary/10 px-2 py-1 text-sm text-primary"
                            : "min-w-8 rounded-lg border border-border px-2 py-1 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                        }
                      >
                        {item + 1}
                      </button>
                    ),
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="mt-5 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              No words found for this search.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
