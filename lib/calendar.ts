import { calendarReleases, type Movie } from './model';
// Keep the legacy UID namespace stable across the A-List rename.
const EVENT_UID_NAMESPACE = 'afterlight';
// Bump the format revision when existing subscribers need an event update.
export const CALENDAR_FORMAT_UPDATED_AT = '2026-10-26T11:02:17.000Z';
const escape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function fold(line: string): string {
  let out = '',
    bytes = 0;
  for (const char of line) {
    const n = new TextEncoder().encode(char).length;
    if (bytes + n > 75) {
      out += '\r\n ';
      bytes = 1;
    }
    out += char;
    bytes += n;
  }
  return out;
}
export function makeCalendar(
  movies: Movie[],
  options: { includeRumors?: boolean; now?: Date } = {},
): string {
  const now = options.now || new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//A-List//US Movie Releases//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:A-List · Movie nights',
    'X-WR-TIMEZONE:UTC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const movie of movies)
    for (const release of calendarReleases(movie, options.includeRumors)) {
      if (release.confidence === 'rumored' && options.includeRumors === false) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date)) continue;
      const start = new Date(`${release.date}T13:00:00Z`);
      if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== release.date)
        continue;
      const day = release.date.replace(/-/g, '');
      const contentUpdated = movie.calendarUpdatedAt || movie.checkedAt;
      const modified = new Date(
        Math.max(Date.parse(contentUpdated) || 0, Date.parse(CALENDAR_FORMAT_UPDATED_AT)),
      ).toISOString();
      const summary = `${release.confidence === 'rumored' ? '[Rumored] ' : ''}${movie.title} · ${release.platform || release.kind}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:movie-${movie.id}-${release.kind.toLowerCase()}@${EVENT_UID_NAMESPACE}`,
        `DTSTAMP:${stamp}`,
        `LAST-MODIFIED:${modified.replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z')}`,
        `DTSTART:${day}T130000Z`,
        `DTEND:${day}T133000Z`,
        `SUMMARY:${escape(summary)}`,
        `DESCRIPTION:${escape(`US ${release.kind} release${release.platform ? ` on ${release.platform}` : ''}. ${release.confidence === 'rumored' ? 'Reported; not confirmed.' : 'Date listed by source; subject to change.'}\nRelease-day reminder: 13:00–13:30 GMT (UTC). Actual availability time may vary.\nSource: ${release.sourceName}\n${release.source}`)}`,
        `URL:${release.source}`,
        `STATUS:${release.confidence === 'rumored' ? 'TENTATIVE' : 'CONFIRMED'}`,
        'TRANSP:TRANSPARENT',
        // A standard at-start alarm fires at the block's fixed 13:00 UTC start.
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'TRIGGER;RELATED=START:PT0S',
        `DESCRIPTION:${escape(summary)}`,
        'END:VALARM',
        'END:VEVENT',
      );
    }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
