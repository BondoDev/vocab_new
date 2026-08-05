export function detectBrowserTimezone(): string | null {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return null;
  }

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === "string" && timezone.trim() ? timezone.trim() : null;
  } catch {
    return null;
  }
}
