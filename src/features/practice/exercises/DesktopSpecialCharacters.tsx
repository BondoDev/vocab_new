import { useState } from "react";
import { ChevronRight, Languages } from "lucide-react";

import { type KeyboardLanguage } from "./layouts";
import { useLanguage } from "../../../contexts/LanguageContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../app/components/ui/popover";

type DesktopSpecialCharactersProps = {
  language: KeyboardLanguage;
  onInsert: (character: string) => void;
  disabled?: boolean;
};

const desktopSpecialCharacters: Partial<Record<KeyboardLanguage, string[]>> = {
  de: ["ä", "ö", "ü", "ß"],
  es: ["ñ", "á", "é", "í", "ó", "ú"],
  fr: ["é", "è", "à", "ç"],
  pt: ["ç", "ã", "õ", "á", "é"],
  it: ["à", "è", "é", "ì", "ò", "ù"],
};

export function DesktopSpecialCharacters({
  language,
  onInsert,
  disabled = false,
}: DesktopSpecialCharactersProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const characters = desktopSpecialCharacters[language];

  if (!characters || characters.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex justify-center">
      <Popover open={disabled ? false : isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Languages className="h-4 w-4" />
            <span>{t("practice.keyboard.specialCharacters")}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="w-auto max-w-[18rem] p-2"
        >
          <div className="flex flex-wrap gap-2">
            {characters.map((character) => (
              <button
                key={character}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onInsert(character);
                  setIsOpen(false);
                }}
                disabled={disabled}
                className="min-w-10 rounded-lg border border-border bg-background px-3 py-2 text-base font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {character}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
