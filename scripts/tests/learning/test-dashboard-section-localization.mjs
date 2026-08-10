// Focused localization + data-flow guard for Dashboard Phase 1 (page
// header + personalized subheader greeting only — see
// src/features/user-profile/sections/dashboard/DashboardSection.tsx's own
// header for what's deliberately NOT implemented yet).
//
// Confirms every one of the 7 supported interface files stays valid JSON
// and defines:
//   - the exact same `userProfile.dashboardPage.*` key set as English;
//   - verbatim (do-not-reword) title/greeting.*/fallback strings, matching
//     the exact translations supplied for this task;
//   - the {name} placeholder shape is present, unchanged, in every
//     locale's morning/afternoon/evening template (so interpolation can't
//     silently break in one language);
//   - the old `userProfile.developmentNotice.*` placeholder namespace it
//     replaced is fully gone (locks in the cleanup, not just an addition).
// It also statically checks DashboardSection.tsx / UserProfileDashboardPage.tsx
// source for the contract points from the Phase 1 brief that aren't
// otherwise covered by test-dashboard-greeting-period.mjs's pure-function
// tests: the nickname prop is threaded through (not re-fetched), a missing
// nickname falls back to the dedicated fallback key, and no English
// greeting text is hardcoded into the component.
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

test("userProfile.dashboardPage has exactly ariaLabel/title/greeting.{morning,afternoon,evening,fallback}", () => {
  assert.deepEqual(englishKeys, [
    "ariaLabel",
    "greeting.afternoon",
    "greeting.evening",
    "greeting.fallback",
    "greeting.morning",
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
  assert.match(dashboardSection, /DashboardSection\(\{\s*nickname\s*\}/);
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
  assert.match(dashboardPageShell, /<DashboardSection\s+nickname=\{nickname\}\s*\/>/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("dashboard-section-localization guard passed");
}
