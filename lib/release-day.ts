// Release dates are calendar days in the market covered by our sources, not instants.
export const releaseTimeZone = 'America/New_York';
const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: releaseTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function releaseDay(now: Date | number = Date.now()): string {
  const parts = dayFormat.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}
export function validReleaseDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
