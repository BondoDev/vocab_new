import { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import type { UserProfile } from "../../../../lib/userProfile";
import type { UserWordProgressFullRow, VocabularyGrowthEventRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { SharedLazyResourceStatus } from "../useProfileSharedDailyStats";
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
  // itself.
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  onRetryLearningDate: () => void;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onRetryWordProgress: () => void;
  // Fetch-audit Phase 1: the shared, lazily-loaded vocabulary-growth-events
  // resource (see useProfileSharedDailyStats.ts) — requested exactly once
  // here (see the mount effect below), shared as-is with Dashboard's Words
  // Learned card when the user switches there instead of either fetching
  // its own copy on mount (see the fetch audit's FETCH-002).
  vocabularyGrowthStatus: SharedLazyResourceStatus;
  vocabularyGrowthEvents: VocabularyGrowthEventRow[];
  onRequestVocabularyGrowthEvents: () => void;
  onRetryVocabularyGrowthEvents: () => void;
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
  vocabularyGrowthStatus,
  vocabularyGrowthEvents,
  onRequestVocabularyGrowthEvents,
  onRetryVocabularyGrowthEvents,
  onStartNewWordStudy,
}: VocabularyGrowthSectionProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const [range, setRange] = useState<VocabularyGrowthRange>(DEFAULT_RANGE);

  const targetLanguage = userProfile.practiceLanguage;

  // Fetch-audit Phase 1: requests the shared vocabulary-growth-events
  // resource once per mount (a no-op if Dashboard already requested it for
  // the same context — see useProfileSharedDailyStats.ts).
  useEffect(() => {
    onRequestVocabularyGrowthEvents();
  }, [onRequestVocabularyGrowthEvents]);

  // loadVocabularyGrowthHistory is now a pure, synchronous computation over
  // already-loaded rows (see that file's own header) — no fetch effect of
  // this section's own remains; only the *inputs'* statuses (shared word
  // progress, shared learning date, shared vocabulary-growth events)
  // determine loading/error/ready here. range is deliberately not part of
  // this computation at all — it only re-slices the already-computed
  // fullHistory below (see visibleData), never triggers a re-derivation.
  const state = useMemo<LoadState>(() => {
    if (!authUserId || !targetLanguage) {
      return { status: "ready", history: [], todayISO: "" };
    }

    if (!isProfileLoaded || todayISOStatus === "loading" || wordProgressStatus === "loading") {
      return { status: "loading" };
    }

    if (todayISOStatus === "error" || wordProgressStatus === "error" || !todayISO) {
      // One of the shared sources genuinely failed — surface this
      // section's own error/retry UI rather than presenting an empty
      // result as though it were successfully loaded data.
      return { status: "error" };
    }

    if (vocabularyGrowthStatus === "idle" || vocabularyGrowthStatus === "loading") {
      return { status: "loading" };
    }

    if (vocabularyGrowthStatus === "error") {
      return { status: "error" };
    }

    const history = loadVocabularyGrowthHistory({
      progressRows: wordProgressRows,
      eventRows: vocabularyGrowthEvents,
      todayISO,
    });
    return { status: "ready", history, todayISO };
  }, [
    authUserId,
    isProfileLoaded,
    targetLanguage,
    todayISO,
    todayISOStatus,
    wordProgressRows,
    wordProgressStatus,
    vocabularyGrowthStatus,
    vocabularyGrowthEvents,
  ]);

  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const fullHistory = state.status === "ready" ? state.history : [];
  const chartTodayISO = state.status === "ready" ? state.todayISO : "";
  const isEmpty = state.status === "ready" && fullHistory.length === 0;

  const visibleData = useMemo(
    () => (fullHistory.length > 0 ? filterVocabularyGrowthByRange(fullHistory, range, chartTodayISO) : []),
    [fullHistory, range, chartTodayISO],
  );

  // A single Retry covers whichever of the three shared sources actually
  // failed (the shared date, the shared word-progress rows, or the shared
  // vocabulary-growth-events resource) — retrying an already-"ready"
  // shared source is a harmless no-visible-change background refresh (see
  // useProfileSharedProgressData.ts's/useProfileSharedDailyStats.ts's own
  // preserve-on-refresh behavior).
  const handleRetry = () => {
    onRetryLearningDate();
    onRetryWordProgress();
    onRetryVocabularyGrowthEvents();
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
