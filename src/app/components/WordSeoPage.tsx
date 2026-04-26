import { useEffect, useMemo, useState } from "react";
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
  word_lemma: string;
  definiton: string;
  sentence: string;
  type: string;
  category: string;
  level: string;
}

const wordVocabModules = import.meta.glob(
  "../../data/vocabulary/*/vocabulary.json",
) as Record<string, () => Promise<{ default: VocabEntry[] }>>;

const LEVEL_DISPLAY: Record<CefrLevel, string> = {
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
};

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

function getTypeVerb(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("noun")) return "refers to";
  if (t.includes("verb")) return "describes the action of";
  if (t.includes("adj")) return "describes the quality of being";
  if (t.includes("adv")) return "indicates";
  if (t.includes("prep")) return "shows a relationship, meaning";
  if (t.includes("conj")) return "connects ideas, meaning";
  return "means";
}

function generateExtraSentences(word: string, type: string): [string, string] {
  const w = word.toLowerCase();
  const W = capitalize(w);
  const t = type.toLowerCase();
  if (t.includes("noun")) return [`She bought a ${w} at the market.`, `The ${w} was very useful.`];
  if (t.includes("verb")) return [`I like to ${w} every morning.`, `They ${w} together every week.`];
  if (t.includes("adj")) return [`The room felt very ${w}.`, `She seemed ${w} after the news.`];
  if (t.includes("adv")) return [`He spoke ${w} and clearly.`, `She finished the work ${w}.`];
  if (t.includes("prep")) return [`The cat sat ${w} the chair.`, `She walked ${w} the building.`];
  if (t.includes("conj")) return [`She is kind ${w} patient.`, `I study ${w} I work.`];
  if (t.includes("pron")) return [`${W} is my best friend.`, `Can you see ${w}?`];
  return [`${W} is an important word to know.`, `You will hear "${w}" in many conversations.`];
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
  meaningHeading: (word: string) => string;
  meaningIntro: (word: string, targetLang: string, def: string, category: string, type: string) => string;
  examplesHeading: string;
  trySentencePrompt: (word: string) => string;
  wordInfoHeading: string;
  wordLabel: string;
  typeLabel: string;
  levelLabel: string;
  categoryLabel: string;
  relatedWordsHeading: string;
  pronounceLabel: string;
  usageHeading: (word: string) => string;
  usageLines: (word: string, targetLang: string, type: string, category: string) => string[];
  practiceHeading: (word: string) => string;
  practiceBody: (word: string, targetLang: string) => string;
  practiceExercises: string[];
  practiceCta: string;
  learnMoreHeading: (targetLang: string) => string;
  learnMoreLinkLabel: (targetLang: string, level: string) => string;
  notFoundTitle: string;
  notFoundBody: string;
}

const TRANSLATIONS: Record<UiLanguageCode, WordPageT> = {
  en: {
    h1: (word, lang) => `Meaning of the ${lang} Word "${capitalize(word)}"`,
    meaningHeading: (word) => `Meaning of the Word "${word}"`,
    meaningIntro: (word, lang, def, category, type) => {
      const d = def.replace(/\.$/, "").toLowerCase();
      const v = getTypeVerb(type);
      return `The ${lang} word "${word}" ${v} ${d}. It commonly appears in ${category} situations and is one of the important words for ${lang} learners to recognise early. Understanding "${word}" will help you follow everyday conversations, read simple texts, and express your thoughts more naturally in ${lang}.`;
    },
    examplesHeading: "Example Sentences",
    trySentencePrompt: (word) =>
      `Try forming your own sentence with "${word}" to strengthen your memory.`,
    wordInfoHeading: "Word Information",
    wordLabel: "Word",
    typeLabel: "Word type",
    levelLabel: "CEFR level",
    categoryLabel: "Category",
    relatedWordsHeading: "Related Words",
    pronounceLabel: "Hear pronunciation",
    usageHeading: (word) => `How the Word "${word}" Is Used`,
    usageLines: (word, lang, type, category) => [
      `"${word}" is a ${type} in ${lang} and appears frequently in everyday situations.`,
      `You will encounter "${word}" in ${category} contexts such as conversations, reading passages, and basic writing.`,
      `Practising "${word}" regularly helps you recognise it quickly and use it naturally when speaking or writing ${lang}.`,
    ],
    practiceHeading: (word) => `Practice the Word "${word}"`,
    practiceBody: (word, lang) =>
      `FluentStellar offers interactive exercises to help you memorise the ${lang} word "${word}" and thousands of other vocabulary words. Regular practice is the fastest way to move from recognising a word to actively using it in conversation.`,
    practiceExercises: ["Typing exercises", "Word connection exercises", "Listening exercises"],
    practiceCta: "Start Vocabulary Practice",
    learnMoreHeading: (lang) => `Learn More ${lang} Vocabulary`,
    learnMoreLinkLabel: (lang, level) => `${lang} ${level} Vocabulary Practice`,
    notFoundTitle: "Word not found",
    notFoundBody: "The requested word could not be found in our vocabulary database.",
  },
  es: {
    h1: (word, lang) => `Significado de la palabra ${lang} "${capitalize(word)}"`,
    meaningHeading: (word) => `Significado de la palabra "${word}"`,
    meaningIntro: (word, lang, def, category, _type) => {
      const d = def.replace(/\.$/, "").toLowerCase();
      return `La palabra ${lang} "${word}" significa ${d}. Aparece con frecuencia en situaciones de ${category} y es una de las palabras esenciales que los estudiantes de ${lang} deben conocer desde el principio. Entender "${word}" te ayudará a seguir conversaciones, leer textos sencillos y expresarte con más naturalidad en ${lang}.`;
    },
    examplesHeading: "Oraciones de ejemplo",
    trySentencePrompt: (word) =>
      `Intenta formar tu propia oración con "${word}" para reforzar tu memoria.`,
    wordInfoHeading: "Información de la palabra",
    wordLabel: "Palabra",
    typeLabel: "Tipo de palabra",
    levelLabel: "Nivel MCER",
    categoryLabel: "Categoría",
    relatedWordsHeading: "Palabras relacionadas",
    pronounceLabel: "Escuchar pronunciación",
    usageHeading: (word) => `Cómo se usa la palabra "${word}"`,
    usageLines: (word, lang, type, category) => [
      `"${word}" es un/una ${type} en ${lang} y aparece con frecuencia en situaciones cotidianas.`,
      `Encontrarás "${word}" en contextos de ${category} como conversaciones, textos de lectura y escritura básica.`,
      `Practicar "${word}" regularmente te ayuda a reconocerlo rápidamente y a usarlo de forma natural en ${lang}.`,
    ],
    practiceHeading: (word) => `Practica la palabra "${word}"`,
    practiceBody: (word, lang) =>
      `FluentStellar ofrece ejercicios interactivos para ayudarte a memorizar la palabra ${lang} "${word}" y miles de otras palabras. La práctica regular es la forma más rápida de pasar de reconocer una palabra a usarla activamente en conversaciones.`,
    practiceExercises: ["Ejercicios de escritura", "Ejercicios de conexión de palabras", "Ejercicios de escucha"],
    practiceCta: "Iniciar práctica de vocabulario",
    learnMoreHeading: (lang) => `Aprende más vocabulario de ${lang}`,
    learnMoreLinkLabel: (lang, level) => `Práctica de vocabulario ${lang} ${level}`,
    notFoundTitle: "Palabra no encontrada",
    notFoundBody: "La palabra solicitada no se encontró en nuestra base de datos de vocabulario.",
  },
  fr: {
    h1: (word, lang) => `Signification du mot ${lang} "${capitalize(word)}"`,
    meaningHeading: (word) => `Signification du mot "${word}"`,
    meaningIntro: (word, lang, def, category, _type) => {
      const d = def.replace(/\.$/, "").toLowerCase();
      return `Le mot ${lang} "${word}" signifie ${d}. Il apparaît fréquemment dans les contextes de ${category} et fait partie des mots essentiels que les apprenants de ${lang} doivent maîtriser tôt. Comprendre "${word}" vous aidera à suivre des conversations, lire des textes simples et vous exprimer plus naturellement en ${lang}.`;
    },
    examplesHeading: "Phrases exemples",
    trySentencePrompt: (word) =>
      `Essayez de former votre propre phrase avec "${word}" pour renforcer votre mémoire.`,
    wordInfoHeading: "Informations sur le mot",
    wordLabel: "Mot",
    typeLabel: "Type de mot",
    levelLabel: "Niveau CECR",
    categoryLabel: "Catégorie",
    relatedWordsHeading: "Mots associés",
    pronounceLabel: "Écouter la prononciation",
    usageHeading: (word) => `Comment le mot "${word}" est utilisé`,
    usageLines: (word, lang, type, category) => [
      `"${word}" est un(e) ${type} en ${lang} et apparaît fréquemment dans les situations quotidiennes.`,
      `Vous rencontrerez "${word}" dans des contextes de ${category} tels que des conversations, des textes et de l'écriture de base.`,
      `Pratiquer "${word}" régulièrement vous aide à le reconnaître rapidement et à l'utiliser naturellement en ${lang}.`,
    ],
    practiceHeading: (word) => `Pratiquer le mot "${word}"`,
    practiceBody: (word, lang) =>
      `FluentStellar propose des exercices interactifs pour vous aider à mémoriser le mot ${lang} "${word}" et des milliers d'autres mots. La pratique régulière est le moyen le plus rapide de passer de la reconnaissance à l'utilisation active en conversation.`,
    practiceExercises: ["Exercices de frappe", "Exercices de connexion de mots", "Exercices d'écoute"],
    practiceCta: "Commencer la pratique du vocabulaire",
    learnMoreHeading: (lang) => `Apprenez plus de vocabulaire ${lang}`,
    learnMoreLinkLabel: (lang, level) => `Pratique du vocabulaire ${lang} ${level}`,
    notFoundTitle: "Mot introuvable",
    notFoundBody: "Le mot demandé n'a pas été trouvé dans notre base de données de vocabulaire.",
  },
  de: {
    h1: (word, lang) => `Bedeutung des ${lang}en Wortes "${capitalize(word)}"`,
    meaningHeading: (word) => `Bedeutung des Wortes "${word}"`,
    meaningIntro: (word, lang, def, category, _type) => {
      const d = def.replace(/\.$/, "").toLowerCase();
      return `Das ${lang}e Wort "${word}" bedeutet ${d}. Es tritt häufig in ${category}-Situationen auf und gehört zu den wichtigen Vokabeln, die ${lang}-Lernende früh kennen sollten. Das Verständnis von "${word}" hilft dir, Gespräche zu folgen, einfache Texte zu lesen und dich natürlicher auf ${lang} auszudrücken.`;
    },
    examplesHeading: "Beispielsätze",
    trySentencePrompt: (word) =>
      `Versuche, einen eigenen Satz mit "${word}" zu bilden, um dein Gedächtnis zu stärken.`,
    wordInfoHeading: "Wortinformationen",
    wordLabel: "Wort",
    typeLabel: "Wortart",
    levelLabel: "GER-Niveau",
    categoryLabel: "Kategorie",
    relatedWordsHeading: "Verwandte Wörter",
    pronounceLabel: "Aussprache anhören",
    usageHeading: (word) => `Wie das Wort "${word}" verwendet wird`,
    usageLines: (word, lang, type, category) => [
      `"${word}" ist ein ${type} im ${lang}en und tritt häufig in alltäglichen Situationen auf.`,
      `Du wirst "${word}" in ${category}-Kontexten wie Gesprächen, Lesetexten und einfachem Schreiben begegnen.`,
      `Regelmäßiges Üben von "${word}" hilft dir, es schnell zu erkennen und natürlich auf ${lang} zu verwenden.`,
    ],
    practiceHeading: (word) => `Das Wort "${word}" üben`,
    practiceBody: (word, lang) =>
      `FluentStellar bietet interaktive Übungen, die dir helfen, das ${lang}e Wort "${word}" und tausende weitere Vokabeln zu memorieren. Regelmäßiges Üben ist der schnellste Weg zur aktiven Verwendung im Gespräch.`,
    practiceExercises: ["Tippübungen", "Wortverbindungsübungen", "Hörübungen"],
    practiceCta: "Vokabelübung starten",
    learnMoreHeading: (lang) => `Mehr ${lang}en Wortschatz lernen`,
    learnMoreLinkLabel: (lang, level) => `${lang}er ${level} Wortschatz üben`,
    notFoundTitle: "Wort nicht gefunden",
    notFoundBody: "Das angeforderte Wort wurde in unserer Vokabeldatenbank nicht gefunden.",
  },
  it: {
    h1: (word, lang) => `Significato della parola ${lang} "${capitalize(word)}"`,
    meaningHeading: (word) => `Significato della parola "${word}"`,
    meaningIntro: (word, lang, def, category, _type) => {
      const d = def.replace(/\.$/, "").toLowerCase();
      return `La parola ${lang} "${word}" significa ${d}. Appare frequentemente in contesti di ${category} ed è una delle parole essenziali che i discenti di ${lang} devono conoscere presto. Capire "${word}" ti aiuterà a seguire conversazioni, leggere testi semplici e esprimerti in modo più naturale in ${lang}.`;
    },
    examplesHeading: "Frasi di esempio",
    trySentencePrompt: (word) =>
      `Prova a formare la tua frase con "${word}" per rafforzare la memoria.`,
    wordInfoHeading: "Informazioni sulla parola",
    wordLabel: "Parola",
    typeLabel: "Tipo di parola",
    levelLabel: "Livello QCER",
    categoryLabel: "Categoria",
    relatedWordsHeading: "Parole correlate",
    pronounceLabel: "Ascolta la pronuncia",
    usageHeading: (word) => `Come si usa la parola "${word}"`,
    usageLines: (word, lang, type, category) => [
      `"${word}" è un/una ${type} in ${lang} e appare frequentemente nelle situazioni quotidiane.`,
      `Incontrerai "${word}" in contesti di ${category} come conversazioni, testi di lettura e scrittura di base.`,
      `Praticare "${word}" regolarmente ti aiuta a riconoscerla rapidamente e a usarla naturalmente in ${lang}.`,
    ],
    practiceHeading: (word) => `Pratica la parola "${word}"`,
    practiceBody: (word, lang) =>
      `FluentStellar offre esercizi interattivi per aiutarti a memorizzare la parola ${lang} "${word}" e migliaia di altre parole. La pratica regolare è il modo più rapido per passare dal riconoscimento all'uso attivo nelle conversazioni.`,
    practiceExercises: ["Esercizi di digitazione", "Esercizi di connessione delle parole", "Esercizi di ascolto"],
    practiceCta: "Inizia la pratica del vocabolario",
    learnMoreHeading: (lang) => `Impara più vocabolario ${lang}`,
    learnMoreLinkLabel: (lang, level) => `Pratica vocabolario ${lang} ${level}`,
    notFoundTitle: "Parola non trovata",
    notFoundBody: "La parola richiesta non è stata trovata nel nostro database di vocabolario.",
  },
  pt: {
    h1: (word, lang) => `Significado da palavra ${lang} "${capitalize(word)}"`,
    meaningHeading: (word) => `Significado da palavra "${word}"`,
    meaningIntro: (word, lang, def, category, _type) => {
      const d = def.replace(/\.$/, "").toLowerCase();
      return `A palavra ${lang} "${word}" significa ${d}. Ela aparece com frequência em situações de ${category} e é uma das palavras essenciais que os estudantes de ${lang} devem conhecer cedo. Entender "${word}" ajudará você a acompanhar conversas, ler textos simples e se expressar com mais naturalidade em ${lang}.`;
    },
    examplesHeading: "Frases de exemplo",
    trySentencePrompt: (word) =>
      `Tente formar sua própria frase com "${word}" para reforçar sua memória.`,
    wordInfoHeading: "Informações da palavra",
    wordLabel: "Palavra",
    typeLabel: "Tipo de palavra",
    levelLabel: "Nível QECR",
    categoryLabel: "Categoria",
    relatedWordsHeading: "Palavras relacionadas",
    pronounceLabel: "Ouvir pronúncia",
    usageHeading: (word) => `Como a palavra "${word}" é usada`,
    usageLines: (word, lang, type, category) => [
      `"${word}" é um(a) ${type} em ${lang} e aparece frequentemente em situações cotidianas.`,
      `Você encontrará "${word}" em contextos de ${category} como conversas, textos de leitura e escrita básica.`,
      `Praticar "${word}" regularmente ajuda você a reconhecê-la rapidamente e a usá-la naturalmente em ${lang}.`,
    ],
    practiceHeading: (word) => `Pratique a palavra "${word}"`,
    practiceBody: (word, lang) =>
      `FluentStellar oferece exercícios interativos para ajudá-lo a memorizar a palavra ${lang} "${word}" e milhares de outras palavras. A prática regular é a maneira mais rápida de passar do reconhecimento ao uso ativo nas conversas.`,
    practiceExercises: ["Exercícios de digitação", "Exercícios de conexão de palavras", "Exercícios de escuta"],
    practiceCta: "Iniciar prática de vocabulário",
    learnMoreHeading: (lang) => `Aprenda mais vocabulário de ${lang}`,
    learnMoreLinkLabel: (lang, level) => `Prática de vocabulário ${lang} ${level}`,
    notFoundTitle: "Palavra não encontrada",
    notFoundBody: "A palavra solicitada não foi encontrada em nosso banco de dados de vocabulário.",
  },
  ru: {
    h1: (word, lang) => `Значение слова "${capitalize(word)}" на ${lang}`,
    meaningHeading: (word) => `Значение слова "${word}"`,
    meaningIntro: (word, lang, def, category, _type) => {
      const d = def.replace(/\.$/, "").toLowerCase();
      return `Слово "${word}" на ${lang} означает ${d}. Оно часто встречается в контекстах категории «${category}» и является одним из ключевых слов, которые учащиеся ${lang} должны знать с самого начала. Понимание "${word}" поможет вам следить за разговорами, читать простые тексты и выражаться более естественно на ${lang}.`;
    },
    examplesHeading: "Примеры предложений",
    trySentencePrompt: (word) =>
      `Попробуйте составить своё предложение со словом "${word}", чтобы закрепить его в памяти.`,
    wordInfoHeading: "Информация о слове",
    wordLabel: "Слово",
    typeLabel: "Часть речи",
    levelLabel: "Уровень CEFR",
    categoryLabel: "Категория",
    relatedWordsHeading: "Связанные слова",
    pronounceLabel: "Услышать произношение",
    usageHeading: (word) => `Как используется слово "${word}"`,
    usageLines: (word, lang, type, category) => [
      `"${word}" является ${type} в ${lang} и часто встречается в повседневных ситуациях.`,
      `Вы будете встречать "${word}" в контекстах «${category}»: в разговорах, текстах для чтения и базовом письме.`,
      `Регулярная практика слова "${word}" поможет быстро его узнавать и использовать естественно на ${lang}.`,
    ],
    practiceHeading: (word) => `Тренируйте слово "${word}"`,
    practiceBody: (word, lang) =>
      `FluentStellar предлагает интерактивные упражнения для запоминания слова "${word}" на ${lang} и тысяч других слов. Регулярная практика — самый быстрый путь от узнавания слова к его активному использованию в разговоре.`,
    practiceExercises: ["Упражнения на ввод слов", "Упражнения на связь слов", "Упражнения на аудирование"],
    practiceCta: "Начать практику словарного запаса",
    learnMoreHeading: (lang) => `Изучайте больше слов на ${lang}`,
    learnMoreLinkLabel: (lang, level) => `Практика словарного запаса ${lang} ${level}`,
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
  onStartPractice,
}: WordSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const t = TRANSLATIONS[uiLang] ?? TRANSLATIONS.en;
  const targetLangName = (TARGET_LANG_NAMES[uiLang] ?? TARGET_LANG_NAMES.en)[targetLanguage];

  const [wordEntry, setWordEntry] = useState<VocabEntry | null | undefined>(undefined);
  const [relatedWords, setRelatedWords] = useState<string[]>([]);

  useEffect(() => {
    setWordEntry(undefined);
    setRelatedWords([]);
    const key = `../../data/vocabulary/${targetLanguage}/vocabulary.json`;
    const loader = wordVocabModules[key];
    if (!loader) {
      setWordEntry(null);
      return;
    }
    let cancelled = false;
    loader().then((mod) => {
      if (cancelled) return;
      const entry = mod.default.find((w) => wordToSlug(w.word_lemma) === wordSlug);
      setWordEntry(entry ?? null);

      if (entry) {
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
      }
    });
    return () => {
      cancelled = true;
    };
  }, [targetLanguage, wordSlug]);

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
        <div className="mx-auto w-full max-w-5xl space-y-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-6 md:p-8">
              <div className="h-8 w-3/4 animate-pulse rounded bg-border/40" />
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-border/30" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-border/30" />
                <div className="h-4 w-4/6 animate-pulse rounded bg-border/30" />
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
        <div className="mx-auto w-full max-w-5xl">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h1 className="text-2xl text-foreground">{t.notFoundTitle}</h1>
            <p className="mt-3 text-muted-foreground">{t.notFoundBody}</p>
          </div>
        </div>
      </main>
    );
  }

  const word = wordEntry.word_lemma;
  const definition = wordEntry.definiton;
  const sentence = wordEntry.sentence;
  const wordType = wordEntry.type;
  const category = wordEntry.category;
  const level = wordEntry.level;
  const speechLang = SPEECH_LANG[targetLanguage] ?? "en-US";
  const [extraSentence1, extraSentence2] = generateExtraSentences(word, wordType);
  const usageLines = t.usageLines(word, targetLangName, wordType, category);

  const cefrLevelLinks = SUPPORTED_LEVELS.map((lvl) => {
    const href = buildLocalizedVocabularyPath(uiLang, targetLanguage, lvl);
    return href
      ? { href, label: t.learnMoreLinkLabel(targetLangName, LEVEL_DISPLAY[lvl]) }
      : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const wordInfoRows: [string, string][] = [
    [t.wordLabel, word],
    [t.typeLabel, wordType],
    [t.levelLabel, level],
    [t.categoryLabel, category],
  ];

  const allSentences = [sentence, extraSentence1, extraSentence2];

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-5xl space-y-8">

        {/* Hero — H1 + intro */}
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl text-foreground md:text-4xl">{t.h1(word, targetLangName)}</h1>
            <button
              type="button"
              aria-label={t.pronounceLabel}
              onClick={() => speakWord(word, speechLang)}
              className="flex-shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-4 text-base text-muted-foreground">
            {t.meaningIntro(word, targetLangName, definition, category, wordType)}
          </p>
        </section>

        {/* Meaning */}
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{t.meaningHeading(word)}</h2>
          <p className="mt-3 text-muted-foreground">{definition}</p>
        </section>

        {/* Example Sentences — 3 */}
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{t.examplesHeading}</h2>
          <ul className="mt-4 space-y-3">
            {allSentences.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-border/70 px-4 py-3 italic text-muted-foreground"
              >
                {highlightWord(s, word)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">{t.trySentencePrompt(word)}</p>
        </section>

        {/* Word Information */}
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{t.wordInfoHeading}</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {wordInfoRows.map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col rounded-lg border border-border/60 px-4 py-3"
              >
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Related Words */}
        {relatedWords.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-2xl text-foreground">{t.relatedWordsHeading}</h2>
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

        {/* How the word is used */}
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{t.usageHeading(word)}</h2>
          <div className="mt-3 space-y-3">
            {usageLines.map((line) => (
              <p key={line} className="text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        </section>

        {/* Practice */}
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{t.practiceHeading(word)}</h2>
          <p className="mt-3 text-muted-foreground">{t.practiceBody(word, targetLangName)}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {t.practiceExercises.map((ex) => (
              <li key={ex}>{ex}</li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-5 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
            onClick={() => onStartPractice(targetLanguage, level)}
          >
            {t.practiceCta}
          </button>
        </section>

        {/* Learn more CEFR links */}
        {cefrLevelLinks.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-2xl text-foreground">{t.learnMoreHeading(targetLangName)}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {cefrLevelLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  to={href}
                  className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm text-primary transition hover:bg-primary/10"
                >
                  {label}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
