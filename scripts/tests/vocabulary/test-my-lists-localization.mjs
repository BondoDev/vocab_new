// Localization contract for My Lists Phase 1 (userProfile.myListsSection.*)
// — mirrors test-dashboard-section-localization.mjs's precedent exactly:
// every one of the 7 supported interface files stays valid JSON and defines
// the same key set as English, with non-empty values, and the exact
// verbatim (do-not-reword) strings supplied for this task.
//
// Plain `node` (no TypeScript involved) — matching
// test-progress-section-localization.mjs's own precedent for a pure JSON
// contract.
//
// Run: node scripts/tests/vocabulary/test-my-lists-localization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");

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

console.log("\n=== myListsSection localization contract ===\n");

const parsed = new Map();
for (const fileName of LOCALE_FILES) {
  test(`${fileName} is valid JSON`, () => {
    const raw = fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8");
    parsed.set(fileName, JSON.parse(raw));
  });
}

const englishSection = parsed.get("english_interface.json")?.userProfile?.myListsSection;

test("english_interface.json defines a non-empty userProfile.myListsSection", () => {
  assert.ok(englishSection && Object.keys(englishSection).length > 0);
});

const englishKeys = flattenKeys(englishSection ?? {});

test("13. userProfile.myListsSection still contains every Phase 1 key (Phase 2A only adds keys, never removes/renames one — see test-my-lists-phase2a-localization.mjs for the full current key-set contract)", () => {
  const phase1Keys = [
    "ariaLabel",
    "createButton",
    "createError",
    "emptyState.description",
    "emptyState.title",
    "loadError",
    "modal.cancel",
    "modal.fieldLabel",
    "modal.placeholder",
    "modal.submit",
    "modal.title",
    "retryButton",
    "subtitle",
    "title",
  ];
  for (const key of phase1Keys) {
    assert.ok(englishKeys.includes(key), `Phase 1 key myListsSection.${key} must still exist`);
  }
});

for (const fileName of LOCALE_FILES) {
  test(`${fileName} myListsSection key set matches English exactly`, () => {
    const section = parsed.get(fileName)?.userProfile?.myListsSection;
    assert.ok(section, `${fileName} is missing userProfile.myListsSection`);
    assert.deepEqual(flattenKeys(section), englishKeys, `${fileName} myListsSection keys differ from English`);
  });

  test(`${fileName} myListsSection values are all non-empty strings`, () => {
    const section = parsed.get(fileName).userProfile.myListsSection;
    for (const key of englishKeys) {
      const value = key.split(".").reduce((node, part) => node?.[part], section);
      assert.equal(typeof value, "string", `${fileName}: myListsSection.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: myListsSection.${key} is empty`);
    }
  });
}

console.log("\n=== Verbatim, do-not-reword translations as supplied by the task brief ===\n");

// Only the strings the brief actually specified verbatim (title/subtitle/
// emptyState/createButton/modal.*/loadError/createError) — ariaLabel and
// retryButton were not part of the supplied table (the brief has no
// equivalent field for either) and were authored to match each locale's own
// established "Section X" / "Try again" phrasing already used by
// vocabularySection/progressSection/vocabularyGrowthSection, so they are
// deliberately not pinned verbatim here.
const EXPECTED = {
  "english_interface.json": {
    title: "My Lists",
    subtitle: "Create and organize vocabulary collections for the words you want to learn.",
    emptyTitle: "No lists yet",
    emptyDescription: "Create your first list to organize words you want to learn together.",
    createButton: "Create List",
    modalTitle: "Create List",
    fieldLabel: "List name",
    placeholder: "Travel German",
    cancel: "Cancel",
    submit: "Create List",
    loadError: "We couldn't load your lists.",
    createError: "We couldn't create your list. Please try again.",
  },
  "german_interface.json": {
    title: "Meine Listen",
    subtitle: "Erstelle und organisiere Vokabellisten mit den Wörtern, die du lernen möchtest.",
    emptyTitle: "Noch keine Listen",
    emptyDescription: "Erstelle deine erste Liste, um Wörter zu organisieren, die du zusammen lernen möchtest.",
    createButton: "Liste erstellen",
    modalTitle: "Liste erstellen",
    fieldLabel: "Listenname",
    placeholder: "Deutsch für Reisen",
    cancel: "Abbrechen",
    submit: "Liste erstellen",
    loadError: "Deine Listen konnten nicht geladen werden.",
    createError: "Die Liste konnte nicht erstellt werden. Bitte versuche es erneut.",
  },
  "spanish_interface.json": {
    title: "Mis listas",
    subtitle: "Crea y organiza colecciones de vocabulario con las palabras que quieres aprender.",
    emptyTitle: "Aún no hay listas",
    emptyDescription: "Crea tu primera lista para organizar palabras que quieras aprender juntas.",
    createButton: "Crear lista",
    modalTitle: "Crear lista",
    fieldLabel: "Nombre de la lista",
    placeholder: "Alemán para viajar",
    cancel: "Cancelar",
    submit: "Crear lista",
    loadError: "No se pudieron cargar tus listas.",
    createError: "No se pudo crear la lista. Inténtalo de nuevo.",
  },
  "french_interface.json": {
    title: "Mes listes",
    subtitle: "Créez et organisez des collections de vocabulaire avec les mots que vous souhaitez apprendre.",
    emptyTitle: "Aucune liste pour le moment",
    emptyDescription: "Créez votre première liste pour organiser les mots que vous souhaitez apprendre ensemble.",
    createButton: "Créer une liste",
    modalTitle: "Créer une liste",
    fieldLabel: "Nom de la liste",
    placeholder: "Allemand pour voyager",
    cancel: "Annuler",
    submit: "Créer la liste",
    loadError: "Impossible de charger vos listes.",
    createError: "Impossible de créer la liste. Veuillez réessayer.",
  },
  "italian_interface.json": {
    title: "Le mie liste",
    subtitle: "Crea e organizza raccolte di vocaboli con le parole che vuoi imparare.",
    emptyTitle: "Nessuna lista ancora",
    emptyDescription: "Crea la tua prima lista per organizzare le parole che vuoi imparare insieme.",
    createButton: "Crea lista",
    modalTitle: "Crea lista",
    fieldLabel: "Nome della lista",
    placeholder: "Tedesco per viaggiare",
    cancel: "Annulla",
    submit: "Crea lista",
    loadError: "Non è stato possibile caricare le tue liste.",
    createError: "Non è stato possibile creare la lista. Riprova.",
  },
  "portuguese_interface.json": {
    title: "As minhas listas",
    subtitle: "Crie e organize coleções de vocabulário com as palavras que pretende aprender.",
    emptyTitle: "Ainda não há listas",
    emptyDescription: "Crie a sua primeira lista para organizar palavras que pretende aprender em conjunto.",
    createButton: "Criar lista",
    modalTitle: "Criar lista",
    fieldLabel: "Nome da lista",
    placeholder: "Alemão para viagens",
    cancel: "Cancelar",
    submit: "Criar lista",
    loadError: "Não foi possível carregar as suas listas.",
    createError: "Não foi possível criar a lista. Tente novamente.",
  },
  "russian_interface.json": {
    title: "Мои списки",
    subtitle: "Создавайте и организуйте подборки слов, которые хотите выучить.",
    emptyTitle: "Списков пока нет",
    emptyDescription: "Создайте первый список, чтобы объединить слова, которые хотите учить вместе.",
    createButton: "Создать список",
    modalTitle: "Создать список",
    fieldLabel: "Название списка",
    placeholder: "Немецкий для путешествий",
    cancel: "Отмена",
    submit: "Создать список",
    loadError: "Не удалось загрузить ваши списки.",
    createError: "Не удалось создать список. Попробуйте ещё раз.",
  },
};

for (const fileName of LOCALE_FILES) {
  test(`${fileName} myListsSection.* matches the exact supplied translations verbatim`, () => {
    const section = parsed.get(fileName).userProfile.myListsSection;
    const expected = EXPECTED[fileName];
    assert.equal(section.title, expected.title, `${fileName}: title was reworded`);
    assert.equal(section.subtitle, expected.subtitle, `${fileName}: subtitle was reworded`);
    assert.equal(section.emptyState.title, expected.emptyTitle, `${fileName}: emptyState.title was reworded`);
    assert.equal(
      section.emptyState.description,
      expected.emptyDescription,
      `${fileName}: emptyState.description was reworded`,
    );
    assert.equal(section.createButton, expected.createButton, `${fileName}: createButton was reworded`);
    assert.equal(section.modal.title, expected.modalTitle, `${fileName}: modal.title was reworded`);
    assert.equal(section.modal.fieldLabel, expected.fieldLabel, `${fileName}: modal.fieldLabel was reworded`);
    assert.equal(section.modal.placeholder, expected.placeholder, `${fileName}: modal.placeholder was reworded`);
    assert.equal(section.modal.cancel, expected.cancel, `${fileName}: modal.cancel was reworded`);
    assert.equal(section.modal.submit, expected.submit, `${fileName}: modal.submit was reworded`);
    assert.equal(section.loadError, expected.loadError, `${fileName}: loadError was reworded`);
    assert.equal(section.createError, expected.createError, `${fileName}: createError was reworded`);
  });
}

console.log("\n=== No vocabulary.json / word-resolution imports anywhere in My Lists ===\n");

const MY_LISTS_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "my-lists");
const LIB_FILE = path.join(ROOT_DIR, "src", "lib", "vocabularyLists.ts");

// Strips `//` line comments before scanning so a file's own explanatory
// prose (e.g. "Do not add vocabulary.json imports here") never trips these
// checks — only a real import/reference in live code counts as an offense.
function stripLineComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

test("14. Card/grid/data-layer files under my-lists never import vocabulary.json or a word-resolution helper (counts stay JSON-free); only ListDetailView.tsx may reuse loadVocabularyProgress — and only it, deliberately, for its own detail rows (Phase 2A, not Phase 1)", () => {
  const allowedException = "ListDetailView.tsx";
  const offenders = [];
  for (const entry of fs.readdirSync(MY_LISTS_DIR)) {
    if (entry === allowedException) continue;
    const filePath = path.join(MY_LISTS_DIR, entry);
    if (!fs.statSync(filePath).isFile()) continue;
    const content = stripLineComments(fs.readFileSync(filePath, "utf8"));
    if (/vocabulary\.json|loadVocabularyProgress|resolveWordCreatedDateISO/.test(content)) {
      offenders.push(entry);
    }
  }
  assert.deepEqual(offenders, [], `unexpected vocabulary-data reference(s): ${offenders.join(", ")}`);

  const detailViewContent = stripLineComments(
    fs.readFileSync(path.join(MY_LISTS_DIR, allowedException), "utf8"),
  );
  assert.doesNotMatch(detailViewContent, /vocabulary\.json/, "even the detail view must resolve via loadVocabularyProgress, never a direct JSON import");
  assert.match(detailViewContent, /loadVocabularyProgress/, "the detail view is expected to reuse loadVocabularyProgress");
});

test("14b. src/lib/vocabularyLists.ts never imports vocabulary.json or queries user_word_progress", () => {
  const content = stripLineComments(fs.readFileSync(LIB_FILE, "utf8"));
  assert.doesNotMatch(content, /vocabulary\.json/);
  assert.doesNotMatch(content, /user_word_progress/, "vocabularyLists.ts must stay scoped to user_vocabulary_lists only");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-localization guard passed");
}
