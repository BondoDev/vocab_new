// Automatic age: the pure calendar rules behind a user's current age.
//
// The server is authoritative. supabase/migrations/
// 20261105160000_add_inferred_birth_year_and_current_age.sql infers
// birth_year when an age is declared and serves current_age on every profile
// read, using the server clock and the profile's time zone. This module
// mirrors those SQL helpers exactly (birth_date_is_valid,
// birth_year_matches_birthday, birthday_in_year, age_on_date,
// infer_birth_year) for three client-side uses only:
//   * form validation before submit (impossible dates, Feb 29 consistency);
//   * keeping a cached profile's displayed age current between server reads;
//   * executable tests of the rules (scripts/tests/account/test-account-age.mjs).
// It never decides minimum-age enforcement; the RPCs do.
//
// Rules shared with the SQL:
//   * A birthday is a real month/day; Feb 29 is valid only for a leap birth
//     year.
//   * In non-leap years a Feb 29 birthday is celebrated on March 1, so the
//     age never increases early.
//   * Age increases on the birthday in the user's own time zone (UTC when the
//     profile has none).
//
// No imports, so Node's native TypeScript stripping can load it directly.

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Largest valid day for a birth month (29 for February, since the birth year
// may be a leap year).
export function maxBirthDayForMonth(month: number): number {
  if (month === 2) return 29;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidBirthDate(month: number, day: number): boolean {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= maxBirthDayForMonth(month)
  );
}

export function birthYearMatchesBirthday(birthYear: number, month: number, day: number): boolean {
  return !(month === 2 && day === 29) || isLeapYear(birthYear);
}

// The date the birthday is celebrated in `year`.
export function birthdayInYear(year: number, month: number, day: number): CalendarDate {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return { year, month: 3, day: 1 };
  }
  return { year, month, day };
}

function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function birthdayNotYetReached(today: CalendarDate, month: number, day: number): boolean {
  return compareDates(today, birthdayInYear(today.year, month, day)) < 0;
}

// Age in completed years on `today`.
export function ageOn(birthYear: number, month: number, day: number, today: CalendarDate): number {
  return today.year - birthYear - (birthdayNotYetReached(today, month, day) ? 1 : 0);
}

// Inverse of ageOn: the birth year for which ageOn(...) === age on `today`.
export function inferBirthYear(age: number, month: number, day: number, today: CalendarDate): number {
  return today.year - age - (birthdayNotYetReached(today, month, day) ? 1 : 0);
}

// The calendar date of `instant` in an IANA time zone; UTC when the zone is
// missing or not recognized (same fallback as the server's user_local_date).
export function calendarDateInTimeZone(instant: Date, timeZone: string | null | undefined): CalendarDate {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(instant);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: value("year"), month: value("month"), day: value("day") };
  };
  if (timeZone) {
    try {
      return read(timeZone);
    } catch {
      // RangeError for an unknown zone: fall through to UTC.
    }
  }
  return read("UTC");
}

export type DeclaredAgeIssue = "invalidBirthDate" | "leapDayMismatch";

// Client-side check of a declared age + birthday before submit. The server
// repeats it with its own clock; this only gives the user an early,
// specific message instead of a generic save error.
export function getDeclaredAgeIssue(
  age: number,
  month: number,
  day: number,
  today: CalendarDate,
): DeclaredAgeIssue | null {
  if (!isValidBirthDate(month, day)) return "invalidBirthDate";
  if (!birthYearMatchesBirthday(inferBirthYear(age, month, day, today), month, day)) return "leapDayMismatch";
  return null;
}

// Day options ("01".."29/30/31") for a two-digit birth month; all 31 while
// no month is chosen yet.
export function birthDayValuesForMonth(month: string): string[] {
  const maxDay = month ? maxBirthDayForMonth(Number(month)) : 31;
  return Array.from({ length: maxDay }, (_, index) => String(index + 1).padStart(2, "0"));
}

// Keeps a chosen day when switching months, or clears it ("") when the new
// month does not have it (e.g. 31 after switching to April).
export function birthDayForMonth(month: string, day: string): string {
  return day && month && Number(day) > maxBirthDayForMonth(Number(month)) ? "" : day;
}

const BIRTH_MONTH_VALUES = [
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
] as const;

// Month names come from Intl rather than locale JSON. A standalone
// { month: "long" } format yields the nominative form (e.g. Russian
// "январь", not the genitive "января"), which is what a dropdown needs.
// Some locales lowercase month names, so the first letter is capitalized
// for list display. Used by the onboarding dialog.
export function getBirthMonthOptions(uiLanguage: string): { value: string; label: string }[] {
  const formatter = new Intl.DateTimeFormat(uiLanguage, { month: "long", timeZone: "UTC" });
  return BIRTH_MONTH_VALUES.map((value) => {
    const name = formatter.format(new Date(Date.UTC(2000, Number(value) - 1, 1)));
    return { value, label: name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1) };
  });
}
