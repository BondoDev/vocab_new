export function isValidBrowseWordLemma(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.normalize("NFC").trim();
  if (trimmed.length <= 2) {
    return false;
  }

  if (/^[-–—]+$/u.test(trimmed)) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(trimmed);
}
