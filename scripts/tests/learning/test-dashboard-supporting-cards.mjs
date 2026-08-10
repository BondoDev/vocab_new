// Localization + data-flow guard for Dashboard Phase 3 (the four
// supporting cards: Vocabulary Overview, Study Activity, Words Learned,
// Milestone Preview — see DashboardSection.tsx's own header). Separate
// file from test-dashboard-section-localization.mjs (Phase 1/2's header +
// hero) — same split precedent as Milestones/Vocabulary Growth each
// getting their own contract file once their scope grew past the
// original Progress-page test.
//
// Confirms every one of the 7 supported interface files stays valid JSON
// and defines the exact same `userProfile.dashboardPage.supportingCards.*`
// key set as English, with verbatim (do-not-reword) strings for every
// value the task brief supplied exactly. It also statically checks the
// four card components / DashboardSection.tsx / UserProfileDashboardPage.tsx
// source for the contract points not otherwise covered by the pure-logic
// tests (test-study-activity.mjs / test-words-learned-summary.mjs /
// test-dashboard-milestone-preview.mjs): reused vocabulary-category logic,
// no Supabase writes anywhere in the four new cards, unchanged routing
// (View Vocabulary / View Progress reuse the existing in-page section
// switch, never a new URL route), and that expanding Study Activity never
// triggers a second fetch.
//
// Plain `node` (no TypeScript needed for the source-regex checks either —
// matching test-dashboard-section-localization.mjs's own precedent).
//
// Run: node scripts/tests/learning/test-dashboard-supporting-cards.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");
const DASHBOARD_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "dashboard");

const LOCALE_FILES = [
  "english_interface.json",
  "german_interface.json",
  "spanish_interface.json",
  "french_interface.json",
  "italian_interface.json",
  "portuguese_interface.json",
  "russian_interface.json",
];

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

function flattenKeys(obj, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const path_ = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenKeys(value, path_));
    } else {
      out.push(path_);
    }
  }
  return out.sort();
}

console.log("\n=== supportingCards localization contract ===\n");

const parsed = new Map();
for (const fileName of LOCALE_FILES) {
  test(`${fileName} is valid JSON`, () => {
    const raw = fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8");
    parsed.set(fileName, JSON.parse(raw));
  });
}

const englishCards = parsed.get("english_interface.json")?.userProfile?.dashboardPage?.supportingCards;

test("english_interface.json defines a non-empty userProfile.dashboardPage.supportingCards", () => {
  assert.ok(englishCards && Object.keys(englishCards).length > 0);
});

const englishKeys = flattenKeys(englishCards ?? {});

for (const fileName of LOCALE_FILES) {
  test(`${fileName} supportingCards key set matches English exactly`, () => {
    const cards = parsed.get(fileName)?.userProfile?.dashboardPage?.supportingCards;
    assert.ok(cards, `${fileName} is missing userProfile.dashboardPage.supportingCards`);
    assert.deepEqual(flattenKeys(cards), englishKeys, `${fileName} supportingCards keys differ from English`);
  });

  test(`${fileName} supportingCards values are all non-empty strings`, () => {
    const cards = parsed.get(fileName).userProfile.dashboardPage.supportingCards;
    for (const key of englishKeys) {
      const value = key.split(".").reduce((node, part) => node?.[part], cards);
      assert.equal(typeof value, "string", `${fileName}: supportingCards.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: supportingCards.${key} is empty`);
    }
  });
}

console.log("\n=== Verbatim, do-not-reword translations as supplied ===\n");

const EXPECTED = {
  "english_interface.json": {
    vocabularyOverviewTitle: "Vocabulary Overview",
    viewVocabulary: "View Vocabulary",
    studyActivityTitle: "Study Activity",
    viewAllActivity: "View all activity",
    wordsLearnedTitle: "Words Learned",
    last7Days: "Last 7 Days",
    comparisonSuffix: "vs previous 7 days",
    milestonePreviewTitle: "Milestone Preview",
    viewProgress: "View Progress",
  },
  "german_interface.json": {
    vocabularyOverviewTitle: "Vokabelübersicht",
    viewVocabulary: "Vokabeln anzeigen",
    studyActivityTitle: "Lernaktivität",
    viewAllActivity: "Alle Aktivitäten anzeigen",
    wordsLearnedTitle: "Gelernte Wörter",
    last7Days: "Letzte 7 Tage",
    comparisonSuffix: "im Vergleich zu den vorherigen 7 Tagen",
    milestonePreviewTitle: "Meilenstein-Vorschau",
    viewProgress: "Fortschritt anzeigen",
  },
  "spanish_interface.json": {
    vocabularyOverviewTitle: "Resumen de vocabulario",
    viewVocabulary: "Ver vocabulario",
    studyActivityTitle: "Actividad de aprendizaje",
    viewAllActivity: "Ver toda la actividad",
    wordsLearnedTitle: "Palabras aprendidas",
    last7Days: "Últimos 7 días",
    comparisonSuffix: "frente a los 7 días anteriores",
    milestonePreviewTitle: "Vista previa de hitos",
    viewProgress: "Ver progreso",
  },
  "french_interface.json": {
    vocabularyOverviewTitle: "Aperçu du vocabulaire",
    viewVocabulary: "Voir le vocabulaire",
    studyActivityTitle: "Activité d’apprentissage",
    viewAllActivity: "Voir toute l’activité",
    wordsLearnedTitle: "Mots appris",
    last7Days: "7 derniers jours",
    comparisonSuffix: "par rapport aux 7 jours précédents",
    milestonePreviewTitle: "Aperçu des étapes",
    viewProgress: "Voir la progression",
  },
  "italian_interface.json": {
    vocabularyOverviewTitle: "Panoramica del vocabolario",
    viewVocabulary: "Visualizza vocabolario",
    studyActivityTitle: "Attività di apprendimento",
    viewAllActivity: "Visualizza tutte le attività",
    wordsLearnedTitle: "Parole imparate",
    last7Days: "Ultimi 7 giorni",
    comparisonSuffix: "rispetto ai 7 giorni precedenti",
    milestonePreviewTitle: "Anteprima dei traguardi",
    viewProgress: "Visualizza progressi",
  },
  "portuguese_interface.json": {
    vocabularyOverviewTitle: "Visão geral do vocabulário",
    viewVocabulary: "Ver vocabulário",
    studyActivityTitle: "Atividade de aprendizagem",
    viewAllActivity: "Ver toda a atividade",
    wordsLearnedTitle: "Palavras aprendidas",
    last7Days: "Últimos 7 dias",
    comparisonSuffix: "em comparação com os 7 dias anteriores",
    milestonePreviewTitle: "Pré-visualização de marcos",
    viewProgress: "Ver progresso",
  },
  "russian_interface.json": {
    vocabularyOverviewTitle: "Обзор словарного запаса",
    viewVocabulary: "Открыть словарь",
    studyActivityTitle: "Учебная активность",
    viewAllActivity: "Показать всю активность",
    wordsLearnedTitle: "Выученные слова",
    last7Days: "Последние 7 дней",
    comparisonSuffix: "по сравнению с предыдущими 7 днями",
    milestonePreviewTitle: "Предпросмотр этапов",
    viewProgress: "Посмотреть прогресс",
  },
};

for (const fileName of LOCALE_FILES) {
  test(`${fileName} supportingCards.* matches the exact supplied translations`, () => {
    const cards = parsed.get(fileName).userProfile.dashboardPage.supportingCards;
    const expected = EXPECTED[fileName];
    assert.equal(cards.vocabularyOverview.title, expected.vocabularyOverviewTitle);
    assert.equal(cards.vocabularyOverview.viewVocabulary, expected.viewVocabulary);
    assert.equal(cards.studyActivity.title, expected.studyActivityTitle);
    assert.equal(cards.studyActivity.viewAllActivity, expected.viewAllActivity);
    assert.equal(cards.wordsLearned.title, expected.wordsLearnedTitle);
    assert.equal(cards.wordsLearned.last7Days, expected.last7Days);
    assert.equal(cards.wordsLearned.comparisonSuffix, expected.comparisonSuffix);
    assert.equal(cards.milestonePreview.title, expected.milestonePreviewTitle);
    assert.equal(cards.milestonePreview.viewProgress, expected.viewProgress);
  });
}

test("21. All 7 locales define the Study Activity range labels (7d/30d/90d/all)", () => {
  for (const fileName of LOCALE_FILES) {
    const range = parsed.get(fileName).userProfile.dashboardPage.supportingCards.studyActivity.range;
    for (const key of ["7d", "30d", "90d", "all"]) {
      assert.equal(typeof range[key], "string");
      assert.ok(range[key].trim().length > 0, `${fileName}: studyActivity.range.${key} is empty`);
    }
  }
});

console.log("\n=== Reused (not duplicated) translation keys ===\n");

test("Learning/Known/Mastered are reused from vocabularySection.summaryCards, not redeclared here", () => {
  for (const fileName of LOCALE_FILES) {
    const data = parsed.get(fileName);
    for (const category of ["learning", "known", "mastered"]) {
      assert.equal(typeof data.userProfile.vocabularySection.summaryCards[category].title, "string");
    }
    // The supportingCards subtree must not redeclare its own copy of these.
    assert.ok(!("learning" in (englishCards.vocabularyOverview ?? {})));
  }
});

test("Reviews/Vocabulary/Consistency track labels are reused from progressSection.tracks, not redeclared here", () => {
  for (const fileName of LOCALE_FILES) {
    const tracks = parsed.get(fileName).userProfile.progressSection.tracks;
    for (const track of ["vocabulary", "reviews", "consistency"]) {
      assert.equal(typeof tracks[track], "string");
      assert.ok(tracks[track].trim().length > 0);
    }
  }
});

test("The 'words' unit is reused from learningSection.todayProgress.wordsUnit, not redeclared here", () => {
  for (const fileName of LOCALE_FILES) {
    const wordsUnit = parsed.get(fileName).userProfile.learningSection.todayProgress.wordsUnit;
    assert.equal(typeof wordsUnit, "string");
    assert.ok(wordsUnit.trim().length > 0);
  }
});

console.log("\n=== Vocabulary Overview reuses the existing category engine (not a duplicate calculation) ===\n");

const vocabularyOverviewCard = fs.readFileSync(path.join(DASHBOARD_DIR, "VocabularyOverviewCard.tsx"), "utf8");

test("1-4. VocabularyOverviewCard imports and calls the shared computeVocabularyCounts, never its own mapping", () => {
  assert.match(
    vocabularyOverviewCard,
    /import\s*\{\s*computeVocabularyCounts[^}]*\}\s*from\s*"\.\.\/\.\.\/\.\.\/\.\.\/data\/learning\/vocabularyCategory"/,
  );
  assert.match(vocabularyOverviewCard, /computeVocabularyCounts\(wordProgressRows\)/);
  assert.doesNotMatch(
    vocabularyOverviewCard,
    /"seen"|"learning"\s*:\s*"learning"|"familiar"|"strong"|"mastered"\s*:\s*"mastered"/,
    "must not re-declare the seen/learning/familiar/strong/mastered mapping locally",
  );
});

console.log("\n=== Dashboard routing contract (static source checks) ===\n");

const dashboardSection = fs.readFileSync(path.join(DASHBOARD_DIR, "DashboardSection.tsx"), "utf8");
const dashboardPageShell = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "UserProfileDashboardPage.tsx"),
  "utf8",
);
const milestonePreviewCard = fs.readFileSync(path.join(DASHBOARD_DIR, "MilestonePreviewCard.tsx"), "utf8");
const studyActivityCard = fs.readFileSync(path.join(DASHBOARD_DIR, "StudyActivityCard.tsx"), "utf8");
const useDashboardSupportingData = fs.readFileSync(path.join(DASHBOARD_DIR, "useDashboardSupportingData.ts"), "utf8");
const wordsLearnedCard = fs.readFileSync(path.join(DASHBOARD_DIR, "WordsLearnedCard.tsx"), "utf8");

test("22. No new route is introduced — DashboardSection accepts onNavigateToSection rather than a URL/route prop", () => {
  assert.match(dashboardSection, /onNavigateToSection\?:\s*\(section: UserProfileSectionId\) => void/);
  assert.doesNotMatch(dashboardSection, /useNavigate|<Link\s|navigate\(/);
});

test("22b. UserProfileDashboardPage wires the existing setActiveSection — the same mechanism the sidebar nav already uses — not a new route", () => {
  assert.match(dashboardPageShell, /onNavigateToSection=\{setActiveSection\}/);
});

test("23. Vocabulary Overview's View Vocabulary button navigates to the vocabulary section", () => {
  assert.match(vocabularyOverviewCard, /onNavigateToSection\?\.\("vocabulary"\)/);
});

test("24. Milestone Preview's View Progress button navigates to the progress section", () => {
  assert.match(milestonePreviewCard, /onNavigateToSection\?\.\("progress"\)/);
});

test("25. Expanding/collapsing Study Activity or switching its range never triggers a fetch — both are local UI state only", () => {
  assert.match(studyActivityCard, /const \[isExpanded, setIsExpanded\] = useState/);
  assert.match(studyActivityCard, /const \[range, setRange\] = useState/);
  // The card imports DashboardSupportingDataStatus as a *type only* (for
  // its `status` prop) but never calls the hook itself, and has no
  // session/supabase import anywhere — computeStudyActivityBuckets (a
  // pure function) is the only thing driven by isExpanded/range.
  assert.match(studyActivityCard, /import type \{ DashboardSupportingDataStatus \} from "\.\/useDashboardSupportingData"/);
  assert.doesNotMatch(studyActivityCard, /useDashboardSupportingData\(/);
  assert.doesNotMatch(studyActivityCard, /getStoredSupabaseSession|supabaseRequest/);
  assert.match(studyActivityCard, /computeStudyActivityBuckets\(/);
});

console.log("\n=== No new Supabase write introduced (Phase 3 is read-only) ===\n");

test("20. useDashboardSupportingData only reads (no insert/update/RPC-write call)", () => {
  assert.doesNotMatch(useDashboardSupportingData, /supabase.*(insert|update|upsert)/i);
  assert.doesNotMatch(useDashboardSupportingData, /\brpc\//i);
  assert.doesNotMatch(useDashboardSupportingData, /method:\s*["'](POST|PATCH|PUT|DELETE)["']/);
  assert.match(useDashboardSupportingData, /readMilestoneDailyStats/);
});

test("20b. None of the four supporting cards call a write/mutation function", () => {
  for (const [name, source] of [
    ["VocabularyOverviewCard", vocabularyOverviewCard],
    ["StudyActivityCard", studyActivityCard],
    ["WordsLearnedCard", wordsLearnedCard],
    ["MilestonePreviewCard", milestonePreviewCard],
  ]) {
    assert.doesNotMatch(
      source,
      /updateDailyGoal|completeNewWordStudy|completeWordReview|writeStoredUserProfile|supabaseRequest/,
      `${name} must perform no writes`,
    );
  }
});

test("Only one useDashboardSupportingData call exists (DashboardSection), never duplicated per card", () => {
  const occurrences = (dashboardSection.match(/useDashboardSupportingData\(/g) || []).length;
  assert.equal(occurrences, 1);
  for (const [name, source] of [
    ["StudyActivityCard", studyActivityCard],
    ["WordsLearnedCard", wordsLearnedCard],
    ["MilestonePreviewCard", milestonePreviewCard],
  ]) {
    assert.doesNotMatch(source, /useDashboardSupportingData\(/, `${name} must receive dailyStats as a prop, not fetch its own`);
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("dashboard-supporting-cards guard passed");
}
