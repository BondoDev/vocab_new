import type { ComponentProps } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, ArrowRight, Languages, SlidersHorizontal } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { SEOHead } from "../../seo/SeoContext";
import { Header } from "../components/layout/Header";
import { LanguageSelector } from "../components/LanguageSelector";
import { VALID_LEVEL_CODES } from "../utils/pageRouting";

interface CustomPracticePreviewPageProps {
  headerProps: ComponentProps<typeof Header>;
  languages: ComponentProps<typeof LanguageSelector>["languages"];
  yourLanguage: string;
  practiceLanguage: string;
  onYourLanguageChange: (value: string) => void;
  onPracticeLanguageChange: (value: string) => void;
  onReverseLanguages: () => void;
  swapRotation: number;
  selectedLevels: string[];
  selectedCategories: string[];
  selectedWordTypes: string[];
  onCustomizeFilters: () => void;
  isCustomizeFiltersDisabled: boolean;
}

export function CustomPracticePreviewPage({
  headerProps,
  languages,
  yourLanguage,
  practiceLanguage,
  onYourLanguageChange,
  onPracticeLanguageChange,
  onReverseLanguages,
  swapRotation,
  selectedLevels,
  selectedCategories,
  selectedWordTypes,
  onCustomizeFilters,
  isCustomizeFiltersDisabled,
}: CustomPracticePreviewPageProps) {
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const allLevels = selectedLevels.length === 0 ||
    [...VALID_LEVEL_CODES].every((level) => selectedLevels.includes(level));
  const allVocabulary = allLevels && selectedCategories.length === 0 && selectedWordTypes.length === 0;
  const translatedLabel = (key: string, fallback: string) => {
    const label = t(key);
    return label && label !== key ? label : fallback;
  };
  const filterSummary = [
    {
      label: t("levelCategory.levels"),
      values: allLevels
        ? [t("levelCategory.selection.allLevelsSelected")]
        : [...VALID_LEVEL_CODES].filter((level) => selectedLevels.includes(level)),
    },
    {
      label: t("levelCategory.categories"),
      values: selectedCategories.length
        ? selectedCategories.map((category) => translatedLabel(`levelCategory.topicNames.${category}`, category))
        : [t("levelCategory.allTopicsSelected")],
    },
    {
      label: t("levelCategory.wordTypes"),
      values: selectedWordTypes.length
        ? selectedWordTypes.map((type) => translatedLabel(`wordTypes.${type}`, type))
        : [t("levelCategory.allGrammarTypesSelected")],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9fc]">
      <SEOHead
        metadata={{
          title: "Custom Practice | FluentStellar",
          description: "Custom practice preview.",
          robots: "noindex, nofollow",
        }}
      />
      <Header {...headerProps} />
      <main className="flex-1 px-4 py-6 md:py-8">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="text-3xl font-semibold text-[#30243f]">
            Customize Your Practice
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Choose your languages, vocabulary, and exercises.
          </p>
        </div>
        <ol className="mx-auto mt-6 grid w-full max-w-3xl grid-cols-3 gap-3 border-b border-[#e5dfed] pb-4">
          {[
            t("home.customPractice.chooseLanguages"),
            t("home.customPractice.filters.title"),
            t("home.customPractice.chooseExercises"),
          ].map((label, index) => (
            <li key={index} className={`flex min-w-0 items-start gap-1.5 text-[11px] leading-4 sm:items-center sm:gap-2 sm:text-sm sm:leading-5 ${index === 2 ? "text-[#70617e]" : "text-[#58416e]"}`}>
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === 2 ? "bg-[#eeeaf3] text-[#70617e]" : "bg-[#eae2f5] text-[#684395]"}`}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 break-words font-medium">{label}</span>
            </li>
          ))}
        </ol>
        <section
          className="language-page mx-auto mt-6 w-full max-w-3xl"
          aria-labelledby="custom-practice-languages-heading"
        >
          <h2 id="custom-practice-languages-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#352a44]">
            <Languages className="h-5 w-5 shrink-0 text-[#77529d]" aria-hidden="true" />
            {t("home.customPractice.chooseLanguages")}
          </h2>
          <div className="grid grid-cols-1 items-start gap-4 bg-[#f3f0f7] p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-5 md:p-5">
            <LanguageSelector
              label={t("home.yourLanguage")}
              value={yourLanguage}
              onChange={onYourLanguageChange}
              placeholder={t("home.selectYourLanguage")}
              languages={languages}
              disabledLanguages={[practiceLanguage]}
            />
            <div className="flex justify-center relative top-4 md:mt-8">
              <motion.button
                type="button"
                onClick={onReverseLanguages}
                className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full border border-border/70 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/70 shadow-sm transition-all"
                aria-label="Reverse languages"
                title="Reverse languages"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <motion.span
                  animate={shouldReduceMotion ? undefined : { rotate: swapRotation }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: "easeInOut" }}
                  className="inline-flex"
                >
                  <ArrowLeftRight className="w-4 h-4 rotate-90 md:rotate-0 text-foreground/80" />
                </motion.span>
              </motion.button>
            </div>
            <LanguageSelector
              label={t("home.practiceLanguage")}
              value={practiceLanguage}
              onChange={onPracticeLanguageChange}
              placeholder={t("home.selectPracticeLanguage")}
              languages={languages}
              disabledLanguages={[yourLanguage]}
            />
          </div>
        </section>
        <section className="mx-auto mt-6 w-full max-w-3xl border-y border-[#e5dfed] py-5" aria-labelledby="custom-practice-filters-heading">
          <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:gap-x-4">
            <SlidersHorizontal className="h-5 w-5 text-[#77529d]" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="custom-practice-filters-heading" className="text-lg font-semibold text-[#352a44]">
                {t("home.customPractice.filters.title")}
              </h2>
              {allVocabulary ? (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {t("home.customPractice.filters.unrestrictedSummary")}
                </p>
              ) : (
                <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
                  {filterSummary.map(({ label, values }, index) => (
                    <span key={label} title={values.join(", ")}>
                      {index > 0 && <span aria-hidden="true"> &middot; </span>}
                      {label}: {values.slice(0, 3).join(", ")}{values.length > 3 ? ` +${values.length - 3}` : ""}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onCustomizeFilters}
              disabled={isCustomizeFiltersDisabled}
              className="col-start-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#ddd4e8] bg-transparent px-4 py-2 text-sm font-medium text-[#684395] transition-colors hover:border-[#bda8d5] hover:bg-[#f3f0fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#684395] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:col-start-auto sm:w-auto"
            >
              {t("home.customPractice.filters.customize")}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
