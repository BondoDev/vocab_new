import { useMemo } from "react";
import type { UILanguage } from "../../../contexts/LanguageContext";
import { getVerbListPath, getVerbListTitle } from "../../../data/seo/verbLists";
import {
  buildEnglishExploreTopics,
  buildConjugatedVerbFormsExploreTopic,
  buildFrenchExploreTopics,
  buildGermanExploreTopics,
  buildItalianExploreTopics,
  buildPastVerbFormsExploreTopic,
  buildPortugueseExploreTopics,
  buildRussianExploreTopics,
  buildSpanishExploreTopics,
  withLevelTestExploreTopic,
  type ExploreTopic,
  type TranslateFn,
} from "./exploreTopics";

// Originally extracted verbatim from src/app/App.tsx (AppContent) — see
// docs/non-seo-regression-checklist.md and the Explore memo audit that
// preceded that extraction. `examPath` is App.tsx's ROUTES.exam, passed in
// rather than imported, matching how ./exploreTopics already receives it
// (that module's `examFallbackPath` param) so this hook never depends on
// App.tsx. Each per-target-language item list now also conditionally
// appends a "past verb forms" entry (buildPastVerbFormsExploreTopic) after
// the verb-list entry — it resolves to null and is simply omitted for any
// (targetLanguage, uiLanguage) combination without authored past-forms
// content yet.
export function useExploreItems(
  uiLanguage: UILanguage,
  t: TranslateFn,
  examPath: string,
): Record<UILanguage, ExploreTopic[]> {
  const englishExploreTopics = useMemo(
    () => buildEnglishExploreTopics(uiLanguage, t),
    [t, uiLanguage],
  );
  const spanishExploreTopics = useMemo(
    () => buildSpanishExploreTopics(uiLanguage),
    [uiLanguage],
  );
  const frenchExploreTopics = useMemo(
    () => buildFrenchExploreTopics(uiLanguage),
    [uiLanguage],
  );
  const germanExploreTopics = useMemo(
    () => buildGermanExploreTopics(uiLanguage),
    [uiLanguage],
  );
  const italianExploreTopics = useMemo(
    () => buildItalianExploreTopics(uiLanguage),
    [uiLanguage],
  );
  const portugueseExploreTopics = useMemo(
    () => buildPortugueseExploreTopics(uiLanguage),
    [uiLanguage],
  );
  const russianExploreTopics = useMemo(
    () => buildRussianExploreTopics(uiLanguage),
    [uiLanguage],
  );
  const englishExploreItems = useMemo(() => {
    const pastVerbFormsTopic = buildPastVerbFormsExploreTopic("english", uiLanguage);
    const conjugatedVerbFormsTopic = buildConjugatedVerbFormsExploreTopic("english", uiLanguage);
    return [
      ...withLevelTestExploreTopic(
        englishExploreTopics,
        "english",
        uiLanguage,
        t,
        examPath,
      ),
      {
        id: "verbs",
        level: "verbs" as const,
        label: getVerbListTitle("english", uiLanguage),
        path: getVerbListPath("english", uiLanguage),
        kind: "custom" as const,
        targetLanguage: "english" as const,
      },
      ...(pastVerbFormsTopic ? [pastVerbFormsTopic] : []),
      ...(conjugatedVerbFormsTopic ? [conjugatedVerbFormsTopic] : []),
    ];
  }, [englishExploreTopics, uiLanguage]);
  const spanishExploreItems = useMemo(() => {
    const pastVerbFormsTopic = buildPastVerbFormsExploreTopic("spanish", uiLanguage);
    const conjugatedVerbFormsTopic = buildConjugatedVerbFormsExploreTopic("spanish", uiLanguage);
    return [
      ...withLevelTestExploreTopic(
        spanishExploreTopics,
        "spanish",
        uiLanguage,
        t,
        examPath,
      ),
      {
        id: "verbs",
        level: "verbs" as const,
        label: getVerbListTitle("spanish", uiLanguage),
        path: getVerbListPath("spanish", uiLanguage),
        kind: "custom" as const,
        targetLanguage: "spanish" as const,
      },
      ...(pastVerbFormsTopic ? [pastVerbFormsTopic] : []),
      ...(conjugatedVerbFormsTopic ? [conjugatedVerbFormsTopic] : []),
    ];
  }, [spanishExploreTopics, uiLanguage]);
  const frenchExploreItems = useMemo(() => {
    const pastVerbFormsTopic = buildPastVerbFormsExploreTopic("french", uiLanguage);
    const conjugatedVerbFormsTopic = buildConjugatedVerbFormsExploreTopic("french", uiLanguage);
    return [
      ...withLevelTestExploreTopic(
        frenchExploreTopics,
        "french",
        uiLanguage,
        t,
        examPath,
      ),
      {
        id: "verbs",
        level: "verbs" as const,
        label: getVerbListTitle("french", uiLanguage),
        path: getVerbListPath("french", uiLanguage),
        kind: "custom" as const,
        targetLanguage: "french" as const,
      },
      ...(pastVerbFormsTopic ? [pastVerbFormsTopic] : []),
      ...(conjugatedVerbFormsTopic ? [conjugatedVerbFormsTopic] : []),
    ];
  }, [frenchExploreTopics, uiLanguage]);
  const germanExploreItems = useMemo(() => {
    const pastVerbFormsTopic = buildPastVerbFormsExploreTopic("german", uiLanguage);
    const conjugatedVerbFormsTopic = buildConjugatedVerbFormsExploreTopic("german", uiLanguage);
    return [
      ...withLevelTestExploreTopic(
        germanExploreTopics,
        "german",
        uiLanguage,
        t,
        examPath,
      ),
      {
        id: "verbs",
        level: "verbs" as const,
        label: getVerbListTitle("german", uiLanguage),
        path: getVerbListPath("german", uiLanguage),
        kind: "custom" as const,
        targetLanguage: "german" as const,
      },
      ...(pastVerbFormsTopic ? [pastVerbFormsTopic] : []),
      ...(conjugatedVerbFormsTopic ? [conjugatedVerbFormsTopic] : []),
    ];
  }, [germanExploreTopics, uiLanguage]);
  const italianExploreItems = useMemo(() => {
    const pastVerbFormsTopic = buildPastVerbFormsExploreTopic("italian", uiLanguage);
    const conjugatedVerbFormsTopic = buildConjugatedVerbFormsExploreTopic("italian", uiLanguage);
    return [
      ...withLevelTestExploreTopic(
        italianExploreTopics,
        "italian",
        uiLanguage,
        t,
        examPath,
      ),
      {
        id: "verbs",
        level: "verbs" as const,
        label: getVerbListTitle("italian", uiLanguage),
        path: getVerbListPath("italian", uiLanguage),
        kind: "custom" as const,
        targetLanguage: "italian" as const,
      },
      ...(pastVerbFormsTopic ? [pastVerbFormsTopic] : []),
      ...(conjugatedVerbFormsTopic ? [conjugatedVerbFormsTopic] : []),
    ];
  }, [italianExploreTopics, uiLanguage]);
  const portugueseExploreItems = useMemo(() => {
    const pastVerbFormsTopic = buildPastVerbFormsExploreTopic("portuguese", uiLanguage);
    const conjugatedVerbFormsTopic = buildConjugatedVerbFormsExploreTopic("portuguese", uiLanguage);
    return [
      ...withLevelTestExploreTopic(
        portugueseExploreTopics,
        "portuguese",
        uiLanguage,
        t,
        examPath,
      ),
      {
        id: "verbs",
        level: "verbs" as const,
        label: getVerbListTitle("portuguese", uiLanguage),
        path: getVerbListPath("portuguese", uiLanguage),
        kind: "custom" as const,
        targetLanguage: "portuguese" as const,
      },
      ...(pastVerbFormsTopic ? [pastVerbFormsTopic] : []),
      ...(conjugatedVerbFormsTopic ? [conjugatedVerbFormsTopic] : []),
    ];
  }, [portugueseExploreTopics, uiLanguage]);
  const russianExploreItems = useMemo(() => {
    const pastVerbFormsTopic = buildPastVerbFormsExploreTopic("russian", uiLanguage);
    const conjugatedVerbFormsTopic = buildConjugatedVerbFormsExploreTopic("russian", uiLanguage);
    return [
      ...withLevelTestExploreTopic(
        russianExploreTopics,
        "russian",
        uiLanguage,
        t,
        examPath,
      ),
      {
        id: "verbs",
        level: "verbs" as const,
        label: getVerbListTitle("russian", uiLanguage),
        path: getVerbListPath("russian", uiLanguage),
        kind: "custom" as const,
        targetLanguage: "russian" as const,
      },
      ...(pastVerbFormsTopic ? [pastVerbFormsTopic] : []),
      ...(conjugatedVerbFormsTopic ? [conjugatedVerbFormsTopic] : []),
    ];
  }, [russianExploreTopics, uiLanguage]);

  return {
    en: englishExploreItems,
    es: spanishExploreItems,
    fr: frenchExploreItems,
    de: germanExploreItems,
    it: italianExploreItems,
    pt: portugueseExploreItems,
    ru: russianExploreItems,
  };
}
