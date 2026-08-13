import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { Button } from "../../../../app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../../app/components/ui/dialog";
import { Input } from "../../../../app/components/ui/input";
import { buildTimezoneOptions, filterTimezoneOptions, type TimezoneOption } from "../../../../app/utils/timezoneOptions";

interface TimezoneSelectorProps {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
}

// Searchable IANA timezone picker for Settings' Time & Region section. The
// popup is intentionally centered, not anchored to the trigger: the option
// list is long enough that a modal surface gives the search field and results
// stable room on both desktop and mobile.
export function TimezoneSelector({ value, onChange, disabled }: TimezoneSelectorProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listboxId = useId();

  const allOptions = useMemo(() => buildTimezoneOptions(), []);
  const visibleOptions = useMemo(() => filterTimezoneOptions(allOptions, query), [allOptions, query]);
  const selected = allOptions.find((option) => option.id === value) ?? null;

  const handleSelect = (option: TimezoneOption) => {
    onChange(option.id);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={t("userProfile.settingsSection.timeRegion.selectorAriaLabel")}
          disabled={disabled}
          className="settings-timezone-selector__trigger"
        >
          <span className="settings-timezone-selector__trigger-text">
            {selected
              ? `${selected.city}${selected.offsetLabel ? ` · ${selected.offsetLabel}` : ""}`
              : value || t("userProfile.settingsSection.timeRegion.selectorPlaceholder")}
          </span>
          <ChevronsUpDown className="settings-timezone-selector__trigger-icon" aria-hidden="true" size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="settings-timezone-selector__content">
        <DialogHeader className="settings-timezone-selector__header">
          <DialogTitle>{t("userProfile.settingsSection.timeRegion.timezone")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("userProfile.settingsSection.timeRegion.selectorAriaLabel")}
          </DialogDescription>
        </DialogHeader>
        <Input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("userProfile.settingsSection.timeRegion.searchPlaceholder")}
          aria-label={t("userProfile.settingsSection.timeRegion.searchPlaceholder")}
          aria-controls={listboxId}
          autoFocus
          className="settings-timezone-selector__search"
        />
        <div id={listboxId} role="listbox" aria-label={t("userProfile.settingsSection.timeRegion.selectorAriaLabel")} className="settings-timezone-selector__list">
          {visibleOptions.length === 0 ? (
            <p className="settings-timezone-selector__empty">
              {t("userProfile.settingsSection.timeRegion.noResults")}
            </p>
          ) : (
            visibleOptions.map((option) => {
              const isSelected = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option)}
                  className={`settings-timezone-selector__option ${
                    isSelected ? "settings-timezone-selector__option--selected" : ""
                  }`}
                >
                  <span className="settings-timezone-selector__option-city">
                    {option.city}
                    {option.region ? (
                      <span className="settings-timezone-selector__option-region"> · {option.region}</span>
                    ) : null}
                  </span>
                  <span className="settings-timezone-selector__option-meta">
                    <span className="settings-timezone-selector__option-id">{option.id}</span>
                    {option.offsetLabel ? (
                      <span className="settings-timezone-selector__option-offset">{option.offsetLabel}</span>
                    ) : null}
                    {isSelected ? <Check size={14} aria-hidden="true" /> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
