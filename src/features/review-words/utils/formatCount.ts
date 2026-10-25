// Plural-aware "{count}" formatting for Review Words copy: picks
// `${baseKey}_${CLDR plural category}` for the UI language (Russian defines
// _few/_many where its grammar needs them, most locales only _one/_other)
// and falls back to `${baseKey}_other`, then substitutes {count} and any
// extra {name} placeholders. t() returns the key itself on a miss, which is
// how an undefined category is detected. Same contract as Study New Words'
// own helper (kept per-feature, as that feature's other utilities are).
export function formatCount(
  t: (key: string) => string,
  uiLanguage: string,
  baseKey: string,
  count: number,
  extra: Record<string, string> = {},
): string {
  const categoryKey = `${baseKey}_${new Intl.PluralRules(uiLanguage).select(count)}`;
  const template = t(categoryKey);
  let text = (template === categoryKey ? t(`${baseKey}_other`) : template).replace("{count}", String(count));
  for (const [name, value] of Object.entries(extra)) {
    text = text.split(`{${name}}`).join(value);
  }
  return text;
}
