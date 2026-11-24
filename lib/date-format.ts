/** Formats a calendar date (YYYY-MM-DD) as e.g. "November 24, 2026", independent of the viewer's zone. */
export const fullDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
