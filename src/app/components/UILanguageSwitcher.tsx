import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Globe, ChevronDown } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

interface UILanguageSwitcherProps {
  variant?: "default" | "centered-modal";
}

export function UILanguageSwitcher({
  variant = "default",
}: UILanguageSwitcherProps) {
  const { uiLanguage, setUILanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
  });

  const languages = [
    { code: "en", name: "English", enabled: true },
    { code: "es", name: "Spanish", enabled: false },
    { code: "fr", name: "French", enabled: false },
    { code: "de", name: "German", enabled: false },
    { code: "it", name: "Italian", enabled: false },
    { code: "pt", name: "Portuguese", enabled: false },
    { code: "ru", name: "Russian", enabled: true },
  ] as const;
  type LanguageCode = (typeof languages)[number]["code"];

  const currentLanguage =
    languages.find((lang) => lang.code === uiLanguage) ||
    languages[0];

  const filteredLanguages = languages.filter((lang) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      lang.name.toLowerCase().includes(query) ||
      lang.code.toLowerCase().includes(query)
    );
  });

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (
        buttonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }

      setIsOpen(false);
      setSearchQuery("");
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (code: LanguageCode) => {
    if (code === "en" || code === "ru") {
      setUILanguage(code);
    }
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      setSearchQuery("");
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onMouseDown={handleToggle}
        className="ui-language-switcher-trigger group flex items-center gap-2 px-3 py-2 rounded-full border border-white/20 bg-white/10 text-white/90 shadow-[0_10px_24px_rgba(10,4,30,0.25)] backdrop-blur-sm transition hover:bg-white/15 hover:text-white"
        aria-label="Change interface language"
        type="button"
      >
        <Globe className="w-4 h-4 text-white/80" />
        <span className="ui-lang-code-mobile text-[11px] font-semibold tracking-[0.2em] text-white/90 md:hidden">
          {currentLanguage.code.toUpperCase()}
        </span>
        <span className="ui-lang-name hidden md:inline text-sm font-semibold text-white/90">
          {currentLanguage.name}
        </span>
        <span className="ui-lang-code-tablet hidden text-sm font-semibold tracking-[0.12em] text-white/90">
          {currentLanguage.code.toUpperCase()}
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <>
            {variant === "centered-modal" && (
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
                style={{ zIndex: 99998 }}
                onMouseDown={() => {
                  setIsOpen(false);
                  setSearchQuery("");
                }}
              />
            )}
            <div
              ref={dropdownRef}
              className={`ui-language-dropdown fixed rounded-2xl border border-white/15 bg-[#1b0f33]/95 p-1 shadow-[0_18px_40px_rgba(12,6,32,0.45)] backdrop-blur-md ${variant === "centered-modal" ? "w-[min(22rem,calc(100vw-2rem))]" : "w-52"}`}
              style={
                variant === "centered-modal"
                  ? {
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      zIndex: 99999,
                    }
                  : {
                      top: `${dropdownPosition.top}px`,
                      left: `${dropdownPosition.left}px`,
                      transform: "translateX(-50%)",
                      zIndex: 99999,
                    }
              }
            >
              <div className="p-2 border-b border-white/10">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("languageSelector.search")}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-foreground"
                />
              </div>

              <div className="max-h-64 overflow-y-auto p-1">
                {filteredLanguages.length > 0 ? (
                  filteredLanguages.map((lang) => {
                    const isSelected = lang.code === uiLanguage;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (!lang.enabled) return;
                          handleSelect(lang.code);
                        }}
                        disabled={!lang.enabled}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                          isSelected
                            ? "bg-white/15 text-white"
                            : lang.enabled
                              ? "text-white/70 hover:bg-white/10 hover:text-white"
                              : "text-white/40 cursor-not-allowed"
                        }`}
                      >
                        <span className="ui-language-option-label text-sm font-medium">
                          {lang.name}
                        </span>
                        {!lang.enabled && (
                          <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-white/40">
                            Soon
                          </span>
                        )}
                        {isSelected && (
                          <span className="ui-language-option-active ml-auto text-[10px] uppercase tracking-[0.2em] text-white/60">
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-3 text-sm text-white/70 text-center">
                    {t("languageSelector.noResults")}
                  </div>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
