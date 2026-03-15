export type KeyboardLanguage = "en" | "de" | "ru" | "es" | "fr" | "pt" | "it";

export const KEY_SHIFT = "__SHIFT__";
export const KEY_BACKSPACE = "__BACKSPACE__";

export type KeyboardLayout = {
  locale: KeyboardLanguage;
  type: "mobile";
  baseLayout: string[][];
  symbolsLayout: string[][];
  extraLayout?: string[][];
  longPress?: Record<string, string[]>;
};

const symbolRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  [".", ",", "?", "!", ":", ";", "'", "-", "(", ")"],
];

export const keyboardLayouts: Record<KeyboardLanguage, KeyboardLayout> = {
  en: {
    locale: "en",
    type: "mobile",
    baseLayout: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      [KEY_SHIFT, "z", "x", "c", "v", "b", "n", "m", KEY_BACKSPACE],
      [".", ",", "?", "!", ":", ";", "'", "-"],
    ],
    symbolsLayout: [],
  },
  de: {
    locale: "de",
    type: "mobile",
    baseLayout: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      [KEY_SHIFT, "z", "x", "c", "v", "b", "n", "m", KEY_BACKSPACE],
      ["\u00f6", "\u00e4", "\u00fc", "\u00df"],
    ],
    symbolsLayout: [],
    extraLayout: [[".", ",", "?", "!", ":", ";", "'", "-"]],
  },
  ru: {
    locale: "ru",
    type: "mobile",
    baseLayout: [
      ["\u0439", "\u0446", "\u0443", "\u043a", "\u0435", "\u043d", "\u0433", "\u0448", "\u0449", "\u0437", "\u0445", "\u044a"],
      ["\u0444", "\u044b", "\u0432", "\u0430", "\u043f", "\u0440", "\u043e", "\u043b", "\u0434", "\u0436", "\u044d"],
      [KEY_SHIFT, "\u044f", "\u0447", "\u0441", "\u043c", "\u0438", "\u0442", "\u044c", "\u0431", "\u044e", "\u0451", KEY_BACKSPACE],
      [".", ",", "?", "!", ":", "-", "\u00ab", "\u00bb", "(", ")"],
    ],
    symbolsLayout: [],
  },
  es: {
    locale: "es",
    type: "mobile",
    baseLayout: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l", "\u00f1"],
      [KEY_SHIFT, "z", "x", "c", "v", "b", "n", "m", KEY_BACKSPACE],
      ["\u00e1", "\u00e9", "\u00ed", "\u00f3", "\u00fa", "\u00fc"],
    ],
    symbolsLayout: [],
    extraLayout: [[".", ",", "?", "!", "\u00bf", "\u00a1", ":", "-", "'"]],
  },
  fr: {
    locale: "fr",
    type: "mobile",
    baseLayout: [
      ["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
      [KEY_SHIFT, "w", "x", "c", "v", "b", "n", KEY_BACKSPACE],
      ["\u00e9", "\u00e8", "\u00e0", "\u00e7", "\u00ea", "\u00f4", "\u00f9"],
    ],
    symbolsLayout: [
      [".", ",", "?", "!", ":", ";", "'", "-", "(", ")"],
      ["\u00e2", "\u00eb", "\u00ee", "\u00ef", "\u0153", "\u00fb", "\u00fc", "\u00ff"],
    ],
    longPress: {
      a: ["\u00e0", "\u00e2"],
      e: ["\u00e9", "\u00e8", "\u00ea", "\u00eb"],
      i: ["\u00ee", "\u00ef"],
      o: ["\u00f4", "\u0153"],
      u: ["\u00f9", "\u00fb", "\u00fc"],
      c: ["\u00e7"],
      y: ["\u00ff"],
    },
  },
  pt: {
    locale: "pt",
    type: "mobile",
    baseLayout: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l", "\u00e7"],
      [KEY_SHIFT, "z", "x", "c", "v", "b", "n", "m", KEY_BACKSPACE],
      ["\u00e1", "\u00e9", "\u00ed", "\u00f3", "\u00fa", "\u00e3", "\u00f5", "\u00ea", "\u00f4"],
    ],
    symbolsLayout: [],
    extraLayout: [
      [".", ",", "?", "!", ":", ";", "-", "'", "(", ")"],
      ["\u00e2", "\u00e0"],
    ],
  },
  it: {
    locale: "it",
    type: "mobile",
    baseLayout: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      [KEY_SHIFT, "z", "x", "c", "v", "b", "n", "m", KEY_BACKSPACE],
      ["\u00e0", "\u00e8", "\u00ec", "\u00f2", "\u00f9", "\u00e9"],
    ],
    symbolsLayout: [],
    extraLayout: [[".", ",", "?", "!", ":", ";", "-", "'", "(", ")"]],
  },
};

export function getKeyboardLayout(language: string): KeyboardLayout {
  if (language in keyboardLayouts) {
    return keyboardLayouts[language as KeyboardLanguage];
  }
  return keyboardLayouts.en;
}
