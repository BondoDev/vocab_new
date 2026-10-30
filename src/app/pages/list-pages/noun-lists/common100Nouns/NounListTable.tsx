import { useSyncExternalStore, type ReactNode } from "react";
import { ListPlus, Volume2 } from "lucide-react";
import { Link } from "react-router-dom";
import { findInflectedWordRanges } from "../../../../../features/practice/utils/highlightInflectedWords";
import "./noun-list-table.scss";

// Word table of the 100-most-common-nouns pages. Page-owned rather than the
// shared VocabularyTable because its phone layout differs: instead of moving
// definition and sentence behind a per-row Details toggle, each row reflows
// (CSS grid, below 700px) into three short lines — number, word and audio;
// then definition; then sentence — so all 100 entries stay readable without
// tapping. Desktop is an ordinary fixed-layout table.
//
// Words are grouped by category: one <tbody> per category, opened by a
// full-width header row (th scope="rowgroup") that names the group, so the
// grouping is part of the table structure rather than a visual divider only.
//
// The phone layout changes the table elements' `display`, which makes some
// browsers drop their implicit table semantics, so every element carries an
// explicit ARIA table role; the header row is visually hidden there (never
// display:none) so cells keep their column headers for screen readers.
//
// Every row is server-rendered for SEO, so per-cell classes are short (nlt-*
// in noun-list-table.scss) and the audio button — which has nothing to
// index — renders only after hydration. It sits after the word so its
// arrival never shifts the word itself.
//
// The last column holds each row's "Add to list" button. The table only
// reports the click; the page owns the sign-in and list-dialog flow.

export interface NounListTableRow {
  key: string;
  // Position in the whole list; numbering runs across groups.
  number: number;
  word: string;
  // The word's detail page; null renders the word as plain text.
  href: string | null;
  // Present only when the page shows a translation column.
  translation?: string | null;
  definition: string | null;
  sentence: string | null;
  // Forms of the word to emphasise inside `sentence`.
  sentenceForms: string[];
}

export interface NounListTableGroup {
  key: string;
  // Display label of the category.
  label: string;
  rows: NounListTableRow[];
}

export interface NounListTableLabels {
  // Accessible name of the table.
  table: string;
  number: string;
  word: string;
  translation: string;
  definition: string;
  sentence: string;
  // Accessible name of each row's audio button ({word} token).
  pronounce: string;
  // Header of the add-to-list column (visually hidden).
  addToList: string;
  // Accessible name of each row's add-to-list button ({word} token).
  addToListWord: string;
}

export interface NounListTableProps {
  groups: NounListTableGroup[];
  labels: NounListTableLabels;
  showTranslations: boolean;
  // BCP 47 tag of the words' language: speech voice, `lang` attribute, and
  // locale-aware matching of the sentence highlight.
  wordLang: string;
  onAddToList: (row: NounListTableRow) => void;
}

const subscribeToNothing = () => () => {};

// cancel() first so rapid clicks don't queue a backlog of words.
function speakWord(word: string, lang: string) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}

// Emphasises the word inside its sentence as React nodes (no HTML injection).
function renderSentence(
  sentence: string,
  forms: string[],
  languageTag: string,
): ReactNode {
  const ranges =
    forms.length > 0
      ? findInflectedWordRanges(sentence, languageTag, forms)
      : [];
  if (ranges.length === 0) {
    return sentence;
  }
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const range of ranges) {
    parts.push(sentence.slice(lastIndex, range.start));
    parts.push(
      <strong key={range.start} className="nlt-hl">
        {sentence.slice(range.start, range.end)}
      </strong>,
    );
    lastIndex = range.end;
  }
  parts.push(sentence.slice(lastIndex));
  return parts;
}

const MISSING = <span className="nlt-missing">—</span>;

export function NounListTable({
  groups,
  labels,
  showTranslations,
  wordLang,
  onAddToList,
}: NounListTableProps) {
  // False on the server and the first client render (so hydration matches),
  // then the browser's real capability; no speech support means no button.
  const canSpeak = useSyncExternalStore(
    subscribeToNothing,
    () => "speechSynthesis" in window,
    () => false,
  );
  const columnCount = showTranslations ? 6 : 5;

  return (
    <div className="nlt">
      <table
        role="table"
        aria-label={labels.table}
        className={
          showTranslations ? "nlt-table nlt-table--translated" : "nlt-table"
        }
      >
        {/* Column proportions; the phone layout ignores them. */}
        <colgroup>
          <col className="nlt-col-num" />
          <col className="nlt-col-word" />
          {showTranslations ? <col className="nlt-col-translation" /> : null}
          <col className="nlt-col-definition" />
          <col className="nlt-col-sentence" />
          <col className="nlt-col-add" />
        </colgroup>
        <thead role="rowgroup" className="nlt-head">
          <tr role="row">
            <th role="columnheader" scope="col" className="nlt-num">
              {labels.number}
            </th>
            <th role="columnheader" scope="col">
              {labels.word}
            </th>
            {showTranslations ? (
              <th role="columnheader" scope="col">
                {labels.translation}
              </th>
            ) : null}
            <th role="columnheader" scope="col">
              {labels.definition}
            </th>
            <th role="columnheader" scope="col">
              {labels.sentence}
            </th>
            <th role="columnheader" scope="col" className="nlt-add">
              <span className="nlt-sr-only">{labels.addToList}</span>
            </th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.key} role="rowgroup" className="nlt-group">
            <tr role="row" className="nlt-group-row">
              <th
                role="rowheader"
                scope="rowgroup"
                colSpan={columnCount}
                className="nlt-group-label"
              >
                {group.label}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.key} role="row" className="nlt-row">
                <td role="cell" className="nlt-num">
                  {row.number}
                </td>
                <th role="rowheader" scope="row" className="nlt-word">
                  <span className="nlt-word-inner">
                    {row.href ? (
                      <Link to={row.href} lang={wordLang} className="nlt-word-text nlt-word-link">
                        {row.word}
                      </Link>
                    ) : (
                      <span lang={wordLang} className="nlt-word-text">
                        {row.word}
                      </span>
                    )}
                    {canSpeak ? (
                      <button
                        type="button"
                        aria-label={labels.pronounce
                          .split("{word}")
                          .join(row.word)}
                        onClick={() => speakWord(row.word, wordLang)}
                        className="nlt-speak"
                      >
                        <Volume2 aria-hidden="true" />
                      </button>
                    ) : null}
                  </span>
                </th>
                {showTranslations ? (
                  <td role="cell" className="nlt-translation">
                    {row.translation ?? MISSING}
                  </td>
                ) : null}
                <td role="cell" className="nlt-definition">
                  {row.definition ?? MISSING}
                </td>
                <td role="cell" lang={wordLang} className="nlt-sentence">
                  {row.sentence
                    ? renderSentence(row.sentence, row.sentenceForms, wordLang)
                    : MISSING}
                </td>
                <td role="cell" className="nlt-add">
                  <button
                    type="button"
                    aria-label={labels.addToListWord.split("{word}").join(row.word)}
                    title={labels.addToList}
                    onClick={() => onAddToList(row)}
                    className="nlt-add-button"
                  >
                    <ListPlus aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
