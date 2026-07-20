export const SUPPORTED_UI_LANGUAGES = ["en", "es", "de", "fr", "ru", "pt", "it"] as const;
export const SUPPORTED_TARGET_LANGUAGES = [
  "english",
  "german",
  "spanish",
  "french",
  "italian",
  "portuguese",
  "russian",
] as const;
export const SUPPORTED_LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"] as const;

export type UiLanguageCode = (typeof SUPPORTED_UI_LANGUAGES)[number];
export type TargetLanguageSlug = (typeof SUPPORTED_TARGET_LANGUAGES)[number];
export type Level = (typeof SUPPORTED_LEVELS)[number];

export const TARGET_LANGUAGE_TO_UI_LANGUAGE: Record<TargetLanguageSlug, UiLanguageCode> = {
  english: "en",
  german: "de",
  spanish: "es",
  french: "fr",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
};

export const TARGET_NAME_SLUGS: Record<UiLanguageCode, Record<TargetLanguageSlug, string>> = {
  en: {
    english: "english",
    german: "german",
    spanish: "spanish",
    french: "french",
    italian: "italian",
    portuguese: "portuguese",
    russian: "russian",
  },
  es: {
    english: "ingles",
    german: "aleman",
    spanish: "espanol",
    french: "frances",
    italian: "italiano",
    portuguese: "portugues",
    russian: "ruso",
  },
  de: {
    english: "englisch",
    german: "deutsch",
    spanish: "spanisch",
    french: "franzoesisch",
    italian: "italienisch",
    portuguese: "portugiesisch",
    russian: "russisch",
  },
  fr: {
    english: "anglais",
    german: "allemand",
    spanish: "espagnol",
    french: "francais",
    italian: "italien",
    portuguese: "portugais",
    russian: "russe",
  },
  ru: {
    english: "angliiskii",
    german: "nemetskii",
    spanish: "ispanskii",
    french: "frantsuzskii",
    italian: "italyanskii",
    portuguese: "portugalskii",
    russian: "russkii",
  },
  pt: {
    english: "ingles",
    german: "alemao",
    spanish: "espanhol",
    french: "frances",
    italian: "italiano",
    portuguese: "portugues",
    russian: "russo",
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
};

export function isSupportedUiLanguage(value: string): value is UiLanguageCode {
  return (SUPPORTED_UI_LANGUAGES as readonly string[]).includes(value);
}
