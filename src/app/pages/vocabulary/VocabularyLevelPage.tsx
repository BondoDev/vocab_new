import { useEffect, type MouseEvent } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { ArrowDown, CheckCircle2 } from "lucide-react";
import { buildLocalizedVocabularyPath } from "../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import { SUPPORTED_LEVELS, SUPPORTED_TARGET_LANGUAGES } from "../../../data/seo/shared/slugs";
import { getLevelTestSeoPath } from "../../../data/seo/levelTests";
import { getSeoHubPath } from "../../../data/seo/shared/hub";
import { getRelatedLearningResources } from "../../components/learning-resources/learningResourcesRegistry";
import type {
  CefrLevelCode,
  TargetLanguageSlug,
  UiLanguageCode,
} from "../../../data/seo/vocabularyLevels";
import type { VocabularyLevelPageModel } from "../../../data/seo/vocabularyLevels/levelContent";
import type { LevelExplorerInitialData } from "../../../data/seo/vocabularyLevels/levelExplorerRows";
import {
  formatCefrWordCount,
  getCefrLevelCode,
  getCefrPageCopy,
} from "../../../data/seo/vocabularyLevels/cefrPageCopy";
import { getVocabularyFaqItems } from "../../../seo/metadata";
import { SEOHead, type SeoMetadata } from "../../../seo/SeoContext";
import { VOCABULARY_EXPLORER_ID, VocabularyLevelExplorer } from "./VocabularyLevelExplorer";
import { useLevelExplorerRows } from "./useLevelExplorerRows";
import "./vocabulary-level-page.scss";

interface VocabularyLevelPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: CefrLevelCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
  // Editorial content, already validated and mapped from either the legacy
  // or the v2 schema (see levelContent.ts).
  contentOverride: {
    model: VocabularyLevelPageModel;
  };
  seoMetadataOverride: SeoMetadata;
  // SSR only: the explorer's first page. The browser reads the same data from
  // the JSON block entry-server.tsx embeds in the HTML.
  initialExplorerData?: LevelExplorerInitialData | null;
}

// CEFR vocabulary-level page (all 294 UI x target x level combinations).
// Section order: compact hero, vocabulary explorer, level guide, topics and
// study guidance, related resources, FAQ (editorial v2 content only), final
// call to action. All visible interface copy comes from cefrPageCopy.ts;
// all page-specific prose comes from the editorial model.
export function VocabularyLevelPage({
  uiLang,
  targetLanguage,
  level,
  onStartPractice,
  contentOverride,
  seoMetadataOverride,
  initialExplorerData,
}: VocabularyLevelPageProps) {
  const location = useLocation();
  const { model } = contentOverride;
  const copy = getCefrPageCopy(uiLang);
  const levelCode = getCefrLevelCode(level);
  const explorerData = useLevelExplorerRows(location.pathname, uiLang, targetLanguage, level, initialExplorerData);

  // A new CEFR path (another level or language) starts at the top; explorer
  // query/page changes keep the same pathname and the reader's position.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const startPractice = () => onStartPractice(targetLanguage, levelCode);
  const scrollToExplorer = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(VOCABULARY_EXPLORER_ID);
    if (!target) {
      return;
    }
    // Scroll without adding #vocabulary to the URL (the href stays as the
    // no-JavaScript fallback).
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const levelLinks = SUPPORTED_LEVELS.map((item) => ({
    level: item,
    code: getCefrLevelCode(item),
    name: copy.levelNames[item],
    href: item === level ? null : buildLocalizedVocabularyPath(uiLang, targetLanguage, item),
  }));
  const languageLinks = SUPPORTED_TARGET_LANGUAGES.filter((language) => language !== targetLanguage)
    .map((language) => ({
      language,
      label: `${copy.languageNames[language]} ${levelCode}`,
      href: buildLocalizedVocabularyPath(uiLang, language, level),
    }))
    .filter((item): item is typeof item & { href: string } => Boolean(item.href));
  const levelTestHref = getLevelTestSeoPath(uiLang, targetLanguage);
  // Same-language list and verb pages (the level test is listed separately).
  const resourceLinks = getRelatedLearningResources(uiLang, targetLanguage, [levelTestHref]);
  const faqItems = getVocabularyFaqItems(model);
  const totalWords = explorerData.totalWords;

  return (
    <main className="vlp min-h-screen bg-background">
      <SEOHead metadata={seoMetadataOverride} />
      <div className="vlp-shell">
        {/* 1. Compact hero */}
        <header className="vlp-hero">
          <ul className="vlp-facts" aria-label={copy.pageFactsLabel}>
            <li className="vlp-fact vlp-fact--level">
              <span className="vlp-fact__code">{levelCode}</span>
              <span>{copy.levelNames[level]}</span>
            </li>
            <li className="vlp-fact vlp-fact--language" lang={uiLang}>
              {copy.languageNames[targetLanguage]}
            </li>
            <li className="vlp-fact vlp-fact--count">
              {totalWords === null ? (
                <span className="vlp-fact__pending" aria-hidden="true" />
              ) : (
                formatCefrWordCount(uiLang, totalWords)
              )}
            </li>
          </ul>
          <h1 className="vlp-hero__title">{model.hero.title}</h1>
          <p className="vlp-hero__intro">{model.hero.introduction}</p>
          <div className="vlp-hero__actions">
            <button type="button" className="vlp-btn vlp-btn--primary" onClick={startPractice}>
              {copy.startPractice}
            </button>
            <a className="vlp-btn vlp-btn--secondary" href={`#${VOCABULARY_EXPLORER_ID}`} onClick={scrollToExplorer}>
              {copy.exploreVocabulary}
              <ArrowDown aria-hidden="true" />
            </a>
          </div>
        </header>

        {/* 2. Vocabulary explorer */}
        <VocabularyLevelExplorer
          uiLang={uiLang}
          targetLanguage={targetLanguage}
          level={level}
          copy={copy}
          data={explorerData}
        />

        {/* 3 + 4. Learning guide: side by side on wide screens */}
        <div className="vlp-guide">
          <section className="vlp-panel vlp-panel--level" aria-labelledby="level-guide-heading">
            <h2 id="level-guide-heading" className="vlp-h2">
              {model.levelGuide.heading}
            </h2>
            {model.levelGuide.lead ? <p className="vlp-lead">{model.levelGuide.lead}</p> : null}
            {model.levelGuide.paragraphs.map((paragraph) => (
              <p key={paragraph} className="vlp-text">
                {paragraph}
              </p>
            ))}
            {model.levelGuide.learningOutcomes.length > 0 ? (
              <>
                <h3 className="vlp-h3">{copy.learningOutcomes}</h3>
                <ul className="vlp-outcomes">
                  {model.levelGuide.learningOutcomes.map((outcome) => (
                    <li key={outcome}>
                      <CheckCircle2 aria-hidden="true" />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="vlp-panel vlp-panel--topics" aria-labelledby="topic-guide-heading">
            <h2 id="topic-guide-heading" className="vlp-h2">
              {model.topicGuide.heading}
            </h2>
            {model.topicGuide.introduction.map((paragraph) => (
              <p key={paragraph} className="vlp-text">
                {paragraph}
              </p>
            ))}
            {model.topicGuide.topics.length > 0 ? (
              <dl className="vlp-topics">
                {model.topicGuide.topics.map((topic) => (
                  <div key={topic.name} className="vlp-topics__item">
                    <dt>{topic.name}</dt>
                    <dd>{topic.description}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {model.topicGuide.groups.map((group, index) => (
              <div key={group.heading || index} className="vlp-group">
                {group.heading ? <h3 className="vlp-h3">{group.heading}</h3> : null}
                <ul className="vlp-list">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            {model.studyAdvice ? (
              <div className="vlp-advice">
                <h3 className="vlp-h3">{model.studyAdvice.heading}</h3>
                <ol className="vlp-advice__tips">
                  {model.studyAdvice.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </section>
        </div>

        {/* 5. Related learning resources */}
        <nav className="vlp-related" aria-labelledby="related-heading">
          <h2 id="related-heading" className="vlp-h2">
            {copy.related.heading}
          </h2>
          <div className="vlp-related__grid">
            <div className="vlp-related__group">
              <h3 className="vlp-related__title">{copy.related.otherLevels}</h3>
              <ul className="vlp-levels">
                {levelLinks.map((item) =>
                  item.href ? (
                    <li key={item.level}>
                      <Link to={item.href} className="vlp-level">
                        <span className="vlp-level__code">{item.code}</span>
                        <span className="vlp-level__name">{item.name}</span>
                      </Link>
                    </li>
                  ) : (
                    <li key={item.level}>
                      <span className="vlp-level vlp-level--current" aria-current="page">
                        <span className="vlp-level__code">{item.code}</span>
                        <span className="vlp-level__name">{item.name}</span>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
            <div className="vlp-related__group">
              <h3 className="vlp-related__title">{copy.related.otherLanguages(levelCode)}</h3>
              <ul className="vlp-chips">
                {languageLinks.map((item) => (
                  <li key={item.language}>
                    <Link to={item.href} className="vlp-chip">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="vlp-related__group">
              <h3 className="vlp-related__title">{copy.related.moreResources}</h3>
              <ul className="vlp-links">
                {levelTestHref ? (
                  <li>
                    <Link to={levelTestHref}>{copy.levelTestLabel(targetLanguage)}</Link>
                  </li>
                ) : null}
                {resourceLinks.map((link) => (
                  <li key={link.kind}>
                    <Link to={link.href}>{link.label}</Link>
                  </li>
                ))}
                <li>
                  <Link to={getSeoHubPath(uiLang)}>{copy.related.allResources}</Link>
                </li>
              </ul>
            </div>
          </div>
        </nav>

        {/* 6. FAQ: editorial (v2) content only; omitted until it exists. */}
        {faqItems.length > 0 ? (
          <section className="vlp-faq" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="vlp-h2">
              {copy.faqHeading}
            </h2>
            <div className="vlp-faq__list">
              {faqItems.map((item) => (
                <details key={item.question} className="vlp-faq__item">
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* 7. Final call to action */}
        <section className="vlp-final" aria-labelledby={model.finalCta.heading ? "final-cta-heading" : undefined}>
          <div className="vlp-final__text">
            {model.finalCta.heading ? (
              <h2 id="final-cta-heading" className="vlp-final__title">
                {model.finalCta.heading}
              </h2>
            ) : null}
            {model.finalCta.description ? <p>{model.finalCta.description}</p> : null}
          </div>
          <button type="button" className="vlp-btn vlp-btn--light" onClick={startPractice}>
            {copy.startPractice}
          </button>
        </section>
      </div>
    </main>
  );
}
