import type { ReactNode } from "react";
import { ListPlus } from "lucide-react";
import {
  VocabularyTable,
  VocabularyTableBadge,
  VocabularyTableHighlight,
  VocabularyTableMissing,
  type VocabularyTableColumn,
} from "../../../components/vocabulary-table/VocabularyTable";
import { findInflectedWordRanges } from "../../../../features/practice/utils/highlightInflectedWords";
import type { FullVocabularyListContentEntry } from "../../../../data/seo/listPages/fullVocabularyList";
import type { FullVocabularyRow } from "../../../../data/seo/listPages/fullVocabularyList/fullVocabularyListEntries";

// Full vocabulary list adapter over the shared VocabularyTable: maps this
// family's rows and JSON copy onto the table's columns. Layout, the compact
// details panel, speech, and the row menu all live in the shared component.

interface FullVocabularyTableProps {
  rows: FullVocabularyRow[];
  label: string;
  columns: FullVocabularyListContentEntry["levelPanel"]["tableColumns"];
  grammarTypes: FullVocabularyListContentEntry["grammarTypes"];
  pronounceLabel: string;
  // BCP 47 voice locale for the target language (e.g. "en-US").
  speechLang: string;
  // Adds a Translation column after Word (UI language differs from the
  // table's language).
  showTranslations: boolean;
  detailsLabel: string;
  hideLabel: string;
  // Accessible name of each row's "⋮" button ({word} token).
  rowActionsLabel: string;
  addToListLabel: string;
  onAddToList: (row: FullVocabularyRow) => void;
}

// Bolds the table word inside its example sentence as React nodes (no HTML
// injection). `languageTag` is only used for locale-aware lowercasing during
// matching, so the target language's voice locale (e.g. "en-US") serves.
function renderSentence(sentence: string, forms: string[] | undefined, languageTag: string): ReactNode {
  const ranges = forms?.length ? findInflectedWordRanges(sentence, languageTag, forms) : [];
  if (ranges.length === 0) {
    return sentence;
  }
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const range of ranges) {
    parts.push(sentence.slice(lastIndex, range.start));
    parts.push(
      <VocabularyTableHighlight key={range.start}>{sentence.slice(range.start, range.end)}</VocabularyTableHighlight>,
    );
    lastIndex = range.end;
  }
  parts.push(sentence.slice(lastIndex));
  return parts;
}

const getRowKey = (row: FullVocabularyRow) => row.conceptId;
const getWord = (row: FullVocabularyRow) => row.word;

export function FullVocabularyTable({
  rows,
  label,
  columns,
  grammarTypes,
  pronounceLabel,
  speechLang,
  showTranslations,
  detailsLabel,
  hideLabel,
  rowActionsLabel,
  addToListLabel,
  onAddToList,
}: FullVocabularyTableProps) {
  const grammarTypeLabel = (row: FullVocabularyRow) =>
    grammarTypes[row.type as keyof typeof grammarTypes] ?? row.type;

  const tableColumns: VocabularyTableColumn<FullVocabularyRow>[] = [
    ...(showTranslations
      ? [
          {
            key: "translation",
            header: columns.translation,
            placement: "primary" as const,
            render: (row: FullVocabularyRow) => row.translation ?? <VocabularyTableMissing />,
          },
        ]
      : []),
    {
      key: "definition",
      header: columns.definition,
      placement: "detail",
      tone: "muted",
      render: (row) => row.definition,
    },
    {
      key: "sentence",
      header: columns.sentence,
      placement: "detail",
      tone: "sentence",
      render: (row) => renderSentence(row.sentence, row.sentenceForms, speechLang),
    },
    {
      key: "grammarType",
      header: columns.grammarType,
      placement: "detail",
      width: "narrow",
      detailStyle: "badge",
      render: (row) => <VocabularyTableBadge>{grammarTypeLabel(row)}</VocabularyTableBadge>,
      renderDetail: (row) => <VocabularyTableBadge compact>{grammarTypeLabel(row)}</VocabularyTableBadge>,
    },
  ];

  return (
    <VocabularyTable
      rows={rows}
      getRowKey={getRowKey}
      getWord={getWord}
      wordLang={speechLang}
      columns={tableColumns}
      labels={{
        number: columns.number,
        word: columns.word,
        details: detailsLabel,
        hide: hideLabel,
        actions: columns.actions,
        pronounce: pronounceLabel,
        rowActions: rowActionsLabel,
      }}
      rowActions={[
        { key: "addToList", label: addToListLabel, icon: <ListPlus aria-hidden="true" />, onSelect: onAddToList },
      ]}
      ariaLabel={label}
      idPrefix="full-vocabulary"
    />
  );
}
