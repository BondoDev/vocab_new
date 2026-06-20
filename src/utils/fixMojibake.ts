const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });
const WINDOWS_1251_DECODER = new TextDecoder("windows-1251", { fatal: false });

let windows1251ReverseMap: Map<string, number> | null = null;

function getWindows1251ReverseMap(): Map<string, number> {
  if (windows1251ReverseMap) {
    return windows1251ReverseMap;
  }

  const map = new Map<string, number>();
  for (let index = 0; index <= 255; index += 1) {
    const decoded = WINDOWS_1251_DECODER.decode(Uint8Array.of(index));
    if (!map.has(decoded)) {
      map.set(decoded, index);
    }
  }

  windows1251ReverseMap = map;
  return map;
}

function looksLikeMojibake(value: string): boolean {
  return /[ÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿРрГгвЂ™]/.test(value);
}

export function fixMojibake(value: string): string {
  if (!value || !looksLikeMojibake(value)) {
    return value;
  }

  const reverseMap = getWindows1251ReverseMap();
  const bytes: number[] = [];

  for (const char of value) {
    const mappedByte = reverseMap.get(char);
    if (mappedByte !== undefined) {
      bytes.push(mappedByte);
      continue;
    }

    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint > 0xff) {
      return value;
    }

    bytes.push(codePoint);
  }

  const decoded = UTF8_DECODER.decode(Uint8Array.from(bytes));
  return decoded.includes("\uFFFD") ? value : decoded;
}

export function fixNullableMojibake(value: string | null | undefined): string {
  return typeof value === "string" ? fixMojibake(value) : "";
}
