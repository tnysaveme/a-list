import { calendarReleaseGroups, type Movie } from './model';
// Keep the legacy UID namespace stable across the A-List rename.
const EVENT_UID_NAMESPACE = 'afterlight';
// Bump the format revision when existing subscribers need an event update.
export const CALENDAR_FORMAT_UPDATED_AT = '2026-10-30T09:51:32.000Z';
const escape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function fold(line: string): string {
  let out = '',
    bytes = 0;
  for (const char of line) {
    const point = char.codePointAt(0)!;
    const n = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
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
    for (const releases of calendarReleaseGroups(movie, options.includeRumors)) {
      // Reuse an existing kind-based UID rather than introducing date-based IDs.
      // Splitting a group restores the other kinds' original UIDs.
      const release = releases[0];
      const listed = releases.find((r) => r.confidence === 'listed');
      const tentative = !listed;
      const labels = [
        ...new Set(
          releases.map((r) => {
            const label =
              r.platform ||
              (releases.length > 1 && r.kind === 'Subscription' ? 'Streaming' : r.kind);
            return `${label}${!tentative && r.confidence === 'rumored' ? ' [Unconfirmed]' : ''}`;
          }),
        ),
      ];
      const day = release.date.replace(/-/g, '');
      const contentUpdated = movie.calendarUpdatedAt || movie.checkedAt;
      const modified = new Date(
        Math.max(Date.parse(contentUpdated) || 0, Date.parse(CALENDAR_FORMAT_UPDATED_AT)),
      ).toISOString();
      const summary = `${tentative ? '[Unconfirmed] ' : ''}${movie.title} · ${labels.join(' + ')}`;
      const description =
        releases
          .map(
            (r) =>
              `US ${r.kind} release${r.platform ? ` on ${r.platform}` : ''}. ${r.confidence === 'rumored' ? 'Unconfirmed date; subject to change.' : 'Date listed by source; subject to change.'}\nSource: ${r.sourceName}\n${r.source}`,
          )
          .join('\n\n') +
        '\n\nRelease-day reminder: 13:00–13:30 GMT (UTC). Actual availability time may vary.';
      lines.push(
        'BEGIN:VEVENT',
        `UID:movie-${movie.id}-${release.kind.toLowerCase()}@${EVENT_UID_NAMESPACE}`,
        `DTSTAMP:${stamp}`,
        `LAST-MODIFIED:${modified.replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z')}`,
        `DTSTART:${day}T130000Z`,
        `DTEND:${day}T133000Z`,
        `SUMMARY:${escape(summary)}`,
        `DESCRIPTION:${escape(description)}`,
        `URL:${(listed || release).source}`,
        `STATUS:${tentative ? 'TENTATIVE' : 'CONFIRMED'}`,
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
