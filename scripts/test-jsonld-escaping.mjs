/**
 * JSON-LD SSR escaping regression tests.
 *
 * Verifies that renderSeoTags() safely escapes HTML-sensitive characters
 * inside <script type="application/ld+json"> elements so that database-
 * controlled content cannot terminate the script element early or inject
 * executable markup into the SSR HTML.
 *
 * Run: node scripts/test-jsonld-escaping.mjs
 * No build required — compiles SeoContext.tsx from TypeScript source.
 *
 * Run after build for dist/ checks: npm run build && node scripts/test-jsonld-escaping.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tempDir = path.join(rootDir, ".tmp-jsonld-escape-test");
const require = createRequire(import.meta.url);

// ── Compile SeoContext.tsx and site.ts to CommonJS ───────────────────────────

function compileModules() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const rootNames = [
    path.join(rootDir, "src", "seo", "SeoContext.tsx"),
    path.join(rootDir, "src", "seo", "site.ts"),
  ];

  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      resolveJsonModule: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      rootDir,
      outDir: tempDir,
      noEmit: false,
    },
  });

  const emitResult = program.emit();
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => rootDir,
      getNewLine: () => "\n",
    });
    throw new Error(`TypeScript compile failed:\n${formatted}`);
  }

  // Mark the temp directory as CommonJS so Node.js loads the compiled files
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ type: "commonjs" }),
  );
}

compileModules();

const { renderSeoTags } = require(
  path.join(tempDir, "src", "seo", "SeoContext.js"),
);

// ── HTML script-element parser ───────────────────────────────────────────────
//
// Mimics the HTML5 parsing algorithm for script elements: a <script> element
// terminates at the FIRST literal </script> found in the source text,
// regardless of what appears between the tags. This is how every browser HTML
// parser (and Googlebot) actually tokenises the document — the JSON parser
// only runs AFTER the HTML parser hands it the text content, so a premature
// </script> corrupts the script element before any JSON is parsed.
function parseScriptElements(html) {
  const elements = [];
  let searchFrom = 0;
  const htmlLower = html.toLowerCase();

  while (searchFrom < html.length) {
    const openStart = htmlLower.indexOf("<script", searchFrom);
    if (openStart === -1) break;

    const openEnd = htmlLower.indexOf(">", openStart);
    if (openEnd === -1) break;

    const openTag = html.slice(openStart, openEnd + 1);
    const contentStart = openEnd + 1;

    // HTML5 spec §12.2.6.1: script element data state ends at </script>
    const closeIdx = htmlLower.indexOf("</script>", contentStart);
    if (closeIdx === -1) break;

    elements.push({
      openTag,
      content: html.slice(contentStart, closeIdx),
    });

    searchFrom = closeIdx + "</script>".length;
  }

  return elements;
}

// ── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ── Hostile payload ───────────────────────────────────────────────────────────
//
// All character classes that can break an HTML-embedded script element.

const HOSTILE_TEXT =
  'Normal "quotes" and \'apostrophes\'\n</script>\n<script>alert("x")</script>\n<\n&\n \n ';

const hostileWordSchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name: "test-word",
  description: HOSTILE_TEXT,
  url: "https://www.fluentstellar.com/en/english-word-test--A1-00001",
  inDefinedTermSet: {
    "@type": "DefinedTermSet",
    name: "English A1 Vocabulary",
  },
};

const hostileMetadata = {
  title: 'English Word "test-word" Meaning (A1 noun)',
  description: "Test word description.",
  canonical: "https://www.fluentstellar.com/en/english-word-test--A1-00001",
  jsonLd: JSON.stringify(hostileWordSchema),
  alternates: [
    {
      hreflang: "en",
      href: "https://www.fluentstellar.com/en/english-word-test--A1-00001",
    },
    {
      hreflang: "x-default",
      href: "https://www.fluentstellar.com/en/english-word-test--A1-00001",
    },
  ],
};

const renderedHostile = renderSeoTags(hostileMetadata);

// ── [1] Source code verification ──────────────────────────────────────────────

console.log("\n[1] Source code verification");

{
  const source = fs.readFileSync(
    path.join(rootDir, "src", "seo", "SeoContext.tsx"),
    "utf8",
  );

  test("escapeJsonScriptContent helper is defined in source", () => {
    assert.ok(source.includes("function escapeJsonScriptContent("));
  });

  test("escapeJsonScriptContent escapes < to \\u003c", () => {
    assert.ok(
      source.includes('"\\\\u003c"') || source.includes('"\\u003c"'),
      "< escape not found",
    );
  });

  test("escapeJsonScriptContent escapes > to \\u003e", () => {
    assert.ok(
      source.includes('"\\\\u003e"') || source.includes('"\\u003e"'),
      "> escape not found",
    );
  });

  test("escapeJsonScriptContent escapes & to \\u0026", () => {
    assert.ok(
      source.includes('"\\\\u0026"') || source.includes('"\\u0026"'),
      "& escape not found",
    );
  });

  test("escapeJsonScriptContent is applied to JSON-LD script content", () => {
    assert.ok(
      source.includes("escapeJsonScriptContent(") &&
        source.includes("application/ld+json"),
    );
  });

  test("JSON-LD script uses data-managed-jsonld attribute", () => {
    assert.ok(source.includes('data-managed-jsonld="true"'));
  });
}

// ── [2] Hostile content: escape characters present in output ─────────────────

console.log("\n[2] Hostile content escaping");

{
  test("Rendered output is a non-empty string", () => {
    assert.ok(typeof renderedHostile === "string" && renderedHostile.length > 0);
  });

  test("Script content contains \\u003c (escaped <)", () => {
    assert.ok(renderedHostile.includes("\\u003c"), "\\u003c not found");
  });

  test("Script content contains \\u003e (escaped >)", () => {
    assert.ok(renderedHostile.includes("\\u003e"), "\\u003e not found");
  });

  test("Script content contains \\u0026 (escaped &)", () => {
    assert.ok(renderedHostile.includes("\\u0026"), "\\u0026 not found");
  });

  test("Script content contains \\u2028 (escaped line separator)", () => {
    assert.ok(renderedHostile.includes("\\u2028"), "\\u2028 not found");
  });

  test("Script content contains \\u2029 (escaped paragraph separator)", () => {
    assert.ok(renderedHostile.includes("\\u2029"), "\\u2029 not found");
  });

  test("No literal </script> inside JSON-LD content", () => {
    const scripts = parseScriptElements(renderedHostile);
    const jsonLd = scripts.find((s) => s.openTag.includes("application/ld+json"));
    assert.ok(jsonLd, "JSON-LD script not found");
    assert.ok(
      !jsonLd.content.toLowerCase().includes("</script>"),
      "Literal </script> found inside JSON-LD content — script terminates early",
    );
  });
}

// ── [3] HTML parser verification ─────────────────────────────────────────────
//
// Uses the state-machine parseScriptElements() above, which applies the same
// termination rule as a real HTML5 parser, to count and inspect script nodes.

console.log("\n[3] HTML parser verification (state-machine, HTML5 termination rule)");

{
  const scripts = parseScriptElements(renderedHostile);
  const jsonLdScripts = scripts.filter((s) =>
    s.openTag.includes("application/ld+json"),
  );
  const executableScripts = scripts.filter(
    (s) =>
      !s.openTag.includes("application/ld+json") &&
      !s.openTag.includes("type="),
  );

  test("Exactly 1 JSON-LD script element found by parser", () => {
    assert.equal(jsonLdScripts.length, 1, `Found ${jsonLdScripts.length}`);
  });

  test("0 executable script elements created from hostile content", () => {
    assert.equal(
      executableScripts.length,
      0,
      `Found ${executableScripts.length}: ${executableScripts.map((s) => s.openTag).join(", ")}`,
    );
  });

  test("Total script element count is exactly 1", () => {
    assert.equal(scripts.length, 1, `Found ${scripts.length} total script elements`);
  });

  test("JSON-LD element is intact (has opening tag and non-empty content)", () => {
    assert.ok(jsonLdScripts[0]?.openTag.includes("application/ld+json"));
    assert.ok((jsonLdScripts[0]?.content.length ?? 0) > 0);
  });
}

// ── [4] Round-trip validation ─────────────────────────────────────────────────
//
// source string → JSON.stringify → escapeJsonScriptContent → HTML embedding
//   → parseScriptElements (HTML5) → JSON.parse → must equal source string

console.log("\n[4] Round-trip: source → JSON.stringify → escape → parse → source");

{
  const scripts = parseScriptElements(renderedHostile);
  const jsonLdScript = scripts.find((s) => s.openTag.includes("application/ld+json"));
  let parsed;

  test("Extracted JSON-LD content parses with JSON.parse", () => {
    assert.ok(jsonLdScript, "JSON-LD script not found");
    parsed = JSON.parse(jsonLdScript.content);
    assert.ok(typeof parsed === "object" && parsed !== null);
  });

  test("Parsed description contains original </script> as literal text", () => {
    assert.ok(
      parsed.description.includes("</script>"),
      `Expected literal </script> in parsed.description`,
    );
  });

  test("Parsed description contains original < character", () => {
    assert.ok(parsed.description.includes("<"));
  });

  test("Parsed description contains original > character", () => {
    assert.ok(parsed.description.includes(">"));
  });

  test("Parsed description contains original & character", () => {
    assert.ok(parsed.description.includes("&"));
  });

  test("Parsed description contains U+2028 (line separator)", () => {
    assert.ok(parsed.description.includes(" "));
  });

  test("Parsed description contains U+2029 (paragraph separator)", () => {
    assert.ok(parsed.description.includes(" "));
  });

  test("Parsed description contains normal double quotes", () => {
    assert.ok(parsed.description.includes('"'));
  });

  test("Parsed description contains apostrophes", () => {
    assert.ok(parsed.description.includes("'"));
  });

  test("Parsed values exactly equal original schema values", () => {
    assert.equal(parsed["@type"], hostileWordSchema["@type"]);
    assert.equal(parsed.name, hostileWordSchema.name);
    assert.equal(parsed.description, hostileWordSchema.description);
  });

  test("No double encoding: parsed < is not literal \\u003c string", () => {
    assert.ok(
      !parsed.description.includes("\\u003c"),
      "Double-encoded \\u003c found in parsed value",
    );
  });

  test("No double encoding: parsed & is not literal \\u0026 string", () => {
    assert.ok(
      !parsed.description.includes("\\u0026"),
      "Double-encoded \\u0026 found in parsed value",
    );
  });
}

// ── [5] Word page: DefinedTerm schema ────────────────────────────────────────

console.log("\n[5] Word page (DefinedTerm schema)");

const wordSchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name: "about",
  description:
    'Used when talking about a subject. Learn how to use "about" with simple examples.',
  url: "https://www.fluentstellar.com/en/english-word-about--A1-00001",
  inDefinedTermSet: {
    "@type": "DefinedTermSet",
    name: "English A1 Vocabulary",
  },
};

const wordMetadata = {
  title: 'English Word "about" Meaning – Definition and Example (A1 preposition)',
  description: 'Used near a topic. Learn how to use "about" with examples.',
  canonical: "https://www.fluentstellar.com/en/english-word-about--A1-00001",
  jsonLd: JSON.stringify(wordSchema),
  alternates: [
    {
      hreflang: "en",
      href: "https://www.fluentstellar.com/en/english-word-about--A1-00001",
    },
    {
      hreflang: "x-default",
      href: "https://www.fluentstellar.com/en/english-word-about--A1-00001",
    },
  ],
};

{
  const rendered = renderSeoTags(wordMetadata);
  const scripts = parseScriptElements(rendered);
  const jsonLdScript = scripts.find((s) => s.openTag.includes("application/ld+json"));
  let parsed;

  test("Word page emits exactly 1 script element", () => {
    assert.equal(scripts.length, 1);
  });

  test("Word page JSON-LD parses successfully", () => {
    assert.ok(jsonLdScript, "No JSON-LD script found");
    parsed = JSON.parse(jsonLdScript.content);
    assert.ok(typeof parsed === "object");
  });

  test("Word page schema @type is DefinedTerm", () => {
    assert.equal(parsed["@type"], "DefinedTerm");
  });

  test("Word page schema inDefinedTermSet @type is DefinedTermSet", () => {
    assert.equal(parsed.inDefinedTermSet["@type"], "DefinedTermSet");
  });

  test("Word page canonical URL uses double-hyphen concept format", () => {
    assert.ok(
      rendered.includes("english-word-about--A1-00001"),
      "canonical URL format incorrect",
    );
  });

  test("Word page hreflang present", () => {
    assert.ok(rendered.includes('hreflang="en"'));
  });

  test("Word page has no noindex", () => {
    assert.ok(!rendered.includes("noindex"));
  });
}

// ── [6] Vocabulary-level page: FAQPage schema ─────────────────────────────────

console.log("\n[6] Vocabulary-level page (FAQPage schema)");

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What vocabulary is included in the English A1 word list?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The A1 level covers essential everyday words for basic communication.",
      },
    },
    {
      "@type": "Question",
      name: "How many English A1 words should I know?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "At the A1 level you should know 500+ words.",
      },
    },
  ],
};

const vocabMetadata = {
  title: "English A1 Vocabulary List (CEFR) – 500+ words & Examples",
  description: "Practice 500+ English A1 words with CEFR-aligned exercises. Start free today.",
  canonical: "https://www.fluentstellar.com/en/learn-english-a1-vocabulary",
  jsonLd: JSON.stringify(faqSchema),
  alternates: [
    {
      hreflang: "en",
      href: "https://www.fluentstellar.com/en/learn-english-a1-vocabulary",
    },
    {
      hreflang: "x-default",
      href: "https://www.fluentstellar.com/en/learn-english-a1-vocabulary",
    },
  ],
};

{
  const rendered = renderSeoTags(vocabMetadata);
  const scripts = parseScriptElements(rendered);
  const jsonLdScript = scripts.find((s) => s.openTag.includes("application/ld+json"));
  let parsed;

  test("Vocabulary page emits exactly 1 script element", () => {
    assert.equal(scripts.length, 1);
  });

  test("Vocabulary page JSON-LD parses successfully", () => {
    assert.ok(jsonLdScript, "No JSON-LD script found");
    parsed = JSON.parse(jsonLdScript.content);
  });

  test("Vocabulary page schema @type is FAQPage", () => {
    assert.equal(parsed["@type"], "FAQPage");
  });

  test("FAQPage mainEntity is an array", () => {
    assert.ok(Array.isArray(parsed.mainEntity));
  });

  test("FAQPage first item @type is Question", () => {
    assert.equal(parsed.mainEntity[0]["@type"], "Question");
  });

  test("FAQPage Question.name is present", () => {
    assert.ok(parsed.mainEntity[0].name.length > 0);
  });

  test("FAQPage acceptedAnswer.text is present", () => {
    assert.ok(parsed.mainEntity[0].acceptedAnswer.text.length > 0);
  });

  // Hostile content in FAQ answer
  const hostileFaqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Does hostile content break the script element?",
        acceptedAnswer: {
          "@type": "Answer",
          text: HOSTILE_TEXT,
        },
      },
    ],
  };

  const hostileVocabRendered = renderSeoTags({
    ...vocabMetadata,
    jsonLd: JSON.stringify(hostileFaqSchema),
  });
  const hostileScripts = parseScriptElements(hostileVocabRendered);
  const hostileJsonLd = hostileScripts.find((s) =>
    s.openTag.includes("application/ld+json"),
  );

  test("FAQPage with hostile answer: exactly 1 script element", () => {
    assert.equal(hostileScripts.length, 1);
  });

  test("FAQPage with hostile answer: JSON.parse succeeds", () => {
    assert.ok(hostileJsonLd, "No JSON-LD script found");
    JSON.parse(hostileJsonLd.content);
  });

  test("FAQPage with hostile answer: parsed value preserves original text exactly", () => {
    const p = JSON.parse(hostileJsonLd.content);
    assert.equal(p.mainEntity[0].acceptedAnswer.text, HOSTILE_TEXT);
  });
}

// ── [7] Pages without JSON-LD ─────────────────────────────────────────────────

console.log("\n[7] Pages without JSON-LD (LevelTest, SeoHub)");

const levelTestMetadata = {
  title: "English Level Test – A1 to C2 CEFR",
  description: "Test your English level with our free CEFR assessment.",
  canonical: "https://www.fluentstellar.com/en/test-your-english-level",
  alternates: [
    { hreflang: "en", href: "https://www.fluentstellar.com/en/test-your-english-level" },
  ],
  // no jsonLd property
};

const seoHubMetadata = {
  title: "SEO Pages - Vocabulary Practice and Level Tests",
  description: "Browse all vocabulary practice pages and language level tests.",
  canonical: "https://www.fluentstellar.com/en/seo-hub",
  alternates: [
    { hreflang: "en", href: "https://www.fluentstellar.com/en/seo-hub" },
  ],
  // no jsonLd property
};

{
  const renderedLevelTest = renderSeoTags(levelTestMetadata);
  const renderedSeoHub = renderSeoTags(seoHubMetadata);

  test("LevelTest page emits no script elements", () => {
    const scripts = parseScriptElements(renderedLevelTest);
    assert.equal(scripts.length, 0, `Unexpected scripts: ${scripts.map((s) => s.openTag).join(", ")}`);
  });

  test("SeoHub page emits no script elements", () => {
    const scripts = parseScriptElements(renderedSeoHub);
    assert.equal(scripts.length, 0, `Unexpected scripts: ${scripts.map((s) => s.openTag).join(", ")}`);
  });

  test("LevelTest page has no empty JSON-LD script in rendered output", () => {
    assert.ok(!renderedLevelTest.includes("application/ld+json"));
  });

  test("LevelTest title is preserved", () => {
    assert.ok(renderedLevelTest.includes("English Level Test"));
  });

  test("LevelTest canonical is preserved", () => {
    assert.ok(renderedLevelTest.includes("test-your-english-level"));
  });

  test("LevelTest hreflang is preserved", () => {
    assert.ok(renderedLevelTest.includes('hreflang="en"'));
  });
}

// ── [8] Non-JSON-LD metadata elements unchanged ───────────────────────────────

console.log("\n[8] Non-JSON-LD metadata: canonical, hreflang, title, description, robots");

{
  const rendered = renderSeoTags(wordMetadata);

  test("Title element rendered", () => {
    assert.ok(rendered.includes("<title>") && rendered.includes("about"));
  });

  test("Meta description rendered", () => {
    assert.ok(rendered.includes('name="description"'));
  });

  test("Canonical link rendered with correct URL", () => {
    assert.ok(rendered.includes('rel="canonical"'));
    assert.ok(rendered.includes("english-word-about--A1-00001"));
  });

  test("Hreflang alternate links rendered", () => {
    assert.ok(rendered.includes('rel="alternate"'));
    assert.ok(rendered.includes('hreflang="en"'));
    assert.ok(rendered.includes('hreflang="x-default"'));
  });

  test("OG tags rendered", () => {
    assert.ok(rendered.includes('property="og:title"'));
    assert.ok(rendered.includes('property="og:url"'));
    assert.ok(rendered.includes('property="og:type"'));
  });

  test("No noindex on canonical word page", () => {
    assert.ok(!rendered.includes("noindex"));
  });

  // Verify robots is included when set
  const robotsMetadata = {
    title: "Profile",
    description: "Your profile.",
    robots: "noindex, nofollow",
  };
  const renderedRobots = renderSeoTags(robotsMetadata);

  test("Robots meta rendered when set", () => {
    assert.ok(renderedRobots.includes('name="robots"'));
    assert.ok(renderedRobots.includes("noindex"));
  });
}

// ── [9] No duplicate JSON-LD ──────────────────────────────────────────────────

console.log("\n[9] No duplicate JSON-LD during SSR injection");

{
  const rendered = renderSeoTags(wordMetadata);
  const count = (rendered.match(/data-managed-jsonld="true"/g) ?? []).length;

  test("Exactly 1 data-managed-jsonld script in SSR output", () => {
    assert.equal(count, 1, `Found ${count} managed JSON-LD scripts`);
  });
}

// ── [10] Schema @type values preserved in source ───────────────────────────────

console.log("\n[10] Schema @type values in metadata.ts (not removed)");

{
  const metadataSource = fs.readFileSync(
    path.join(rootDir, "src", "seo", "metadata.ts"),
    "utf8",
  );

  test('"FAQPage" @type still present in buildVocabularySeoMetadata', () => {
    assert.ok(metadataSource.includes('"FAQPage"'));
  });

  test('"DefinedTerm" @type still present in buildWordSeoMetadata', () => {
    assert.ok(metadataSource.includes('"DefinedTerm"'));
  });

  test('"Question" @type still present in FAQPage schema', () => {
    assert.ok(metadataSource.includes('"Question"'));
  });

  test('"Answer" @type still present in acceptedAnswer', () => {
    assert.ok(metadataSource.includes('"Answer"'));
  });

  test('"DefinedTermSet" @type still present', () => {
    assert.ok(metadataSource.includes('"DefinedTermSet"'));
  });
}

// ── [11] dist/ HTML checks (conditional — requires prior npm run build) ───────

const distDir = path.join(rootDir, "dist");
const distExists = fs.existsSync(distDir);

if (distExists) {
  console.log("\n[11] Built dist/ HTML verification");

  const indexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");

  test("dist/index.html exists and is non-empty", () => {
    assert.ok(indexHtml.length > 0);
  });

  // Homepage: should have no JSON-LD (homepage uses DEFAULT_SEO_METADATA without jsonLd)
  test("Homepage dist HTML does not have JSON-LD from a previous page", () => {
    // Homepage has no jsonLd so any JSON-LD present is a regression
    const homeScripts = parseScriptElements(indexHtml).filter((s) =>
      s.openTag.includes("application/ld+json"),
    );
    assert.equal(homeScripts.length, 0, `Homepage has unexpected JSON-LD scripts`);
  });

  // Verify any JSON-LD in prerendered word pages uses escaped content
  const enDir = path.join(distDir, "en");
  if (fs.existsSync(enDir)) {
    const wordDirs = fs.readdirSync(enDir).filter((d) => d.includes("-word-"));

    if (wordDirs.length > 0) {
      const wordHtml = fs.readFileSync(
        path.join(distDir, "en", wordDirs[0], "index.html"),
        "utf8",
      );
      const wordScripts = parseScriptElements(wordHtml);
      const jsonLdScripts = wordScripts.filter((s) =>
        s.openTag.includes("application/ld+json"),
      );

      test(`Prerendered word page (${wordDirs[0]}) has exactly 1 JSON-LD script`, () => {
        assert.equal(jsonLdScripts.length, 1, `Found ${jsonLdScripts.length}`);
      });

      test("Prerendered word page JSON-LD parses successfully", () => {
        const parsed = JSON.parse(jsonLdScripts[0].content);
        assert.ok(typeof parsed === "object");
      });

      test("Prerendered word page schema @type is DefinedTerm", () => {
        const parsed = JSON.parse(jsonLdScripts[0].content);
        assert.equal(parsed["@type"], "DefinedTerm");
      });

      test("Prerendered word page has canonical", () => {
        assert.ok(wordHtml.includes('rel="canonical"'));
      });

      test("Prerendered word page has hreflang", () => {
        assert.ok(wordHtml.includes("hreflang"));
      });

      test("Prerendered word page is indexable (no noindex)", () => {
        assert.ok(!wordHtml.includes("noindex"));
      });
    } else {
      console.log(
        "       (no prerendered word pages found — WORD_PRERENDER_LIMIT=0 or build not run)",
      );
    }
  }

  // Check vocab-level pages for FAQPage
  const vocabDirs = fs.existsSync(enDir)
    ? fs.readdirSync(enDir).filter((d) => /^learn-/.test(d))
    : [];

  if (vocabDirs.length > 0) {
    const vocabHtml = fs.readFileSync(
      path.join(distDir, "en", vocabDirs[0], "index.html"),
      "utf8",
    );
    const vocabScripts = parseScriptElements(vocabHtml);
    const vocabJsonLd = vocabScripts.filter((s) =>
      s.openTag.includes("application/ld+json"),
    );

    test(`Prerendered vocab page (${vocabDirs[0]}) has exactly 1 JSON-LD script`, () => {
      assert.equal(vocabJsonLd.length, 1);
    });

    test("Prerendered vocab page JSON-LD parses successfully", () => {
      JSON.parse(vocabJsonLd[0].content);
    });

    test("Prerendered vocab page schema @type is FAQPage", () => {
      const parsed = JSON.parse(vocabJsonLd[0].content);
      assert.equal(parsed["@type"], "FAQPage");
    });
  } else {
    console.log("       (no prerendered vocab pages in dist/ — may need full build)");
  }
} else {
  console.log(
    "\n[11] dist/ HTML verification — SKIPPED (run npm run build first to enable)",
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

fs.rmSync(tempDir, { recursive: true, force: true });

if (failed > 0) {
  process.exit(1);
}

console.log("JSON-LD escaping regression tests passed.\n");
