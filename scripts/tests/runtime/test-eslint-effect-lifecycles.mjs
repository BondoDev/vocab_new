import assert from "node:assert/strict";
import fs from "node:fs";
import { effectCalls, evaluate, evaluateInitializer, evaluateModule, initializer, nodesMatching, ts } from "../../lib/component-contract.mjs";

const read = (name) => fs.readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");
const sameDeps = (previous, next) => previous?.length === next.length && next.every((value, index) => Object.is(value, previous[index]));
const noop = () => {};

// Execute production callback/effect expressions with deterministic dependency
// scheduling. This is not a mounted React renderer or a live backend test.
function memoProbe(source) {
  const cache = new Map();
  return (name, bindings) => {
    const remember = (create, deps) => {
      const previous = cache.get(name);
      if (previous && sameDeps(previous.deps, deps)) return previous.value;
      const value = create();
      cache.set(name, { deps, value });
      return value;
    };
    const declarations = nodesMatching(source, (node) => ts.isVariableDeclaration(node) && node.name.getText() === name &&
      node.initializer && ts.isCallExpression(node.initializer) && ["useMemo", "useCallback"].includes(node.initializer.expression.getText()));
    assert.equal(declarations.length, 1, `one memoized declaration must own ${name}`);
    return evaluate(declarations[0].initializer, {
      ...bindings, useMemo: remember, useCallback: (callback, deps) => remember(() => callback, deps),
    });
  };
}

function effectProbe(source, marker) {
  const matches = effectCalls(source).filter((call) => call.arguments[0].getText().includes(marker));
  assert.equal(matches.length, 1, `one effect must own ${marker}`);
  let previousDeps;
  let cleanup;
  return (bindings, execute = false) => {
    const deps = evaluate(matches[0].arguments[1], bindings);
    if (sameDeps(previousDeps, deps)) return false;
    previousDeps = deps;
    if (execute) {
      cleanup?.();
      cleanup = evaluate(matches[0].arguments[0], bindings)();
    }
    return true;
  };
}

{
  const source = read("src/app/hooks/usePracticeRouteLanguageSync.ts");
  const route = { yourLanguage: "en", practiceLanguage: "fr" };
  const params = { pathname: "/languages/filters/exercises/en-fr/practice", navigate: noop,
    yourLanguage: "en", practiceLanguage: "fr", practiceRoute: route, resolvedPage: "practice",
    setPracticeLanguage: noop, setYourLanguage: noop, routes: { practice: "/languages/filters/exercises/practice" } };
  for (const marker of ["setYourLanguage(", "buildPracticeRoute("]) {
    const update = effectProbe(source, marker);
    assert.equal(update(params), true);
    assert.equal(update({ ...params }), false, "unrelated renders cannot re-run route synchronization");
    assert.equal(update({ ...params, yourLanguage: "de" }), true);
  }
  const app = read("src/app/App.tsx");
  const call = nodesMatching(app, (node) => ts.isCallExpression(node) && node.expression.getText() === "usePracticeRouteLanguageSync")[0];
  const routes = call.arguments[0].properties.find((property) => property.name.getText() === "routes");
  assert.equal(routes.initializer.getText(), "ROUTES", "the caller must pass the stable module-level route map");

  const redirect = effectProbe(read("src/app/hooks/useStoredLanguageAutoRedirect.ts"), "const startedOnLegacyPracticePage");
  const navigations = [];
  const redirectParams = {
    ...evaluateModule(read("src/app/utils/storedLanguageAutoRedirectPolicy.ts")),
    resolvedPage: "practice", initialPathRef: { current: params.routes.practice },
    startedOnLanguagePageRef: { current: false }, startedFromReloadRef: { current: false },
    shouldAutoRedirectFromStoredLanguagesRef: { current: true }, hasAutoRedirectedRef: { current: false },
    isContinueDisabled: false, legacyPracticePath: params.routes.practice, exerciseSelectionPath: "/languages/filters/exercises",
    navigate: (pathname) => navigations.push(pathname),
  };
  redirect(redirectParams, true);
  redirect({ ...redirectParams, resolvedPage: "exerciseSelection" }, true);
  redirect(redirectParams, true);
  assert.deepEqual(navigations, ["/languages/filters/exercises"], "navigation cannot re-arm the stored-language redirect");
}

{
  const source = read("src/app/hooks/useStoredAppPreferences.ts");
  const load = effectProbe(source, "readStoredString(");
  const storageKeys = Object.fromEntries(["yourLanguage", "practiceLanguage", "selectedLevel", "selectedCategories",
    "selectedLevels", "selectedWordTypes", "selectedExercises"].map((key) => [key, `app.${key}`]));
  const params = { storageKeys, supportedLanguageCodes: new Set(["en", "fr"]), hasInitialCanonicalPracticeRoute: true };
  assert.equal(load(params), true);
  assert.equal(load({ ...params, storageKeys: { ...storageKeys }, yourLanguage: "de", selectedLevels: ["B1"] }), false,
    "live selections and a same-valued key object cannot reload stored preferences");
  const persist = effectProbe(source, "setItem(storageKeys.yourLanguage");
  assert.equal(persist({ ...params, yourLanguage: "en" }), true);
  assert.equal(persist({ ...params, yourLanguage: "en" }), false);
  assert.equal(persist({ ...params, yourLanguage: "fr" }), true);
  const profile = effectProbe(read("src/app/hooks/useUserProfileLoad.ts"), "readSupabaseUserProfile(");
  const profileParams = { authUserId: "account-1", setAccountOnboardingError: noop,
    setIsAccountOnboardingOpen: noop, setPracticeLanguage: noop, setYourLanguage: noop };
  assert.equal(profile(profileParams), true);
  assert.equal(profile({ ...profileParams, yourLanguage: "de", practiceLanguage: "it" }), false,
    "language fallbacks cannot refetch a profile");
  assert.equal(profile({ ...profileParams, authUserId: "account-2" }), true);
}

{
  const source = read("src/app/pages/explore/useExploreItems.ts");
  const memo = memoProbe(source);
  const translate = (key) => `first:${key}`;
  const nextTranslate = (key) => `second:${key}`;
  for (const language of ["english", "spanish", "french", "german", "italian", "portuguese", "russian"]) {
    const params = { uiLanguage: "en", t: translate, examPath: "/exam", [`${language}ExploreTopics`]: [],
      withLevelTestExploreTopic: (topics, target, ui, translateTopic, examPath) => [...topics, { target, ui, label: translateTopic("exam"), path: examPath }],
      getVerbListTitle: () => "Verbs", getVerbListPath: () => "/verbs",
      buildPastVerbFormsExploreTopic: () => null, buildConjugatedVerbFormsExploreTopic: () => null };
    const name = `${language}ExploreItems`;
    const initial = memo(name, params);
    assert.equal(memo(name, { ...params }), initial);
    const translated = memo(name, { ...params, t: nextTranslate });
    assert.equal(translated[0].label, "second:exam");
    const rerouted = memo(name, { ...params, t: nextTranslate, examPath: "/level-test" });
    assert.equal(rerouted[0].path, "/level-test");
  }
}

{
  const source = read("src/app/pages/VocabularyLevelExam.tsx");
  const memo = memoProbe(source);
  const update = effectProbe(source, "generateQuestion();");
  let questions = 0;
  const params = {
    allWords: [{ level: "A1", word_lemma: "apple", concept_id: "one" }], currentLevel: 0,
    currentQuestionInLevel: 0, translationMap: { one: "pomme" }, examComplete: false,
    LEVELS: ["A1", "A2", "B1", "B2", "C1", "C2"], shuffleArray: (items) => items,
    setCurrentQuestion: () => { questions++; }, setSelectedAnswer: noop, setShowFeedback: noop,
  };
  const draw = (props) => update({ ...props, generateQuestion: memo("generateQuestion", props) }, true);
  draw(params);
  assert.equal(questions, 1);
  draw({ ...params, selectedAnswer: "pomme", showFeedback: true });
  assert.equal(questions, 1, "feedback renders cannot generate a new random question");
  draw({ ...params, currentQuestionInLevel: 1 });
  assert.equal(questions, 2, "advancing the question generates exactly one new question");
  draw({ ...params, currentQuestionInLevel: 1, examComplete: true });
  assert.equal(questions, 2, "completion cannot generate another question");
}

{
  const source = read("src/features/practice/exercises/BrokenWordExercise.tsx");
  const memo = memoProbe(source);
  const update = effectProbe(source, "initializeBrokenWord();");
  let shuffles = 0;
  let initializedChunks;
  const params = { currentWord: { word_lemma: "apple" }, onStatusChange: noop,
    splitWordIntoChunks: evaluateInitializer(source, "splitWordIntoChunks"),
    shuffleArray: (chunks) => { shuffles++; return chunks; },
    hasAutoPlayedCorrectAudioRef: { current: false }, charSlotRefs: { current: [] } };
  for (const setter of ["setWordChunks", "setShuffledChunks", "setPlacedChunks", "setPlacedChunkIndices", "setUsedChunks",
    "setLockedSlots", "setUsedHintForBrokenWord", "setShowIncorrectFeedback", "setUsedShowWord", "setIsCorrect", "setLineCount"]) params[setter] = noop;
  params.setWordChunks = (chunks) => { initializedChunks = chunks; };
  const draw = (props) => update({ ...props, initializeBrokenWord: memo("initializeBrokenWord", props) }, true);
  draw(params);
  draw({ ...params, placedChunks: ["ap"] });
  assert.equal(shuffles, 1, "typing/placement renders cannot reset the exercise");
  assert.deepEqual(initializedChunks, ["ap", "pl", "e"]);
  draw({ ...params, currentWord: { word_lemma: "banana" } });
  assert.equal(shuffles, 2, "a new word initializes once");
  assert.deepEqual(initializedChunks, ["ba", "na", "na"], "initialization uses the new word, not a stale closure");

  const half = read("src/features/practice/exercises/HalfWrittenExercise.tsx");
  const validate = effectProbe(half, "const correctAnswer = normalizedWord");
  let correct;
  const validation = { currentWord: { word_lemma: "apple" }, userInput: "ple", currentPrompt: "pomme",
    normalizedWord: "apple", visibleLetterCount: 2, isCompletedWrongAttempt: () => false,
    setHasCompletedWrongAttempt: noop, setIsCorrect: (value) => { correct = value; } };
  validate(validation, true);
  assert.equal(correct, true);
  validate({ ...validation, normalizedWord: "apply" }, true);
  assert.equal(correct, false, "validation must follow its normalized answer input");
}

{
  const source = read("src/features/practice/VocabularyPractice.tsx");
  const memo = memoProbe(source);
  const params = Object.fromEntries(initializer(source, "runNextStep").arguments[1].elements.map((element) => [element.getText(), noop]));
  const firstStep = memo("runNextStep", params);
  assert.equal(memo("runNextStep", { ...params }), firstStep, "unrelated renders keep the advance callback stable");
  assert.notEqual(memo("runNextStep", { ...params, exerciseStatus: {} }), firstStep, "new exercise status updates the advance closure");
  const advances = [];
  let timeout;
  let interactions = 0;
  const nextParams = { isCardSwitching: false, isNextActionAvailable: true,
    runNextStep: (skip) => advances.push(["original", skip]),
    customPracticeTimerRef: { current: { recordInteraction: () => { interactions++; } } },
    cardSwitchTimeoutRef: { current: null }, setIsCardSwitching: noop, setCardBlinkKey: noop,
    window: { clearTimeout: noop, setTimeout: (callback, delay) => { assert.equal(delay, 180); timeout = callback; return 1; } } };
  const handler = memo("handleNext", nextParams);
  const keyListener = effectProbe(source, 'addEventListener("keydown"');
  assert.equal(keyListener({ ...nextParams, handleNext: handler }), true);
  assert.equal(keyListener({ ...nextParams, handleNext: memo("handleNext", { ...nextParams }) }), false,
    "unchanged action inputs cannot churn the Enter listener");
  handler();
  memo("handleNext", { ...nextParams, runNextStep: (skip) => advances.push(["replacement", skip]) });
  timeout();
  assert.deepEqual(advances, [["original", false]], "the 180ms transition retains its invocation-time closure");
  assert.equal(interactions, 1);
}

for (const [file, name, readyField] of [
  ["src/features/user-profile/sections/progress/VocabularyGrowthSection.tsx", "fullHistory", "history"],
  ["src/features/user-profile/sections/vocabulary/AddWordToListDialog.tsx", "lists", "lists"],
]) {
  const memo = memoProbe(read(file));
  const state = { status: "loading" };
  const empty = memo(name, { state });
  assert.equal(memo(name, { state }), empty, "loading renders retain the same empty memo input");
  const rows = [{ id: "one" }];
  assert.equal(memo(name, { state: { status: "ready", [readyField]: rows } }), rows,
    "ready data is forwarded unchanged");
}

console.log("PASS: route, preference/profile, Explore, exam, exercise, practice callback, and chart/list memo lifecycles");
