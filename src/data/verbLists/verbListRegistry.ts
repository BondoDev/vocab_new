import verbListContentJson from "./common_100_verblists_text.json";
import { type TargetLanguageSlug, type UiLanguageCode } from "../seo/slugs";
import { getFallbackVerbListCopy } from "./verbListFallbackCopy";
import {
  buildVerbListContentLookup,
  type VerbListContent,
  type VerbListContentEntry,
} from "./verbListRouteHelpers";

export interface VerbListConfigEntry {
  speechLang: string;
  targetAliases: readonly string[];
  paths: Record<UiLanguageCode, string>;
}

export const VERB_LIST_CONFIG = {
  english: {
    speechLang: "en-US",
    targetAliases: ["en", "english"],
    paths: {
      en: "/en/100-most-common-english-verbs",
      es: "/es/100-verbos-ingles-mas-comunes",
      de: "/de/100-haeufigste-englische-verben",
      fr: "/fr/100-verbes-anglais-les-plus-courants",
      it: "/it/100-verbi-inglesi-piu-comuni",
      pt: "/pt/100-verbos-ingleses-mais-comuns",
      ru: "/ru/100-samykh-chastykh-angliiskikh-glagolov",
    },
  },
  french: {
    speechLang: "fr-FR",
    targetAliases: ["fr", "french"],
    paths: {
      en: "/en/100-most-common-french-verbs",
      es: "/es/100-verbos-franceses-mas-comunes",
      de: "/de/100-haeufigste-franzoesische-verben",
      fr: "/fr/100-verbes-francais-les-plus-courants",
      it: "/it/100-verbi-francesi-piu-comuni",
      pt: "/pt/100-verbos-franceses-mais-comuns",
      ru: "/ru/100-samykh-chastykh-frantsuzskikh-glagolov",
    },
  },
  german: {
    speechLang: "de-DE",
    targetAliases: ["de", "german"],
    paths: {
      en: "/en/100-most-common-german-verbs",
      es: "/es/100-verbos-alemanes-mas-comunes",
      de: "/de/100-haeufigste-deutsche-verben",
      fr: "/fr/100-verbes-allemands-les-plus-courants",
      it: "/it/100-verbi-tedeschi-piu-comuni",
      pt: "/pt/100-verbos-alemaes-mais-comuns",
      ru: "/ru/100-samykh-chastykh-nemetskikh-glagolov",
    },
  },
  italian: {
    speechLang: "it-IT",
    targetAliases: ["it", "italian"],
    paths: {
      en: "/en/100-most-common-italian-verbs",
      es: "/es/100-verbos-italianos-mas-comunes",
      de: "/de/100-haeufigste-italienische-verben",
      fr: "/fr/100-verbes-italiens-les-plus-courants",
      it: "/it/100-verbi-italiani-piu-comuni",
      pt: "/pt/100-verbos-italianos-mais-comuns",
      ru: "/ru/100-samykh-chastykh-italianskikh-glagolov",
    },
  },
  portuguese: {
    speechLang: "pt-PT",
    targetAliases: ["pt", "portuguese"],
    paths: {
      en: "/en/100-most-common-portuguese-verbs",
      es: "/es/100-verbos-portugueses-mas-comunes",
      de: "/de/100-haeufigste-portugiesische-verben",
      fr: "/fr/100-verbes-portugais-les-plus-courants",
      it: "/it/100-verbi-portoghesi-piu-comuni",
      pt: "/pt/100-verbos-portugueses-mais-comuns",
      ru: "/ru/100-samykh-chastykh-portugalskikh-glagolov",
    },
  },
  russian: {
    speechLang: "ru-RU",
    targetAliases: ["ru", "russian"],
    paths: {
      en: "/en/100-most-common-russian-verbs",
      es: "/es/100-verbos-rusos-mas-comunes",
      de: "/de/100-haeufigste-russische-verben",
      fr: "/fr/100-verbes-russes-les-plus-courants",
      it: "/it/100-verbi-russi-piu-comuni",
      pt: "/pt/100-verbos-russos-mais-comuns",
      ru: "/ru/100-samykh-chastykh-russkikh-glagolov",
    },
  },
  spanish: {
    speechLang: "es-ES",
    targetAliases: ["es", "spanish"],
    paths: {
      en: "/en/100-most-common-spanish-verbs",
      es: "/es/100-verbos-espanoles-mas-comunes",
      de: "/de/100-haeufigste-spanische-verben",
      fr: "/fr/100-verbes-espagnols-les-plus-courants",
      it: "/it/100-verbi-spagnoli-piu-comuni",
      pt: "/pt/100-verbos-espanhois-mais-comuns",
      ru: "/ru/100-samykh-chastykh-ispanskikh-glagolov",
    },
  },
} as const satisfies Record<TargetLanguageSlug, VerbListConfigEntry>;

const VERB_LIST_CONTENT = Object.fromEntries(
  (Object.entries(VERB_LIST_CONFIG) as Array<[TargetLanguageSlug, VerbListConfigEntry]>).map(
    ([targetLanguage, config]) => [
      targetLanguage,
      buildVerbListContentLookup(
        verbListContentJson as Record<string, VerbListContent> | VerbListContentEntry[],
        config.targetAliases,
      ),
    ],
  ),
) as Record<TargetLanguageSlug, Partial<Record<UiLanguageCode, VerbListContent>>>;

export function getVerbListConfig(targetLanguage: TargetLanguageSlug): VerbListConfigEntry {
  return VERB_LIST_CONFIG[targetLanguage];
}

export function getVerbListPath(targetLanguage: TargetLanguageSlug, uiLang: UiLanguageCode): string {
  return VERB_LIST_CONFIG[targetLanguage].paths[uiLang];
}

export function getAllVerbListPaths(): string[] {
  return (Object.values(VERB_LIST_CONFIG) as VerbListConfigEntry[]).flatMap((config) =>
    Object.values(config.paths),
  );
}

export function resolveVerbListRoute(
  path: string,
): { uiLang: UiLanguageCode; targetLanguage: TargetLanguageSlug } | null {
  for (const [targetLanguage, config] of Object.entries(VERB_LIST_CONFIG) as Array<
    [TargetLanguageSlug, VerbListConfigEntry]
  >) {
    const entry = Object.entries(config.paths).find(([, routePath]) => routePath === path);
    if (entry) {
      return { uiLang: entry[0] as UiLanguageCode, targetLanguage };
    }
  }

  return null;
}

export function getVerbListContent(
  targetLanguage: TargetLanguageSlug,
  uiLang: UiLanguageCode,
): VerbListContent | null {
  const contentByUiLang = VERB_LIST_CONTENT[targetLanguage];
  return contentByUiLang[uiLang] ?? contentByUiLang.en ?? null;
}

export function getVerbListTitle(targetLanguage: TargetLanguageSlug, uiLang: UiLanguageCode): string {
  return (
    getVerbListContent(targetLanguage, uiLang)?.title ??
    getFallbackVerbListCopy(uiLang, targetLanguage).pageTitle
  );
}

export function getVerbListSpeechLang(targetLanguage: TargetLanguageSlug): string {
  return VERB_LIST_CONFIG[targetLanguage].speechLang;
}
