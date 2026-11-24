/**
 * Shared display formats. Every date is formatted in UTC so server-rendered and
 * hydrated text match. Calendar dates (YYYY-MM-DD) are read at UTC noon;
 * timestamps use their UTC calendar day.
 *
 * - fullDate   "November 24, 2026"  prose in film details and settings
 * - mediumDate "Nov 24, 2026"       compact metadata and footers
 * - shortDate  "Nov 24"             cards where the year is implied
 */
const calendarDate = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (value: string) => new Date(calendarDate.test(value) ? `${value}T12:00:00Z` : value);
const utc = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });

const long = utc({ month: 'long', day: 'numeric', year: 'numeric' });
const medium = utc({ month: 'short', day: 'numeric', year: 'numeric' });
const short = utc({ month: 'short', day: 'numeric' });
const weekday = utc({ weekday: 'short' });
const month = utc({ month: 'short' });

export const fullDate = (value: string) => long.format(toDate(value));
export const mediumDate = (value: string) => medium.format(toDate(value));
export const shortDate = (value: string) => short.format(toDate(value));
/** Short date, adding the year only when it differs from the reference day's year. */
export const shortDateInYear = (value: string, today: string) =>
  value.slice(0, 4) === today.slice(0, 4) ? shortDate(value) : mediumDate(value);

/** Parts for calendar-style date tiles: "Tue", "24", "Nov". */
export const weekdayName = (value: string) => weekday.format(toDate(value));
export const dayOfMonth = (value: string) => String(toDate(value).getUTCDate());
export const monthName = (value: string) => month.format(toDate(value));

/** A moment with its time, in the viewer's zone. Only for client-only text. */
export const localDateTime = (value: string) =>
  new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
