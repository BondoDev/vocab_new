import { type KeyboardLanguage } from "../../../keyboards/layouts";

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
  const characters = desktopSpecialCharacters[language];

  if (!characters || characters.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {characters.map((character) => (
        <button
          key={character}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(character)}
          disabled={disabled}
          className="min-w-10 rounded-lg border border-border bg-background px-3 py-2 text-base font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {character}
        </button>
      ))}
    </div>
  );
}
