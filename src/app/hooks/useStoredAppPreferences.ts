// Owns the "application preferences" state cluster extracted from App.tsx:
// the two language selections, the level-category/exercise filter selections,
// and their coordinated localStorage load/persist behavior.
//
// Deliberately narrow scope: this hook does NOT touch routing, navigation,
// auth, Supabase, user-profile sync, onboarding, or the level-test modal.
// Those all read or write yourLanguage/practiceLanguage too, but they stay
// in App.tsx because they're cross-cutting concerns, not preference storage.
//
// Effect-order contract: this hook must be invoked before any App.tsx effect
// that reads `shouldAutoRedirectFromStoredLanguagesRef.current` (the
// stored-language auto-redirect effect). React fires a component's effects
// in declaration order, and that ref is only populated once the
// storage-loading effect below has run.
//
// Canonical-route precedence: when the app mounted on a valid canonical
// practice URL, that URL's language pair is already authoritative in state
// (seeded by App.tsx's initialPracticeRouteRef) before this effect runs.
// Restoring a different stored pair on top of it would fight the
// route→state/state→URL effects every render (see
// shouldRestoreStoredLanguagePreference). The storage-loading effect below
// still reads and validates every stored value unconditionally — it just
// skips applying the language ones in that case.
import { useEffect, useRef, useState } from "react";
import { canUseLocalStorage, readStoredString, readStoredStringArray } from "../utils/storage";
import { VALID_LEVEL_CODES } from "../utils/pageRouting";
import { shouldRestoreStoredLanguagePreference } from "../utils/storedLanguagePreferencePolicy";
import { hasCompleteLanguagePair } from "../utils/languageProfileSyncPolicy";
import { EXERCISE_IDS } from "../../exercises/exerciseIds";

export interface AppPreferencesStorageKeys {
  yourLanguage: string;
  practiceLanguage: string;
  selectedLevel: string;
  selectedCategories: string;
  selectedLevels: string;
  selectedWordTypes: string;
  selectedExercises: string;
}

export interface UseStoredAppPreferencesParams {
  // The literal STORAGE_KEYS object stays defined in App.tsx (source-text
  // guarded by scripts/tests/routing/test-interactive-contracts.mjs) and is passed in here.
  storageKeys: AppPreferencesStorageKeys;
  // Derived from App.tsx's initialPracticeRouteRef (a practice-URL match),
  // not the ref itself — the ref belongs to route parsing, which stays in
  // App.tsx; only the two primitive fallback values are this hook's concern.
  initialYourLanguage: string;
  initialPracticeLanguage: string;
  // App.tsx's `initialPracticeRouteRef.current !== null` — whether the app
  // mounted on a valid canonical practice URL. Only this boolean crosses the
  // boundary (not the parsed route itself), matching the primitives above.
  hasInitialCanonicalPracticeRoute: boolean;
  supportedLanguageCodes: Set<string>;
}

export interface UseStoredAppPreferencesResult {
  yourLanguage: string;
  setYourLanguage: React.Dispatch<React.SetStateAction<string>>;
  practiceLanguage: string;
  setPracticeLanguage: React.Dispatch<React.SetStateAction<string>>;
  selectedLevel: string;
  setSelectedLevel: React.Dispatch<React.SetStateAction<string>>;
  selectedCategories: string[];
  setSelectedCategories: React.Dispatch<React.SetStateAction<string[]>>;
  selectedLevels: string[];
  setSelectedLevels: React.Dispatch<React.SetStateAction<string[]>>;
  selectedWordTypes: string[];
  setSelectedWordTypes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedExercises: string[];
  setSelectedExercises: React.Dispatch<React.SetStateAction<string[]>>;
  isContinueDisabled: boolean;
  // Set by the storage-loading effect below; read by App.tsx's stored-
  // language auto-redirect effect. See the effect-order note above.
  shouldAutoRedirectFromStoredLanguagesRef: React.MutableRefObject<boolean>;
  // Whether a *complete* native+learning language pair already existed in
  // localStorage before this load - captured once, from the raw read below,
  // before anything in this hook has a chance to write to it. This is the
  // canonical "was this visitor's language setup already done" signal for
  // the anonymous account-intro popup (see accountIntroPolicy.ts):
  // determining it from live yourLanguage/practiceLanguage state after
  // Continue would always read "complete" (this hook's own persist effects
  // below have already written it by then), so it must come from this
  // one-time raw read instead.
  hadCompleteStoredLanguagePairAtLoadRef: React.MutableRefObject<boolean>;
  // The state-reset portion of the former handleStartVocabularyPractice:
  // resets the filter/exercise selections for a freshly chosen level. Popup
  // queuing and navigation remain in App.tsx's handleStartVocabularyPractice.
  resetFiltersForLevel: (level: string) => void;
}

export function useStoredAppPreferences({
  storageKeys,
  initialYourLanguage,
  initialPracticeLanguage,
  hasInitialCanonicalPracticeRoute,
  supportedLanguageCodes,
}: UseStoredAppPreferencesParams): UseStoredAppPreferencesResult {
  const [yourLanguage, setYourLanguage] = useState(initialYourLanguage);
  const [practiceLanguage, setPracticeLanguage] = useState(
    initialPracticeLanguage,
  );
  const [selectedLevel, setSelectedLevel] = useState("A1");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedWordTypes, setSelectedWordTypes] = useState<string[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([
    ...EXERCISE_IDS,
  ]);

  const isContinueDisabled = !yourLanguage || !practiceLanguage;

  const shouldAutoRedirectFromStoredLanguagesRef = useRef(false);
  const hadCompleteStoredLanguagePairAtLoadRef = useRef(false);

  // Single coordinated load: reads every persisted preference once on
  // mount and applies whichever ones validate, exactly as before the
  // extraction (kept as one effect rather than split into per-key effects).
  useEffect(() => {
    const persistedYourLanguage = readStoredString(
      storageKeys.yourLanguage,
      (value) => supportedLanguageCodes.has(value),
    );
    const persistedPracticeLanguage = readStoredString(
      storageKeys.practiceLanguage,
      (value) => supportedLanguageCodes.has(value),
    );
    const persistedSelectedLevel = readStoredString(
      storageKeys.selectedLevel,
      (value) => VALID_LEVEL_CODES.has(value.toUpperCase()),
    );
    const persistedSelectedCategories =
      readStoredStringArray(storageKeys.selectedCategories) ?? [];
    const persistedSelectedLevels = (
      readStoredStringArray(storageKeys.selectedLevels, (value) =>
        VALID_LEVEL_CODES.has(value.toUpperCase()),
      ) ?? []
    ).map((value) => value.toUpperCase());
    const persistedSelectedWordTypes =
      readStoredStringArray(storageKeys.selectedWordTypes) ?? [];
    const allowedExercises = new Set<string>(EXERCISE_IDS);
    const persistedSelectedExercises = readStoredStringArray(
      storageKeys.selectedExercises,
      (value) => allowedExercises.has(value),
    );

    // Raw pre-save read, independent of the canonical-route gating below -
    // this must reflect whatever was actually in localStorage before this
    // load, not whatever ends up applied to live state.
    hadCompleteStoredLanguagePairAtLoadRef.current = hasCompleteLanguagePair({
      nativeLanguage: persistedYourLanguage ?? "",
      practiceLanguage: persistedPracticeLanguage ?? "",
    });

    const restoreStoredLanguage = shouldRestoreStoredLanguagePreference(
      hasInitialCanonicalPracticeRoute,
    );

    if (restoreStoredLanguage) {
      if (persistedYourLanguage) {
        setYourLanguage(persistedYourLanguage);
      }
      if (persistedPracticeLanguage) {
        setPracticeLanguage(persistedPracticeLanguage);
      }
    }
    if (persistedSelectedLevel) {
      setSelectedLevel(persistedSelectedLevel.toUpperCase());
    }
    if (persistedSelectedCategories.length > 0) {
      setSelectedCategories(persistedSelectedCategories);
    }
    if (persistedSelectedLevels.length > 0) {
      setSelectedLevels(persistedSelectedLevels);
    }
    if (persistedSelectedWordTypes.length > 0) {
      setSelectedWordTypes(persistedSelectedWordTypes);
    }
    if (persistedSelectedExercises && persistedSelectedExercises.length > 0) {
      setSelectedExercises(persistedSelectedExercises);
    }

    // Gated by restoreStoredLanguage too: a canonical-practice mount must
    // never make /languages's stored-language auto-redirect eligible — the
    // route's own pair, not localStorage, is what's active for this load.
    shouldAutoRedirectFromStoredLanguagesRef.current =
      restoreStoredLanguage &&
      Boolean(persistedYourLanguage && persistedPracticeLanguage);
  }, [supportedLanguageCodes, hasInitialCanonicalPracticeRoute]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(storageKeys.yourLanguage, yourLanguage);
    // storageKeys is App.tsx's module-level STORAGE_KEYS constant, passed
    // straight through and referentially stable — omitted from deps to
    // match the pre-extraction effect's dependency array exactly.
  }, [yourLanguage]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      storageKeys.practiceLanguage,
      practiceLanguage,
    );
  }, [practiceLanguage]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(storageKeys.selectedLevel, selectedLevel);
  }, [selectedLevel]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      storageKeys.selectedCategories,
      JSON.stringify(selectedCategories),
    );
  }, [selectedCategories]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      storageKeys.selectedLevels,
      JSON.stringify(selectedLevels),
    );
  }, [selectedLevels]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      storageKeys.selectedWordTypes,
      JSON.stringify(selectedWordTypes),
    );
  }, [selectedWordTypes]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      storageKeys.selectedExercises,
      JSON.stringify(selectedExercises),
    );
  }, [selectedExercises]);

  const resetFiltersForLevel = (level: string) => {
    setSelectedLevel(level.toUpperCase());
    setSelectedLevels([level.toUpperCase()]);
    setSelectedCategories([]);
    setSelectedWordTypes([]);
    setSelectedExercises([...EXERCISE_IDS]);
  };

  return {
    yourLanguage,
    setYourLanguage,
    practiceLanguage,
    setPracticeLanguage,
    selectedLevel,
    setSelectedLevel,
    selectedCategories,
    setSelectedCategories,
    selectedLevels,
    setSelectedLevels,
    selectedWordTypes,
    setSelectedWordTypes,
    selectedExercises,
    setSelectedExercises,
    isContinueDisabled,
    shouldAutoRedirectFromStoredLanguagesRef,
    hadCompleteStoredLanguagePairAtLoadRef,
    resetFiltersForLevel,
  };
}
