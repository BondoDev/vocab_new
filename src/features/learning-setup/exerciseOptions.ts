import type { ExerciseId } from "../../exercises/exerciseIds";

interface ExerciseGroupItem {
  id: ExerciseId;
  description: string;
}

interface ExerciseGroup {
  id: string;
  title: string;
  items: ExerciseGroupItem[];
}

// Setup-only presentation metadata (grouping, titles, descriptions, display
// order) — item ids are compile-time checked against the canonical
// ExerciseId union, but the grouping/order/copy here is not derived from it
// and is not shared with practice.
export const exerciseGroups: ExerciseGroup[] = [
  {
    id: "recall",
    title: "Recall exercises",
    items: [
      {
        id: "wordTyping",
        description: "Type the full word from memory.",
      },
      {
        id: "halfWritten",
        description: "Fill in missing letters.",
      },
    ],
  },
  {
    id: "construction",
    title: "Construction exercises",
    items: [
      {
        id: "brokenWord",
        description: "Build the word from pieces.",
      },
    ],
  },
  {
    id: "association",
    title: "Association exercises",
    items: [
      {
        id: "connectWords",
        description: "Match words with translations.",
      },
    ],
  },
  {
    id: "listening",
    title: "Listening",
    items: [
      {
        id: "listening",
        description: "Select what you hear.",
      },
    ],
  },
];
export const exerciseItems = exerciseGroups.flatMap((group) => group.items);
