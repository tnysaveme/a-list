import { releaseCheckDue, type Movie } from './model';

export function releaseStatusNotice(movie: Movie, now = Date.now()): string | undefined {
  if (movie.releaseCheck?.status === 'failed' || movie.releaseCheck?.status === 'partial')
    return 'Some release sources could not be refreshed. Showing the last saved dates; an update will be retried automatically.';
  if (movie.primaryListingUnavailable)
    return movie.releases.some((r) => r.sourceName === 'DVDs Release Dates')
      ? 'The original source no longer shows a digital release section. Its previous date is kept here until it can be verified again.'
      : 'This film’s source page has no digital release listing. No date has been inferred from its DVD or cinema release.';
  if (releaseCheckDue(movie, now) && movie.releases.length)
    return 'These dates are awaiting a source refresh. Check the last successful source date below.';
  return undefined;
}
