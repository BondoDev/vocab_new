// Deterministic guard for interactive-application route/shell contracts,
// documented in docs/non-seo-regression-checklist.md. Complements
// scripts/test-generated-data-ownership.mjs and
// scripts/test-import-boundaries.mjs (which guard data/import architecture)
// by guarding the interactive routing/profile-shell surface those scripts
// don't touch. Cheap, file/source-text-level checks only — deliberately
// does not attempt to require() .tsx modules (they import .scss and
// browser-only globals; see docs/non-seo-regression-checklist.md's
// "Automation candidates" section for why that approach was rejected) and
// does not replace the manual checklists in that document.
//
// Run: node scripts/test-interactive-contracts.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

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

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, ...relPath.split("/")), "utf8");
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT_DIR, ...relPath.split("/")));
}

// Extracts key: "value" pairs from a `const NAME = { ... } as const;` block.
function extractRouteObject(source, constName) {
  const blockMatch = source.match(
    new RegExp(`const ${constName} = \\{([\\s\\S]*?)\\} as const;`),
  );
  assert.ok(blockMatch, `could not find "const ${constName} = { ... } as const;" block`);
  const body = blockMatch[1];
  const entries = new Map();
  const entryPattern = /(\w+):\s*"([^"]*)"/g;
  let match;
  while ((match = entryPattern.exec(body)) !== null) {
    entries.set(match[1], match[2]);
  }
  return entries;
}

console.log("\n=== interactive route contracts ===\n");

const appTsxSource = readFile("src/app/App.tsx");
const headerTsxSource = readFile("src/app/components/Header.tsx");

const EXPECTED_ROUTES = {
  language: "/languages",
  levelCategory: "/languages/filters",
  exerciseSelection: "/languages/filters/exercises",
  practice: "/languages/filters/exercises/practice",
  explore: "/explore",
  exam: "/languages/level-test",
  about: "/about",
  help: "/help",
  profile: "/profile",
};

test("src/app/App.tsx ROUTES contains exactly the expected primary interactive routes", () => {
  const routes = extractRouteObject(appTsxSource, "ROUTES");
  const actual = Object.fromEntries(routes);
  assert.deepEqual(
    actual,
    EXPECTED_ROUTES,
    "ROUTES in src/app/App.tsx no longer matches the expected route map — update docs/non-seo-regression-checklist.md in the same change if this is intentional",
  );
});

test("src/app/App.tsx ROUTES has no duplicate path values", () => {
  const routes = extractRouteObject(appTsxSource, "ROUTES");
  const values = [...routes.values()];
  const duplicates = values.filter((v, i) => values.indexOf(v) !== i);
  assert.deepEqual(duplicates, [], `duplicate route path(s) found: ${duplicates.join(", ")}`);
});

test("src/app/components/Header.tsx NAV_HREFS stays consistent with src/app/App.tsx ROUTES for shared keys", () => {
  const routes = extractRouteObject(appTsxSource, "ROUTES");
  const navHrefs = extractRouteObject(headerTsxSource, "NAV_HREFS");
  const mismatches = [];
  for (const [key, href] of navHrefs) {
    if (routes.has(key) && routes.get(key) !== href) {
      mismatches.push(`${key}: ROUTES="${routes.get(key)}" NAV_HREFS="${href}"`);
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `route string drift between App.tsx ROUTES and Header.tsx NAV_HREFS: ${mismatches.join("; ")}`,
  );
});

test("/profile route is still wired to the resolvedPage switch in src/app/App.tsx", () => {
  assert.ok(
    appTsxSource.includes('resolvedPage === "profile"'),
    'src/app/App.tsx no longer has a resolvedPage === "profile" branch',
  );
});

console.log("\n=== profile shell wiring (unfinished by design — see docs/non-seo-regression-checklist.md) ===\n");

test("profile shell component files exist", () => {
  const missing = [
    "src/app/components/user-profile/UserProfileDashboardPage.tsx",
    "src/app/components/user-profile/UserProfileSidebar.tsx",
  ].filter((p) => !fileExists(p));
  assert.deepEqual(missing, [], `missing profile shell file(s): ${missing.join(", ")}`);
});

test("src/app/App.tsx still renders <UserProfileDashboardPage within the profile branch", () => {
  assert.ok(
    appTsxSource.includes("<UserProfileDashboardPage"),
    "src/app/App.tsx no longer renders <UserProfileDashboardPage — profile shell may have been silently removed",
  );
});

console.log("\n=== interactive feature module presence ===\n");

test("key practice/exercise/exam module files exist", () => {
  const expectedFiles = [
    "src/app/components/LevelCategorySelection.tsx",
    "src/app/components/ExerciseSelection.tsx",
    "src/app/components/VocabularyPractice.tsx",
    "src/app/components/VocabularyLevelExam.tsx",
    "src/app/components/exercises/WordTypingExercise.tsx",
    "src/app/components/exercises/HalfWrittenExercise.tsx",
    "src/app/components/exercises/BrokenWordExercise.tsx",
    "src/app/components/exercises/ConnectWordsExercise.tsx",
    "src/app/components/exercises/ListeningExercise.tsx",
    "src/app/components/exercises/MobileKeyboard.tsx",
    "src/app/components/exercises/DesktopSpecialCharacters.tsx",
    "src/lib/supabaseAuth.ts",
    "src/lib/userProfile.ts",
  ];
  const missing = expectedFiles.filter((p) => !fileExists(p));
  assert.deepEqual(missing, [], `missing expected interactive module(s): ${missing.join(", ")}`);
});

console.log("\n=== localStorage key contracts ===\n");

test("known interactive-feature localStorage keys still appear in their owning source files", () => {
  const expectations = [
    { file: "src/app/App.tsx", keys: [
      "app.yourLanguage", "app.practiceLanguage", "app.selectedLevel",
      "app.selectedCategories", "app.selectedLevels", "app.selectedWordTypes",
      "app.selectedExercises",
    ] },
    { file: "src/contexts/LanguageContext.tsx", keys: ["uiLanguage"] },
    { file: "src/lib/supabaseAuth.ts", keys: ["supabase.auth.session", "supabase.auth.pkce.verifier"] },
  ];
  const missing = [];
  for (const { file, keys } of expectations) {
    const text = readFile(file);
    for (const key of keys) {
      if (!text.includes(key)) {
        missing.push(`${key} (expected in ${file})`);
      }
    }
  }
  assert.deepEqual(missing, [], `missing expected localStorage key reference(s): ${missing.join(", ")}`);
});

console.log("\n=== regression-checklist documentation completeness ===\n");

test("docs/non-seo-regression-checklist.md exists and contains all required sections", () => {
  const docPath = "docs/non-seo-regression-checklist.md";
  assert.ok(fileExists(docPath), `${docPath} is missing`);
  const text = readFile(docPath);
  const requiredMentions = [
    "## 1. Feature-status inventory",
    "## 2. Test scope classification",
    "## 3. Profile-page ground truth",
    "## 4. Manual smoke checklist",
    "## 5. Full regression checklist",
    "## 6. Persistence and side-effect matrix",
    "## 7. Automation candidates",
    "## 8. Test-data policy",
    "## 9. Test cadence by change type",
    "## 10. Test-run report template",
  ];
  const missing = requiredMentions.filter((m) => !text.includes(m));
  assert.deepEqual(missing, [], `docs/non-seo-regression-checklist.md is missing section(s): ${missing.join(", ")}`);
});

test("docs/non-seo-regression-checklist.md documents the profile page as an unfinished shell", () => {
  const text = readFile("docs/non-seo-regression-checklist.md");
  assert.ok(
    text.includes("unfinished shell"),
    'docs/non-seo-regression-checklist.md must explicitly describe the profile page as an "unfinished shell"',
  );
  assert.ok(
    text.includes("do not mark missing profile content as a regression"),
    "docs/non-seo-regression-checklist.md must explicitly warn against treating missing profile content as a regression",
  );
});

test("docs/non-seo-regression-checklist.md uses distinct current vs. deferred ID prefixes for the profile page", () => {
  const text = readFile("docs/non-seo-regression-checklist.md");
  assert.ok(text.includes("PROFILE-SHELL-"), "missing PROFILE-SHELL- current-behavior IDs");
  assert.ok(text.includes("PROFILE-DEFERRED-"), "missing PROFILE-DEFERRED- deferred-behavior IDs");
});

test("docs/non-seo-regression-checklist.md marks daily-target and practice-persistence as deferred, not assumed", () => {
  const text = readFile("docs/non-seo-regression-checklist.md");
  assert.ok(text.includes("TARGET-DEFERRED-"), "missing TARGET-DEFERRED- IDs for the non-existent daily-target feature");
  assert.ok(text.includes("PROGRESS-DEFERRED-"), "missing PROGRESS-DEFERRED- IDs for unimplemented practice/exam persistence");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("interactive-contracts guards passed");
}
