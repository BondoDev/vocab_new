// Localization contract for Settings Phase 1 (userProfile.settingsSection.*)
// — mirrors test-my-lists-localization.mjs's precedent: every one of the 7
// supported interface files stays valid JSON, defines the same key set as
// English, with non-empty values, and the exact verbatim (do-not-reword)
// strings this task's own brief supplied for the 8 pinned concepts.
//
// Also scans every new Settings TSX file for hardcoded English UI strings
// that should have gone through t(...) instead.
//
// Run: node scripts/tests/account/test-settings-localization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");
const SETTINGS_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "settings");

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

console.log("\n=== settingsSection localization contract ===\n");

const parsed = new Map();
for (const fileName of LOCALE_FILES) {
  test(`${fileName} is valid JSON`, () => {
    const raw = fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8");
    parsed.set(fileName, JSON.parse(raw));
  });
}

const englishSection = parsed.get("english_interface.json")?.userProfile?.settingsSection;

test("english_interface.json defines a non-empty userProfile.settingsSection", () => {
  assert.ok(englishSection && Object.keys(englishSection).length > 0);
});

const englishKeys = flattenKeys(englishSection ?? {});

test("Required Settings Phase 1 concepts are all present as keys", () => {
  const requiredKeys = [
    "ariaLabel",
    "title",
    "subtitle",
    "save",
    "saving",
    "cancel",
    "account.title",
    "account.nickname",
    "account.email",
    "languages.title",
    "languages.native",
    "languages.learning",
    "languages.currentLevel",
    "languages.changeNote",
    "languages.savedToast",
    "languages.saveError",
    "timeRegion.title",
    "timeRegion.timezone",
    "timeRegion.useCurrent",
    "timeRegion.explanation",
    "timeRegion.detectionError",
    "timeRegion.savedToast",
    "timeRegion.saveError",
    "dataAccount.title",
    "dataAccount.resetProgress",
    "dataAccount.deleteAccount",
    "dataAccount.resetDialog.title",
    "dataAccount.resetDialog.description",
    "dataAccount.resetDialog.confirmLabel",
    "dataAccount.resetDialog.confirm",
    "dataAccount.deleteDialog.title",
    "dataAccount.deleteDialog.description",
    "dataAccount.deleteDialog.confirmLabel",
    "dataAccount.deleteDialog.confirm",
  ];
  for (const key of requiredKeys) {
    assert.ok(englishKeys.includes(key), `required key settingsSection.${key} must exist`);
  }
});

for (const fileName of LOCALE_FILES) {
  test(`${fileName} settingsSection key set matches English exactly`, () => {
    const section = parsed.get(fileName)?.userProfile?.settingsSection;
    assert.ok(section, `${fileName} is missing userProfile.settingsSection`);
    assert.deepEqual(flattenKeys(section), englishKeys, `${fileName} settingsSection keys differ from English`);
  });

  test(`${fileName} settingsSection values are all non-empty strings`, () => {
    const section = parsed.get(fileName).userProfile.settingsSection;
    for (const key of englishKeys) {
      const value = key.split(".").reduce((node, part) => node?.[part], section);
      assert.equal(typeof value, "string", `${fileName}: settingsSection.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: settingsSection.${key} is empty`);
    }
  });
}

console.log("\n=== Verbatim, do-not-reword translations for the 8 pinned strings ===\n");

const EXPECTED = {
  "english_interface.json": {
    title: "Settings",
    subtitle: "Manage your account and learning preferences.",
    account: "Account",
    languages: "Languages",
    timeRegion: "Time & Region",
    dataAccount: "Data & Account",
    useCurrent: "Use current timezone",
    explanation: "Your timezone determines when a new learning day begins for daily goals, streaks, and statistics.",
    resetProgress: "Reset language progress",
    deleteAccount: "Delete account",
  },
  "german_interface.json": {
    title: "Einstellungen",
    subtitle: "Verwalte dein Konto und deine Lerneinstellungen.",
    account: "Konto",
    languages: "Sprachen",
    timeRegion: "Zeit & Region",
    dataAccount: "Daten & Konto",
    useCurrent: "Aktuelle Zeitzone verwenden",
    explanation: "Deine Zeitzone bestimmt, wann ein neuer Lerntag für Tagesziele, Serien und Statistiken beginnt.",
    resetProgress: "Lernfortschritt zurücksetzen",
    deleteAccount: "Konto löschen",
  },
  "spanish_interface.json": {
    title: "Configuración",
    subtitle: "Gestiona tu cuenta y tus preferencias de aprendizaje.",
    account: "Cuenta",
    languages: "Idiomas",
    timeRegion: "Hora y región",
    dataAccount: "Datos y cuenta",
    useCurrent: "Usar zona horaria actual",
    explanation:
      "Tu zona horaria determina cuándo comienza un nuevo día de aprendizaje para los objetivos diarios, las rachas y las estadísticas.",
    resetProgress: "Restablecer progreso de aprendizaje",
    deleteAccount: "Eliminar cuenta",
  },
  "french_interface.json": {
    title: "Paramètres",
    subtitle: "Gérez votre compte et vos préférences d’apprentissage.",
    account: "Compte",
    languages: "Langues",
    timeRegion: "Heure et région",
    dataAccount: "Données et compte",
    useCurrent: "Utiliser le fuseau horaire actuel",
    explanation:
      "Votre fuseau horaire détermine le début d’une nouvelle journée d’apprentissage pour les objectifs quotidiens, les séries et les statistiques.",
    resetProgress: "Réinitialiser la progression",
    deleteAccount: "Supprimer le compte",
  },
  "italian_interface.json": {
    title: "Impostazioni",
    subtitle: "Gestisci il tuo account e le tue preferenze di apprendimento.",
    account: "Account",
    languages: "Lingue",
    timeRegion: "Ora e regione",
    dataAccount: "Dati e account",
    useCurrent: "Usa il fuso orario attuale",
    explanation: "Il tuo fuso orario determina quando inizia un nuovo giorno di apprendimento per obiettivi giornalieri, serie e statistiche.",
    resetProgress: "Reimposta i progressi di apprendimento",
    deleteAccount: "Elimina account",
  },
  "portuguese_interface.json": {
    title: "Definições",
    subtitle: "Gira a sua conta e as preferências de aprendizagem.",
    account: "Conta",
    languages: "Idiomas",
    timeRegion: "Hora e região",
    dataAccount: "Dados e conta",
    useCurrent: "Usar fuso horário atual",
    explanation:
      "O seu fuso horário determina quando começa um novo dia de aprendizagem para objetivos diários, sequências e estatísticas.",
    resetProgress: "Repor progresso de aprendizagem",
    deleteAccount: "Eliminar conta",
  },
  "russian_interface.json": {
    title: "Настройки",
    subtitle: "Управляйте аккаунтом и настройками обучения.",
    account: "Аккаунт",
    languages: "Языки",
    timeRegion: "Время и регион",
    dataAccount: "Данные и аккаунт",
    useCurrent: "Использовать текущий часовой пояс",
    explanation: "Часовой пояс определяет начало нового учебного дня для дневных целей, серий и статистики.",
    resetProgress: "Сбросить прогресс обучения",
    deleteAccount: "Удалить аккаунт",
  },
};

for (const fileName of LOCALE_FILES) {
  test(`${fileName} settingsSection.* matches the exact supplied translations verbatim`, () => {
    const section = parsed.get(fileName).userProfile.settingsSection;
    const expected = EXPECTED[fileName];
    assert.equal(section.title, expected.title, `${fileName}: title was reworded`);
    assert.equal(section.subtitle, expected.subtitle, `${fileName}: subtitle was reworded`);
    assert.equal(section.account.title, expected.account, `${fileName}: account.title was reworded`);
    assert.equal(section.languages.title, expected.languages, `${fileName}: languages.title was reworded`);
    assert.equal(section.timeRegion.title, expected.timeRegion, `${fileName}: timeRegion.title was reworded`);
    assert.equal(section.dataAccount.title, expected.dataAccount, `${fileName}: dataAccount.title was reworded`);
    assert.equal(section.timeRegion.useCurrent, expected.useCurrent, `${fileName}: timeRegion.useCurrent was reworded`);
    assert.equal(section.timeRegion.explanation, expected.explanation, `${fileName}: timeRegion.explanation was reworded`);
    assert.equal(
      section.dataAccount.resetProgress,
      expected.resetProgress,
      `${fileName}: dataAccount.resetProgress was reworded`,
    );
    assert.equal(
      section.dataAccount.deleteAccount,
      expected.deleteAccount,
      `${fileName}: dataAccount.deleteAccount was reworded`,
    );
  });
}

console.log("\n=== No hardcoded English UI strings in the new Settings components ===\n");

test("Every Settings .tsx file's JSX text content is sourced from t(...)/props, never a bare English literal", () => {
  const offenders = [];
  const entries = fs.readdirSync(SETTINGS_DIR).filter((entry) => entry.endsWith(".tsx"));
  assert.ok(entries.length > 0, "expected at least one Settings .tsx file to exist");

  // A conservative heuristic, not a full JSX parser: flags a JSX text child
  // that is a run of capitalized English words (e.g. ">Reset Account<")
  // sitting directly between tags, the shape a hardcoded label would take.
  // Attribute strings, translation keys, and CSS class names are a
  // different shape (no `>...<` text-node wrapping) and don't match this.
  const HARDCODED_TEXT_PATTERN = />\s*[A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)*\s*</g;
  const ALLOWED = new Set(["FluentStellar"]); // brand name, not a translatable UI string

  for (const entry of entries) {
    const content = fs.readFileSync(path.join(SETTINGS_DIR, entry), "utf8");
    const matches = content.matchAll(HARDCODED_TEXT_PATTERN);
    for (const match of matches) {
      const text = match[0].slice(1, -1).trim();
      if (!ALLOWED.has(text)) {
        offenders.push(`${entry}: "${text}"`);
      }
    }
  }

  assert.deepEqual(offenders, [], `hardcoded UI text found: ${offenders.join("; ")}`);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("settingsSection localization guard passed");
}
