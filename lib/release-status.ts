import { releaseCheckDue, verifiedReleases, type Movie } from './model';

export function releaseStatusNotice(movie: Movie, now = Date.now()): string | undefined {
  if (movie.releaseCheck?.status === 'failed' || movie.releaseCheck?.status === 'partial')
    return 'Some release sources could not be refreshed. Showing the last saved dates; an update will be retried automatically.';
  if (movie.releaseLookupStatus === 'unresolved')
    return 'A release source was found, but its film identity could not be verified. It will be checked again automatically.';
  if (movie.releaseLookupStatus === 'unavailable')
    return 'An additional release source could not be checked. Showing any saved dates; an update will be retried automatically.';
  const releases = verifiedReleases(movie);
  if (movie.primaryListingUnavailable) {
    if (releases.some((r) => r.sourceName === 'DVDs Release Dates'))
      return 'The original source no longer shows a digital release section. Its previous date is kept here until it can be verified again.';
    if (!releases.length) return 'No home release date has been found in the checked sources yet.';
  }
  if (releaseCheckDue(movie, now) && releases.length)
    return 'These dates are awaiting a source refresh. Check the last successful source date below.';
  return undefined;
}
