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
  conceptId: string | null;
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
  conceptId?: string | null,
): string {
  return buildWordPathFromSlug(
    uiLang,
    targetLanguage,
    wordToSlug(wordLemma),
    conceptId,
  );
}

export function buildWordPathFromSlug(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  wordSlug: string,
  conceptId?: string | null,
): string {
  const base = `/${uiLang}/${targetLanguage}-word-${wordSlug}`;
  if (!conceptId || !conceptId.trim()) return base;
  return `${base}--${conceptId.trim()}`;
}

export function resolveWordRoute(uiLangRaw: string, slug: string): WordRouteMatch | null {
  if (!isSupportedUiLanguage(uiLangRaw)) return null;
  for (const targetLanguage of SUPPORTED_TARGET_LANGUAGES) {
    const prefix = `${targetLanguage}-word-`;
    if (slug.startsWith(prefix)) {
      const suffix = slug.slice(prefix.length);
      const [wordSlug, conceptIdRaw] = suffix.split("--");
      if (wordSlug.length === 0) return null;
      const conceptId = conceptIdRaw?.trim() ? conceptIdRaw.trim() : null;
      return { uiLang: uiLangRaw, targetLanguage, wordSlug, conceptId };
    }
  }
  return null;
}

export function getAllWordPaths(
  entries: Array<{ targetLanguage: TargetLanguageSlug; wordLemma: string; conceptId?: string | null }>,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const { targetLanguage, wordLemma, conceptId } of entries) {
    const slug = wordToSlug(wordLemma);
    if (!slug) continue;
    const conceptKey = conceptId?.trim();
    const key = conceptKey ? `${targetLanguage}:${conceptKey}` : `${targetLanguage}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    for (const uiLang of SUPPORTED_UI_LANGUAGES) {
      paths.push(buildWordPath(uiLang, targetLanguage, wordLemma, conceptId));
    }
  }

  return paths;
}
