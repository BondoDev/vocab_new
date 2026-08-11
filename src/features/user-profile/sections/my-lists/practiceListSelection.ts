// Pure selection logic for Practice List (My Lists Phase 3): turning a
// list's membership rows into a concrete, ordered word_id sequence to hand
// to the existing Custom Practice engine (VocabularyPractice.tsx's
// restrictToConceptIds prop). No React, no Supabase, no browser globals —
// safe to load directly via `node --experimental-strip-types` for
// scripts/tests/vocabulary/test-practice-list-selection.mjs.
//
// Deliberately reads ONLY the memberships passed in — Learning/Known/
// Mastered/Not-studied status never influences quantity options or
// selection order; every list word is equal for Practice List purposes
// (see supabase/README.md's "My Lists Corrective Phase" section on why
// membership itself is already independent of user_word_progress).

// The three fixed quantity presets Practice List offers, before filtering
// out any that would equal or exceed the list's own size (see
// buildQuantityOptions below for why "equal" is excluded too).
const FIXED_QUANTITY_CANDIDATES = [10, 20, 30] as const;

export type PracticeQuantityOption =
  | { kind: "fixed"; value: number }
  | { kind: "all"; value: number };

// One option per usable choice, always ending in the "all" option (present
// for any list size ≥ 1). A fixed candidate is included only when it's
// strictly smaller than the list — a candidate equal to (or larger than)
// the list size would select exactly the same words "All {count}" already
// selects, so it's omitted rather than shown as a confusing duplicate
// (e.g. a 10-word list shows only "All 10", never "10" AND "All 10").
// Returns an empty array for a zero-word list — Practice List has nothing
// to offer at all in that case (see the "no words to practise" state this
// feeds into).
export function buildQuantityOptions(listSize: number): PracticeQuantityOption[] {
  if (listSize <= 0) {
    return [];
  }

  const fixedOptions: PracticeQuantityOption[] = FIXED_QUANTITY_CANDIDATES.filter(
    (candidate) => candidate < listSize,
  ).map((value) => ({ kind: "fixed", value }));

  return [...fixedOptions, { kind: "all", value: listSize }];
}

// Preferred default: the "10" fixed option when the list has at least 10
// words (i.e. buildQuantityOptions actually produced one), otherwise the
// "all" option (always present for any non-empty list). Returns null only
// for a zero-word list, mirroring buildQuantityOptions' own empty-array
// case — callers already gate Practice List's availability on list size,
// so this is a defensive fallback, not an expected UI state.
export function getDefaultQuantityOption(
  options: readonly PracticeQuantityOption[],
): PracticeQuantityOption | null {
  const tenWords = options.find((option) => option.kind === "fixed" && option.value === 10);
  if (tenWords) {
    return tenWords;
  }
  return options.find((option) => option.kind === "all") ?? null;
}

export type PracticeWordOrder = "random" | "listOrder";

export interface PracticeListMembershipLike {
  wordId: string;
  createdAt: string;
}

// Selects up to `quantity` word ids from `memberships`, per `order`:
//   - "listOrder": membership order (created_at ascending — the order a
//     word was added to the list), taking the first `quantity`.
//   - "random": every membership is eligible with equal probability
//     (Fisher-Yates shuffle of a copy, then the first `quantity`) — never
//     influenced by word_state, matching this module's own header note.
// Quantity greater than the list size is clamped to the list size (the
// "All" option's own value already equals list size exactly, so this only
// guards a caller passing an out-of-range number directly). Never returns
// a duplicate word id — sampling is always without replacement.
export function selectListPracticeWords(
  memberships: readonly PracticeListMembershipLike[],
  quantity: number,
  order: PracticeWordOrder,
  randomFn: () => number = Math.random,
): string[] {
  const orderedByCreatedAt = [...memberships].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const wordIds = orderedByCreatedAt.map((membership) => membership.wordId);
  const clampedQuantity = Math.max(0, Math.min(quantity, wordIds.length));

  if (order === "listOrder") {
    return wordIds.slice(0, clampedQuantity);
  }

  // Fisher-Yates shuffle of a copy — sampling without replacement; taking
  // every element (clampedQuantity === wordIds.length, the "Random + All"
  // case) yields a full shuffle, exactly as required.
  const shuffled = [...wordIds];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, clampedQuantity);
}

export interface PracticeListSetupSummary {
  wordCount: number;
  order: PracticeWordOrder;
  exerciseCount: number;
}

// Derives the setup dialog's summary line's raw values (word count, order,
// exercise count) — kept pure/UI-free so the component only has to
// interpolate translated copy around these three numbers/enum, never
// compute them inline in JSX.
export function buildPracticeListSetupSummary(
  quantityOption: PracticeQuantityOption | null,
  order: PracticeWordOrder,
  exerciseCount: number,
): PracticeListSetupSummary {
  return {
    wordCount: quantityOption?.value ?? 0,
    order,
    exerciseCount,
  };
}
