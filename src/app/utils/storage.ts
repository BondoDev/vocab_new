// Pure localStorage read helpers extracted from App.tsx.
//
// SSR-safe: every helper guards on `canUseLocalStorage()` first and never
// assumes `window` or `window.localStorage` exists, so they can be called
// from code that also runs during prerendering or Worker SSR — they simply
// return null there. Validation failures and JSON parse errors also return
// null so callers fall back to their in-memory defaults.
//
// Only reads live here. The `STORAGE_KEYS` constant, the persistence
// effects, and all localStorage writes stay in App.tsx: the write timing is
// coupled to React state ownership, and scripts/test-interactive-contracts.mjs
// asserts the `app.*` key strings appear in App.tsx's source.

export function canUseLocalStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export function readStoredString(
  key: string,
  isValid: (value: string) => boolean,
): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const value = window.localStorage.getItem(key);
  if (!value || !isValid(value)) {
    return null;
  }

  return value;
}

export function readStoredStringArray(
  key: string,
  isValidItem?: (value: string) => boolean,
): string[] | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const normalized = parsed.filter(
      (item): item is string => typeof item === "string",
    );
    return isValidItem ? normalized.filter(isValidItem) : normalized;
  } catch {
    return null;
  }
}
