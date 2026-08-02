// Mirrors VocabularyPractice.tsx's inline speakSpecificWord/getLanguageCode
// (there is no shared export for it — see that file's own header comments
// on why cross-feature imports between practice and learning-setup are
// avoided). Duplicated here rather than imported so this feature doesn't
// depend on a practice-session React component; the logic itself is a tiny,
// stable browser API call.
const UI_LANGUAGE_TO_LOCALE: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  ru: "ru-RU",
};

export function speakGuidedWord(word: string, uiLanguageCode: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !word) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = UI_LANGUAGE_TO_LOCALE[uiLanguageCode] ?? "en-US";
  window.speechSynthesis.speak(utterance);
}
