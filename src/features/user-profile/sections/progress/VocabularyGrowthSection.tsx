import { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import type { UserProfile } from "../../../../lib/userProfile";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
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
  // The shared learning date and active-language word-progress rows, owned
  // and fetched exactly once by UserProfileDashboardPage's
  // useProfileSharedProgressData (see that hook's own header) — this
  // section no longer calls getCurrentLearningDate or readUserWordProgress
  // itself. Still owns its own readVocabularyGrowthEvents fetch (see
  // loadVocabularyGrowthHistory.ts).
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  onRetryLearningDate: () => void;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onRetryWordProgress: () => void;
  onStartNewWordStudy?: () => void;
}

// The Progress page's second section, below Milestones — a real,
// Supabase-backed multi-series line chart (Learning/Known/Mastered over
// time). Loads the *full* available history exactly once per language/
// session (loadVocabularyGrowthHistory.ts); switching the 7/30/90/all
// range re-slices that same already-loaded array locally
// (filterVocabularyGrowthByRange) — never a second Supabase round trip.
export function VocabularyGrowthSection({
  userProfile,
  isProfileLoaded,
  todayISO,
  todayISOStatus,
  onRetryLearningDate,
  wordProgressRows,
  wordProgressStatus,
  onRetryWordProgress,
  onStartNewWordStudy,
}: VocabularyGrowthSectionProps) {
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

    if (!isProfileLoaded || todayISOStatus === "loading" || wordProgressStatus === "loading") {
      setState({ status: "loading" });
      return;
    }

    if (todayISOStatus === "error" || wordProgressStatus === "error") {
      // One of the two shared sources genuinely failed — surface this
      // section's own error/retry UI rather than presenting an empty
      // result as though it were successfully loaded data.
      setState({ status: "error" });
      return;
    }

    if (!targetLanguage || !todayISO) {
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

        const history = await loadVocabularyGrowthHistory({
          session,
          progressRows: wordProgressRows,
          targetLanguage,
          todayISO,
        });
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
  }, [authUserId, isProfileLoaded, targetLanguage, todayISO, todayISOStatus, wordProgressRows, wordProgressStatus, retryToken]);

  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const fullHistory = state.status === "ready" ? state.history : [];
  const chartTodayISO = state.status === "ready" ? state.todayISO : "";
  const isEmpty = state.status === "ready" && fullHistory.length === 0;

  const visibleData = useMemo(
    () => (fullHistory.length > 0 ? filterVocabularyGrowthByRange(fullHistory, range, chartTodayISO) : []),
    [fullHistory, range, chartTodayISO],
  );

  // A single Retry covers whichever of the three sources actually failed
  // (the shared date, the shared word-progress rows, or this section's own
  // readVocabularyGrowthEvents) — retrying an already-"ready" shared source
  // is a harmless no-visible-change background refresh (see
  // useProfileSharedProgressData.ts's preserve-on-refresh behavior).
  const handleRetry = () => {
    onRetryLearningDate();
    onRetryWordProgress();
    setRetryToken((token) => token + 1);
  };

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
              onClick={handleRetry}
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
