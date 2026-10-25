import { validMovieId, type Movie, type SourceIssue } from './model';
import { getMetadata, imdbId } from './metadata';
import { fetchSource, parseDetail, parseSearchResults, parseSynopsis } from './sources';
import { fetchVerifiedReport } from './source-verification';
import { titleKey, identityId, verifiedIdentityId, conflictingIdentity } from './film-identity';
import { listingImdbId } from './source-identity';
import type { ReviewedReportIdentity } from './reviewed-report-identities';
import { MovieRefreshError, sourceIssue, logSourceIssue } from './source-errors';

export type SourceResult = { source: 'primary' | 'wts'; success: boolean; issue?: SourceIssue };
export async function refreshMovie(
  movie: Movie,
  {
    discoverReleases = true,
    identities,
    signal: parent,
    onSourceResult,
  }: {
    discoverReleases?: boolean;
    identities?: readonly ReviewedReportIdentity[];
    signal?: AbortSignal;
    onSourceResult?: (result: SourceResult) => void;
  } = {},
): Promise<Movie> {
  if (!validMovieId(movie.id)) throw new Error('Invalid film ID');
  if (conflictingIdentity(movie)) throw new Error('Film source identity mismatch');
  const deadline = AbortSignal.timeout(16000),
    signal = parent ? AbortSignal.any([parent, deadline]) : deadline;
  const requestOptions = { signal, ...(discoverReleases ? { cache: 'no-store' as const } : {}) };
  const source = new URL(movie.source);
  const dvd =
    source.protocol === 'https:' &&
    source.hostname === 'www.dvdsreleasedates.com' &&
    /^\/movies\/\d{1,8}\//.test(source.pathname);
  if (dvd && !imdbId(movie.id) && source.pathname.split('/')[2] !== movie.id)
    throw new Error('Film source identity mismatch');
  if (
    !dvd &&
    !(
      imdbId(movie.id) &&
      source.protocol === 'https:' &&
      source.hostname === 'www.imdb.com' &&
      source.pathname === `/title/${movie.id}/`
    )
  )
    throw new Error('Invalid film source');
  const reports = discoverReleases
    ? [
        ...new Map(
          movie.releases.filter((r) => r.sourceName === 'When To Stream').map((r) => [r.source, r]),
        ).values(),
      ]
    : [];
  const profiles = new Map<string, Promise<string>>();
  // Independent source requests start together so a slow primary cannot consume WTS's deadline.
  const reportWork = Promise.allSettled(
    reports.map(async (release) => {
      const report = await fetchVerifiedReport(
        { title: movie.title, year: movie.year, imdbId: identityId(movie), release },
        identities,
        signal,
        profiles,
        true,
      );
      return report && report.imdbId === identityId(movie) ? report.release : null;
    }),
  );
  let result = { ...movie },
    primaryError: unknown,
    provider: SourceIssue['provider'] = 'primary';
  const issues: SourceIssue[] = [];
  try {
    if (dvd) {
      const html = await fetchSource(movie.source, requestOptions);
      if (verifiedIdentityId(movie) && listingImdbId(html) !== verifiedIdentityId(movie))
        throw new Error('Film source identity mismatch');
      try {
        result = parseDetail(html, movie);
      } catch (error) {
        if (discoverReleases) throw error;
        const overview = parseSynopsis(html),
          id = listingImdbId(html);
        if (!overview && !id) throw error;
        const repaired = !!id && !!movie.imdbId && id !== movie.imdbId;
        result = {
          ...movie,
          imdbId: id,
          identityVerifiedAt: id ? new Date().toISOString() : undefined,
          ...(repaired ? { overview: undefined, overviewSource: undefined } : {}),
          ...(overview ? { overview, overviewSource: movie.source } : {}),
          metadataCheckedAt: new Date().toISOString(),
        };
      }
    }
    const id = result.imdbId || (imdbId(movie.id) ? movie.id : undefined);
    if (id && result.mediaType !== 'series' && (!dvd || !result.overview)) {
      provider = 'metadata';
      try {
        const meta = await getMetadata(id, signal);
        result = {
          ...result,
          imdbId: id,
          year: result.year || meta.year,
          poster: result.poster || meta.poster,
          overview: !dvd ? meta.overview || result.overview : result.overview || meta.overview,
          overviewSource:
            !dvd && meta.overview
              ? meta.overviewSource
              : result.overview
                ? result.overviewSource
                : meta.overviewSource,
          metadataCheckedAt: meta.metadataCheckedAt,
          metadataIssue: undefined,
        };
      } catch (error) {
        result.metadataIssue = sourceIssue(error, 'metadata');
        logSourceIssue(movie.id, result.metadataIssue);
      }
    }
    if (!dvd && discoverReleases && id) {
      provider = 'primary';
      const html = await fetchSource('https://www.dvdsreleasedates.com/search/', {
        ...requestOptions,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ searchStr: movie.title }).toString(),
      });
      const matches = parseSearchResults(html).filter(
        (m) =>
          titleKey(m.title) === titleKey(movie.title) &&
          (!m.year || !movie.year || m.year === movie.year),
      );
      result.primaryListingUnavailable = true;
      for (const match of matches.slice(0, 2)) {
        const detail = await fetchSource(match.source, requestOptions);
        if (listingImdbId(detail) !== id) continue;
        result = parseDetail(detail, { ...result, source: match.source });
        break;
      }
      result.releaseCheckedAt = new Date().toISOString();
    }
    if (discoverReleases) onSourceResult?.({ source: 'primary', success: true });
  } catch (error) {
    primaryError = error;
    result = { ...movie };
    const issue = sourceIssue(error, provider);
    issues.push(issue);
    logSourceIssue(movie.id, issue);
    if (discoverReleases) onSourceResult?.({ source: 'primary', success: false, issue });
  }
  const refreshed = await reportWork;
  if (discoverReleases) {
    result.releases = result.releases.filter((r) => r.sourceName !== 'When To Stream');
    for (const [index, outcome] of refreshed.entries()) {
      if (outcome.status === 'rejected') {
        const issue = sourceIssue(outcome.reason, 'wts');
        issues.push(issue);
        logSourceIssue(movie.id, issue);
      }
      const report = outcome.status === 'fulfilled' ? outcome.value : reports[index];
      if (
        report &&
        report.filmImdbId === verifiedIdentityId(result) &&
        !result.releases.some((r) => r.kind === report.kind)
      )
        result.releases.push(report);
    }
    if (reports.length)
      onSourceResult?.({
        source: 'wts',
        success: refreshed.every((r) => r.status === 'fulfilled'),
      });
    if (primaryError || refreshed.some((r) => r.status === 'rejected'))
      result.releaseCheckedAt = movie.releaseCheckedAt;
  }
  if (discoverReleases)
    result.releaseCheck = {
      status: issues.length ? 'partial' : 'fresh',
      attemptedAt: new Date().toISOString(),
      issues,
    };
  if (primaryError && !refreshed.some((r) => r.status === 'fulfilled')) {
    result.releaseCheck = { status: 'failed', attemptedAt: new Date().toISOString(), issues };
    throw new MovieRefreshError(result, primaryError);
  }
  return {
    ...result,
    metadataCheckedAt: new Date().toISOString(),
    synopsisCheckedAt: new Date().toISOString(),
    ...(!discoverReleases
      ? {
          releases: movie.releases,
          checkedAt: movie.checkedAt,
          releaseCheckedAt: movie.releaseCheckedAt,
        }
      : {}),
  };
}
