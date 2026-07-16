// Owns the language-continue popup lifecycle extracted from App.tsx:
// the popup ref, the queued-popup flag, and the two effects that show/hide
// it. Navigation, the immediate `popupRef.current?.show({ delayMs: 0 })`
// calls, and the <LanguageContinuePopup> render all stay in App.tsx — this
// hook only owns "queue a popup to appear once the language page renders."
import { useEffect, useRef, useState } from "react";
import type { LanguageContinuePopupHandle } from "../components/LanguageContinuePopup";
import type { PageKey } from "../utils/pageRouting";

export interface UseLanguageContinuePopupParams {
  resolvedPage: PageKey;
  isContinueDisabled: boolean;
}

export interface UseLanguageContinuePopupResult {
  popupRef: React.MutableRefObject<LanguageContinuePopupHandle | null>;
  queueForLanguagePage: () => void;
}

export function useLanguageContinuePopup({
  resolvedPage,
  isContinueDisabled,
}: UseLanguageContinuePopupParams): UseLanguageContinuePopupResult {
  const popupRef = useRef<LanguageContinuePopupHandle | null>(null);
  const [popupQueuedForLanguage, setPopupQueuedForLanguage] = useState(false);

  // Cleanup when leaving page or changing languages
  useEffect(() => {
    if (resolvedPage !== "language" || !isContinueDisabled) {
      setPopupQueuedForLanguage(false);
      popupRef.current?.hide();
    }
  }, [resolvedPage, isContinueDisabled]);

  // Show queued popup after language page renders
  useEffect(() => {
    if (resolvedPage !== "language" || !popupQueuedForLanguage) {
      return;
    }
    setPopupQueuedForLanguage(false);
    popupRef.current?.show({ delayMs: 100 });
  }, [resolvedPage, popupQueuedForLanguage]);

  const queueForLanguagePage = () => {
    setPopupQueuedForLanguage(true);
  };

  return { popupRef, queueForLanguagePage };
}
