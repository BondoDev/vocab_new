import { useMemo } from "react";
import type { UILanguage } from "../../../contexts/LanguageContext";
import { getVerbListPath, getVerbListTitle } from "../../../data/seo/verbLists";
import {
  buildEnglishExploreTopics,
  buildFrenchExploreTopics,
  buildGermanExploreTopics,
  buildItalianExploreTopics,
  buildPortugueseExploreTopics,
  buildRussianExploreTopics,
  buildSpanishExploreTopics,
  withLevelTestExploreTopic,
  type ExploreTopic,
  type TranslateFn,
} from "../../utils/exploreTopics";

// Extracted verbatim from src/app/App.tsx (AppContent). Every useMemo body,
// dependency array, helper call, and appended level-test/verb-list entry is
// unchanged — see docs/non-seo-regression-checklist.md and the Explore memo
// audit that preceded this extraction. `examPath` is App.tsx's ROUTES.exam,
// passed in rather than imported, matching how ./utils/exploreTopics already
// receives it (that module's `examFallbackPath` param) so this hook never
// depends on App.tsx.
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
  const englishExploreItems = useMemo(
    () => [
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
    ],
    [englishExploreTopics, uiLanguage],
  );
  const spanishExploreItems = useMemo(
    () => [
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
    ],
    [spanishExploreTopics, uiLanguage],
  );
  const frenchExploreItems = useMemo(
    () => [
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
    ],
    [frenchExploreTopics, uiLanguage],
  );
  const germanExploreItems = useMemo(
    () => [
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
    ],
    [germanExploreTopics, uiLanguage],
  );
  const italianExploreItems = useMemo(
    () => [
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
    ],
    [italianExploreTopics, uiLanguage],
  );
  const portugueseExploreItems = useMemo(
    () => [
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
    ],
    [portugueseExploreTopics, uiLanguage],
  );
  const russianExploreItems = useMemo(
    () => [
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
    ],
    [russianExploreTopics, uiLanguage],
  );

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
