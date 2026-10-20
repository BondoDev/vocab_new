interface TableSearchRowProps {
  colSpan: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  containerWidth: number;
}

// A single full-row search input, rendered as a table row directly under
// the header row. The <td> itself spans every column (so it participates
// in normal table layout/scrolling like any other row), but its content is
// wrapped in a sticky-left, viewport-width div — so the input itself always
// stays fully visible and usable while the columns scroll underneath it,
// instead of being just as wide as (and scrolling away with) the table.
export function TableSearchRow({ colSpan, searchValue, onSearchChange, placeholder, containerWidth }: TableSearchRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-b border-border p-0">
        <div
          className="sticky left-0 z-20 bg-card p-3"
          style={containerWidth ? { width: containerWidth } : undefined}
        >
          <label className="flex w-full text-sm text-foreground">
            <span className="sr-only">{placeholder}</span>
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-primary/35 bg-primary/5 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>
      </td>
    </tr>
  );
}
