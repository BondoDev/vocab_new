import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type KeyboardLanguage,
  KEY_BACKSPACE,
  KEY_SHIFT,
  getKeyboardLayout,
} from "./layouts";
import { useLanguage } from "../../../contexts/LanguageContext";

export type MobileKeyboardProps = {
  language: KeyboardLanguage;
  value: string;
  onChange: (nextValue: string) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  disabled?: boolean;
  canInsertSpace?: boolean;
  anchorElement?: HTMLElement | null;
  desiredGapPx?: number;
};

type SpecialKey = "shift" | "backspace" | "space" | "enter" | "symbols" | "extra";

type LongPressPopupState = {
  options: string[];
  anchorX: number;
  anchorY: number;
};

const LONG_PRESS_DELAY_MS = 280;

export function MobileKeyboard({
  language,
  value,
  onChange,
  onSubmit,
  onClose,
  disabled = false,
  canInsertSpace = true,
  anchorElement = null,
  desiredGapPx = 48,
}: MobileKeyboardProps) {
  const { t } = useLanguage();
  const [isShiftActive, setIsShiftActive] = useState(false);
  const [isSymbolsMode, setIsSymbolsMode] = useState(false);
  const [isExtraLayerVisible, setIsExtraLayerVisible] = useState(false);
  const [longPressPopup, setLongPressPopup] = useState<LongPressPopupState | null>(null);
  const [activePopupIndex, setActivePopupIndex] = useState(0);
  const [bottomOffset, setBottomOffset] = useState<number | null>(null);

  const keyboardRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOpenedRef = useRef(false);

  const layout = useMemo(() => getKeyboardLayout(language), [language]);
  const hasSymbolsLayer = layout.symbolsLayout.length > 0;
  const hasExtraLayer = Boolean(layout.extraLayout && layout.extraLayout.length > 0);
  const activeRows =
    hasSymbolsLayer && isSymbolsMode
      ? layout.symbolsLayout
      : [
          ...layout.baseLayout,
          ...(hasExtraLayer && isExtraLayerVisible ? layout.extraLayout ?? [] : []),
        ];
  const specialKeyLabels: Record<SpecialKey, string> = {
    shift: t("practice.keyboard.shift"),
    backspace: t("practice.keyboard.backspace"),
    space: t("practice.keyboard.space"),
    enter: t("practice.keyboard.enter"),
    symbols: t("practice.keyboard.toggleSymbols"),
    extra: t("practice.keyboard.toggleSymbols"),
  };

  const symbolsToggleLabel = (() => {
    if (isSymbolsMode) return "ABC";
    if (language === "fr") return "é#+";
    if (language === "es") return "ü#+";
    if (language === "pt") return "â#+";
    return "#+";
  })();
  const extraToggleLabel = "#+";

  const toUpperWithLanguage = (key: string): string => {
    if (key === "\u00df") return "\u1e9e";
    const localeMap: Record<KeyboardLanguage, string> = {
      en: "en-US",
      de: "de-DE",
      ru: "ru-RU",
      es: "es-ES",
      fr: "fr-FR",
      pt: "pt-PT",
      it: "it-IT",
    };
    return key.toLocaleUpperCase(localeMap[language]);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const closeLongPressPopup = () => {
    setLongPressPopup(null);
    setActivePopupIndex(0);
  };

  const applyTextKey = (key: string) => {
    if (disabled) return;
    const output = isShiftActive ? toUpperWithLanguage(key) : key;
    onChange(`${value}${output}`);
    if (isShiftActive) setIsShiftActive(false);
  };

  const handleBackspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const handleSpace = () => {
    if (disabled || !canInsertSpace) return;
    onChange(`${value} `);
  };

  const handleSpecialKey = (key: SpecialKey) => {
    if (disabled) return;
    if (key === "shift") {
      setIsShiftActive((prev) => !prev);
      return;
    }
    if (key === "backspace") {
      handleBackspace();
      return;
    }
    if (key === "space") {
      handleSpace();
      return;
    }
    if (key === "symbols") {
      if (!hasSymbolsLayer) return;
      setIsSymbolsMode((prev) => !prev);
      setIsShiftActive(false);
      closeLongPressPopup();
      return;
    }
    if (key === "extra") {
      if (!hasExtraLayer) return;
      setIsExtraLayerVisible((prev) => !prev);
      setIsSymbolsMode(false);
      setIsShiftActive(false);
      closeLongPressPopup();
      return;
    }
    if (key === "enter") {
      onSubmit?.();
    }
  };

  const handleLongPressSelect = (key: string) => {
    applyTextKey(key);
    closeLongPressPopup();
  };

  const handleTextKeyPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
  ) => {
    if (disabled) return;
    event.preventDefault();
    longPressOpenedRef.current = false;

    const variants =
      !isSymbolsMode && layout.longPress ? layout.longPress[key] : undefined;

    clearLongPressTimer();
    if (!variants || variants.length === 0) return;

    const targetRect = event.currentTarget.getBoundingClientRect();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressOpenedRef.current = true;
      setLongPressPopup({
        options: [key, ...variants],
        anchorX: targetRect.left + targetRect.width / 2,
        anchorY: targetRect.top - 8,
      });
      setActivePopupIndex(0);
    }, LONG_PRESS_DELAY_MS);
  };

  const handleTextKeyPointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
  ) => {
    if (disabled) return;
    event.preventDefault();
    const popupOpen = longPressPopup !== null || longPressOpenedRef.current;
    clearLongPressTimer();
    if (popupOpen) return;
    applyTextKey(key);
  };

  const handleTextKeyPointerCancel = () => {
    clearLongPressTimer();
  };

  useEffect(() => {
    if (!longPressPopup) return;

    const handlePointerMove = (event: PointerEvent) => {
      const hovered = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-kb-popup-option-index]") as HTMLElement | null;
      if (!hovered) return;
      const nextIndex = Number(hovered.dataset.kbPopupOptionIndex);
      if (!Number.isNaN(nextIndex)) {
        setActivePopupIndex(nextIndex);
      }
    };

    const handlePointerUp = () => {
      const selected = longPressPopup.options[activePopupIndex];
      if (selected) {
        handleLongPressSelect(selected);
      } else {
        closeLongPressPopup();
      }
    };

    const handlePointerDownOutside = (event: PointerEvent) => {
      if (!popupRef.current) return;
      if (!popupRef.current.contains(event.target as Node)) {
        closeLongPressPopup();
      }
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointerdown", handlePointerDownOutside, true);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointerdown", handlePointerDownOutside, true);
    };
  }, [activePopupIndex, longPressPopup]);

  useEffect(
    () => () => {
      clearLongPressTimer();
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updatePosition = () => {
      const keyboardHeight = keyboardRef.current?.getBoundingClientRect().height ?? 0;
      if (!anchorElement || keyboardHeight <= 0) {
        setBottomOffset(null);
        return;
      }

      const anchorRect = anchorElement.getBoundingClientRect();
      const viewport = window.visualViewport;
      const visibleBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const desiredTop = anchorRect.bottom + desiredGapPx;
      const nextBottom = Math.max(0, visibleBottom - desiredTop - keyboardHeight);
      setBottomOffset(Math.round(nextBottom));
    };

    updatePosition();

    const viewport = window.visualViewport;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    viewport?.addEventListener("resize", updatePosition);
    viewport?.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      viewport?.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("scroll", updatePosition);
    };
  }, [anchorElement, desiredGapPx, value, isSymbolsMode, isExtraLayerVisible]);

  useEffect(() => {
    if (!onClose) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".mobile-keyboard-v2")) return;
      if (target.closest(".exercise-hint-button")) return;
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  const renderKey = (key: string, rowIndex: number, keyIndex: number) => {
    if (key === KEY_SHIFT) {
      return (
        <button
          key={`shift-${rowIndex}-${keyIndex}`}
          type="button"
          className={`mobile-keyboard-v2__key mobile-keyboard-v2__key--action mobile-keyboard-v2__key--edge ${isShiftActive ? "is-active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleSpecialKey("shift")}
          aria-label={specialKeyLabels.shift}
          disabled={disabled}
        >
          {"\u25b2"}
        </button>
      );
    }

    if (key === KEY_BACKSPACE) {
      return (
        <button
          key={`backspace-${rowIndex}-${keyIndex}`}
          type="button"
          className="mobile-keyboard-v2__key mobile-keyboard-v2__key--action mobile-keyboard-v2__key--edge mobile-keyboard-v2__key--backspace"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleSpecialKey("backspace")}
          aria-label={specialKeyLabels.backspace}
          disabled={disabled}
        >
          {"\u232b"}
        </button>
      );
    }

    const displayKey =
      isShiftActive && !isSymbolsMode ? toUpperWithLanguage(key) : key;

    return (
      <button
        key={`key-${rowIndex}-${keyIndex}-${key}`}
        type="button"
        className="mobile-keyboard-v2__key"
        onPointerDown={(event) => handleTextKeyPointerDown(event, key)}
        onPointerUp={(event) => handleTextKeyPointerUp(event, key)}
        onPointerCancel={handleTextKeyPointerCancel}
        onPointerLeave={handleTextKeyPointerCancel}
        disabled={disabled}
      >
        {displayKey}
      </button>
    );
  };

  const keyboard = (
    <div
      ref={keyboardRef}
      className="mobile-keyboard-v2"
      role="group"
      aria-label={t("practice.keyboard.mobileKeyboard")}
      style={bottomOffset !== null ? { bottom: `${bottomOffset}px` } : undefined}
    >
      {activeRows.map((row, rowIndex) => (
        <div key={`row-${rowIndex}`} className="mobile-keyboard-v2__row">
          {row.map((key, keyIndex) => renderKey(key, rowIndex, keyIndex))}
        </div>
      ))}

      <div className="mobile-keyboard-v2__row mobile-keyboard-v2__row--actions">
        {hasSymbolsLayer && (
          <button
            type="button"
            className={`mobile-keyboard-v2__key mobile-keyboard-v2__key--action ${isSymbolsMode ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleSpecialKey("symbols")}
            aria-label={specialKeyLabels.symbols}
            disabled={disabled}
          >
            {symbolsToggleLabel}
          </button>
        )}
        {hasExtraLayer && (
          <button
            type="button"
            className={`mobile-keyboard-v2__key mobile-keyboard-v2__key--action ${isExtraLayerVisible ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleSpecialKey("extra")}
            aria-label={specialKeyLabels.extra}
            disabled={disabled}
          >
            {extraToggleLabel}
          </button>
        )}
        <button
          type="button"
          className="mobile-keyboard-v2__key mobile-keyboard-v2__key--action mobile-keyboard-v2__key--wide"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleSpecialKey("space")}
          aria-label={specialKeyLabels.space}
          disabled={disabled}
        >
          {t("practice.keyboard.space")}
        </button>
        {hasSymbolsLayer && isSymbolsMode && (
          <button
            type="button"
            className="mobile-keyboard-v2__key mobile-keyboard-v2__key--action mobile-keyboard-v2__key--backspace"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleSpecialKey("backspace")}
            aria-label={specialKeyLabels.backspace}
            disabled={disabled}
          >
            {"\u232b"}
          </button>
        )}
        {onSubmit && (
          <button
            type="button"
            className="mobile-keyboard-v2__key mobile-keyboard-v2__key--action"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleSpecialKey("enter")}
            aria-label={specialKeyLabels.enter}
            disabled={disabled}
          >
            {t("practice.keyboard.enter")}
          </button>
        )}
      </div>

      {longPressPopup && (
        <div
          ref={popupRef}
          className="mobile-keyboard-v2__popup"
          style={{ left: longPressPopup.anchorX, top: longPressPopup.anchorY }}
        >
          {longPressPopup.options.map((option, index) => (
            <div
              key={`popup-option-${option}-${index}`}
              data-kb-popup-option-index={index}
              className={`mobile-keyboard-v2__popup-option ${activePopupIndex === index ? "is-active" : ""}`}
            >
              {isShiftActive ? toUpperWithLanguage(option) : option}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") {
    return keyboard;
  }

  return createPortal(keyboard, document.body);
}
