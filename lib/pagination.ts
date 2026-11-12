import type { Movie, Release } from './model';
export type LibraryPage = {
  movies: Movie[];
  total: number;
  watchedTotal?: number;
  filteredTotal: number;
  trackedCount: number;
  knownCount: number;
  listedEvents: number;
  /** Additional days with only unconfirmed releases; mixed days already count as listed. */
  rumoredEvents: number;
  upcoming: Movie | null;
  upcomingRelease?: Release | null;
  /** Saved films within seven days, independent of the current page/filter. */
  weekReleases?: { movie: Movie; release: Release }[];
  nextOffset: number | null;
};
export function pageOptions(url: URL) {
  const sort = url.searchParams.get('sort') || 'release',
    filter = url.searchParams.get('filter') || 'all';
  const raw = url.searchParams.get('offset') || '0',
    offset = Number(raw);
  if (
    !['release', 'title', 'added', 'theatrical'].includes(sort) ||
    !['all', 'soon', 'available', 'unknown', 'rumored', 'watched'].includes(filter) ||
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(offset) ||
    offset > 100000
  )
    throw new Error('Invalid page');
  return { sort, filter, offset, limit: 25, tracked: url.searchParams.get('tracked') === 'true' };
}
