import { releaseDay, validReleaseDate } from './release-day';
export type Release = {
  kind: 'Digital' | 'PVOD' | 'Subscription';
  date: string;
  confidence: 'listed' | 'rumored';
  source: string;
  sourceName: string;
  evidence?: 'listing' | 'detail';
  platform?: string;
  checkedAt?: string;
  conflictingRelease?: Release;
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
  /** Personal library state; excluded from the release calendar when set. */
  watchedAt?: string | null;
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
      validReleaseDate(release.date) &&
      (release.confidence === 'listed' || release.confidence === 'rumored') &&
      (release.sourceName !== 'When To Stream' ||
        (!!release.filmImdbId && release.filmImdbId === verifiedIdentityId(movie))),
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
/** Select from verified windows in one pass, preserving date/confidence tie ordering. */
export function selectRelease(releases: readonly Release[], today: string, filter = 'all') {
  let available: Release | undefined, upcoming: Release | undefined, latest: Release | undefined;
  for (const release of releases) {
    if (filter === 'rumored' && release.confidence !== 'rumored') continue;
    if (
      release.confidence === 'listed' &&
      release.date <= today &&
      (!available || release.date >= available.date)
    )
      available = release;
    if (
      (filter === 'soon' ? release.date > today : release.date >= today) &&
      (!upcoming || compareReleaseDays(release, upcoming) < 0)
    )
      upcoming = release;
    if (
      !latest ||
      release.date > latest.date ||
      (release.date === latest.date &&
        (filter === 'rumored' || compareReleaseDays(release, latest) < 0))
    )
      latest = release;
  }
  if (filter === 'available') return available;
  if (filter === 'soon') return upcoming;
  if (filter === 'next' || filter === 'rumored') return upcoming || latest;
  return available || upcoming || latest;
}
export const availableRelease = (movie: Movie, today = releaseDay()) =>
  selectRelease(verifiedReleases(movie), today, 'available');
export const nextRelease = (movie: Movie, today = releaseDay()) =>
  selectRelease(verifiedReleases(movie), today, 'next');
export const displayRelease = (movie: Movie, today = releaseDay()) =>
  selectRelease(verifiedReleases(movie), today);
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

/** Prefer a listed release when several windows share the same calendar day. */
export function compareReleaseDays(a: Release, b: Release) {
  return (
    a.date.localeCompare(b.date) ||
    Number(a.confidence === 'rumored') - Number(b.confidence === 'rumored')
  );
}
export function calendarReleases(movie: Movie, includeRumors = true) {
  return verifiedReleases(movie).filter((r) => includeRumors || r.confidence === 'listed');
}
/** One reminder per movie/date; a fixed kind order keeps the surviving legacy UID predictable. */
export function calendarReleaseGroups(movie: Movie, includeRumors = true): Release[][] {
  const kinds: Release['kind'][] = ['Digital', 'PVOD', 'Subscription'];
  const releases = calendarReleases(movie, includeRumors).sort(
    (a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind),
  );
  const groups = new Map<string, Release[]>();
  for (const release of releases) {
    const group = groups.get(release.date);
    if (group) group.push(release);
    else groups.set(release.date, [release]);
  }
  return [...groups.values()];
}
export function calendarRelease(movie: Movie, includeRumors = true, today = releaseDay()) {
  return selectRelease(calendarReleases(movie, includeRumors), today, 'next');
}
