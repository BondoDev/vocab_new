import { useState, useSyncExternalStore, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronDown, RotateCcw, Search, X } from "lucide-react";
import type { FullVocabularyFilter } from "../../../../data/seo/listPages/fullVocabularyList/fullVocabularyListEntries";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";

// Same breakpoint as the table's compact layout (FullVocabularyTable.tsx).
const COMPACT_QUERY = "(max-width: 581px)";

// Server snapshot is "not compact": it only chooses which popup a tap opens,
// and the trigger markup is identical either way, so hydration can't differ.
function useCompactViewport(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(COMPACT_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

const SHEET_ROW_CLASS =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-foreground transition hover:bg-primary/5 has-[:checked]:font-semibold has-[:checked]:text-primary";
const SHEET_CHECKBOX_CLASS = "size-[1.125rem] shrink-0 cursor-pointer accent-[var(--primary)]";

// Hover/keyboard focus and checked rows use the indigo accent. The shared
// item's own left-hand check indicator is hidden (first child span) because
// every row draws a visible checkbox instead — clearer for multi-select.
const OPTION_CLASS =
  "cursor-pointer gap-2.5 rounded-lg py-2 pl-2.5 pr-3 focus:bg-primary/10 focus:text-primary data-[state=checked]:font-semibold data-[state=checked]:text-primary [&>span:first-child]:hidden";

function OptionCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
        checked ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30 bg-card"
      }`}
    >
      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  );
}

export interface VocabularyFilterOption {
  value: string;
  label: string;
}

interface VocabularyFilterBarProps {
  idPrefix: string;
  // "global" spans every CEFR section (taller, higher-contrast toolbar);
  // "local" sits inside one expanded level (compact, muted controls) so the
  // two tiers read as clearly different scopes.
  variant: "global" | "local";
  searchLabel: string;
  searchPlaceholder: string;
  categoryLabel: string;
  categoryAllOption: string;
  // The popup used instead of the dropdown below 582px: its commit button
  // and its ✕ button's accessible name.
  categoryApplyLabel: string;
  categoryCloseLabel: string;
  resetLabel: string;
  // Controlled by the owner (the page for global, the level section for
  // local); this component holds no filter state of its own.
  value: FullVocabularyFilter;
  onChange: (next: FullVocabularyFilter) => void;
  categoryOptions: VocabularyFilterOption[];
  // Lets the page start loading vocabulary as soon as a control is focused,
  // before the visitor has opened any level.
  onInteract?: () => void;
  describedById?: string;
  // Slot for future filters (e.g. topic), placed before the reset control.
  extraFilters?: ReactNode;
}

// Global: a slim toolbar with no surrounding card — strong borders, readable
// placeholders, and the accent color for hover/focus. On mobile the search
// takes the first row and the category select + Reset share the second.
// Local: a compact row inside each expanded CEFR level.
// Labels are screen-reader-only in both; placeholders carry the visible cue.
const GLOBAL_STYLE = {
  layout: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]",
  searchCell: "col-span-2 min-w-0 sm:col-span-1",
  control:
    "h-11 w-full rounded-xl border border-foreground/20 bg-card text-sm text-foreground shadow-sm transition placeholder:text-foreground/55 hover:border-primary/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
  icon: "text-foreground/55",
  reset:
    "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent",
};

const LOCAL_STYLE = {
  layout: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]",
  searchCell: "col-span-2 min-w-0 sm:col-span-1",
  control:
    "h-9 w-full rounded-lg border border-foreground/15 bg-card text-sm text-foreground transition placeholder:text-foreground/50 hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
  icon: "text-foreground/50",
  reset:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent",
};

export function VocabularyFilterBar({
  idPrefix,
  variant,
  searchLabel,
  searchPlaceholder,
  categoryLabel,
  categoryAllOption,
  categoryApplyLabel,
  categoryCloseLabel,
  resetLabel,
  value,
  onChange,
  categoryOptions,
  onInteract,
  describedById,
  extraFilters,
}: VocabularyFilterBarProps) {
  const style = variant === "global" ? GLOBAL_STYLE : LOCAL_STYLE;
  const searchId = `${idPrefix}-search`;
  const categoryId = `${idPrefix}-category`;
  const selectedTypes = new Set(value.types);
  const canReset = value.query.length > 0 || selectedTypes.size > 0;
  // Unfiltered, the button names what it filters ("Parts of speech");
  // otherwise it lists the selected names, comma-joined and truncated by CSS
  // when they don't fit, so no per-language plural strings are needed.
  const selectedLabel =
    selectedTypes.size === 0
      ? categoryLabel
      : categoryOptions
          .filter((option) => selectedTypes.has(option.value))
          .map((option) => option.label)
          .join(", ") || categoryLabel;

  const isCompact = useCompactViewport();
  const [popupOpen, setPopupOpen] = useState(false);
  // The compact popup edits a draft that only takes effect on Apply; closing
  // it any other way (✕, outside tap, Escape) discards the draft.
  const [draftTypes, setDraftTypes] = useState<ReadonlySet<string>>(() => new Set());

  // Keeps the list's own order regardless of click order.
  const toggledTypes = (base: ReadonlySet<string>, type: string, checked: boolean) =>
    categoryOptions
      .map((option) => option.value)
      .filter((candidate) => (candidate === type ? checked : base.has(candidate)));

  const clearTypes = () => onChange({ ...value, types: [] });
  const setType = (type: string, checked: boolean) =>
    onChange({ ...value, types: toggledTypes(selectedTypes, type, checked) });

  // One trigger for both the dropdown and the popup, so the toolbar renders
  // identically on the server and in either mode.
  const triggerButton = (
    <button
      id={categoryId}
      type="button"
      aria-describedby={describedById}
      className={`${style.control} flex items-center justify-between gap-2 px-3 text-left`}
    >
      {/* Both spans share one grid cell: the invisible, unwrapped label
          ("Parts of speech", "Wortarten", …) fixes the button's width to
          exactly that text, and the visible text — the label or the
          selected names — is laid over it and truncated to the same width.
          So the button hugs its label in every language and never resizes
          while types are ticked. */}
      <span className="grid min-w-0 flex-1 overflow-hidden">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
          {categoryLabel}
        </span>
        {/* w-0 + min-w-full: contributes no width of its own (so a long
            selection can't stretch the button) yet fills the cell. */}
        <span className="col-start-1 row-start-1 w-0 min-w-full truncate">{selectedLabel}</span>
      </span>
      <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${style.icon}`} />
    </button>
  );

  return (
    <div className={style.layout}>
      <div className={style.searchCell}>
        <label htmlFor={searchId} className="sr-only">
          {searchLabel}
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className={`pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 ${style.icon}`}
          />
          <input
            id={searchId}
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={searchPlaceholder}
            value={value.query}
            onChange={(event) => onChange({ ...value, query: event.target.value })}
            onFocus={onInteract}
            aria-describedby={describedById}
            className={`${style.control} pl-9 pr-3`}
          />
        </div>
      </div>

      {/* On wider screens this grid column is `auto`, so the button sizes to
          its content — see triggerButton for why that content is the
          localized label rather than the current selection. Phones keep the
          full-row layout. */}
      <div className="min-w-0 sm:max-w-[15rem]">
        <label htmlFor={categoryId} className="sr-only">
          {categoryLabel}
        </label>
        {/* Below 582px the categories open in a centered popup (easier to
            tap than a small anchored list); wider screens get the dropdown,
            which applies each tick immediately. */}
        {isCompact ? (
          <Dialog
            open={popupOpen}
            onOpenChange={(open) => {
              setPopupOpen(open);
              if (open) {
                setDraftTypes(new Set(value.types));
                onInteract?.();
              }
            }}
          >
            <DialogTrigger asChild>{triggerButton}</DialogTrigger>
            <DialogPortal>
              <DialogOverlay />
              {/* Built from the dialog primitives rather than the shared
                  DialogContent, whose built-in close button carries a
                  hard-coded English label; the ✕ here is localized. */}
              <DialogPrimitive.Content
                aria-describedby={undefined}
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(92vw,22rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-foreground/10 bg-card shadow-2xl outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
              >
                <div className="flex items-center justify-between gap-2 border-b border-foreground/10 py-2 pl-5 pr-2">
                  <DialogTitle className="text-base font-semibold text-foreground">{categoryLabel}</DialogTitle>
                  <DialogClose asChild>
                    <button
                      type="button"
                      aria-label={categoryCloseLabel}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-foreground/60 transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <X aria-hidden="true" className="size-5" />
                    </button>
                  </DialogClose>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
                  <label className={SHEET_ROW_CLASS}>
                    <input
                      type="checkbox"
                      checked={draftTypes.size === 0}
                      onChange={() => setDraftTypes(new Set())}
                      className={SHEET_CHECKBOX_CLASS}
                    />
                    {categoryAllOption}
                  </label>
                  <div className="mx-2 my-1 h-px bg-foreground/10" />
                  {categoryOptions.map((option) => (
                    <label key={option.value} className={SHEET_ROW_CLASS}>
                      <input
                        type="checkbox"
                        checked={draftTypes.has(option.value)}
                        onChange={(event) =>
                          setDraftTypes(new Set(toggledTypes(draftTypes, option.value, event.target.checked)))
                        }
                        className={SHEET_CHECKBOX_CLASS}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <div className="border-t border-foreground/10 p-3">
                  <button
                    type="button"
                    onClick={() => {
                      onChange({
                        ...value,
                        types: categoryOptions.map((option) => option.value).filter((type) => draftTypes.has(type)),
                      });
                      setPopupOpen(false);
                    }}
                    className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
                  >
                    {categoryApplyLabel}
                  </button>
                </div>
              </DialogPrimitive.Content>
            </DialogPortal>
          </Dialog>
        ) : (
          // Multi-select via the shared ui/dropdown-menu checkbox items
          // (Radix Select is single-choice only). modal={false} keeps page
          // scroll unlocked, so opening it never shifts the layout, and each
          // item's onSelect preventDefault keeps the menu open while several
          // types are ticked. "All categories" clears the selection.
          <DropdownMenu
            modal={false}
            onOpenChange={(open) => {
              if (open) {
                onInteract?.();
              }
            }}
          >
            <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border-foreground/10 p-1 shadow-lg"
            >
              <DropdownMenuCheckboxItem
                checked={selectedTypes.size === 0}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={clearTypes}
                className={OPTION_CLASS}
              >
                <OptionCheckbox checked={selectedTypes.size === 0} />
                {categoryAllOption}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator className="mx-1 my-1" />
              {categoryOptions.map((option) => {
                const checked = selectedTypes.has(option.value);
                return (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={checked}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(nextChecked) => setType(option.value, nextChecked === true)}
                    className={OPTION_CLASS}
                  >
                    <OptionCheckbox checked={checked} />
                    {option.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {extraFilters}

      <button
        type="button"
        disabled={!canReset}
        onClick={() => onChange({ query: "", types: [] })}
        className={style.reset}
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        {resetLabel}
      </button>
    </div>
  );
}
