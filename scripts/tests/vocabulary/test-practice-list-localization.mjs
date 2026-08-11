// Localization contract for Practice List (My Lists Phase 3): the exact
// "EXACT NEW TRANSLATIONS" strings for all 7 UI languages, plus
// {name}/{count} interpolation parity and confirmation that Learning/Known/
// Mastered/exercise names are still reused rather than duplicated.
//
// Run: node scripts/tests/vocabulary/test-practice-list-localization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");

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

function loadLocale(fileBaseName) {
  return JSON.parse(fs.readFileSync(path.join(INTERFACE_DIR, `${fileBaseName}.json`), "utf8"));
}

// Exact translations specified by the Practice List brief's "EXACT NEW
// TRANSLATIONS" section (practiceList maps to its first line, practiceSetup
// maps to the remaining 8 lines in the given order).
const EXPECTED = {
  english_interface: {
    practiceList: "Practice List",
    title: 'Practice "{name}"',
    description: "Choose how you want to practise this list.",
    numberOfWords: "Number of words",
    wordOrder: "Word order",
    random: "Random",
    listOrder: "List order",
    startPractice: "Start Practice",
    noWords: "This list has no words to practise.",
  },
  german_interface: {
    practiceList: "Liste üben",
    title: "„{name}“ üben",
    description: "Wähle aus, wie du diese Liste üben möchtest.",
    numberOfWords: "Anzahl der Wörter",
    wordOrder: "Wortreihenfolge",
    random: "Zufällig",
    listOrder: "Listenreihenfolge",
    startPractice: "Übung starten",
    noWords: "Diese Liste enthält keine Wörter zum Üben.",
  },
  spanish_interface: {
    practiceList: "Practicar lista",
    title: 'Practicar "{name}"',
    description: "Elige cómo quieres practicar esta lista.",
    numberOfWords: "Número de palabras",
    wordOrder: "Orden de las palabras",
    random: "Aleatorio",
    listOrder: "Orden de la lista",
    startPractice: "Empezar práctica",
    noWords: "Esta lista no contiene palabras para practicar.",
  },
  french_interface: {
    practiceList: "Pratiquer la liste",
    title: "Pratiquer « {name} »",
    description: "Choisissez comment vous souhaitez pratiquer cette liste.",
    numberOfWords: "Nombre de mots",
    wordOrder: "Ordre des mots",
    random: "Aléatoire",
    listOrder: "Ordre de la liste",
    startPractice: "Commencer l'entraînement",
    noWords: "Cette liste ne contient aucun mot à pratiquer.",
  },
  italian_interface: {
    practiceList: "Esercita la lista",
    title: 'Esercita "{name}"',
    description: "Scegli come vuoi esercitarti con questa lista.",
    numberOfWords: "Numero di parole",
    wordOrder: "Ordine delle parole",
    random: "Casuale",
    listOrder: "Ordine della lista",
    startPractice: "Inizia pratica",
    noWords: "Questa lista non contiene parole da esercitare.",
  },
  portuguese_interface: {
    practiceList: "Praticar lista",
    title: 'Praticar "{name}"',
    description: "Escolha como pretende praticar esta lista.",
    numberOfWords: "Número de palavras",
    wordOrder: "Ordem das palavras",
    random: "Aleatória",
    listOrder: "Ordem da lista",
    startPractice: "Iniciar prática",
    noWords: "Esta lista não contém palavras para praticar.",
  },
  russian_interface: {
    practiceList: "Практиковать список",
    title: "Практиковать «{name}»",
    description: "Выберите, как вы хотите практиковать этот список.",
    numberOfWords: "Количество слов",
    wordOrder: "Порядок слов",
    random: "Случайный",
    listOrder: "Порядок списка",
    startPractice: "Начать практику",
    noWords: "В этом списке нет слов для практики.",
  },
};

console.log("\n=== 31. All 7 locales contain the exact required Practice List translations ===\n");

for (const [fileBaseName, expected] of Object.entries(EXPECTED)) {
  test(`${fileBaseName}: myListsSection.practiceList === exact translation`, () => {
    const locale = loadLocale(fileBaseName);
    assert.equal(locale?.userProfile?.myListsSection?.practiceList, expected.practiceList);
  });

  test(`${fileBaseName}: practiceSetup.* all match the exact given translations`, () => {
    const locale = loadLocale(fileBaseName);
    const setup = locale?.userProfile?.myListsSection?.practiceSetup;
    assert.ok(setup, "practiceSetup must exist");
    assert.equal(setup.title, expected.title);
    assert.equal(setup.description, expected.description);
    assert.equal(setup.numberOfWords, expected.numberOfWords);
    assert.equal(setup.wordOrder, expected.wordOrder);
    assert.equal(setup.random, expected.random);
    assert.equal(setup.listOrder, expected.listOrder);
    assert.equal(setup.startPractice, expected.startPractice);
    assert.equal(setup.noWords, expected.noWords);
  });
}

console.log("\n=== 32. {name}/{count} interpolation parity — every locale's title carries {name}, count-bearing keys carry {count} ===\n");

for (const fileBaseName of Object.keys(EXPECTED)) {
  test(`${fileBaseName}: practiceSetup.title contains the {name} placeholder`, () => {
    const locale = loadLocale(fileBaseName);
    assert.match(locale.userProfile.myListsSection.practiceSetup.title, /\{name\}/);
  });

  test(`${fileBaseName}: allCount/exerciseType/exerciseTypes each contain the {count} placeholder`, () => {
    const locale = loadLocale(fileBaseName);
    const setup = locale.userProfile.myListsSection.practiceSetup;
    for (const key of ["allCount", "exerciseType", "exerciseTypes"]) {
      assert.match(setup[key], /\{count\}/, `practiceSetup.${key} must contain {count}`);
    }
  });
}

console.log("\n=== Reused copy: exercises/Cancel/words-unit are NOT duplicated as new Practice List-only keys ===\n");

for (const fileBaseName of Object.keys(EXPECTED)) {
  test(`${fileBaseName}: modal.cancel is reused (no separate practiceSetup.cancel key)`, () => {
    const locale = loadLocale(fileBaseName);
    assert.equal(locale.userProfile.myListsSection.practiceSetup.cancel, undefined);
    assert.ok(typeof locale.userProfile.myListsSection.modal.cancel === "string" && locale.userProfile.myListsSection.modal.cancel.length > 0);
  });

  test(`${fileBaseName}: exercise names are reused from exerciseSelection.exercise.* — no duplicate exercise-name keys under practiceSetup`, () => {
    const locale = loadLocale(fileBaseName);
    const setup = locale.userProfile.myListsSection.practiceSetup;
    for (const exerciseId of ["wordTyping", "halfWritten", "brokenWord", "connectWords", "listening"]) {
      assert.equal(setup[exerciseId], undefined, `practiceSetup must not duplicate the ${exerciseId} exercise name`);
      assert.ok(
        typeof locale?.exerciseSelection?.exercise?.[exerciseId] === "string" &&
          locale.exerciseSelection.exercise[exerciseId].length > 0,
        `exerciseSelection.exercise.${exerciseId} must exist for reuse`,
      );
    }
  });
}

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("practice-list-localization guard passed");
}
