// Minimal {token} substitution for translation strings that need a dynamic
// value. The project's t() function (src/contexts/LanguageContext.tsx) does
// plain flat-key lookup only and has no interpolation support of its own —
// this tiny standalone helper fills that gap rather than changing
// LanguageContextType's signature. Originally added for the Dashboard
// header's personalized greeting ({name}); reused as-is for the Dashboard
// hero card's {count} messages rather than duplicating the same regex
// substitution a second time.
//
// A token with no matching value is left in place rather than silently
// dropped, so a missing interpolation value fails loudly (a visible
// "{count}" in the UI) instead of quietly disappearing.
export function interpolateTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}
