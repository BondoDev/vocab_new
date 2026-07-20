import { ChevronDown, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage, type UILanguage } from "../../contexts/LanguageContext";
import type { TargetLanguageSlug } from "../../data/seo/shared/slugs";
import type { ExploreTopic } from "../utils/exploreTopics";

interface ExploreLanguageOption {
  code: string;
  flagCode: string;
  name: string;
}

interface ExplorePageProps {
  languages: ExploreLanguageOption[];
  itemsByLanguageCode: Record<string, ExploreTopic[]>;
  openLanguage: UILanguage | null;
  onToggleLanguage: (language: UILanguage) => void;
  onCloseDropdown: () => void;
  onStartLevelTest: (targetLanguage: TargetLanguageSlug) => void;
  examPath: string;
}

export function ExplorePage({
  languages,
  itemsByLanguageCode,
  openLanguage,
  onToggleLanguage,
  onCloseDropdown,
  onStartLevelTest,
  examPath,
}: ExplorePageProps) {
  const { t } = useLanguage();

  const renderExploreTopicItem = (topic: ExploreTopic) => {
    if (topic.kind === "test") {
      if (topic.path !== examPath) {
        return (
          <Link
            key={`${topic.targetLanguage}-${topic.id}`}
            to={topic.path}
            onClick={onCloseDropdown}
            className="block w-full border-b border-primary/10 px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:bg-primary/5 last:border-b-0"
          >
            {topic.label}
          </Link>
        );
      }

      return (
        <button
          key={`${topic.targetLanguage}-${topic.id}`}
          type="button"
          onClick={() => {
            onCloseDropdown();
            if (topic.path === examPath) {
              onStartLevelTest(topic.targetLanguage);
              return;
            }

            // Unreachable: mirrors the pre-extraction `navigate(topic.path)`
            // fallback. The enclosing `if (topic.path !== examPath)` above
            // always returns a <Link> in that case, so this can never run;
            // kept as a structural no-op since ExplorePage has no generic
            // navigate callback and adding one isn't warranted for code
            // that cannot execute.
          }}
          className="block w-full border-b border-primary/10 px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:bg-primary/5 last:border-b-0"
        >
          {topic.label}
        </button>
      );
    }

    return (
      <Link
        key={`${topic.targetLanguage}-${topic.id}`}
        to={topic.path}
        onClick={onCloseDropdown}
        className="block w-full border-b border-primary/10 px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:bg-primary/5 last:border-b-0"
      >
        {topic.label}
      </Link>
    );
  };

  return (
    <main className="flex-1 px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-5">
          <label htmlFor="explore-language-search" className="sr-only">
            {t("languageSelector.search")}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="explore-language-search"
              type="text"
              placeholder={t("languageSelector.search")}
              className="h-12 w-full rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 pl-11 pr-4 text-foreground shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] outline-none transition-all duration-300 placeholder:text-muted-foreground/80 focus:border-primary/60 focus:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
            />
          </div>
        </div>
        <div className="columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3">
          {languages.map((language) => {
            const items = itemsByLanguageCode[language.code];

            if (!items) {
              return (
                <div key={language.code} className="mb-4 break-inside-avoid">
                  <button
                    type="button"
                    className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                  >
                    <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                        <span
                          className={`fi fi-${language.flagCode}`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="text-base text-foreground relative">
                        {language.name}
                      </span>
                    </span>
                    <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-300 group-hover:translate-y-0.5" />
                  </button>
                </div>
              );
            }

            const isOpen = openLanguage === language.code;

            return (
              <div
                key={language.code}
                className="mb-4 break-inside-avoid space-y-2"
              >
                <button
                  type="button"
                  onClick={() => onToggleLanguage(language.code as UILanguage)}
                  className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                >
                  <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                  <span className="flex items-center gap-3">
                    <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                      <span
                        className={`fi fi-${language.flagCode}`}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-base text-foreground relative">
                      {language.name}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                      isOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                    }`}
                  />
                </button>
                {isOpen ? (
                  <div className="overflow-hidden rounded-xl border border-primary/25 bg-card/90 shadow-[0_12px_26px_-18px_rgba(74,43,130,0.65)]">
                    {items.map(renderExploreTopicItem)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
