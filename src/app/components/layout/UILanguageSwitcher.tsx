import { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { Globe, ChevronDown } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useLanguage } from "../../../contexts/LanguageContext";
import { buildLocalizedVocabularyPath, resolveVocabularyRoute } from "../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import { getLevelTestSeoPath, resolveLevelTestSeoRoute } from "../../../data/seo/levelTests";
import { getSeoHubPath, resolveSeoHubRoute } from "../../../data/seo/shared/hub";
import {
  getPrivacyPolicyPath,
  resolvePrivacyPolicyRoute,
} from "../../../data/seo/legalPages/privacyPolicy/privacyPolicyRoutes";
import { isSupportedUiLanguage } from "../../../data/seo/shared/slugs";
import { getFullVocabularyListPath, resolveFullVocabularyListRoute } from "../../../data/seo/listPages/fullVocabularyList";
import { getNounListPath, resolveNounListRoute } from "../../../data/seo/listPages/nounLists";
import { resolveWordRoute, buildWordPathFromSlug } from "../../../data/seo/wordPages/wordSlugs";
import {
  getConjugatedVerbFormsPath,
  getPastVerbFormsPath,
  getVerbListPath,
  resolveConjugatedVerbFormsRoute,
  resolvePastVerbFormsRoute,
  resolveVerbListRoute,
} from "../../../data/seo/listPages/verbLists";
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

  // Listbox pattern (WAI-ARIA APG "collapsible listbox"): the trigger opens a
  // role="listbox" whose options use a roving tabindex. The popup is portaled
  // to <body> (it must escape the header's stacking context), so it is NOT
  // next to the trigger in tab order: focus is moved into it on open and
  // handed back to the trigger on Escape or a selection (Tab / Shift+Tab
  // continue from the trigger to its neighbours) — otherwise a keyboard user
  // would have to tab through the whole page to reach it.
  const listboxId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedIndex = Math.max(
    0,
    languages.findIndex((lang) => lang.code === currentLanguage.code),
  );

  const openListbox = (index = selectedIndex) => {
    setActiveIndex(index);
    setIsOpen(true);
  };

  const closeListbox = () => {
    setIsOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  // Focus the active option once the portal has rendered (and whenever the
  // arrow keys move the active option).
  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[activeIndex]?.focus({ preventScroll: false });
  }, [isOpen, activeIndex]);

  const handleListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = languages.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index >= last ? 0 : index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? last : index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        break;
      case "Escape":
        // preventDefault also tells the mobile menu's document-level key
        // handler (Header.tsx) that this key has been handled here, so only
        // the listbox closes.
        event.preventDefault();
        event.stopPropagation();
        closeListbox();
        break;
      case "Tab":
        // Close and hand focus back to the trigger WITHOUT cancelling the
        // key: the browser's default Tab / Shift+Tab then continues from the
        // trigger, so focus lands on the control after (or before) it in
        // one press, as if the portaled popup were not there. Left
        // uncancelled on purpose, so the open mobile menu's focus wrap
        // (Header.tsx) still applies when the drawer trigger is its last item.
        closeListbox();
        break;
      default:
        break;
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openListbox(event.key === "ArrowUp" ? languages.length - 1 : selectedIndex);
    }
  };

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
    if (isSupportedUiLanguage(code)) {
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

      // Same page in the newly chosen language, opened at the top. Any
      // #section anchor is deliberately dropped: carrying it over made the
      // new language jump straight to that section (often the page bottom).
      if (resolvePrivacyPolicyRoute(location.pathname)) {
        const nextPath = getPrivacyPolicyPath(code);
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

      const fullVocabularyListRoute = resolveFullVocabularyListRoute(location.pathname);
      if (fullVocabularyListRoute) {
        const nextPath = getFullVocabularyListPath(fullVocabularyListRoute.targetLanguage, code);
        if (nextPath && nextPath !== location.pathname) {
          navigate(nextPath);
        }
        setUILanguage(code);
        setIsOpen(false);
        return;
      }

      const nounListRoute = resolveNounListRoute(location.pathname);
      if (nounListRoute) {
        const nextPath = getNounListPath(nounListRoute.listId, code);
        if (nextPath && nextPath !== location.pathname) {
          navigate(nextPath);
        }
        setUILanguage(code);
        setIsOpen(false);
        return;
      }

      const conjugatedVerbFormsRoute = resolveConjugatedVerbFormsRoute(location.pathname);
      if (conjugatedVerbFormsRoute) {
        const nextPath = getConjugatedVerbFormsPath(conjugatedVerbFormsRoute.targetLanguage, code);
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
    if (isOpen) {
      setIsOpen(false);
    } else {
      openListbox();
    }
  };

  // A selection closes the listbox and returns focus to the trigger (if the
  // header survives the language/route change; otherwise focus is harmless).
  const handleOptionSelect = (code: LanguageCode) => {
    handleSelect(code);
    buttonRef.current?.focus({ preventScroll: true });
  };

  // The mobile drawer's language row (variant="centered-modal") gets its own
  // light, drawer-integrated presentation - a readable language name instead
  // of a bare two-letter code, and a light popup that matches the rest of
  // the (now light) mobile menu - while the desktop header trigger (variant
  // "default") keeps its original dark-on-purple pill and popup untouched.
  // Same component, same state/logic/positioning, purely a styling branch.
  const isDrawer = variant === "centered-modal";

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={
          isDrawer
            ? "ui-language-switcher-trigger ui-language-switcher-trigger--drawer"
            : "ui-language-switcher-trigger group flex items-center gap-2 px-3 py-2 rounded-full border border-white/20 bg-white/10 text-white/90 shadow-[0_10px_24px_rgba(10,4,30,0.25)] backdrop-blur-sm transition hover:bg-white/15 hover:text-white"
        }
        // No aria-label on either variant: the accessible name is the
        // visible text itself (plus a visually hidden localized prefix /
        // separator), so it always contains exactly what is on screen at the
        // current breakpoint (WCAG 2.5.3) — e.g. "Interface Language: English".
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        {isDrawer ? (
          <>
            <span
              className={`fi fi-${currentLanguage.flagCode} rounded-[2px]`}
              aria-hidden="true"
              style={{ width: "20px", height: "15px" }}
            />
            <span className="ui-language-switcher-trigger__details">
              <span suppressHydrationWarning className="header-mobile-lang-label">
                {t("header.interfaceLanguage")}
              </span>
              <span className="sr-only">: </span>
              <span suppressHydrationWarning className="ui-lang-name">
                {currentLanguage.name}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`ui-language-switcher-trigger__chevron w-4 h-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </>
        ) : (
          <>
            <Globe className="w-4 h-4 text-white/80" aria-hidden="true" />
            <span suppressHydrationWarning className="sr-only">
              {`${t("header.interfaceLanguage")}: `}
            </span>
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
              aria-hidden="true"
              className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {isOpen &&
        createPortal(
          <>
            {isDrawer && (
              <div
                className="fixed inset-0 bg-[rgba(22,14,40,0.46)] backdrop-blur-[2px]"
                style={{ zIndex: 99998 }}
                onMouseDown={() => {
                  setIsOpen(false);
                }}
              />
            )}
            <div
              ref={dropdownRef}
              className={
                isDrawer
                  ? "ui-language-dropdown ui-language-dropdown--drawer fixed rounded-2xl p-1.5 w-[min(22rem,calc(100vw-2rem))]"
                  : "ui-language-dropdown fixed rounded-2xl border border-white/15 bg-[#1b0f33]/95 p-1 shadow-[0_18px_40px_rgba(12,6,32,0.45)] backdrop-blur-md w-52"
              }
              style={
                isDrawer
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
              <div
                id={listboxId}
                role="listbox"
                aria-label={t("header.interfaceLanguage")}
                onKeyDown={handleListboxKeyDown}
                className="max-h-64 overflow-y-auto p-1"
              >
                {languages.map((lang, index) => {
                  const isSelected = lang.code === uiLanguage;
                  return (
                    <button
                      key={lang.code}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={index === activeIndex ? 0 : -1}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!lang.enabled) return;
                        handleOptionSelect(lang.code);
                      }}
                      disabled={!lang.enabled}
                      className={
                        isDrawer
                          ? `ui-language-option w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                              isSelected ? "is-selected" : ""
                            } ${!lang.enabled ? "is-disabled" : ""}`
                          : `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                              isSelected
                                ? "bg-white/15 text-white"
                                : lang.enabled
                                  ? "text-white/70 hover:bg-white/10 hover:text-white"
                                  : "text-white/40 cursor-not-allowed"
                            }`
                      }
                    >
                      <span
                        className={
                          isDrawer
                            ? `fi fi-${lang.flagCode} ui-language-option__flag rounded-[2px]`
                            : `fi fi-${lang.flagCode} rounded-[2px] shadow-sm border border-white/15`
                        }
                        aria-hidden="true"
                        style={{ width: "18px", height: "14px" }}
                      />
                      <span className="ui-language-option-label text-sm font-medium">
                        {lang.name}
                      </span>
                      {!lang.enabled && (
                        <span
                          className={
                            isDrawer
                              ? "ui-language-option__soon ml-auto text-[10px] uppercase tracking-[0.12em]"
                              : "ml-auto text-[10px] uppercase tracking-[0.12em] text-white/40"
                          }
                        >
                          Soon
                        </span>
                      )}
                      {isSelected && (
                        // Visual badge only: aria-selected conveys the state,
                        // and this English word would otherwise leak into the
                        // option's name in every UI language.
                        <span
                          aria-hidden="true"
                          className={
                            isDrawer
                              ? "ui-language-option-active ml-auto text-[10px] uppercase tracking-[0.18em]"
                              : "ui-language-option-active ml-auto text-[10px] uppercase tracking-[0.2em] text-white/60"
                          }
                        >
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
