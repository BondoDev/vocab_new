// Pure localStorage read helpers extracted from App.tsx.
//
// SSR-safe: every helper guards on `canUseLocalStorage()` first and never
// assumes `window` or `window.localStorage` exists, so they can be called
// from code that also runs during prerendering or Worker SSR — they simply
// return null there. Validation failures and JSON parse errors also return
// null so callers fall back to their in-memory defaults.
//
// Only reads live here. The `STORAGE_KEYS` constant stays in App.tsx for
// source-text guards; preference persistence effects and writes are owned by
// useStoredAppPreferences, where the related React state now lives.

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
