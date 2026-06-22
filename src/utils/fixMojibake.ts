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

function countSuspiciousChars(value: string): number {
  let suspicious = 0;
  const suspiciousLatin1 = new Set([
    0x00C2, // Â
    0x00C3, // Ã
    0x00D0, // Ð
    0x00D1, // Ñ
    0x00D2,
    0x00D3,
    0x00D4,
    0x00D5,
    0x00D6,
    0x00D7,
    0x00D8,
    0x00D9,
    0x00DA,
    0x00DB,
    0x00DC,
    0x00DD,
    0x00DE,
    0x00DF,
    0x00E2, // â
  ]);

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;

    if (
      suspiciousLatin1.has(codePoint) ||
      (codePoint >= 0x0400 && codePoint <= 0x04FF) ||
      (codePoint >= 0x2018 && codePoint <= 0x201E) ||
      codePoint === 0x20AC ||
      codePoint === 0x2122
    ) {
      suspicious += 1;
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
