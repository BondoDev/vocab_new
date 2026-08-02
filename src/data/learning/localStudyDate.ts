// The project has no established user-timezone system yet (no stored
// per-user timezone, no existing local-date helper anywhere in src/ as of
// this writing). This helper isolates that gap behind one small function
// rather than deriving "today" from UTC (which would roll the calendar date
// over at the wrong moment for most users) or building a broader timezone
// architecture that's out of scope here.
//
// Limitation: this uses the requesting device's local timezone at call time,
// not a persisted per-user timezone preference. A user who studies from two
// devices in different timezones on the same UTC day could see two different
// "today"s. Revisit if/when the project adds per-user timezone storage.
export function getLocalCalendarDateISO(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
