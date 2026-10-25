// Read-only check for the session-complete screen's Review Words suggestion:
// how many of the learner's words are actually *due* (past next_review_at)
// right now. Uses the same progress read and the same selection engine as
// Review Words (readUserWordProgressForReview + selectReviewQueue) — no
// separate review rules — but skips vocabulary resolution, since only the
// count is needed.
//
// Deliberately the overdue count, not the size of the queue Review Words
// would build: that queue also tops up with weighted-random not-yet-due
// words, so it is almost never empty, and quoting its size would imply the
// words just studied are already due for review.
import type { StoredSupabaseSession } from "../../lib/supabaseAuth";
import { readUserWordProgressForReview } from "../../lib/newWordProgress";
import { selectReviewQueue } from "../../data/learning/reviewQueue";

export async function loadDueReviewCount(
  session: StoredSupabaseSession,
  targetLanguage: string,
  now: Date = new Date(),
): Promise<number> {
  const progressRows = await readUserWordProgressForReview(session, targetLanguage);
  if (progressRows.length === 0) {
    return 0;
  }
  return selectReviewQueue({ progressRows, now }).metadata.overdueCandidateCount;
}
