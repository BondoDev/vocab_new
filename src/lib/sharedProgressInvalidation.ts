// Narrow invalidation signal for the profile dashboard's shared
// active-language user_word_progress rows (see
// src/features/user-profile/sections/useProfileSharedProgressData.ts).
// Module-scope pub/sub only — no React, no new dependency — so it can be
// called from newWordProgress.ts (the only module that knows about
// user_word_progress/user_daily_stats) without importing anything from the
// user-profile feature.
//
// completeNewWordStudy and completeWordReview are the only two writes that
// change user_word_progress.word_state for the signed-in user; both call
// notifyWordProgressChanged() once their write succeeds. Any subscriber
// (currently just useProfileSharedProgressData) treats this as "the active
// language's word-progress rows may be stale" and re-fetches them in the
// background — never a broader invalidation (the authoritative learning
// date and user_daily_stats-derived reads are untouched by this signal).
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyWordProgressChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeWordProgressChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
