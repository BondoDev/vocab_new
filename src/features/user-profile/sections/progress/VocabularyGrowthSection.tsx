import { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { getCurrentLearningDate } from "../../../../lib/learningDate";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import type { UserProfile } from "../../../../lib/userProfile";
import type { VocabularyGrowthDayCounts, VocabularyGrowthRange } from "../../../../data/learning/vocabularyGrowth";
import { loadVocabularyGrowthHistory, filterVocabularyGrowthByRange } from "./loadVocabularyGrowthHistory";
import { VocabularyGrowthChart } from "./VocabularyGrowthChart";
import "./vocabulary-growth-section.scss";

const RANGE_OPTIONS: { value: VocabularyGrowthRange; labelKey: string }[] = [
  { value: "7d", labelKey: "userProfile.vocabularyGrowthSection.ranges.sevenDays" },
  { value: "30d", labelKey: "userProfile.vocabularyGrowthSection.ranges.thirtyDays" },
  { value: "90d", labelKey: "userProfile.vocabularyGrowthSection.ranges.ninetyDays" },
  { value: "all", labelKey: "userProfile.vocabularyGrowthSection.ranges.allTime" },
];

const DEFAULT_RANGE: VocabularyGrowthRange = "30d";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; history: VocabularyGrowthDayCounts[]; todayISO: string }
  | { status: "error" };

interface VocabularyGrowthSectionProps {
  // Same shared-profile-load contract as MilestonesSection — no profile
  // fetched here.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  onStartNewWordStudy?: () => void;
}

// The Progress page's second section, below Milestones — a real,
// Supabase-backed multi-series line chart (Learning/Known/Mastered over
// time). Owns its own current-learning-date fetch (getCurrentLearningDate)
// the same way MilestonesSection does, since it has no sibling component
// to share that date with. Loads the *full* available history exactly
// once per language/session (loadVocabularyGrowthHistory.ts); switching
// the 7/30/90/all range re-slices that same already-loaded array locally
// (filterVocabularyGrowthByRange) — never a second Supabase round trip.
export function VocabularyGrowthSection({ userProfile, isProfileLoaded, onStartNewWordStudy }: VocabularyGrowthSectionProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  const [range, setRange] = useState<VocabularyGrowthRange>(DEFAULT_RANGE);

  const targetLanguage = userProfile.practiceLanguage;

  useEffect(() => {
    if (!authUserId) {
      setState({ status: "ready", history: [], todayISO: "" });
      return;
    }

    if (!isProfileLoaded) {
      setState({ status: "loading" });
      return;
    }

    if (!targetLanguage) {
      setState({ status: "ready", history: [], todayISO: "" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "ready", history: [], todayISO: "" });
          return;
        }

        const todayISO = await getCurrentLearningDate(session);
        const history = await loadVocabularyGrowthHistory({ session, targetLanguage, todayISO });
        if (cancelled) return;
        setState({ status: "ready", history, todayISO });
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "VocabularyGrowthSection: failed to load vocabulary growth history.",
          describeSupabaseError("loadVocabularyGrowthHistory", error),
        );
        setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
    // targetLanguage changing re-fetches (a different language's history is
    // a genuinely different dataset — see the task brief's "switch target
    // language and confirm chart data changes" manual-verification step).
    // range is deliberately NOT a dependency: it only re-slices the
    // already-loaded fullHistory below, never triggers a new load.
  }, [authUserId, isProfileLoaded, targetLanguage, retryToken]);

  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const fullHistory = state.status === "ready" ? state.history : [];
  const todayISO = state.status === "ready" ? state.todayISO : "";
  const isEmpty = state.status === "ready" && fullHistory.length === 0;

  const visibleData = useMemo(
    () => (fullHistory.length > 0 ? filterVocabularyGrowthByRange(fullHistory, range, todayISO) : []),
    [fullHistory, range, todayISO],
  );

  return (
    <section className="vocabulary-growth-section" aria-label={t("userProfile.vocabularyGrowthSection.title")}>
      <header className="vocabulary-growth-section__header">
        <div className="vocabulary-growth-section__title-row">
          <span className="vocabulary-growth-section__icon" aria-hidden="true">
            <TrendingUp size={16} strokeWidth={2} />
          </span>
          <h2 className="vocabulary-growth-section__title">{t("userProfile.vocabularyGrowthSection.title")}</h2>
        </div>
        <p className="vocabulary-growth-section__subtitle">{t("userProfile.vocabularyGrowthSection.subtitle")}</p>
      </header>

      {!isLoading && !isError && !isEmpty ? (
        <div className="vocabulary-growth-section__ranges" role="group" aria-label={t("userProfile.vocabularyGrowthSection.title")}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`vocabulary-growth-section__range-button ${
                range === option.value ? "vocabulary-growth-section__range-button--active" : ""
              }`}
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="vocabulary-growth-section__panel">
        {isLoading ? (
          <span className="vocabulary-growth-section__skeleton" aria-hidden="true" aria-busy="true" />
        ) : isError ? (
          <div className="vocabulary-growth-section__error" role="status">
            <p className="vocabulary-growth-section__error-text">{t("userProfile.vocabularyGrowthSection.loadError")}</p>
            <button
              type="button"
              className="vocabulary-growth-section__error-retry"
              onClick={() => setRetryToken((token) => token + 1)}
            >
              {t("userProfile.vocabularyGrowthSection.retryButton")}
            </button>
          </div>
        ) : isEmpty ? (
          <div className="vocabulary-growth-section__empty" role="status">
            <p className="vocabulary-growth-section__empty-title">{t("userProfile.vocabularyGrowthSection.emptyState.title")}</p>
            <p className="vocabulary-growth-section__empty-message">{t("userProfile.vocabularyGrowthSection.emptyState.message")}</p>
            {onStartNewWordStudy ? (
              <button type="button" className="vocabulary-growth-section__empty-action" onClick={onStartNewWordStudy}>
                {t("userProfile.vocabularySection.emptyStates.noWordsYetAction")}
              </button>
            ) : null}
          </div>
        ) : (
          <VocabularyGrowthChart data={visibleData} />
        )}
      </div>
    </section>
  );
}
