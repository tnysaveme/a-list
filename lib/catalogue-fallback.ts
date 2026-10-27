import type { Movie } from './model';
/** Snapshot metadata must not overwrite newer evidence or invent personal membership. */
export function fallbackMovies(snapshot: Movie[], known: ReadonlyMap<string, Movie>): Movie[] {
  return snapshot.map((movie) => {
    const recent = known.get(movie.id);
    return recent ? { ...recent } : { ...movie, saved: undefined, tracked: undefined };
  });
}
export function catalogueFreshness(page: {
  checkedAt?: string | null;
  provenance?: 'live' | 'fallback';
  stale: boolean;
}) {
  if (page.provenance === 'fallback') return 'Showing saved listings · refresh unavailable';
  if (!page.checkedAt) return 'Listings have not been verified yet';
  const stamp = new Date(page.checkedAt);
  if (!Number.isFinite(stamp.getTime())) return 'Listings have not been verified yet';
  return `Listings checked ${stamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}${page.stale ? ' · awaiting refresh' : ''}`;
}
