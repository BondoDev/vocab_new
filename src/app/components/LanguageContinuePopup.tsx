import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useLanguage } from "../../contexts/LanguageContext";

export type LanguageContinuePopupHandle = {
  show: (options?: { delayMs?: number }) => void;
  hide: () => void;
};

type LanguageContinuePopupProps = {
  autoHideMs?: number;
};

export const LanguageContinuePopup = forwardRef<
  LanguageContinuePopupHandle,
  LanguageContinuePopupProps
>(({ autoHideMs = 3000 }, ref) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const delayTimeoutRef = useRef<number | null>(null);
  const autoHideTimeoutRef = useRef<number | null>(null);

  const clearDelayTimeout = useCallback(() => {
    if (delayTimeoutRef.current !== null) {
      window.clearTimeout(delayTimeoutRef.current);
      delayTimeoutRef.current = null;
    }
  }, []);

  const clearAutoHideTimeout = useCallback(() => {
    if (autoHideTimeoutRef.current !== null) {
      window.clearTimeout(autoHideTimeoutRef.current);
      autoHideTimeoutRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearDelayTimeout();
    clearAutoHideTimeout();
    setOpen(false);
  }, [clearDelayTimeout, clearAutoHideTimeout]);

  const show = useCallback(
    (options?: { delayMs?: number }) => {
      const delayMs = options?.delayMs ?? 0;
      clearDelayTimeout();
      clearAutoHideTimeout();

      if (delayMs <= 0) {
        setOpen(true);
        return;
      }

      setOpen(false);
      delayTimeoutRef.current = window.setTimeout(() => {
        setOpen(true);
        delayTimeoutRef.current = null;
      }, delayMs);
    },
    [clearDelayTimeout, clearAutoHideTimeout],
  );

  useImperativeHandle(ref, () => ({ show, hide }), [show, hide]);

  useEffect(() => {
    clearAutoHideTimeout();
    if (!open) {
      return;
    }
    autoHideTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      autoHideTimeoutRef.current = null;
    }, autoHideMs);
    return () => clearAutoHideTimeout();
  }, [open, autoHideMs, clearAutoHideTimeout]);

  useEffect(() => () => {
    clearDelayTimeout();
    clearAutoHideTimeout();
  }, [clearDelayTimeout, clearAutoHideTimeout]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label={t("languageContinuePopup.closePopup")}
        className="absolute inset-0 backdrop-blur-sm cursor-pointer"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.25)" }}
        onClick={hide}
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 px-6 py-5 text-white shadow-2xl"
        style={{ backgroundColor: "rgba(15, 23, 42, 0.7)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-base md:text-lg font-semibold">
            {t("languageContinuePopup.title")}
          </p>
          <button
            type="button"
            onClick={hide}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:text-white hover:bg-white/10"
            aria-label={t("languageContinuePopup.close")}
          >
            X
          </button>
        </div>
      </div>
    </div>
  );
});

LanguageContinuePopup.displayName = "LanguageContinuePopup";
