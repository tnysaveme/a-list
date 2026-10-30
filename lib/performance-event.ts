/** Only fixed page paths leave the app; auth tokens, queries and feed URLs never do. */
export function sanitizePerformanceEvent<T extends { url: string; route?: string }>(
  event: T,
): T | null {
  try {
    const url = new URL(event.url);
    if (!['/', '/login', '/privacy'].includes(url.pathname)) return null;
    return { ...event, url: `${url.origin}${url.pathname}`, route: url.pathname };
  } catch {
    return null;
  }
}
