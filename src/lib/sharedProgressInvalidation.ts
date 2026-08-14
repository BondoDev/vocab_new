// Narrow invalidation signals for the profile dashboard's shared, lazily-
// loaded datasets:
//
//   - notifyWordProgressChanged/subscribeWordProgressChanged — the active-
//     language user_word_progress rows (see
//     src/features/user-profile/sections/useProfileSharedProgressData.ts).
//   - notifyDailyStatsChanged/subscribeDailyStatsChanged — the unbounded
//     user_daily_stats rows (see
//     src/features/user-profile/sections/useProfileSharedDailyStats.ts).
//   - notifyVocabularyGrowthChanged/subscribeVocabularyGrowthChanged — the
//     review_events-derived vocabulary-growth events (see the same file).
//
// Each is module-scope pub/sub only — no React, no new dependency — so any
// of them can be called from a lib mutation module (newWordProgress.ts,
// customPracticeProgress.ts) without importing anything from the
// user-profile feature.
//
// These three are deliberately separate signals, not one combined
// "something changed" event: a write that only affects one dataset (e.g.
// completeCustomPracticeWord, which only touches user_daily_stats) must not
// force an unrelated resource (vocabulary-growth events, untouched by that
// write) to refetch on its next request. See each mutation's own call site
// for exactly which signal(s) it fires and why — the fetch audit's own
// invalidation-matrix section documents the full mapping.
type Listener = () => void;

function createChannel() {
  const listeners = new Set<Listener>();
  return {
    notify(): void {
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// completeNewWordStudy/completeWordReview (src/lib/newWordProgress.ts) are
// the only two writes that change user_word_progress.word_state for the
// signed-in user; both call notifyWordProgressChanged() once their write
// succeeds. Any subscriber (currently just useProfileSharedProgressData)
// treats this as "the active language's word-progress rows may be stale"
// and re-fetches them in the background — never a broader invalidation.
const wordProgressChannel = createChannel();
export function notifyWordProgressChanged(): void {
  wordProgressChannel.notify();
}
export function subscribeWordProgressChanged(listener: Listener): () => void {
  return wordProgressChannel.subscribe(listener);
}

// Fired by every write that changes a user_daily_stats row for the signed-in
// user: completeNewWordStudy, completeWordReview, completeCustomPracticeWord
// (src/lib/customPracticeProgress.ts), resetLearningLanguageProgress (call
// site: SettingsSection.tsx), and updateDailyGoal (call site:
// DailyGoalSelector.tsx). Any subscriber (useProfileSharedDailyStats.ts)
// treats this as "the shared unbounded user_daily_stats rows may be stale"
// and re-fetches them in the background, for whichever (authUserId,
// targetLanguage) context is currently cached.
const dailyStatsChannel = createChannel();
export function notifyDailyStatsChanged(): void {
  dailyStatsChannel.notify();
}
export function subscribeDailyStatsChanged(listener: Listener): () => void {
  return dailyStatsChannel.subscribe(listener);
}

// Fired only by writes that change review_events for the signed-in user:
// completeWordReview and resetLearningLanguageProgress. completeNewWordStudy
// and completeCustomPracticeWord never touch review_events (see each
// function's own call-site comment), so neither fires this — the
// vocabulary-growth chart's "words" input is already covered by
// notifyWordProgressChanged/the shared word-progress rows, and firing this
// signal for a write that didn't actually change any event would force an
// unnecessary refetch of data that hasn't changed.
const vocabularyGrowthChannel = createChannel();
export function notifyVocabularyGrowthChanged(): void {
  vocabularyGrowthChannel.notify();
}
export function subscribeVocabularyGrowthChanged(listener: Listener): () => void {
  return vocabularyGrowthChannel.subscribe(listener);
}
