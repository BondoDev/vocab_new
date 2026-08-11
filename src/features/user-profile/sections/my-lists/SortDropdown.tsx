import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../../app/components/ui/dropdown-menu";

export interface SortDropdownOption<TValue extends string> {
  value: TValue;
  label: string;
}

interface SortDropdownProps<TValue extends string> {
  value: TValue;
  options: SortDropdownOption<TValue>[];
  ariaLabel: string;
  onChange: (value: TValue) => void;
}

export function SortDropdown<TValue extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: SortDropdownProps<TValue>) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="my-lists-toolbar__sort-trigger" aria-label={ariaLabel}>
          <span className="my-lists-toolbar__sort-trigger-label">{selectedOption?.label}</span>
          <ChevronDown size={18} strokeWidth={2.4} aria-hidden="true" className="my-lists-toolbar__sort-trigger-icon" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="my-lists-toolbar__sort-menu">
        <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => onChange(nextValue as TValue)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="my-lists-toolbar__sort-option">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
