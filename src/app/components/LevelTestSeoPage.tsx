import { useEffect, useMemo } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { getEnglishLevelPracticeLinks, getLevelTestContent, type LevelTestContent } from "../../data/seo/levelTests";
import { buildLevelTestSeoMetadata } from "../../seo/metadata";
import { SEOHead, useSeoSiteOrigin } from "../../seo/SeoContext";
import type { TargetLanguageSlug, UiLanguageCode } from "../../data/seo/slugs";

interface LevelTestSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  onStartTest: () => void;
}

function renderSection(section: LevelTestContent["sections"][number]) {
  return (
    <section key={section.heading} className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <h2 className="text-2xl text-foreground">{section.heading}</h2>
      <div className="mt-3 space-y-3">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-base text-muted-foreground">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

export function LevelTestSeoPage({
  uiLang,
  targetLanguage,
  onStartTest,
}: LevelTestSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const content = useMemo(
    () => getLevelTestContent(uiLang, targetLanguage),
    [targetLanguage, uiLang],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  if (!content) {
    return null;
  }

  const seoMetadata = buildLevelTestSeoMetadata({
    uiLang,
    targetLanguage,
    pathname: location.pathname,
    siteOrigin,
  });
  const practiceLinks = getEnglishLevelPracticeLinks(uiLang);

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">{content.title}</h1>
          <div className="mt-3 space-y-3">
            {content.introParagraphs.map((paragraph) => (
              <p key={paragraph} className="text-base text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="mt-5 rounded-xl border border-primary/45 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/15"
            onClick={onStartTest}
          >
            {content.startButtonLabel}
          </button>
        </section>

        {content.sections.map(renderSection)}

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h3 className="text-xl text-foreground">{content.practiceLinksHeading}</h3>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            {practiceLinks.map((item) => (
              <li key={item.level}>
                <Link className="text-primary transition hover:underline" to={item.href ?? "#"}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
