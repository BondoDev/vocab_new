const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });
const WINDOWS_1251_DECODER = new TextDecoder("windows-1251", { fatal: false });
const WINDOWS_1252_DECODER = new TextDecoder("windows-1252", { fatal: false });

let windows1251ReverseMap: Map<string, number> | null = null;
let windows1252ReverseMap: Map<string, number> | null = null;

function buildReverseMap(decoder: TextDecoder): Map<string, number> {
  const map = new Map<string, number>();
  for (let index = 0; index <= 255; index += 1) {
    const decoded = decoder.decode(Uint8Array.of(index));
    if (!map.has(decoded)) {
      map.set(decoded, index);
    }
  }

  return map;
}

function getWindows1251ReverseMap(): Map<string, number> {
  if (!windows1251ReverseMap) {
    windows1251ReverseMap = buildReverseMap(WINDOWS_1251_DECODER);
  }

  return windows1251ReverseMap;
}

function getWindows1252ReverseMap(): Map<string, number> {
  if (!windows1252ReverseMap) {
    windows1252ReverseMap = buildReverseMap(WINDOWS_1252_DECODER);
  }

  return windows1252ReverseMap;
}

const MOJIBAKE_PATTERNS = [
  /Ã./g,
  /Â./g,
  /â[\u0080-\u00BF]/g,
  /Ð./g,
  /Ñ./g,
  /Р./g,
  /С./g,
  /вЂ./g,
  /в„./g,
  /в€./g,
  /в[\u0400-\u04FF]/g,
  /Г./g,
  /\uFFFD/g,
];

function countSuspiciousChars(value: string): number {
  let suspicious = 0;

  for (const pattern of MOJIBAKE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = value.match(pattern);
    if (matches) {
      suspicious += matches.length;
    }
  }

  return suspicious;
}

function looksLikeMojibake(value: string): boolean {
  return countSuspiciousChars(value) > 0;
}

function decodeUtf8FromReverseMap(
  value: string,
  reverseMap: Map<string, number>,
): string | null {
  const bytes: number[] = [];

  for (const char of value) {
    const mappedByte = reverseMap.get(char);
    if (mappedByte !== undefined) {
      bytes.push(mappedByte);
      continue;
    }

    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint > 0xff) {
      return null;
    }

    bytes.push(codePoint);
  }

  const decoded = UTF8_DECODER.decode(Uint8Array.from(bytes));
  return decoded.includes("\uFFFD") ? null : decoded;
}

function repairOnce(value: string): string {
  const candidates = [
    decodeUtf8FromReverseMap(value, getWindows1251ReverseMap()),
    decodeUtf8FromReverseMap(value, getWindows1252ReverseMap()),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const currentScore = countSuspiciousChars(value);
  let bestCandidate = value;
  let bestScore = currentScore;

  for (const candidate of candidates) {
    const candidateScore = countSuspiciousChars(candidate);
    if (candidateScore < bestScore) {
      bestCandidate = candidate;
      bestScore = candidateScore;
    }
  }

  return bestCandidate;
}

export function fixMojibake(value: string): string {
  if (!value || !looksLikeMojibake(value)) {
    return value;
  }

  let repaired = value;

  for (let pass = 0; pass < 3; pass += 1) {
    const nextValue = repairOnce(repaired);
    if (nextValue === repaired) {
      break;
    }

    repaired = nextValue;
  }

  return repaired;
}

export function fixNullableMojibake(value: string | null | undefined): string {
  return typeof value === "string" ? fixMojibake(value) : "";
}
