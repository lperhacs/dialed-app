// All server timestamps are stored and returned in UTC. SQLite hands them back
// as space-separated strings like "2026-06-01 14:30:00" with NO timezone marker,
// which JavaScript's `new Date()` would wrongly interpret as LOCAL time — shifting
// every timestamp by the device's UTC offset (e.g. a 2-hour-old post showing
// "just now" for US users). parseServerDate normalizes the value to a correct
// instant so it renders in the user's local timezone (toLocale* uses the device tz).
//
// Date-only values (YYYY-MM-DD — event_date, challenge start_date/end_date, recap
// week bounds) are calendar days, not instants. They're parsed as LOCAL midnight
// so they display as the same day everywhere; a bare date string would otherwise
// be treated as UTC midnight and roll back a day for anyone west of GMT.
export function parseServerDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return new Date(value);
  const s = value.trim();

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  // Full timestamp. If it already carries a zone (trailing Z or ±HH:MM) trust it;
  // otherwise it's a bare UTC string from SQLite, so mark it explicitly as UTC.
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  return new Date(hasZone ? iso : iso + 'Z');
}
