import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect, useId } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import deFlag from "../../assets/flags/de.svg";
import esFlag from "../../assets/flags/es.svg";
import frFlag from "../../assets/flags/fr.svg";
import gbFlag from "../../assets/flags/gb.svg";
import itFlag from "../../assets/flags/it.svg";
import ptFlag from "../../assets/flags/pt.svg";
import ruFlag from "../../assets/flags/ru.svg";

// Self-hosted copies of the hampusborgos/country-flags SVGs this component
// formerly loaded from jsDelivr (true-proportion flags, unlike flag-icons'
// fixed 4:3 `.fi` classes used elsewhere). Imported through Vite so URLs are
// fingerprinted and follow `base`; tiny files may be inlined as data: URIs,
// which CSP img-src already allows. Only the seven supported-language flags
// are bundled — a code missing here renders no flag rather than a broken
// image.
const FLAG_SRC_BY_CODE: Record<string, string> = {
  de: deFlag,
  es: esFlag,
  fr: frFlag,
  gb: gbFlag,
  it: itFlag,
  pt: ptFlag,
  ru: ruFlag,
};

function getFlagSrc(flagCode?: string): string | undefined {
  return flagCode ? FLAG_SRC_BY_CODE[flagCode.toLowerCase()] : undefined;
}

interface LanguageSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  languages: {
    code: string;
    name: string;
    flagCode?: string;
  }[];
  disabledLanguages?: string[];
}

export function LanguageSelector({
  label,
  value,
  onChange,
  placeholder,
  languages,
  disabledLanguages = [],
}: LanguageSelectorProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobilePicker, setIsMobilePicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Disclosure pattern: the trigger exposes aria-expanded/aria-controls, the
  // panel (desktop dropdown or mobile sheet) holds a labelled search field
  // and ordinary option buttons, the selected one marked aria-current.
  // Escape and a selection close it and return focus to the trigger.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // The visible placeholder ends in "..."; the field's name should not.
  const searchLabel = t("languageSelector.search").replace(/\s*(\.\.\.|…)$/, "");
  const closeLabel = t("languageContinuePopup.close");

  const closeAndReturnFocus = () => {
    setIsOpen(false);
    setSearchQuery("");
    triggerRef.current?.focus();
  };

  // Detect mobile sizes where selector should open as popup sheet.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 430.98px)");
    const update = () => setIsMobilePicker(media.matches);
    update();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  // Close desktop dropdown when clicking outside
  useEffect(() => {
    if (isMobilePicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobilePicker]);

  // Escape closes the mobile popup and returns focus to the trigger. On
  // open, focus moves into the sheet (its Close button, not the search
  // field, so no on-screen keyboard opens by itself). The sheet is a modal
  // dialog covering the page, so Tab/Shift+Tab wrap inside it instead of
  // reaching controls behind it.
  useEffect(() => {
    if (!isOpen || !isMobilePicker) return;

    mobileCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setSearchQuery("");
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !mobileSheetRef.current) return;

      const focusable = Array.from(
        mobileSheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), input:not([disabled])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = mobileSheetRef.current.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isMobilePicker]);

  // Filter languages based on search query
  const filteredLanguages = languages.filter((lang) =>
    lang.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedLanguage = languages.find((lang) => lang.code === value);
  const selectedFlagSrc = getFlagSrc(selectedLanguage?.flagCode);

  const handleSelect = (code: string) => {
    if (!disabledLanguages.includes(code)) {
      onChange(code);
      // The chosen option unmounts with the panel; keep focus on the trigger.
      closeAndReturnFocus();
    }
  };

  const renderLanguageList = (isMobileVariant = false) => (
    <div className={`${isMobileVariant ? "max-h-[65svh]" : "max-h-64"} overflow-y-auto`}>
      {filteredLanguages.length > 0 ? (
        filteredLanguages.map((lang) => {
          const isDisabled = disabledLanguages.includes(lang.code);
          const isSelected = lang.code === value;
          const flagSrc = getFlagSrc(lang.flagCode);

          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleSelect(lang.code)}
              disabled={isDisabled}
              aria-current={isSelected ? "true" : undefined}
              className={`w-full px-4 py-3 text-left transition-colors ${
                isSelected
                  ? "bg-primary/10 text-primary font-medium"
                  : isDisabled
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : "hover:bg-muted text-foreground"
              }`}
            >
              <span className="inline-flex items-center gap-3 w-full overflow-hidden">
                {flagSrc && (
                  <div className="flex-shrink-0 flex items-center justify-center">
                    <img
                      src={flagSrc}
                      alt=""
                      className="language-selector-option-flag w-[18px] h-auto md:w-[22px] rounded-[1px] shadow-sm border border-black/5"
                    />
                  </div>
                )}
                <span className="truncate flex-grow">{lang.name}</span>
              </span>
              {isDisabled && (
                <span className="ml-2 text-xs">
                  {t("languageSelector.alreadySelected")}
                </span>
              )}
            </button>
          );
        })
      ) : (
        <div className="px-4 py-3 text-sm text-muted-foreground text-center">
          {t("languageSelector.noResults")}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="flex flex-col gap-2 w-full"
      ref={dropdownRef}
      // Desktop dropdown: Escape closes it (focus back on the trigger) and
      // it closes when keyboard focus leaves the picker. The mobile sheet
      // handles Escape in its own effect above.
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen && !isMobilePicker) {
          event.preventDefault();
          event.stopPropagation();
          closeAndReturnFocus();
        }
      }}
      onBlur={(event) => {
        if (
          isOpen &&
          !isMobilePicker &&
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        ) {
          setIsOpen(false);
          setSearchQuery("");
        }
      }}
    >
      <label className="text-sm md:text-base text-foreground/80 font-bold">
        {label}
      </label>
      <div className="relative">
        {/* Selected language display */}
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          onClick={() => setIsOpen(!isOpen)}
          className="language-selector-trigger w-full bg-input-background border border-border rounded-lg px-4 py-3 md:px-6 md:py-5 md:text-lg pr-10 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedFlagSrc && (
              <div className="flex-shrink-0 flex items-center justify-center">
                <img
                  src={selectedFlagSrc}
                  alt=""
                  className="language-selector-selected-flag w-[20px] h-auto md:w-[24px] rounded-[2px] shadow-sm border border-black/5"
                />
              </div>
            )}
            <span
              className={
                selectedLanguage
                  ? "language-selector-trigger-text truncate"
                  : "language-selector-trigger-text truncate text-sm text-muted-foreground"
              }
            >
              {selectedLanguage?.name || placeholder || "Select..."}
            </span>
          </span>
        </button>
        <ChevronDown className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-muted-foreground pointer-events-none" />

        {/* Desktop dropdown */}
        {isOpen && !isMobilePicker && (
          <div id={panelId} className="absolute z-50 w-full mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            {/* Search input */}
            <div className="p-3 border-b border-border">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={searchLabel}
                placeholder={t("languageSelector.search")}
                className="language-selector-search-input w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {/* Language list */}
            {renderLanguageList()}
          </div>
        )}

        {/* Mobile popup */}
        {isOpen && isMobilePicker && (
          <div
            id={panelId}
            ref={mobileSheetRef}
            className="language-selector-mobile-popup fixed inset-0 z-[70]"
            role="dialog"
            aria-modal="true"
            aria-label={label}
          >
            {/* Tap-outside-to-close only; the labelled Close button below is
                the keyboard and screen-reader way out. */}
            <button
              type="button"
              className="language-selector-mobile-backdrop absolute inset-0"
              onClick={closeAndReturnFocus}
              tabIndex={-1}
              aria-hidden="true"
            />
            <div className="language-selector-mobile-sheet absolute left-3 right-3 bottom-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-semibold text-foreground">{label}</span>
                <button
                  ref={mobileCloseRef}
                  type="button"
                  onClick={closeAndReturnFocus}
                  className="px-2 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  {closeLabel}
                </button>
              </div>
              <div className="p-3 border-b border-border">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label={searchLabel}
                  placeholder={t("languageSelector.search")}
                  className="language-selector-search-input w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              {renderLanguageList(true)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
