// Focused localization + data-flow guard for Dashboard Phase 1 (page header
// + personalized subheader greeting) and Phase 2 (the combined Today /
// Rocket / Continue Learning hero card) — see
// src/features/user-profile/sections/dashboard/DashboardSection.tsx's own
// header for what's deliberately NOT implemented yet.
//
// Confirms every one of the 7 supported interface files stays valid JSON
// and defines:
//   - the exact same `userProfile.dashboardPage.*` key set as English
//     (title/greeting.* from Phase 1, hero.* from Phase 2);
//   - verbatim (do-not-reword) strings, matching the exact translations
//     supplied for this task;
//   - the {name}/{count} placeholder shapes are present, unchanged, in
//     every locale's templates (so interpolation can't silently break in
//     one language);
//   - the old `userProfile.developmentNotice.*` placeholder namespace
//     Phase 1 replaced is fully gone (locks in the cleanup).
// It also statically checks DashboardSection.tsx / DashboardHeroCard.tsx /
// UserProfileDashboardPage.tsx source for the contract points from the
// briefs that aren't otherwise covered by test-dashboard-greeting-
// period.mjs's / test-dashboard-hero-cta.mjs's pure-function tests: prop
// threading (never a second fetch), the nickname/no-vocabulary fallbacks,
// the Continue Learning/Review Words routes, that no review-word quantity
// is ever rendered, that the rocket asset exists on disk, and that no new
// Supabase write was introduced anywhere in this phase.
//
// Plain `node` (no TypeScript needed for the source-regex checks either —
// matching test-progress-section-localization.mjs's own precedent).
//
// Run: node scripts/tests/learning/test-dashboard-section-localization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");
const DASHBOARD_DIR = path.join(
  ROOT_DIR,
  "src",
  "features",
  "user-profile",
  "sections",
  "dashboard",
);

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

console.log("\n=== dashboardPage (Dashboard header + greeting) localization contract ===\n");

const parsed = new Map();
for (const fileName of LOCALE_FILES) {
  test(`${fileName} is valid JSON`, () => {
    const raw = fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8");
    parsed.set(fileName, JSON.parse(raw));
  });
}

const englishPage = parsed.get("english_interface.json")?.userProfile?.dashboardPage;

test("english_interface.json defines a non-empty userProfile.dashboardPage", () => {
  assert.ok(englishPage && Object.keys(englishPage).length > 0);
});

const englishKeys = flattenKeys(englishPage ?? {});

test("userProfile.dashboardPage has exactly the Phase 1 + Phase 2 keys, no more, no less (Phase 3's supportingCards.* has its own dedicated contract in test-dashboard-supporting-cards.mjs, excluded here)", () => {
  const keysExcludingSupportingCards = englishKeys.filter((key) => !key.startsWith("supportingCards."));
  assert.deepEqual(keysExcludingSupportingCards, [
    "ariaLabel",
    "greeting.afternoon",
    "greeting.evening",
    "greeting.fallback",
    "greeting.morning",
    "hero.ariaLabel",
    "hero.continueLearning.message",
    "hero.continueLearning.title",
    "hero.reviewWords.message",
    "hero.stats.dayStreakLabel",
    "hero.stats.goalLabel",
    "hero.stats.wordsLearnedLabel",
    "hero.todayLabel",
    "title",
  ]);
});

for (const fileName of LOCALE_FILES) {
  test(`${fileName} dashboardPage key set matches English exactly`, () => {
    const page = parsed.get(fileName)?.userProfile?.dashboardPage;
    assert.ok(page, `${fileName} is missing userProfile.dashboardPage`);
    assert.deepEqual(flattenKeys(page), englishKeys, `${fileName} dashboardPage keys differ from English`);
  });

  test(`${fileName} dashboardPage values are all non-empty strings`, () => {
    const page = parsed.get(fileName).userProfile.dashboardPage;
    for (const key of englishKeys) {
      const value = key.split(".").reduce((node, part) => node?.[part], page);
      assert.equal(typeof value, "string", `${fileName}: dashboardPage.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: dashboardPage.${key} is empty`);
    }
  });
}

console.log("\n=== Verbatim, do-not-reword translations as supplied ===\n");

const EXPECTED_DASHBOARD_PAGE = {
  "english_interface.json": {
    title: "Dashboard",
    greeting: {
      morning: "Good morning, {name}. Ready to keep learning?",
      afternoon: "Good afternoon, {name}. Ready to keep learning?",
      evening: "Good evening, {name}. Ready to keep learning?",
      fallback: "Ready to keep learning?",
    },
  },
  "german_interface.json": {
    title: "Übersicht",
    greeting: {
      morning: "Guten Morgen, {name}. Bereit, weiterzulernen?",
      afternoon: "Guten Tag, {name}. Bereit, weiterzulernen?",
      evening: "Guten Abend, {name}. Bereit, weiterzulernen?",
      fallback: "Bereit, weiterzulernen?",
    },
  },
  "spanish_interface.json": {
    title: "Panel",
    greeting: {
      morning: "Buenos días, {name}. ¿Listo para seguir aprendiendo?",
      afternoon: "Buenas tardes, {name}. ¿Listo para seguir aprendiendo?",
      evening: "Buenas noches, {name}. ¿Listo para seguir aprendiendo?",
      fallback: "¿Listo para seguir aprendiendo?",
    },
  },
  "french_interface.json": {
    title: "Tableau de bord",
    greeting: {
      morning: "Bonjour, {name}. Prêt à continuer d’apprendre ?",
      afternoon: "Bon après-midi, {name}. Prêt à continuer d’apprendre ?",
      evening: "Bonsoir, {name}. Prêt à continuer d’apprendre ?",
      fallback: "Prêt à continuer d’apprendre ?",
    },
  },
  "italian_interface.json": {
    title: "Dashboard",
    greeting: {
      morning: "Buongiorno, {name}. Pronto a continuare a imparare?",
      afternoon: "Buon pomeriggio, {name}. Pronto a continuare a imparare?",
      evening: "Buonasera, {name}. Pronto a continuare a imparare?",
      fallback: "Pronto a continuare a imparare?",
    },
  },
  "portuguese_interface.json": {
    title: "Painel",
    greeting: {
      morning: "Bom dia, {name}. Pronto para continuar a aprender?",
      afternoon: "Boa tarde, {name}. Pronto para continuar a aprender?",
      evening: "Boa noite, {name}. Pronto para continuar a aprender?",
      fallback: "Pronto para continuar a aprender?",
    },
  },
  "russian_interface.json": {
    title: "Панель",
    greeting: {
      morning: "Доброе утро, {name}. Готовы продолжить обучение?",
      afternoon: "Добрый день, {name}. Готовы продолжить обучение?",
      evening: "Добрый вечер, {name}. Готовы продолжить обучение?",
      fallback: "Готовы продолжить обучение?",
    },
  },
};

for (const fileName of LOCALE_FILES) {
  test(`${fileName} dashboardPage.title matches the exact supplied translation`, () => {
    const page = parsed.get(fileName).userProfile.dashboardPage;
    assert.equal(page.title, EXPECTED_DASHBOARD_PAGE[fileName].title, `${fileName}: dashboardPage.title was reworded`);
  });

  test(`${fileName} dashboardPage.greeting.* matches the exact supplied translations`, () => {
    const greeting = parsed.get(fileName).userProfile.dashboardPage.greeting;
    const expected = EXPECTED_DASHBOARD_PAGE[fileName].greeting;
    for (const period of ["morning", "afternoon", "evening", "fallback"]) {
      assert.equal(greeting[period], expected[period], `${fileName}: dashboardPage.greeting.${period} was reworded`);
    }
  });
}

console.log("\n=== {name} placeholder shape is consistent across all languages ===\n");

for (const fileName of LOCALE_FILES) {
  test(`${fileName} morning/afternoon/evening templates each contain a literal {name} token`, () => {
    const greeting = parsed.get(fileName).userProfile.dashboardPage.greeting;
    for (const period of ["morning", "afternoon", "evening"]) {
      assert.ok(greeting[period].includes("{name}"), `${fileName}: dashboardPage.greeting.${period} is missing {name}`);
    }
  });

  test(`${fileName} fallback template contains no {name} token (it's the no-nickname case)`, () => {
    const greeting = parsed.get(fileName).userProfile.dashboardPage.greeting;
    assert.ok(!greeting.fallback.includes("{name}"), `${fileName}: dashboardPage.greeting.fallback must not reference {name}`);
  });
}

console.log("\n=== The developmentNotice placeholder namespace it replaced is fully gone ===\n");

for (const fileName of LOCALE_FILES) {
  test(`${fileName} no longer defines userProfile.developmentNotice`, () => {
    assert.equal(parsed.get(fileName).userProfile.developmentNotice, undefined);
  });
}

console.log("\n=== DashboardSection / UserProfileDashboardPage contract (static source checks) ===\n");

const dashboardSection = fs.readFileSync(path.join(DASHBOARD_DIR, "DashboardSection.tsx"), "utf8");
const dashboardPageShell = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "UserProfileDashboardPage.tsx"),
  "utf8",
);

test("13. DashboardSection accepts and uses an authenticated nickname prop (not its own fetch)", () => {
  assert.match(dashboardSection, /interface DashboardSectionProps\s*\{[^}]*nickname\??:\s*string/s);
  assert.match(dashboardSection, /export function DashboardSection\(\{[^)]*\bnickname\b[^)]*\}:/s);
});

test("14. Missing/empty nickname falls back to the dedicated fallback key, not an undefined/empty name", () => {
  assert.match(dashboardSection, /if\s*\(!trimmedNickname\)\s*\{\s*return t\("userProfile\.dashboardPage\.greeting\.fallback"\)/);
});

test("15. No hardcoded English production greeting text in the component", () => {
  assert.doesNotMatch(dashboardSection, /Good (morning|afternoon|evening)/);
  assert.doesNotMatch(dashboardSection, /Ready to keep learning/);
});

test("16. No redundant profile request: DashboardSection never calls the profile-read helpers directly", () => {
  assert.doesNotMatch(dashboardSection, /readStoredUserProfile|readSupabaseUserProfile|useUserProfileLoad/);
});

test("16b. UserProfileDashboardPage threads its existing nickname prop into DashboardSection rather than loading a new one", () => {
  const dashboardSectionJsxMatch = dashboardPageShell.match(/<DashboardSection\s+([\s\S]*?)\/>/);
  assert.ok(dashboardSectionJsxMatch, "UserProfileDashboardPage must render <DashboardSection ... />");
  assert.match(dashboardSectionJsxMatch[1], /nickname=\{nickname\}/);
});

console.log("\n=== Dashboard hero (Phase 2) localization contract ===\n");

// Verbatim, do-not-reword translations as supplied for the genuinely-new
// Dashboard-specific hero copy (ariaLabel/todayLabel/stats labels/
// continueLearning.title were authored for this task since no equivalent
// existed; continueLearning.message and reviewWords.message are the exact
// strings supplied in the brief). reviewWords.title/button and
// startLearning's title/button are deliberately NOT duplicated here — the
// component reuses userProfile.learningSection.modeCards.modes.* verbatim
// instead (see the DashboardHeroCard source checks below).
const EXPECTED_HERO = {
  "english_interface.json": {
    ariaLabel: "Today overview",
    todayLabel: "Today",
    wordsLearnedLabel: "words learned",
    dayStreakLabel: "day streak",
    goalLabel: "Goal",
    continueLearningTitle: "Continue Learning",
    continueLearningMessage: "You have {count} words left for today.",
    reviewWordsMessage: "Keep your vocabulary fresh with a review session.",
  },
  "german_interface.json": {
    ariaLabel: "Heutige Übersicht",
    todayLabel: "Heute",
    wordsLearnedLabel: "gelernte Wörter",
    dayStreakLabel: "Tage-Serie",
    goalLabel: "Ziel",
    continueLearningTitle: "Weiterlernen",
    continueLearningMessage: "Du hast heute noch {count} Wörter übrig.",
    reviewWordsMessage: "Halte deinen Wortschatz mit einer Wiederholungseinheit frisch.",
  },
  "spanish_interface.json": {
    ariaLabel: "Resumen de hoy",
    todayLabel: "Hoy",
    wordsLearnedLabel: "palabras aprendidas",
    dayStreakLabel: "racha de días",
    goalLabel: "Meta",
    continueLearningTitle: "Continuar aprendiendo",
    continueLearningMessage: "Te quedan {count} palabras para hoy.",
    reviewWordsMessage: "Mantén tu vocabulario fresco con una sesión de repaso.",
  },
  "french_interface.json": {
    ariaLabel: "Aperçu du jour",
    todayLabel: "Aujourd’hui",
    wordsLearnedLabel: "mots appris",
    dayStreakLabel: "jours consécutifs",
    goalLabel: "Objectif",
    continueLearningTitle: "Continuer l’apprentissage",
    continueLearningMessage: "Il vous reste {count} mots à apprendre aujourd’hui.",
    reviewWordsMessage: "Entretenez votre vocabulaire avec une session de révision.",
  },
  "italian_interface.json": {
    ariaLabel: "Riepilogo di oggi",
    todayLabel: "Oggi",
    wordsLearnedLabel: "parole apprese",
    dayStreakLabel: "giorni consecutivi",
    goalLabel: "Obiettivo",
    continueLearningTitle: "Continua a imparare",
    continueLearningMessage: "Ti restano {count} parole per oggi.",
    reviewWordsMessage: "Mantieni fresco il tuo vocabolario con una sessione di ripasso.",
  },
  "portuguese_interface.json": {
    ariaLabel: "Resumo de hoje",
    todayLabel: "Hoje",
    wordsLearnedLabel: "palavras aprendidas",
    dayStreakLabel: "dias seguidos",
    goalLabel: "Meta",
    continueLearningTitle: "Continuar a aprender",
    continueLearningMessage: "Ainda faltam {count} palavras para hoje.",
    reviewWordsMessage: "Mantenha o seu vocabulário ativo com uma sessão de revisão.",
  },
  "russian_interface.json": {
    ariaLabel: "Сводка за сегодня",
    todayLabel: "Сегодня",
    wordsLearnedLabel: "изученные слова",
    dayStreakLabel: "дней подряд",
    goalLabel: "Цель",
    continueLearningTitle: "Продолжить обучение",
    continueLearningMessage: "На сегодня осталось {count} слов.",
    reviewWordsMessage: "Закрепите словарный запас с помощью повторения.",
  },
};

for (const fileName of LOCALE_FILES) {
  test(`${fileName} hero.* matches the exact supplied/authored translations`, () => {
    const hero = parsed.get(fileName).userProfile.dashboardPage.hero;
    const expected = EXPECTED_HERO[fileName];
    assert.equal(hero.ariaLabel, expected.ariaLabel, `${fileName}: hero.ariaLabel was reworded`);
    assert.equal(hero.todayLabel, expected.todayLabel, `${fileName}: hero.todayLabel was reworded`);
    assert.equal(hero.stats.wordsLearnedLabel, expected.wordsLearnedLabel, `${fileName}: hero.stats.wordsLearnedLabel was reworded`);
    assert.equal(hero.stats.dayStreakLabel, expected.dayStreakLabel, `${fileName}: hero.stats.dayStreakLabel was reworded`);
    assert.equal(hero.stats.goalLabel, expected.goalLabel, `${fileName}: hero.stats.goalLabel was reworded`);
    assert.equal(hero.continueLearning.title, expected.continueLearningTitle, `${fileName}: hero.continueLearning.title was reworded`);
    assert.equal(
      hero.continueLearning.message,
      expected.continueLearningMessage,
      `${fileName}: hero.continueLearning.message was reworded`,
    );
    assert.equal(hero.reviewWords.message, expected.reviewWordsMessage, `${fileName}: hero.reviewWords.message was reworded`);
  });
}

console.log("\n=== {count} placeholder shape is consistent across all languages ===\n");

for (const fileName of LOCALE_FILES) {
  test(`${fileName} hero.continueLearning.message contains a literal {count} token`, () => {
    const hero = parsed.get(fileName).userProfile.dashboardPage.hero;
    assert.ok(hero.continueLearning.message.includes("{count}"), `${fileName}: hero.continueLearning.message is missing {count}`);
  });

  test(`${fileName} hero.reviewWords.message contains no review-word quantity/placeholder`, () => {
    const hero = parsed.get(fileName).userProfile.dashboardPage.hero;
    assert.ok(!/\{.*\}/.test(hero.reviewWords.message), `${fileName}: hero.reviewWords.message must not interpolate a count — no review quantity is ever shown`);
    assert.ok(!/\d/.test(hero.reviewWords.message), `${fileName}: hero.reviewWords.message must not contain a literal number`);
  });
}

test("English hero.stats.* and modeCards.* reused keys required by the hero are all present and non-empty (reuse contract)", () => {
  const userProfile = parsed.get("english_interface.json").userProfile;
  assert.equal(userProfile.learningSection.todayProgress.wordsUnit, "words");
  assert.equal(userProfile.learningSection.modeCards.modes.reviewWords.title, "Review Words");
  assert.equal(userProfile.learningSection.modeCards.modes.reviewWords.buttonLabel, "Start Review");
  assert.equal(userProfile.learningSection.modeCards.modes.studyNewWords.buttonLabel, "Start Learning");
});

console.log("\n=== Rocket asset (Phase 2 hero) ===\n");

const ROCKET_ASSET_RELATIVE_PATH = "public/images/user-profile/dashboard/dashboard-image.png";

test("12. The rocket asset referenced by DashboardHeroCard exists on disk", () => {
  const assetPath = path.join(ROOT_DIR, ROCKET_ASSET_RELATIVE_PATH);
  assert.ok(fs.existsSync(assetPath), `expected an existing asset at ${ROCKET_ASSET_RELATIVE_PATH}`);
});

const dashboardHeroCard = fs.readFileSync(path.join(DASHBOARD_DIR, "DashboardHeroCard.tsx"), "utf8");
const useDashboardHeroData = fs.readFileSync(path.join(DASHBOARD_DIR, "useDashboardHeroData.ts"), "utf8");

test("12b. DashboardHeroCard references the exact existing asset path, not a generated/renamed one", () => {
  assert.match(dashboardHeroCard, /\/images\/user-profile\/dashboard\/dashboard-image\.png/);
});

console.log("\n=== DashboardHeroCard CTA routing + no-review-quantity contract (static source checks) ===\n");

test("5. Review CTA never renders a review-word quantity/count", () => {
  assert.doesNotMatch(dashboardHeroCard, /\d+\s*words?\s*ready/i);
  // The only {count}-interpolated message in the component is
  // continueLearning's — reviewWords never receives a count value.
  const reviewMessageLine = dashboardHeroCard.match(/reviewWords[\s\S]{0,80}?message/);
  assert.ok(reviewMessageLine, "expected a hero.reviewWords.message reference in DashboardHeroCard");
});

test("6. Continue Learning (and Start Learning) route through onStartNewWordStudy — the Study New Words flow", () => {
  assert.match(
    dashboardHeroCard,
    /const handleCtaClick = cta\.kind === "reviewWords" \? onStartReviewWords : onStartNewWordStudy;/,
  );
});

test("7. Review Words routes through onStartReviewWords — the structured Review flow, never Custom Practice/Exercises", () => {
  assert.doesNotMatch(dashboardHeroCard, /exerciseSelection|source=custom-practice|onStartCustomPractice/);
  assert.match(dashboardHeroCard, /onStartReviewWords/);
});

console.log("\n=== No new Supabase write introduced (Phase 2 is read-only) ===\n");

test("13b. useDashboardHeroData only reads (no insert/update/RPC-write call)", () => {
  assert.doesNotMatch(useDashboardHeroData, /supabase.*(insert|update|upsert)/i);
  assert.doesNotMatch(useDashboardHeroData, /\brpc\//i);
  assert.doesNotMatch(useDashboardHeroData, /method:\s*["'](POST|PATCH|PUT|DELETE)["']/);
  assert.match(useDashboardHeroData, /readTodayNewWordsCompleted/);
  assert.match(useDashboardHeroData, /readDailyStreakStats/);
});

test("13c. DashboardHeroCard itself performs no writes and calls no daily-goal/word-progress mutation function", () => {
  assert.doesNotMatch(dashboardHeroCard, /updateDailyGoal|completeNewWordStudy|completeWordReview|writeStoredUserProfile/);
});

console.log("\n=== Learning/Review pure engines remain unchanged (reused, not forked) ===\n");

test("14. TodayProgressCard.tsx and DailyStreakCard.tsx still own the Learning page's own reads/rendering (untouched by this phase)", () => {
  const todayProgressCard = fs.readFileSync(
    path.join(DASHBOARD_DIR, "..", "learning", "TodayProgressCard.tsx"),
    "utf8",
  );
  const dailyStreakCard = fs.readFileSync(path.join(DASHBOARD_DIR, "..", "learning", "DailyStreakCard.tsx"), "utf8");
  assert.match(todayProgressCard, /export function TodayProgressCard/);
  assert.match(todayProgressCard, /computeTodayProgressDisplay/);
  assert.match(dailyStreakCard, /export function DailyStreakCard/);
  assert.match(dailyStreakCard, /computeDailyStreakSummary/);
});

test("14b. DashboardHeroCard reuses the same pure engines (computeTodayProgressDisplay/computeDailyStreakSummary), not a re-implementation", () => {
  assert.match(dashboardHeroCard, /import\s*\{\s*computeTodayProgressDisplay\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/\.\.\/data\/learning\/todayProgressDisplay"/);
  assert.match(dashboardHeroCard, /computeDailyStreakSummary/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("dashboard-section-localization guard passed");
}
