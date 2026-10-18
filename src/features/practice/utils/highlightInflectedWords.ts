type InflectedEntry = Record<string, unknown>;

const WORD_CHAR_REGEX = /[\p{L}\p{N}\p{M}]/u;
const LETTER_CHAR_REGEX = /[\p{L}\p{M}]/u;

const isWordChar = (char: string): boolean =>
  WORD_CHAR_REGEX.test(char);

const isWholeWordMatch = (
  sentence: string,
  start: number,
  end: number,
  enforceLetterBoundary: boolean,
): boolean => {
  const before = start > 0 ? sentence[start - 1] : "";
  const after = end < sentence.length ? sentence[end] : "";

  if (enforceLetterBoundary) {
    if (before && LETTER_CHAR_REGEX.test(before)) return false;
    if (after && LETTER_CHAR_REGEX.test(after)) return false;
    return true;
  }

  if (before && isWordChar(before)) return false;
  if (after && isWordChar(after)) return false;
  return true;
};

export const extractInflectedForms = (entry: InflectedEntry): string[] => {
  const forms: string[] = [];

  Object.entries(entry).forEach(([key, value]) => {
    if (!/inflected/i.test(key)) return;
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    forms.push(trimmed);
  });

  return forms;
};

export interface InflectedWordRange {
  start: number;
  end: number;
}

// Whole-word, case-insensitive occurrences of any of `forms` in `sentence`,
// sorted and non-overlapping (at an overlap the longer, earlier match wins).
// Shared by highlightInflectedWords (HTML string for the practice flow) and
// callers that render React nodes instead of injecting HTML (e.g. the full
// vocabulary list tables).
export const findInflectedWordRanges = (
  sentence: string,
  languageCode: string,
  forms: Iterable<string>,
): InflectedWordRange[] => {
  if (!sentence) return [];

  const sentenceLower = sentence.toLocaleLowerCase(languageCode);
  const matches: InflectedWordRange[] = [];

  new Set(forms).forEach((form) => {
    const formLower = form.toLocaleLowerCase(languageCode);
    if (!formLower) return;

    let searchIndex = 0;
    while (searchIndex < sentenceLower.length) {
      const foundIndex = sentenceLower.indexOf(formLower, searchIndex);
      if (foundIndex === -1) break;

      const endIndex = foundIndex + formLower.length;
      const enforceLetterBoundary = formLower.length <= 2;
      if (
        isWholeWordMatch(
          sentence,
          foundIndex,
          endIndex,
          enforceLetterBoundary,
        )
      ) {
        matches.push({ start: foundIndex, end: endIndex });
      }

      searchIndex = foundIndex + Math.max(formLower.length, 1);
    }
  });

  matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });

  const merged: InflectedWordRange[] = [];
  let lastEnd = -1;

  matches.forEach((match) => {
    if (match.start < lastEnd) return;
    merged.push(match);
    lastEnd = match.end;
  });

  return merged;
};

export const highlightInflectedWords = (
  sentence: string,
  languageCode: string,
  inflectedEntries: InflectedEntry[],
): string => {
  if (!sentence || !inflectedEntries?.length) return sentence;

  const forms = inflectedEntries.flatMap((entry) => extractInflectedForms(entry));
  const merged = findInflectedWordRanges(sentence, languageCode, forms);
  if (merged.length === 0) return sentence;

  let result = "";
  let lastIndex = 0;
  merged.forEach((match) => {
    result += sentence.slice(lastIndex, match.start);
    result += `<strong>${sentence.slice(match.start, match.end)}</strong>`;
    lastIndex = match.end;
  });
  result += sentence.slice(lastIndex);

  return result;
};
