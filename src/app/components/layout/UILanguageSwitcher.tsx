import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Globe, ChevronDown } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useLanguage } from "../../../contexts/LanguageContext";
import { buildLocalizedVocabularyPath, resolveVocabularyRoute } from "../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import { getLevelTestSeoPath, resolveLevelTestSeoRoute } from "../../../data/seo/levelTests";
import { getSeoHubPath, resolveSeoHubRoute } from "../../../data/seo/shared/hub";
import { resolveWordRoute, buildWordPathFromSlug } from "../../../data/seo/wordPages/wordSlugs";
import {
  getPastVerbFormsPath,
  getVerbListPath,
  resolvePastVerbFormsRoute,
  resolveVerbListRoute,
} from "../../../data/seo/verbLists";
import {
  resolveWordSeoHubRoute,
  getWordSeoHubSummaryPath,
  getWordSeoHubLevelPath,
} from "../../../data/seo/wordPages/wordHubRoutes";

interface UILanguageSwitcherProps {
  variant?: "default" | "centered-modal";
}

export function UILanguageSwitcher({
  variant = "default",
}: UILanguageSwitcherProps) {
  const { uiLanguage, setUILanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
  });

  const languages = [
    { code: "en", name: "English", flagCode: "gb", enabled: true },
    { code: "es", name: "Espa\u00f1ol", flagCode: "es", enabled: true },
    { code: "fr", name: "Fran\u00e7ais", flagCode: "fr", enabled: true },
    { code: "de", name: "Deutsch", flagCode: "de", enabled: true },
    { code: "it", name: "Italiano", flagCode: "it", enabled: true },
    { code: "pt", name: "Portugu\u00eas", flagCode: "pt", enabled: true },
    { code: "ru", name: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", flagCode: "ru", enabled: true },
  ] as const;
  type LanguageCode = (typeof languages)[number]["code"];

  const currentLanguage =
    languages.find((lang) => lang.code === uiLanguage) ||
    languages[0];

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
    if (code === "en" || code === "es" || code === "fr" || code === "pt" || code === "it" || code === "de" || code === "ru") {
      const seoHubRoute = resolveSeoHubRoute(location.pathname);
      if (seoHubRoute) {
        const nextPath = getSeoHubPath(code);
        if (nextPath !== location.pathname) {
          navigate(nextPath);
        }
        setUILanguage(code);
        setIsOpen(false);
        return;
      }

      const wordSeoHubRoute = resolveWordSeoHubRoute(location.pathname);
      if (wordSeoHubRoute) {
        const nextPath =
          wordSeoHubRoute.kind === "summary"
            ? getWordSeoHubSummaryPath(code, wordSeoHubRoute.targetLanguage)
            : getWordSeoHubLevelPath(
                code,
                wordSeoHubRoute.targetLanguage,
                wordSeoHubRoute.level,
                wordSeoHubRoute.page,
              );
        if (nextPath !== location.pathname) {
          navigate(nextPath);
        }
        setUILanguage(code);
        setIsOpen(false);
        return;
      }

      const levelTestRoute = resolveLevelTestSeoRoute(location.pathname);
      if (levelTestRoute) {
        const nextPath = getLevelTestSeoPath(code, levelTestRoute.targetLanguage);
        if (nextPath && nextPath !== location.pathname) {
          navigate(nextPath);
        }
      }

      const match = location.pathname.match(/^\/([a-z]{2})\/([^/?#]+)$/);
      if (match) {
        const [, currentUiLang, slug] = match;

        const wordResolved = resolveWordRoute(currentUiLang, slug);
        if (wordResolved) {
          const nextPath = buildWordPathFromSlug(
            code,
            wordResolved.targetLanguage,
            wordResolved.wordSlug,
            wordResolved.conceptId,
          );
          if (nextPath !== location.pathname) {
            navigate(nextPath);
          }
          setUILanguage(code);
          setIsOpen(false);
          return;
        }

        const resolved = resolveVocabularyRoute(currentUiLang, slug);
        if (resolved) {
          const nextPath = buildLocalizedVocabularyPath(
            code,
            resolved.targetLanguage,
            resolved.level,
          );
          if (nextPath && nextPath !== location.pathname) {
            navigate(nextPath);
          }
        }
      }

      const verbListRoute = resolveVerbListRoute(location.pathname);
      if (verbListRoute) {
        const nextPath = getVerbListPath(verbListRoute.targetLanguage, code);
        if (nextPath !== location.pathname) {
          navigate(nextPath);
        }
        setUILanguage(code);
        setIsOpen(false);
        return;
      }

      const pastVerbFormsRoute = resolvePastVerbFormsRoute(location.pathname);
      if (pastVerbFormsRoute) {
        const nextPath = getPastVerbFormsPath(pastVerbFormsRoute.targetLanguage, code);
        if (nextPath && nextPath !== location.pathname) {
          navigate(nextPath);
        }
        setUILanguage(code);
        setIsOpen(false);
        return;
      }

      setUILanguage(code);
    }
    setIsOpen(false);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
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
        <span suppressHydrationWarning className="ui-lang-code-mobile text-[11px] font-semibold tracking-[0.2em] text-white/90 md:hidden">
          {currentLanguage.code.toUpperCase()}
        </span>
        <span suppressHydrationWarning className="ui-lang-name hidden md:inline text-sm font-semibold text-white/90">
          {currentLanguage.name}
        </span>
        <span suppressHydrationWarning className="ui-lang-code-tablet hidden text-sm font-semibold tracking-[0.12em] text-white/90">
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
              <div className="max-h-64 overflow-y-auto p-1">
                {languages.map((lang) => {
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
                      <span
                        className={`fi fi-${lang.flagCode} rounded-[2px] shadow-sm border border-white/15`}
                        aria-hidden="true"
                        style={{ width: "18px", height: "14px" }}
                      />
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
                })}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

