import { buildLocalizedVocabularyPath } from "../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import {
  isSupportedUiLanguage,
  SUPPORTED_TARGET_LANGUAGES,
  type TargetLanguageSlug,
} from "../../../data/seo/shared/slugs";
import type { CefrLevelCode, UiLanguageCode } from "../../../data/seo/vocabularyLevels";
import type { VocabularyLevelEditorialContent } from "../../../data/seo/vocabularyLevels/levelContent";

type PreviewTargetLanguage = TargetLanguageSlug | UiLanguageCode;

export type SeoCefrContentItem = {
  uiLanguage: UiLanguageCode;
  targetLanguage: PreviewTargetLanguage;
  // Legacy entries carry an English display name; the page no longer shows
  // it (localized names come from cefrPageCopy.ts), and v2 entries may omit it.
  targetLanguageDisplayName?: string;
  level: CefrLevelCode;
  // Either editorial schema; see levelContent.ts for detection/validation.
  content: VocabularyLevelEditorialContent;
};

// seo-cefr-content.json (~1.7 MB, every CEFR page's editorial content) is a
// lazy chunk, not a static import, so only CEFR pages download it instead
// of every page carrying it in the entry bundle. Same hydration contract as
// the noun details (common100NounDetails.ts): one shared promise plus a
// synchronous view of the settled result. The getters below are render-time
// reads — before the file has loaded they throw the pending promise, so the
// caller suspends at the nearest Suspense boundary:
//   - Prerendering: App's route boundary catches it and the prerender waits
//     for it (entry-server's stream.allReady), so the HTML is complete.
//   - Hydration: src/entry-client.tsx loads the file BEFORE hydrateRoot, so
//     a CEFR page never suspends while hydrating (React #418/#421/#422).
//   - Client-side navigation: App's route boundary shows its loading
//     fallback until the chunk arrives.
// Never call them outside render (e.g. in an event handler or effect).
let loadedItems: SeoCefrContentItem[] | null = null;
let pendingLoad: Promise<SeoCefrContentItem[]> | null = null;

export function loadSeoCefrContent(): Promise<SeoCefrContentItem[]> {
  if (!pendingLoad) {
    pendingLoad = import("../../../data/seo/vocabularyLevels/seo-cefr-content.json").then(
      (module) => {
        loadedItems = module.default as SeoCefrContentItem[];
        return loadedItems;
      },
      // Settled for this page load, like the noun details: render as "no
      // content" (App's not-found decision) instead of unmounting the app;
      // a reload retries.
      (error: unknown) => {
        console.warn("devSeoCefrPreviewData: could not load seo-cefr-content.json.", error);
        loadedItems = [];
        return loadedItems;
      },
    );
  }
  return pendingLoad;
}

function readPreviewItems(): SeoCefrContentItem[] {
  if (loadedItems) {
    return loadedItems;
  }
  throw loadSeoCefrContent();
}

export function getSeoCefrPreviewItems(): SeoCefrContentItem[] {
  return readPreviewItems();
}

const TARGET_LANGUAGE_CODE_TO_SLUG: Record<UiLanguageCode, TargetLanguageSlug> = {
  en: "english",
  es: "spanish",
  de: "german",
  fr: "french",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

function isTargetLanguageSlug(value: string): value is TargetLanguageSlug {
  return (SUPPORTED_TARGET_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeTargetLanguage(targetLanguage: PreviewTargetLanguage): TargetLanguageSlug {
  if (isTargetLanguageSlug(targetLanguage)) {
    return targetLanguage;
  }
  if (isSupportedUiLanguage(targetLanguage)) {
    return TARGET_LANGUAGE_CODE_TO_SLUG[targetLanguage];
  }
  throw new Error(`normalizeTargetLanguage: unsupported target language "${targetLanguage}"`);
}

// Dev-only hint shown by the /test preview. Fixed to the content file's
// first entry (en / english / a1) rather than read from it, so building the
// constant never needs the lazily loaded content.
export const DEV_CEFR_PREVIEW_PATH =
  `/test${buildLocalizedVocabularyPath("en", "english", "a1") ?? "/en/english-b1-vocabulary-practice"}`;

export function findSeoCefrPreviewItem(params: {
  uiLanguage: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: CefrLevelCode;
}): SeoCefrContentItem | null {
  return (
    readPreviewItems().find(
      (item) =>
        item.uiLanguage === params.uiLanguage &&
        normalizeTargetLanguage(item.targetLanguage) === params.targetLanguage &&
        item.level === params.level,
    ) ?? null
  );
}
