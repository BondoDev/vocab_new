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
//   - notifyVocabularyListsChanged/subscribeVocabularyListsChanged — the
//     signed-in user's vocabulary lists + list-word memberships (see
//     src/features/user-profile/sections/useProfileSharedMyLists.ts).
//   - notifyLearningDateChanged/subscribeLearningDateChanged — the shared
//     authoritative current learning date (see the same
//     useProfileSharedProgressData.ts). Fired only by a successful
//     update_user_timezone save (SettingsSection.tsx's handleSaveTimezone)
//     — the one write that can actually change what get_current_learning_date
//     resolves to for an already-loaded session. Root-cause investigation,
//     2026-08-15: this signal replaces watching the raw `timezone` value as
//     a fetch-triggering effect dependency, which fired a genuine second
//     get_current_learning_date call on most cold loads — not from a real
//     timezone mutation, but because `timezone` itself transitions from an
//     empty placeholder to its real persisted value partway through
//     useUserProfileLoad's own async resolution (a client-side render
//     detail get_current_learning_date's server-side resolution never
//     depended on in the first place — see learningDate.ts: the RPC takes
//     no client-supplied timezone parameter at all). Using an explicit
//     signal instead of the raw prop means only a genuine, successful
//     mutation of the *persisted* timezone triggers a refresh — mirroring
//     every other signal in this file, and the sibling word-progress effect
//     two effects below in that same hook, which already uses exactly this
//     pattern (subscribeWordProgressChanged) instead of watching a raw
//     value.
//
// Each is module-scope pub/sub only — no React, no new dependency — so any
// of them can be called from a lib mutation module (newWordProgress.ts,
// customPracticeProgress.ts) without importing anything from the
// user-profile feature.
//
// These are deliberately separate signals, not one combined "something
// changed" event: a write that only affects one dataset (e.g.
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

// Fired only by writers OTHER than MyListsSection's own create/rename/
// delete/add-words/remove-word handlers — those already update
// useProfileSharedMyLists' cached lists/memberships precisely in place
// (the mutation response tells them exactly what changed), so they never
// need this signal. The one other writer today is AddWordToListDialog
// (src/features/user-profile/sections/vocabulary/), the Vocabulary page's
// "Add to list" popup: it can create a list and add/remove this word's own
// membership while the My Lists cache sits mounted above it, unvisited.
// addWordsToVocabularyList's own RPC response never includes the new
// membership row's created_at (see vocabularyLists.ts's own header — My
// Lists' own add-words flow works around this with a small authoritative
// re-read of just that one list), so a dialog that only has a word_id/
// already_added pair cannot patch the cache precisely; it fires this
// broad-but-narrow (only this resource, not word-progress/daily-stats/
// vocabulary-growth) signal instead. useProfileSharedMyLists treats it as
// "the cached lists/memberships may be stale" and refetches both in the
// background, but only for a context it has actually already loaded/been
// asked to load — never a premature first fetch.
const vocabularyListsChannel = createChannel();
export function notifyVocabularyListsChanged(): void {
  vocabularyListsChannel.notify();
}
export function subscribeVocabularyListsChanged(listener: Listener): () => void {
  return vocabularyListsChannel.subscribe(listener);
}

// Fired only by a successful update_user_timezone save (SettingsSection.tsx)
// — see this file's own header for the full root-cause reasoning this
// signal replaces (watching the raw `timezone` prop as an effect
// dependency). useProfileSharedProgressData.ts treats this as "the
// authoritative learning date may now resolve differently server-side" and
// re-fetches it in the background for whichever authUserId is currently
// loaded.
const learningDateChannel = createChannel();
export function notifyLearningDateChanged(): void {
  learningDateChannel.notify();
}
export function subscribeLearningDateChanged(listener: Listener): () => void {
  return learningDateChannel.subscribe(listener);
}
