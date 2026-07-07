// EXPERIMENTAL — self-contained HTML/metadata composition for the proof-of-
// concept renderer. Deliberately duplicated (not imported) from
// src/seo/metadata.ts and src/seo/SeoContext.tsx: those production modules
// pull in React (SeoContext.tsx) and, transitively, node:fs (metadata.ts ->
// data/vocabularyLevels -> node:fs fallback), so importing them would defeat
// the point of proving a Node/React/fs-free rendering path. The logic below
// mirrors their *output shape* (same title/description format, same JSON-LD
// graph shape, same head tag list) so the parity test can compare directly.
const OG_IMAGE = "https://www.fluentstellar.com/favicon.png";

const LINE_SEPARATOR_RE = new RegExp(String.fromCharCode(0x2028), "g");
const PARAGRAPH_SEPARATOR_RE = new RegExp(String.fromCharCode(0x2029), "g");

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonForScript(value) {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATOR_RE, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR_RE, "\\u2029");
}

// Matches WORD_META_TITLE.en in src/seo/metadata.ts exactly.
const WORD_META_TITLE = {
  en: (lang, word) => `${lang} Word "${word}" Meaning – Definition and Example`,
};

const WORD_META_DESC = {
  en: (lang, word) => `Learn "${word}" with examples, synonyms, CEFR level, and practice.`,
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sanitizeMetadataText(value) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Builds the same shape as production's buildWordSeoMetadata (src/seo/metadata.ts):
 * title, description, canonical, alternates (hreflang), jsonLd, optional robots.
 */
export function buildWordSeoMetadataPoc({
  shared,
  uiLang,
  targetLanguage,
  targetLanguageDisplayName,
  wordLemma,
  conceptId,
  definition,
  wordType,
  cefrLevel,
  pathname,
  siteOrigin,
  browsePage = 1,
}) {
  const origin = siteOrigin.replace(/\/$/, "");
  const titleBuilder = WORD_META_TITLE[uiLang] ?? WORD_META_TITLE.en;
  const descBuilder = WORD_META_DESC[uiLang] ?? WORD_META_DESC.en;
  const titleSuffix = browsePage > 1 ? ` - Browse Page ${browsePage}` : "";
  const title = sanitizeMetadataText(
    `${titleBuilder(targetLanguageDisplayName, wordLemma)} (${cefrLevel} ${wordType})${titleSuffix}`,
  );
  const trimmedDefinition = definition.trim().replace(/\s+/g, " ");
  const paginatedPrefix =
    browsePage > 1 ? `Browse page ${browsePage} of more ${cefrLevel} ${targetLanguageDisplayName} words. ` : "";
  const description = sanitizeMetadataText(
    `${paginatedPrefix}${trimmedDefinition ? `${trimmedDefinition} ` : ""}${descBuilder(targetLanguageDisplayName, wordLemma)}`.trim(),
  );

  const alternates = [
    ...shared.SUPPORTED_UI_LANGUAGES.map((lang) => ({
      hreflang: lang,
      href: `${origin}${shared.buildWordPath(lang, targetLanguage, wordLemma, conceptId)}`,
    })),
    {
      hreflang: "x-default",
      href: `${origin}${shared.buildWordPath("en", targetLanguage, wordLemma, conceptId)}`,
    },
  ];

  const canonical = `${origin}${pathname}`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: uiLang,
        mainEntity: { "@id": `${canonical}#term` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
      },
      {
        "@type": "DefinedTerm",
        "@id": `${canonical}#term`,
        name: sanitizeMetadataText(wordLemma),
        description,
        url: canonical,
        inDefinedTermSet: {
          "@type": "DefinedTermSet",
          name: sanitizeMetadataText(`${targetLanguageDisplayName} ${cefrLevel} Vocabulary`),
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: sanitizeMetadataText(wordLemma),
            item: canonical,
          },
        ],
      },
    ],
  });

  return {
    title,
    description,
    canonical,
    alternates,
    jsonLd,
    ...(browsePage > 1 ? { robots: "noindex, follow" } : {}),
  };
}

/** Mirrors renderSeoTags() in src/seo/SeoContext.tsx — same tag list, same order. */
export function renderSeoTagsPoc(metadata) {
  const alternates = (metadata.alternates ?? [])
    .map(
      (alt) =>
        `<link rel="alternate" hreflang="${escapeHtml(alt.hreflang)}" href="${escapeHtml(alt.href)}" data-vocab-hreflang="true">`,
    )
    .join("\n    ");

  return [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    metadata.robots ? `<meta name="robots" content="${escapeHtml(metadata.robots)}">` : "",
    metadata.canonical ? `<link rel="canonical" href="${escapeHtml(metadata.canonical)}">` : "",
    metadata.canonical ? `<meta property="og:type" content="website">` : "",
    metadata.canonical ? `<meta property="og:url" content="${escapeHtml(metadata.canonical)}">` : "",
    metadata.canonical ? `<meta property="og:title" content="${escapeHtml(metadata.title)}">` : "",
    metadata.canonical ? `<meta property="og:description" content="${escapeHtml(metadata.description)}">` : "",
    metadata.canonical ? `<meta property="og:image" content="${escapeHtml(OG_IMAGE)}">` : "",
    metadata.canonical ? `<meta property="og:image:width" content="1200">` : "",
    metadata.canonical ? `<meta property="og:image:height" content="630">` : "",
    alternates,
    metadata.jsonLd
      ? `<script type="application/ld+json" data-managed-jsonld="true">${escapeJsonForScript(metadata.jsonLd)}</script>`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");
}

const H1_TEXT = (word, targetLang) => `Meaning of the ${targetLang} Word "${capitalize(word)}"`;

/**
 * Composes the full canonical word-page body HTML (no React). Mirrors the
 * SEO-critical content of WordSeoPage.tsx: H1, word, definition, example
 * sentence, other meanings, related words, browse/discovery links. Practice
 * exercise / speech-synthesis interactivity is intentionally omitted — it is
 * not SEO-critical content and out of scope for this prototype.
 */
export function renderWordPageBodyHtml({
  shared,
  uiLang,
  targetLanguage,
  targetLanguageDisplayName,
  concept,
  otherMeanings,
  relatedWords,
  discoveryWords,
  browseLinks,
  browsePage,
  totalBrowsePages,
}) {
  const word = concept.wordLemma;
  const otherMeaningsHtml = otherMeanings.length
    ? `<section aria-label="Other meanings">
      <h2>Other Meanings of This Word</h2>
      <ul>
        ${otherMeanings
          .map(
            (m) =>
              `<li><p>${escapeHtml(m.definition)}</p><span>${escapeHtml(m.level)}</span> <a href="${escapeHtml(shared.buildWordPath(uiLang, targetLanguage, m.wordLemma, m.conceptId))}">Open Word Page</a></li>`,
          )
          .join("\n        ")}
      </ul>
    </section>`
    : "";

  const relatedWordsHtml = relatedWords.length
    ? `<section aria-label="Related words">
      <h2>Related Words</h2>
      <ul>
        ${relatedWords
          .map(
            (w) =>
              `<li><a href="${escapeHtml(shared.buildWordPath(uiLang, targetLanguage, w.wordLemma, w.conceptId))}">${escapeHtml(w.wordLemma)}</a></li>`,
          )
          .join("\n        ")}
      </ul>
    </section>`
    : "";

  const discoveryWordsHtml = discoveryWords.length
    ? `<section aria-label="Explore more words">
      <h2>Explore More ${escapeHtml(concept.level)} ${escapeHtml(targetLanguageDisplayName)} Word Pages</h2>
      <ul>
        ${discoveryWords
          .map(
            (w) =>
              `<li><a href="${escapeHtml(shared.buildWordPath(uiLang, targetLanguage, w.wordLemma, w.conceptId))}">${escapeHtml(w.wordLemma)}</a></li>`,
          )
          .join("\n        ")}
      </ul>
    </section>`
    : "";

  const browseHtml = browseLinks.length
    ? `<section aria-label="Browse ${escapeHtml(concept.level)} words">
      <h2>Browse More ${escapeHtml(concept.level)} ${escapeHtml(targetLanguageDisplayName)} Words (page ${browsePage} of ${totalBrowsePages})</h2>
      <ul>
        ${browseLinks
          .map((w) => `<li><a href="${escapeHtml(w.href)}">${escapeHtml(w.wordLemma)}</a></li>`)
          .join("\n        ")}
      </ul>
    </section>`
    : "";

  return `<main>
    <article>
      <h1>${escapeHtml(H1_TEXT(word, targetLanguageDisplayName))}</h1>
      <p class="word">${escapeHtml(word)}</p>
      <p class="definition">${escapeHtml(concept.definition)}</p>
      <p class="example">${escapeHtml(concept.example)}</p>
      <dl>
        <dt>CEFR level</dt><dd>${escapeHtml(concept.level)}</dd>
        <dt>Word type</dt><dd>${escapeHtml(concept.grammarType)}</dd>
        <dt>Category</dt><dd>${escapeHtml(concept.category)}</dd>
      </dl>
      ${otherMeaningsHtml}
      ${relatedWordsHtml}
      ${discoveryWordsHtml}
      ${browseHtml}
    </article>
  </main>`;
}

export function renderNotFoundBodyHtml() {
  return `<main><div><h1>Word not found</h1><p>The requested word could not be found in our vocabulary database.</p></div></main>`;
}

export function renderFullHtmlDocument({ uiLang, headTags, bodyHtml, hydrationPayload }) {
  const hydrationScript = hydrationPayload
    ? `\n    <script id="word-page-data" type="application/json">${escapeJsonForScript(JSON.stringify(hydrationPayload))}</script>`
    : "";
  return `<!doctype html>
<html lang="${escapeHtml(uiLang)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${headTags}${hydrationScript}
  </head>
  <body>
    <div id="root">${bodyHtml}</div>
  </body>
</html>`;
}
