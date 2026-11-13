import { releaseCheckDue, type Movie } from './model';
import { needsReportLookup } from './release-lookup';
export type DetailRow = { movie: Movie; refresh_after?: string; report_lookup_after?: string };
export function synopsisRefreshDue(movie: Movie, now = Date.now()) {
  const checked = movie.synopsisCheckedAt || movie.releaseCheck?.attemptedAt;
  return (
    (!movie.overview || (movie.imdbId && !movie.synopsisCheckedAt)) &&
    (!checked || now - Date.parse(checked) > 3600000)
  );
}
export function detailRefreshDue(row: DetailRow, now = Date.now()) {
  const movie = row.movie;
  if (movie.mediaType === 'series') return false;
  const due = (stamp: string | undefined) =>
    !stamp || !Number.isFinite(Date.parse(stamp)) || Date.parse(stamp) <= now;
  return (
    (releaseCheckDue(movie, now) && due(row.refresh_after)) ||
    synopsisRefreshDue(movie, now) ||
    (needsReportLookup(movie) && due(row.report_lookup_after))
  );
}
