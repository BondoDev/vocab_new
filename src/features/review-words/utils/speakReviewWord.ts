// Mirrors src/features/study-new-words/utils/speakGuidedWord.ts (itself a
// mirror of VocabularyPractice.tsx's inline speakSpecificWord/getLanguageCode)
// — duplicated rather than imported so this feature doesn't depend on
// another feature's private util; the logic itself is a tiny, stable
// browser API call. See that file's own header for why cross-feature
// imports are avoided here.
const UI_LANGUAGE_TO_LOCALE: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  ru: "ru-RU",
};

export function speakReviewWord(word: string, uiLanguageCode: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !word) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = UI_LANGUAGE_TO_LOCALE[uiLanguageCode] ?? "en-US";
  window.speechSynthesis.speak(utterance);
}
