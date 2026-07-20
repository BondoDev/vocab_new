import type { UiLanguageCode } from "../../data/seo/shared/slugs";

export const WORD_META_TITLE: Record<UiLanguageCode, (lang: string, word: string) => string> = {
  en: (lang, word) => `${lang} Word "${word}" Meaning – Definition and Example`,
  es: (lang, word) => `Palabra ${lang} "${word}" – Significado y Ejemplo`,
  fr: (lang, word) => `Mot ${lang} "${word}" – Signification et Exemple`,
  de: (lang, word) => `${lang}es Wort "${word}" – Bedeutung und Beispiel`,
  it: (lang, word) => `Parola ${lang} "${word}" – Significato ed Esempio`,
  pt: (lang, word) => `Palavra ${lang} "${word}" – Significado e Exemplo`,
  ru: (lang, word) => `Слово "${word}" на ${lang} – значение и пример`,
};

export const WORD_META_DESC: Record<UiLanguageCode, (lang: string, word: string) => string> = {
  en: (lang, word) =>
    `Learn how to use "${word}" with simple examples, synonyms, CEFR level, and quick practice.`,
  es: (lang, word) =>
    `Aprende el significado de la palabra ${lang} "${word}", ve oraciones de ejemplo y practica este vocabulario con ejercicios interactivos.`,
  fr: (lang, word) =>
    `Apprenez le sens du mot ${lang} "${word}", découvrez des exemples de phrases et pratiquez ce vocabulaire avec des exercices interactifs.`,
  de: (lang, word) =>
    `Lerne die Bedeutung des ${lang}en Wortes "${word}", sieh Beispielsätze und übe dieses Vokabel mit interaktiven Übungen.`,
  it: (lang, word) =>
    `Impara il significato della parola ${lang} "${word}", vedi frasi di esempio e pratica questo vocabolario con esercizi interattivi.`,
  pt: (lang, word) =>
    `Aprenda o significado da palavra ${lang} "${word}", veja frases de exemplo e pratique este vocabulário com exercícios interativos.`,
  ru: (lang, word) =>
    `Узнайте значение слова "${word}" на ${lang}, посмотрите примеры предложений и потренируйтесь с интерактивными упражнениями.`,
};

WORD_META_DESC.es = (lang, word) =>
  `Aprende el significado de la palabra ${lang} "${word}" y ve oraciones de ejemplo.`;
WORD_META_DESC.fr = (lang, word) =>
  `Apprenez le sens du mot ${lang} "${word}" et découvrez des exemples de phrases.`;
WORD_META_DESC.de = (lang, word) =>
  `Lerne die Bedeutung des ${lang}en Wortes "${word}" und sieh Beispielsätze.`;
WORD_META_DESC.it = (lang, word) =>
  `Impara il significato della parola ${lang} "${word}" e vedi frasi di esempio.`;
WORD_META_DESC.pt = (lang, word) =>
  `Aprenda o significado da palavra ${lang} "${word}" e veja frases de exemplo.`;
WORD_META_DESC.ru = (lang, word) =>
  `Узнайте значение слова "${word}" на ${lang} и посмотрите примеры предложений.`;

WORD_META_DESC.en = (lang, word) =>
  `Learn "${word}" with examples, synonyms, CEFR level, and practice.`;
WORD_META_DESC.es = (lang, word) =>
  `Aprende la palabra ${lang} "${word}" y ve ejemplos.`;
WORD_META_DESC.fr = (lang, word) =>
  `Apprenez le mot ${lang} "${word}" et voyez des exemples.`;
WORD_META_DESC.de = (lang, word) =>
  `Lerne das Wort "${word}" auf ${lang} und sieh Beispiele.`;
WORD_META_DESC.it = (lang, word) =>
  `Impara la parola ${lang} "${word}" e vedi esempi.`;
WORD_META_DESC.pt = (lang, word) =>
  `Aprenda a palavra ${lang} "${word}" e veja exemplos.`;
WORD_META_DESC.ru = (lang, word) =>
  `РЈР·РЅР°Р№С‚Рµ Р·РЅР°С‡РµРЅРёРµ СЃР»РѕРІР° "${word}" РЅР° ${lang} Рё РїРѕСЃРјРѕС‚СЂРёС‚Рµ РїСЂРёРјРµСЂС‹.`;

WORD_META_DESC.ru = (lang, word) =>
  `\u0423\u0437\u043d\u0430\u0439\u0442\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0441\u043b\u043e\u0432\u0430 "${word}" \u043d\u0430 ${lang} \u0438 \u043f\u043e\u0441\u043c\u043e\u0442\u0440\u0438\u0442\u0435 \u043f\u0440\u0438\u043c\u0435\u0440\u044b.`;
