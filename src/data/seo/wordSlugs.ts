import {
  SUPPORTED_UI_LANGUAGES,
  SUPPORTED_TARGET_LANGUAGES,
  isSupportedUiLanguage,
  type UiLanguageCode,
  type TargetLanguageSlug,
} from "./slugs";

export interface WordRouteMatch {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
}

export function wordToSlug(lemma: string): string {
  return lemma
    .toLowerCase()
    .replace(/['’‘]/g, "")
    .replace(/[^a-z0-9À-ɏЀ-ӿ\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function buildWordPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordLemma: string,
): string {
  return `/${uiLang}/${targetLanguage}-word-${wordToSlug(wordLemma)}`;
}

export function resolveWordRoute(uiLangRaw: string, slug: string): WordRouteMatch | null {
  if (!isSupportedUiLanguage(uiLangRaw)) return null;

  for (const targetLanguage of SUPPORTED_TARGET_LANGUAGES) {
    const prefix = `${targetLanguage}-word-`;
    if (slug.startsWith(prefix)) {
      const wordSlug = slug.slice(prefix.length);
      if (wordSlug.length > 0) {
        return { uiLang: uiLangRaw, targetLanguage, wordSlug };
      }
    }
  }

  return null;
}

export function getAllWordPaths(
  entries: Array<{ targetLanguage: TargetLanguageSlug; wordLemma: string }>,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const { targetLanguage, wordLemma } of entries) {
    const slug = wordToSlug(wordLemma);
    if (!slug) continue;
    const key = `${targetLanguage}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    for (const uiLang of SUPPORTED_UI_LANGUAGES) {
      paths.push(buildWordPath(uiLang, targetLanguage, wordLemma));
    }
  }

  return paths;
}
