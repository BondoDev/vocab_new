import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { Volume2 } from "lucide-react";
import {
  SUPPORTED_LEVELS,
  buildLocalizedVocabularyPath,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/seo/slugs";
import { buildWordPath, wordToSlug } from "../../data/seo/wordSlugs";
import { buildWordSeoMetadata } from "../../seo/metadata";
import { SEOHead, useSeoSiteOrigin } from "../../seo/SeoContext";

type CefrLevel = (typeof SUPPORTED_LEVELS)[number];

interface VocabEntry {
  concept_id: string;
  word_lemma: string;
  definiton: string;
  sentence: string;
  type: string;
  category: string;
  level: string;
}

const UI_LANG_TO_VOCAB: Record<UiLanguageCode, TargetLanguageSlug> = {
  en: "english",
  es: "spanish",
  fr: "french",
  de: "german",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

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

const TARGET_LANG_NAMES: Record<UiLanguageCode, Record<TargetLanguageSlug, string>> = {
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  pronounceLabel: string;
  practiceHeading: string;
  practiceInstruction: string;
  definitionLabel: string;
  checkButtonLabel: string;
  correctMessage: string;
  tryAgainMessage: string;
  practiceCta: (level: string) => string;
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
    pronounceLabel: "Hear pronunciation",
    practiceHeading: "Practice This Word",
    practiceInstruction: "Type the correct word based on the definition.",
    definitionLabel: "Definition:",
    checkButtonLabel: "Check Answer",
    correctMessage: "Correct ✓",
    tryAgainMessage: "Try again",
    practiceCta: (level) => `Practice More ${level} Vocabulary`,
    notFoundTitle: "Word not found",
    notFoundBody: "The requested word could not be found in our vocabulary database.",
  },
  es: {
    h1: (word, lang) => `Significado de la palabra ${lang} "${capitalize(word)}"`,
    definitionHeading: "Definición",
    exampleSentenceHeading: "Frase de ejemplo",
    wordInfoHeading: "Información de la palabra",
    typeLabel: "Tipo de palabra",
    levelLabel: "Nivel MCER",
    categoryLabel: "Categoría",
    relatedWordsHeading: "Palabras relacionadas",
    pronounceLabel: "Escuchar pronunciación",
    practiceHeading: "Practica esta palabra",
    practiceInstruction: "Escribe la palabra correcta según la definición.",
    definitionLabel: "Definición:",
    checkButtonLabel: "Comprobar respuesta",
    correctMessage: "Correcto ✓",
    tryAgainMessage: "Inténtalo de nuevo",
    practiceCta: (level) => `Practica más vocabulario ${level}`,
    notFoundTitle: "Palabra no encontrada",
    notFoundBody: "La palabra solicitada no se encontró en nuestra base de datos de vocabulario.",
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
    pronounceLabel: "Écouter la prononciation",
    practiceHeading: "Pratiquer ce mot",
    practiceInstruction: "Tapez le mot correct en vous basant sur la définition.",
    definitionLabel: "Définition :",
    checkButtonLabel: "Vérifier la réponse",
    correctMessage: "Correct ✓",
    tryAgainMessage: "Réessayez",
    practiceCta: (level) => `Pratiquer plus de vocabulaire ${level}`,
    notFoundTitle: "Mot introuvable",
    notFoundBody: "Le mot demandé n'a pas été trouvé dans notre base de données de vocabulaire.",
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
    pronounceLabel: "Aussprache anhören",
    practiceHeading: "Dieses Wort üben",
    practiceInstruction: "Tippe das richtige Wort anhand der Definition.",
    definitionLabel: "Definition:",
    checkButtonLabel: "Antwort prüfen",
    correctMessage: "Richtig ✓",
    tryAgainMessage: "Nochmal versuchen",
    practiceCta: (level) => `Mehr ${level} Vokabeln üben`,
    notFoundTitle: "Wort nicht gefunden",
    notFoundBody: "Das angeforderte Wort wurde in unserer Vokabeldatenbank nicht gefunden.",
  },
  it: {
    h1: (word, lang) => `Significato della parola ${lang} "${capitalize(word)}"`,
    definitionHeading: "Definizione",
    exampleSentenceHeading: "Frase di esempio",
    wordInfoHeading: "Informazioni sulla parola",
    typeLabel: "Tipo di parola",
    levelLabel: "Livello QCER",
    categoryLabel: "Categoria",
    relatedWordsHeading: "Parole correlate",
    pronounceLabel: "Ascolta la pronuncia",
    practiceHeading: "Pratica questa parola",
    practiceInstruction: "Digita la parola corretta in base alla definizione.",
    definitionLabel: "Definizione:",
    checkButtonLabel: "Controlla risposta",
    correctMessage: "Corretto ✓",
    tryAgainMessage: "Riprova",
    practiceCta: (level) => `Pratica più vocabolario ${level}`,
    notFoundTitle: "Parola non trovata",
    notFoundBody: "La parola richiesta non è stata trovata nel nostro database di vocabolario.",
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
    pronounceLabel: "Ouvir pronúncia",
    practiceHeading: "Pratique esta palavra",
    practiceInstruction: "Digite a palavra correta com base na definição.",
    definitionLabel: "Definição:",
    checkButtonLabel: "Verificar resposta",
    correctMessage: "Correto ✓",
    tryAgainMessage: "Tente novamente",
    practiceCta: (level) => `Pratique mais vocabulário ${level}`,
    notFoundTitle: "Palavra não encontrada",
    notFoundBody: "A palavra solicitada não foi encontrada em nosso banco de dados de vocabulário.",
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
    pronounceLabel: "Услышать произношение",
    practiceHeading: "Практикуйте это слово",
    practiceInstruction: "Введите правильное слово на основе определения.",
    definitionLabel: "Определение:",
    checkButtonLabel: "Проверить ответ",
    correctMessage: "Правильно ✓",
    tryAgainMessage: "Попробуйте снова",
    practiceCta: (level) => `Практикуйте больше слов уровня ${level}`,
    notFoundTitle: "Слово не найдено",
    notFoundBody: "Запрошенное слово не найдено в нашей базе данных словарного запаса.",
  },
};

interface WordSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

export function WordSeoPage({
  uiLang,
  targetLanguage,
  wordSlug,
}: WordSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const t = TRANSLATIONS[uiLang] ?? TRANSLATIONS.en;
  const targetLangName = (TARGET_LANG_NAMES[uiLang] ?? TARGET_LANG_NAMES.en)[targetLanguage];

  const exerciseInputRef = useRef<HTMLInputElement>(null);
  const [wordEntry, setWordEntry] = useState<VocabEntry | null | undefined>(undefined);
  const [displayDefinition, setDisplayDefinition] = useState<string>("");
  const [relatedWords, setRelatedWords] = useState<string[]>([]);
  const [practiceInput, setPracticeInput] = useState("");
  const [practiceResult, setPracticeResult] = useState<"correct" | "incorrect" | null>(null);

  useEffect(() => {
    setWordEntry(undefined);
    setDisplayDefinition("");
    setRelatedWords([]);
    setPracticeInput("");
    setPracticeResult(null);
    const key = `../../data/vocabulary/${targetLanguage}/vocabulary.json`;
    const loader = wordVocabModules[key];
    if (!loader) {
      setWordEntry(null);
      return;
    }
    let cancelled = false;
    loader().then(async (mod) => {
      if (cancelled) return;
      const entry = mod.default.find((w) => wordToSlug(w.word_lemma) === wordSlug);
      setWordEntry(entry ?? null);

      if (!entry) return;

      // Load definition in UI language when it differs from the target language
      const uiVocabLang = UI_LANG_TO_VOCAB[uiLang];
      if (uiVocabLang !== targetLanguage) {
        const uiKey = `../../data/vocabulary/${uiVocabLang}/vocabulary.json`;
        const uiLoader = wordVocabModules[uiKey];
        if (uiLoader) {
          const uiMod = await uiLoader();
          if (cancelled) return;
          const uiEntry = uiMod.default.find((w) => w.concept_id === entry.concept_id);
          setDisplayDefinition(uiEntry?.definiton ?? entry.definiton);
        } else {
          setDisplayDefinition(entry.definiton);
        }
      } else {
        setDisplayDefinition(entry.definiton);
      }

      const seen = new Set<string>([entry.word_lemma.toLowerCase()]);
      const related: string[] = [];
      for (const w of mod.default) {
        if (
          w.category === entry.category &&
          w.level === entry.level &&
          w.word_lemma.length > 2 &&
          !seen.has(w.word_lemma.toLowerCase())
        ) {
          seen.add(w.word_lemma.toLowerCase());
          related.push(w.word_lemma);
          if (related.length >= 5) break;
        }
      }
      setRelatedWords(related);
    });
    return () => {
      cancelled = true;
    };
  }, [targetLanguage, wordSlug, uiLang]);

  const seoMetadata = useMemo(() => {
    if (!wordEntry) return null;
    return buildWordSeoMetadata({
      uiLang,
      targetLanguage,
      targetLanguageDisplayName: targetLangName,
      wordLemma: wordEntry.word_lemma,
      cefrLevel: wordEntry.level,
      pathname: location.pathname,
      siteOrigin,
    });
  }, [wordEntry, uiLang, targetLanguage, targetLangName, location.pathname, siteOrigin]);

  if (wordEntry === undefined) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-6">
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
  const definition = displayDefinition || wordEntry.definiton;
  const sentence = wordEntry.sentence;
  const wordType = wordEntry.type;
  const category = wordEntry.category;
  const level = wordEntry.level;
  const speechLang = SPEECH_LANG[targetLanguage] ?? "en-US";
  const cefrLevel = level.toLowerCase() as CefrLevel;
  const practiceHref = buildLocalizedVocabularyPath(uiLang, targetLanguage, cefrLevel);

  function checkAnswer() {
    const correct = practiceInput.trim().toLowerCase() === word.toLowerCase();
    setPracticeResult(correct ? "correct" : "incorrect");
  }

  function scrollToExercise() {
    exerciseInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    exerciseInputRef.current?.focus();
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-[1120px] space-y-6">

        {/* HERO */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-10">
          <h1 className="text-lg font-medium text-muted-foreground md:text-xl">
            {t.h1(word, targetLangName)}
          </h1>
          <div className="mt-4 flex items-end gap-3">
            <span className="text-6xl font-bold leading-none tracking-tight text-foreground md:text-7xl">
              {word}
            </span>
            <button
              type="button"
              aria-label={t.pronounceLabel}
              onClick={() => speakWord(word, speechLang)}
              className="mb-1 flex-shrink-0 rounded-full p-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
            >
              <Volume2 className="h-8 w-8" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {level}
            </span>
            <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
              {wordType}
            </span>
            {category && (
              <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
                {category}
              </span>
            )}
          </div>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {definition}
          </p>
          <button
            type="button"
            onClick={scrollToExercise}
            className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            {t.practiceHeading}
          </button>
        </section>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">

          {/* LEFT — example + exercise */}
          <div className="space-y-6">

            <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
              <h2 className="text-base font-semibold text-foreground">{t.exampleSentenceHeading}</h2>
              <p className="mt-3 rounded-xl border border-border/60 bg-muted/30 px-5 py-4 text-base italic leading-relaxed text-muted-foreground">
                {highlightWord(sentence, word)}
              </p>
            </section>

            <section className="rounded-2xl border-2 border-primary/25 bg-primary/[0.04] p-6 md:p-8">
              <h2 className="text-base font-semibold text-foreground">{t.practiceHeading}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.practiceInstruction}</p>
              <div className="mt-5 space-y-4">
                <p className="rounded-lg border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{t.definitionLabel}</span>{" "}
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

          </div>

          {/* RIGHT — word info + related words */}
          <div className="space-y-6">

            <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
              <h2 className="text-base font-semibold text-foreground">{t.wordInfoHeading}</h2>
              <dl className="mt-4 divide-y divide-border/50">
                {[
                  [t.levelLabel, level],
                  [t.typeLabel, wordType],
                  ...(category ? [[t.categoryLabel, category]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="text-sm font-semibold capitalize text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {relatedWords.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
                <h2 className="text-base font-semibold text-foreground">{t.relatedWordsHeading}</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {relatedWords.map((relWord) => (
                    <Link
                      key={relWord}
                      to={buildWordPath(uiLang, targetLanguage, relWord)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                      {relWord}
                    </Link>
                  ))}
                </div>
              </section>
            )}

          </div>
        </div>

        {/* BOTTOM CTA */}
        {practiceHref && (
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <Link
              to={practiceHref}
              className="inline-block rounded-xl bg-primary px-7 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
            >
              {t.practiceCta(level)}
            </Link>
          </div>
        )}

      </div>
    </main>
  );
}
