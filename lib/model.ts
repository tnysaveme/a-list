export type Release = {
  kind: 'Digital' | 'PVOD' | 'Subscription';
  date: string;
  confidence: 'listed' | 'rumored';
  source: string;
  sourceName: string;
  evidence?: 'listing' | 'detail';
  platform?: string;
  checkedAt?: string;
  filmImdbId?: string;
  filmIdentityMethod?: 'structured' | 'reviewed' | 'corroborated';
  filmIdentitySource?: string;
};
import { verifiedIdentityId } from './film-identity';
export type Movie = {
  id: string;
  title: string;
  year: string;
  poster: string;
  source: string;
  overview?: string;
  overviewSource?: string;
  imdbId?: string;
  identityVerifiedAt?: string;
  metadataCheckedAt?: string;
  synopsisCheckedAt?: string;
  metadataIssue?: SourceIssue;
  mediaType?: 'movie' | 'series';
  releaseCheckedAt?: string;
  primaryListingUnavailable?: boolean;
  releaseCheck?: ReleaseCheck;
  /** Current detail lookup outcome; not a claim that no release date exists. */
  releaseLookupStatus?: 'unresolved' | 'unavailable';
  /** Response-only state; never persisted in movie records. */
  refreshPending?: boolean;
  rating?: string;
  theatrical?: string;
  releases: Release[];
  checkedAt: string;
  calendarUpdatedAt?: string;
  addedAt?: string;
  tracked?: boolean;
  saved?: boolean;
  discoveredFrom?: 'When To Stream';
};
export type SourceIssue = {
  provider: 'primary' | 'metadata' | 'wts';
  category:
    | 'timeout'
    | 'http_error'
    | 'format_changed'
    | 'identity_conflict'
    | 'not_listed'
    | 'unavailable';
  status?: number;
};
export type ReleaseCheck = {
  status: 'fresh' | 'partial' | 'failed';
  attemptedAt: string;
  issues: SourceIssue[];
};
export const verifiedReleases = (movie: Movie) =>
  movie.releases.filter(
    (release) =>
      release.sourceName !== 'When To Stream' ||
      (!!release.filmImdbId && release.filmImdbId === verifiedIdentityId(movie)),
  );
export const sanitizeMovie = (movie: Movie): Movie => ({
  ...movie,
  releases: verifiedReleases(movie),
});
export const validMovieId = (id: string) => /^(?:[0-9]{1,8}|tt[0-9]{7,10})$/.test(id);
export const releaseCheckDue = (movie: Movie, now = Date.now()) =>
  !movie.releaseCheckedAt ||
  !Number.isFinite(Date.parse(movie.releaseCheckedAt)) ||
  now - Date.parse(movie.releaseCheckedAt) >= 6 * 3600_000;
export const availableRelease = (
  movie: Movie,
  today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
) =>
  verifiedReleases(movie)
    .filter((r) => r.confidence === 'listed' && r.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
export const nextRelease = (
  movie: Movie,
  today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
) => {
  const sorted = verifiedReleases(movie).sort((a, b) => a.date.localeCompare(b.date));
  return sorted.find((r) => r.date >= today) || sorted.at(-1);
};
export const displayRelease = (movie: Movie, today?: string) =>
  availableRelease(movie, today) || nextRelease(movie, today);
export function mergeMovies(movies: Movie[]): Movie[] {
  const map = new Map<string, Movie>();
  for (const movie of movies) {
    const prev = map.get(movie.id);
    if (!prev) {
      map.set(movie.id, movie);
      continue;
    }
    const releases = new Map(prev.releases.map((release) => [release.kind, release]));
    for (const release of movie.releases) {
      const before = releases.get(release.kind);
      // An unqualified calendar cell cannot confirm an explicit estimate on the film page.
      if (
        before?.sourceName === 'DVDs Release Dates' &&
        release.sourceName === before.sourceName &&
        before.evidence === 'detail' &&
        release.evidence === 'listing' &&
        before.date === release.date &&
        before.confidence === 'rumored' &&
        release.confidence === 'listed'
      )
        continue;
      releases.set(release.kind, release);
    }
    map.set(movie.id, { ...prev, ...movie, releases: [...releases.values()] });
  }
  return [...map.values()].map(sanitizeMovie);
}

export function calendarReleases(movie: Movie, includeRumors = true) {
  return verifiedReleases(movie).filter((r) => {
    const parsed = new Date(`${r.date}T13:00:00Z`);
    return (
      (includeRumors || r.confidence === 'listed') &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === r.date
    );
  });
}
export function calendarRelease(
  movie: Movie,
  includeRumors = true,
  today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
) {
  const releases = calendarReleases(movie, includeRumors).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return releases.find((r) => r.date >= today) || releases.at(-1);
}
