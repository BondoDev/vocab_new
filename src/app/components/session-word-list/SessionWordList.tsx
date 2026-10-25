import { useState, type ReactNode } from "react";
import { ChevronDown, MoreVertical, Volume2 } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import { buildWordPath } from "../../../data/seo/wordPages/wordSlugs";
import { getUiVocabularyLanguage, isSupportedUiLanguage } from "../../../data/seo/shared/slugs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import "./session-word-list.scss";

// The vocabulary list shown on the Study New Words and Review Words
// completion screens. Presentational only: the words, every visible label,
// the speech function and each row's menu actions come from the caller, so
// this component knows nothing about how a mode tracks or persists words
// (same "caller owns data and copy" split as vocabulary-table/).
//
// Each row: listen button + the word (a link to its word page, new tab) |
// translation | part of speech | "⋮" menu. Lists longer than
// COLLAPSE_THRESHOLD show the first COLLAPSED_ROW_COUNT rows with a
// Show all toggle.

export interface SessionWordListItem {
  // Stable vocabulary concept id — the row key and the word-page id.
  conceptId: string;
  targetWord: string;
  translation?: string;
  grammarType?: string;
}

export interface SessionWordRowAction {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

export interface SessionWordListLabels {
  heading: string;
  // Caption of the part-of-speech column.
  typeColumn: string;
  // Accessible name of each row's "⋮" button, followed by ": <word>".
  moreActions: string;
  showFewer: string;
  showAll: (count: number) => string;
}

interface SessionWordListProps<Word extends SessionWordListItem> {
  words: Word[];
  // UI language codes of the studied and the learner's own language.
  practiceLanguage: string;
  yourLanguage: string;
  labels: SessionWordListLabels;
  // Unique per page; prefixes the heading/list element ids.
  idPrefix: string;
  // Omit to render no listen buttons.
  onSpeakWord?: (word: Word) => void;
  // Omit (or return []) for a row without a "⋮" menu.
  getRowActions?: (word: Word) => SessionWordRowAction[];
}

const COLLAPSE_THRESHOLD = 12;
const COLLAPSED_ROW_COUNT = 10;

// Same item styling as the shared VocabularyTable's row menu.
const ROW_MENU_ITEM_CLASS =
  "cursor-pointer gap-2.5 rounded-lg py-2 pl-2.5 pr-3 focus:bg-primary/10 focus:text-primary [&_svg]:!text-primary";

// Untranslated wordTypes.* id → title-cased raw value (same fallback as the
// learning screens), never a raw translation key.
function formatWordTypeLabel(typeId: string): string {
  return typeId
    .split(/[_-]+/g)
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function SessionWordList<Word extends SessionWordListItem>({
  words,
  practiceLanguage,
  yourLanguage,
  labels,
  idPrefix,
  onSpeakWord,
  getRowActions,
}: SessionWordListProps<Word>) {
  const { t, uiLanguage } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);

  if (words.length === 0) return null;

  // Speech synthesis is browser-dependent; without it the listen buttons
  // would silently do nothing, so they're omitted instead.
  const canSpeak = Boolean(onSpeakWord) && typeof window !== "undefined" && "speechSynthesis" in window;
  const languageName = t(`languageNames.${practiceLanguage}`);
  const nativeLanguageName = t(`languageNames.${yourLanguage}`);
  const isCollapsible = words.length > COLLAPSE_THRESHOLD;
  const visibleWords = isCollapsible && !isExpanded ? words.slice(0, COLLAPSED_ROW_COUNT) : words;
  const headingId = `${idPrefix}-heading`;
  const listId = `${idPrefix}-list`;

  // Word page in the current UI language for the studied language (same
  // URL builder as the Vocabulary page's "View details"); plain text if
  // either language is unsupported.
  const wordPagePath = (word: Word): string | null =>
    isSupportedUiLanguage(uiLanguage) && isSupportedUiLanguage(practiceLanguage)
      ? buildWordPath(uiLanguage, getUiVocabularyLanguage(practiceLanguage), word.targetWord, word.conceptId)
      : null;

  const grammarLabel = (grammarType?: string) => {
    if (!grammarType) return null;
    const translated = t(`wordTypes.${grammarType}`);
    return translated === `wordTypes.${grammarType}` ? formatWordTypeLabel(grammarType) : translated;
  };

  return (
    <section className="session-word-list" aria-labelledby={headingId}>
      <h2 id={headingId} className="session-word-list__heading">
        {labels.heading}
      </h2>
      {/* Column captions double as the language key for every row; hidden
          from assistive tech because each row's cells carry lang. */}
      <div className="session-word-list__columns" aria-hidden="true">
        <span>{languageName}</span>
        <span>{nativeLanguageName}</span>
        <span>{labels.typeColumn}</span>
        <span />
      </div>
      <ul id={listId} className="session-word-list__list">
        {visibleWords.map((word) => {
          const wordPath = wordPagePath(word);
          const actions = getRowActions?.(word) ?? [];
          return (
            <li key={word.conceptId} className="session-word-list__row">
              <span className="session-word-list__word">
                {canSpeak && (
                  <button
                    type="button"
                    onClick={() => onSpeakWord?.(word)}
                    aria-label={`${t("practice.pronounceWord")}: ${word.targetWord}`}
                    className="session-word-list__audio"
                  >
                    <Volume2 className="session-word-list__audio-icon" aria-hidden="true" />
                  </button>
                )}
                {wordPath ? (
                  <a
                    href={wordPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="session-word-list__term session-word-list__link"
                    lang={practiceLanguage}
                  >
                    {word.targetWord}
                  </a>
                ) : (
                  <span className="session-word-list__term" lang={practiceLanguage}>
                    {word.targetWord}
                  </span>
                )}
              </span>
              <span className="session-word-list__translation" lang={yourLanguage}>
                {word.translation}
              </span>
              <span className="session-word-list__type">{grammarLabel(word.grammarType)}</span>
              {actions.length > 0 && (
                // Non-modal, like the shared VocabularyTable's menu, so
                // opening it never locks scroll.
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${labels.moreActions}: ${word.targetWord}`}
                      className="session-word-list__more"
                    >
                      <MoreVertical className="session-word-list__more-icon" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-0 rounded-xl border-foreground/10 p-1 shadow-lg">
                    {actions.map((action) => (
                      <DropdownMenuItem
                        key={action.key}
                        className={ROW_MENU_ITEM_CLASS}
                        disabled={action.disabled}
                        onSelect={action.onSelect}
                      >
                        {action.icon}
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
      {isCollapsible && (
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          aria-controls={listId}
          className="session-word-list__toggle"
        >
          <span>{isExpanded ? labels.showFewer : labels.showAll(words.length)}</span>
          <ChevronDown
            className={`session-word-list__toggle-icon${isExpanded ? " is-expanded" : ""}`}
            aria-hidden="true"
          />
        </button>
      )}
    </section>
  );
}
