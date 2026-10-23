import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronLeft,
  ChevronRight,
  Languages,
  ListChecks,
  Volume2,
} from "lucide-react";
import { useLanguage, type UILanguage } from "../../../contexts/LanguageContext";
import { getSeoHubPath } from "../../../data/seo/shared/hub";
import { buildVocabularyConceptResolver } from "../../../data/vocabulary/resolveVocabularyWordData";
import { Header } from "../../components/layout/Header";
import type { LanguageSelector } from "../../components/LanguageSelector";
import "./new-home-page.scss";

// Page-owned lazy imports follow the practice loaders without coupling to their state.
const DAILY_WORD_IMPORTERS: Record<string, () => Promise<{ default: unknown[] }>> = {
  en: () => import("../../../data/vocabulary/english/vocabulary.json"),
  de: () => import("../../../data/vocabulary/german/vocabulary.json"),
  it: () => import("../../../data/vocabulary/italian/vocabulary.json"),
  es: () => import("../../../data/vocabulary/spanish/vocabulary.json"),
  fr: () => import("../../../data/vocabulary/french/vocabulary.json"),
  ru: () => import("../../../data/vocabulary/russian/vocabulary.json"),
  pt: () => import("../../../data/vocabulary/portuguese/vocabulary.json"),
};

interface DailyWord {
  interfaceLanguage: UILanguage;
  language: string;
  word: string;
  type: string;
  translation: string;
}

const DAILY_WORD_SPEECH_LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  ru: "ru-RU",
};

async function loadRandomDailyWord(interfaceLanguage: UILanguage): Promise<DailyWord> {
  const { default: nativeEntries } = await DAILY_WORD_IMPORTERS[interfaceLanguage]();
  const remainingLanguages = Object.keys(DAILY_WORD_IMPORTERS).filter(
    (language) => language !== interfaceLanguage,
  );
  while (remainingLanguages.length > 0) {
    const [language] = remainingLanguages.splice(
      Math.floor(Math.random() * remainingLanguages.length), 1,
    );
    try {
      const { default: entries } = await DAILY_WORD_IMPORTERS[language]();
      const resolveConcept = buildVocabularyConceptResolver(entries, nativeEntries);
      const eligible: DailyWord[] = [];
      for (const raw of entries) {
        if (!raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        if (typeof entry.concept_id !== "string") continue;
        const resolved = resolveConcept(entry.concept_id);
        if (!resolved || (resolved.level !== "A2" && resolved.level !== "B1") || !resolved.grammarType) continue;
        const word = resolved.targetWord.trim().normalize("NFC");
        const translation = resolved.translation.trim().normalize("NFC");
        // Count letters in both languages, including accented and Cyrillic
        // letters, but not spaces, punctuation, or combining marks.
        const wordLetters = word.match(/\p{L}/gu)?.length ?? 0;
        const translationLetters = translation.match(/\p{L}/gu)?.length ?? 0;
        if (wordLetters < 7 || wordLetters > 12 || translationLetters < 7 || translationLetters > 12) continue;
        eligible.push({ interfaceLanguage, language, word, type: resolved.grammarType, translation });
      }
      if (eligible.length > 0) {
        return eligible[Math.floor(Math.random() * eligible.length)];
      }
    } catch (error) {
      console.warn(`Homepage vocabulary could not load for ${language}.`, error);
    }
  }
  throw new Error("No eligible homepage vocabulary is available.");
}

const FEATURE_HIGHLIGHTS = [
  { id: "vocabulary", icon: BookOpen },
  { id: "languages", icon: Languages },
  { id: "exercises", icon: ListChecks },
  { id: "progress", icon: ChartNoAxesColumnIncreasing },
] as const;

// Presentation order only; names and flags come from the app's language metadata.
const LANGUAGE_DISPLAY_ORDER: Record<string, number> = {
  en: 0,
  de: 1,
  it: 2,
  es: 3,
  fr: 4,
  ru: 5,
  pt: 6,
};

interface NewHomePageProps {
  headerProps: ComponentProps<typeof Header>;
  languages: ComponentProps<typeof LanguageSelector>["languages"];
  onLogin: () => void;
  onStartPracticing: () => void;
}

export function NewHomePage({ headerProps, languages, onLogin, onStartPracticing }: NewHomePageProps) {
  const { t, uiLanguage } = useLanguage();
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [dailyWordSelection, setDailyWordSelection] = useState<DailyWord | null>(null);
  const [dailyWordErrorLanguage, setDailyWordErrorLanguage] = useState<UILanguage | null>(null);
  const dailyWord = dailyWordSelection?.interfaceLanguage === uiLanguage ? dailyWordSelection : null;
  const sourceFlagCode = languages.find((language) => language.code === dailyWord?.language)?.flagCode;
  const translationFlagCode = languages.find((language) => language.code === uiLanguage)?.flagCode;
  const dailyWordError = dailyWordErrorLanguage === uiLanguage;
  const pronounceDailyWord = () => {
    if (!dailyWord || !isSpeechSupported) return;
    const utterance = new SpeechSynthesisUtterance(dailyWord.word);
    utterance.lang = DAILY_WORD_SPEECH_LOCALES[dailyWord.language] ?? dailyWord.language;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const dailyWordRequestRef = useRef<{ language: UILanguage; promise: Promise<DailyWord> } | null>(null);
  const dailyWordHeadingRef = useRef<HTMLDivElement>(null);
  const dailyWordTitleRef = useRef<HTMLHeadingElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const languagesRef = useRef<HTMLElement>(null);
  const languagesRailRef = useRef<HTMLDivElement>(null);
  const languagesListRef = useRef<HTMLUListElement>(null);
  const [languageScroll, setLanguageScroll] = useState({
    overflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });
  const orderedLanguages = [...languages].sort(
    (first, second) =>
      (LANGUAGE_DISPLAY_ORDER[first.code] ?? Number.MAX_SAFE_INTEGER) -
      (LANGUAGE_DISPLAY_ORDER[second.code] ?? Number.MAX_SAFE_INTEGER),
  );

  useEffect(() => {
    // Detect browser-only support after hydration to keep the initial render stable.
    setIsSpeechSupported(
      "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    );
  }, []);

  useEffect(() => {
    // Defer randomness until hydration and reuse StrictMode's request. Tag the
    // result by UI language so stale translations never appear during a switch.
    let cancelled = false;
    setDailyWordErrorLanguage(null);
    if (dailyWordRequestRef.current?.language !== uiLanguage) {
      dailyWordRequestRef.current = { language: uiLanguage, promise: loadRandomDailyWord(uiLanguage) };
    }
    void dailyWordRequestRef.current.promise.then(
      (word) => { if (!cancelled) setDailyWordSelection(word); },
      () => { if (!cancelled) setDailyWordErrorLanguage(uiLanguage); },
    );
    return () => { cancelled = true; };
  }, [uiLanguage]);

  useEffect(() => {
    const heading = dailyWordHeadingRef.current;
    const title = dailyWordTitleRef.current;
    const speaker = heading?.querySelector<HTMLButtonElement>("button");
    const card = heading?.closest<HTMLElement>(".new-home-page__daily-word");
    const translation = card?.querySelector<HTMLElement>(".new-home-page__daily-word-translation");
    if (!heading || !title || !speaker || !card || !translation) return;
    let cancelled = false;
    const fitSourceWord = () => {
      // Measure at the SCSS-defined size before fitting, so widening the card
      // restores the original typography instead of retaining a smaller font.
      card.style.removeProperty("--daily-word-fitted-font-size");
      const fontSize = parseFloat(getComputedStyle(title).fontSize);
      const gap = parseFloat(getComputedStyle(heading).columnGap) || 0;
      const flag = heading.querySelector<HTMLElement>(".new-home-page__daily-word-flag");
      const flagWidth = flag?.offsetWidth ?? 0;
      const available = heading.clientWidth - speaker.offsetWidth - flagWidth - gap * (flagWidth > 0 ? 2 : 1);
      const naturalWidth = title.scrollWidth;
      if (available > 0 && naturalWidth > available) {
        card.style.setProperty(
          "--daily-word-fitted-font-size",
          `${fontSize * Math.max(1, available - 1) / naturalWidth}px`,
        );
      }
    };
    const fitTranslation = () => {
      const size = parseFloat(getComputedStyle(translation).fontSize);
      const available = translation.clientWidth;
      const naturalWidth = translation.scrollWidth;
      return naturalWidth > available && available > 0
        ? size * Math.max(1, available - 1) / naturalWidth
        : size;
    };
    const fitWord = () => {
      if (cancelled) return;
      card.classList.remove("new-home-page__daily-word--stacked");
      card.style.removeProperty("--daily-word-translation-font-size");
      fitSourceWord();
      let translationSize = fitTranslation();
      // Prefer full-width blocks over squeezing either word below comfortable
      // desktop sizes. This is presentation-only; the connected pair is unchanged.
      if (parseFloat(getComputedStyle(title).fontSize) < 28 || translationSize < 24) {
        card.classList.add("new-home-page__daily-word--stacked");
        fitSourceWord();
        translationSize = fitTranslation();
      }
      card.style.setProperty("--daily-word-translation-font-size", `${translationSize}px`);
    };
    fitWord();
    let lastWidth = card.clientWidth;
    // Ignore height changes caused by stacking/font fitting to avoid resize loops.
    const observer = new ResizeObserver(() => {
      if (card.clientWidth === lastWidth) return;
      lastWidth = card.clientWidth;
      fitWord();
    });
    observer.observe(card);
    void document.fonts.ready.then(fitWord);
    document.fonts.addEventListener("loadingdone", fitWord);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fitWord);
      card.classList.remove("new-home-page__daily-word--stacked");
      card.style.removeProperty("--daily-word-fitted-font-size");
      card.style.removeProperty("--daily-word-translation-font-size");
    };
  }, [dailyWord]);

  useEffect(() => {
    const page = pageRef.current;
    const strip = languagesRef.current;
    if (!page || !strip) return;
    const header = page.querySelector<HTMLElement>(".header-shell");

    // Match fixed navigation heights so neither a hero gap nor rail overlap remains.
    const reserveStripHeight = () => {
      if (header) {
        page.style.setProperty(
          "--homepage-header-height",
          `${header.getBoundingClientRect().height}px`,
        );
      }
      page.style.setProperty(
        "--language-strip-height",
        `${strip.getBoundingClientRect().height}px`,
      );
    };
    reserveStripHeight();
    const observer = new ResizeObserver(reserveStripHeight);
    observer.observe(strip);
    if (header) observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const rail = languagesRailRef.current;
    const list = languagesListRef.current;
    if (!rail || !list) return;

    const updateScrollAvailability = () => {
      const next = {
        // Compare against the full rail, not the space narrowed by visible arrows.
        // This lets the arrows disappear again as soon as every language fits.
        overflow: list.scrollWidth > rail.clientWidth + 1,
        canScrollLeft: list.scrollLeft > 1,
        canScrollRight: list.scrollLeft + list.clientWidth < list.scrollWidth - 1,
      };
      setLanguageScroll((previous) =>
        previous.overflow === next.overflow &&
        previous.canScrollLeft === next.canScrollLeft &&
        previous.canScrollRight === next.canScrollRight
          ? previous
          : next,
      );
    };
    updateScrollAvailability();
    const observer = new ResizeObserver(updateScrollAvailability);
    observer.observe(rail);
    observer.observe(list);
    for (const item of list.children) observer.observe(item);
    list.addEventListener("scroll", updateScrollAvailability, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", updateScrollAvailability);
    };
  }, [languages]);

  const scrollLanguages = (direction: number) => {
    const list = languagesListRef.current;
    if (!list) return;
    list.scrollBy({ left: direction * Math.max(list.clientWidth * 0.75, 120) });
  };

  return (
    <div ref={pageRef} className="new-home-page">
      <Header {...headerProps} activePage="language" />
      <main className="new-home-page__main">
        <section className="new-home-page__hero" aria-labelledby="homepage-hero-title">
          <div className="new-home-page__hero-copy">
            <h1 id="homepage-hero-title" className="new-home-page__title">
              {t("home.heroTitle")}
            </h1>
          </div>
          <div className="new-home-page__hero-scene">
            <p className="new-home-page__subtitle">
              {t("home.heroSubtitle")}
            </p>
            <div className="new-home-page__daily-word-slot">
              <article
                className="new-home-page__daily-word"
                aria-labelledby="homepage-daily-word-label"
                aria-busy={!dailyWord && !dailyWordError}
              >
                <p id="homepage-daily-word-label" className="new-home-page__daily-word-label">
                  {t("home.dailyWordLabel")}
                </p>
                <div className="new-home-page__daily-word-details">
                  {dailyWord ? (
                    <>
                      <p className="new-home-page__daily-word-meta">
                        {t(`languageNames.${dailyWord.language}`)}
                      </p>
                      <div ref={dailyWordHeadingRef} className="new-home-page__daily-word-heading">
                        {sourceFlagCode && (
                          <span
                            className={`fi fi-${sourceFlagCode} new-home-page__daily-word-flag`}
                            role="img"
                            aria-label={t(`languageNames.${dailyWord.language}`)}
                          />
                        )}
                        <h2
                          ref={dailyWordTitleRef}
                          id="homepage-daily-word-title"
                          className="new-home-page__daily-word-title"
                          lang={dailyWord.language}
                        >
                          {dailyWord.word}
                        </h2>
                        <button
                          type="button"
                          className="new-home-page__daily-word-speaker"
                          aria-label={t("practice.listenToPronunciation")}
                          title={t("practice.listenToPronunciation")}
                          onClick={pronounceDailyWord}
                          disabled={!isSpeechSupported}
                        >
                          <Volume2 aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="new-home-page__daily-word-status" role="status">
                      {t(dailyWordError ? "supabaseErrors.temporarilyUnavailable" : "practice.loadingWords")}
                    </p>
                  )}
                </div>
                {dailyWord && (
                  <div className="new-home-page__daily-word-translation-panel">
                    <p className="new-home-page__daily-word-meta">
                      {t(`languageNames.${uiLanguage}`)}
                    </p>
                    <div className="new-home-page__daily-word-translation-row">
                      {translationFlagCode && (
                        <span
                          className={`fi fi-${translationFlagCode} new-home-page__daily-word-flag`}
                          role="img"
                          aria-label={t(`languageNames.${uiLanguage}`)}
                        />
                      )}
                      <p className="new-home-page__daily-word-translation" lang={uiLanguage}>
                        {dailyWord.translation}
                      </p>
                    </div>
                  </div>
                )}
              </article>
            </div>
          </div>
        </section>
        <div className="new-home-page__cards">
          <div className="new-home-page__card new-home-page__card--personalized">
            <div className="new-home-page__card-header">
              <span className="new-home-page__card-icon-badge">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 64 64"
                  className="new-home-page__card-icon"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M32 49c-7-5-15-6-24-4V15c9-2 17-1 24 4 7-5 15-6 24-4v30c-9-2-17-1-24 4Z" />
                  <path d="M32 19v30" />
                  <path d="M14 24c5-.6 9 .2 13 2" />
                  <path d="M14 32c5-.6 9 .2 13 2" />
                  <path d="M37 26c3-1.5 6-2.2 9-2" />
                  <path
                    className="new-home-page__card-icon-star"
                    d="m46 5 2.6 5.4 L54 13l-5.4 2.6 L46 21l-2.6-5.4 L38 13l5.4-2.6 L46 5Z"
                  />
                </svg>
              </span>
              <div className="new-home-page__card-copy">
                <h2 className="new-home-page__card-title">{t("home.personalizedLearning.title")}</h2>
                <p className="new-home-page__card-description">
                  {t("home.personalizedLearning.description")}
                </p>
              </div>
            </div>
            <ul className="new-home-page__card-labels">
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.personalizedLearning.features.study")}</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.personalizedLearning.features.review")}</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.personalizedLearning.features.progress")}</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.personalizedLearning.features.favorites")}</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.personalizedLearning.features.statistics")}</span>
              </li>
            </ul>
            <div className="new-home-page__card-footer">
              <button type="button" className="new-home-page__card-button" onClick={onLogin}>
                <span>{t("home.personalizedLearning.button")}</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="new-home-page__card new-home-page__card--custom">
            <div className="new-home-page__card-header">
              <span className="new-home-page__card-icon-badge">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 80 80"
                  className="new-home-page__card-icon"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="12" y="13" width="49" height="54" rx="7" />
                  <path
                    className="new-home-page__card-icon-text"
                    d="M23 27h25M23 35h17M23 43h12"
                  />
                  <circle cx="45" cy="53" r="9" />
                  <path
                    className="new-home-page__card-icon-check"
                    d="m41 53 3 3 5-6"
                  />
                  <path
                    className="new-home-page__card-icon-pencil"
                    d="m53 36 13-13 5 5-13 13-8 3 3-8Z"
                  />
                  <path
                    className="new-home-page__card-icon-pencil-detail"
                    d="m62 27 5 5"
                  />
                </svg>
              </span>
              <div className="new-home-page__card-copy">
                <h2 className="new-home-page__card-title">
                  {t("home.customPractice.title")}
                </h2>
                <p className="new-home-page__card-description">
                  {t("home.customPractice.description")}
                </p>
              </div>
            </div>
            <ul className="new-home-page__card-labels">
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.customPractice.features.language")}</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.customPractice.features.vocabulary")}</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.customPractice.features.exercises")}</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.customPractice.features.pace")}</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>{t("home.customPractice.features.noAccount")}</span>
              </li>
            </ul>
            <div className="new-home-page__card-footer">
              <button type="button" className="new-home-page__card-button" onClick={onStartPracticing}>
                <span>{t("home.customPractice.button")}</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <section
          className="new-home-page__highlights"
          aria-label={t("home.highlights.label")}
        >
          <ul className="new-home-page__highlights-list">
            {FEATURE_HIGHLIGHTS.map(({ id, icon: Icon }) => (
              <li key={id} className="new-home-page__highlight">
                <span className="new-home-page__highlight-icon">
                  <Icon aria-hidden="true" />
                </span>
                <div className="new-home-page__highlight-copy">
                  <h2 className="new-home-page__highlight-title">
                    {t(`home.highlights.${id}.title`)}
                  </h2>
                  <p className="new-home-page__highlight-description">
                    {t(`home.highlights.${id}.description`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        {/* Secondary entry point into the public resource pages. A real
            anchor in the prerendered HTML: it is the homepage's only
            crawlable path into the CEFR, list, verb, and level-test pages. */}
        <section
          className="new-home-page__resources"
          aria-labelledby="homepage-resources-title"
        >
          <span className="new-home-page__highlight-icon" aria-hidden="true">
            <BookOpen />
          </span>
          <div className="new-home-page__resources-copy">
            <h2 id="homepage-resources-title" className="new-home-page__highlight-title">
              {t("learningResources.label")}
            </h2>
            <p className="new-home-page__highlight-description">
              {t("learningResources.homeDescription")}
            </p>
          </div>
          <Link className="new-home-page__resources-link" to={getSeoHubPath(uiLanguage)}>
            {t("learningResources.browse")}
            <ArrowRight aria-hidden="true" />
          </Link>
        </section>
        <section
          ref={languagesRef}
          className="new-home-page__languages"
          aria-label={t("home.supportedLanguages")}
        >
          <div ref={languagesRailRef} className="new-home-page__languages-rail">
            {languageScroll.overflow ? (
              <button
                type="button"
                className="new-home-page__languages-arrow"
                aria-label={t("home.languageScrollLeft")}
                title={t("home.languageScrollLeft")}
                aria-controls="homepage-languages-list"
                disabled={!languageScroll.canScrollLeft}
                onClick={() => scrollLanguages(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
            ) : null}
            <ul
              ref={languagesListRef}
              id="homepage-languages-list"
              className="new-home-page__languages-list"
              tabIndex={languageScroll.overflow ? 0 : undefined}
              aria-label={t("home.supportedLanguages")}
            >
              {orderedLanguages.map((language) => (
                <li
                  key={language.code}
                  className="new-home-page__language"
                  title={language.name}
                >
                  {language.flagCode ? (
                    <span
                      className={`fi fi-${language.flagCode} new-home-page__language-flag`}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="new-home-page__language-name">
                    {language.name}
                  </span>
                </li>
              ))}
            </ul>
            {languageScroll.overflow ? (
              <button
                type="button"
                className="new-home-page__languages-arrow"
                aria-label={t("home.languageScrollRight")}
                title={t("home.languageScrollRight")}
                aria-controls="homepage-languages-list"
                disabled={!languageScroll.canScrollRight}
                onClick={() => scrollLanguages(1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
