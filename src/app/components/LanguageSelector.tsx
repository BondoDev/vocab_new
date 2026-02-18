import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";

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

  // Escape closes mobile popup.
  useEffect(() => {
    if (!isOpen || !isMobilePicker) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
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

  const handleSelect = (code: string) => {
    if (!disabledLanguages.includes(code)) {
      onChange(code);
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  const renderLanguageList = (isMobileVariant = false) => (
    <div className={`${isMobileVariant ? "max-h-[65svh]" : "max-h-64"} overflow-y-auto`}>
      {filteredLanguages.length > 0 ? (
        filteredLanguages.map((lang) => {
          const isDisabled = disabledLanguages.includes(lang.code);
          const isSelected = lang.code === value;

          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleSelect(lang.code)}
              disabled={isDisabled}
              className={`w-full px-4 py-3 text-left transition-colors ${
                isSelected
                  ? "bg-primary/10 text-primary font-medium"
                  : isDisabled
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : "hover:bg-muted text-foreground"
              }`}
            >
              <span className="inline-flex items-center gap-3 w-full overflow-hidden">
                {lang.flagCode && (
                  <div className="flex-shrink-0 flex items-center justify-center">
                    <img
                      src={`https://cdn.jsdelivr.net/gh/hampusborgos/country-flags@main/svg/${lang.flagCode.toLowerCase()}.svg`}
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
    <div className="flex flex-col gap-2 w-full" ref={dropdownRef}>
      <label className="text-sm md:text-base text-foreground/80 font-bold">
        {label}
      </label>
      <div className="relative">
        {/* Selected language display */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="language-selector-trigger w-full bg-input-background border border-border rounded-lg px-4 py-3 md:px-6 md:py-5 md:text-lg pr-10 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-left"
        >
          <span className="inline-flex items-center gap-2">
            {selectedLanguage?.flagCode && (
              <div className="flex-shrink-0 flex items-center justify-center">
                <img
                  src={`https://cdn.jsdelivr.net/gh/hampusborgos/country-flags@main/svg/${selectedLanguage.flagCode.toLowerCase()}.svg`}
                  alt=""
                  className="language-selector-selected-flag w-[20px] h-auto md:w-[24px] rounded-[2px] shadow-sm border border-black/5"
                />
              </div>
            )}
            <span
              className={
                selectedLanguage
                  ? "language-selector-trigger-text"
                  : "language-selector-trigger-text text-sm text-muted-foreground/70"
              }
            >
              {selectedLanguage?.name || placeholder || "Select..."}
            </span>
          </span>
        </button>
        <ChevronDown className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-muted-foreground pointer-events-none" />

        {/* Desktop dropdown */}
        {isOpen && !isMobilePicker && (
          <div className="absolute z-50 w-full mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            {/* Search input */}
            <div className="p-3 border-b border-border">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
            className="language-selector-mobile-popup fixed inset-0 z-[70]"
            role="dialog"
            aria-modal="true"
            aria-label={`${label} picker`}
          >
            <button
              type="button"
              className="language-selector-mobile-backdrop absolute inset-0"
              onClick={() => setIsOpen(false)}
              aria-label="Close language picker"
            />
            <div className="language-selector-mobile-sheet absolute left-3 right-3 bottom-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-semibold text-foreground">{label}</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-2 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  Close
                </button>
              </div>
              <div className="p-3 border-b border-border">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
