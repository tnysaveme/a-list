import type { Movie } from './model';
import { filmIndex, verifiedIdentityId, conflictingIdentity } from './film-identity';
import { assertListingSource, listingImdbId } from './source-identity';
import { fetchSource, parseDetail, parseVerifiedReport, type ReleaseReport } from './sources';
import type { ReviewedReportIdentity } from './reviewed-report-identities';
import { reviewedReportIdentity } from './reviewed-report-identities';
import { text } from './sources';
import { parseSourceProfile, profileFingerprint, SourceProfileConflict } from './release-profile';

/** Existing mappings need current native evidence; a failed fetch is not a withdrawal. */
export async function fetchVerifiedReport(
  report: ReleaseReport,
  identities: readonly ReviewedReportIdentity[] | undefined,
  signal: AbortSignal,
  profiles = new Map<string, Promise<string>>(),
  fresh = false,
) {
  let page = profiles.get(report.release.source);
  if (!page) {
    page = fetchSource(report.release.source, {
      signal,
      ...(fresh ? { cache: 'no-store' as const } : {}),
    });
    profiles.set(report.release.source, page);
  }
  const html = await page;
  const mapping =
    reviewedReportIdentity(html, report.title, text, identities) ||
    identities?.find(
      (identity) =>
        identity.sourceFilmUrl === report.release.source && identity.imdbId === report.imdbId,
    );
  if (mapping?.profileFingerprint) {
    let profile = profiles.get(mapping.sourceFilmUrl);
    if (!profile) {
      profile = fetchSource(mapping.sourceFilmUrl, { signal });
      profiles.set(mapping.sourceFilmUrl, profile);
    }
    const native = await profile;
    try {
      if (profileFingerprint(parseSourceProfile(native, mapping)) !== mapping.profileFingerprint)
        return null;
    } catch (error) {
      if (error instanceof SourceProfileConflict) return null;
      throw error;
    }
  }
  return parseVerifiedReport(html, report, identities);
}

const MAX_VERIFICATIONS = 4;

/** Search stays bounded even when many titles collide. Failures keep providers separate. */
export async function verifySearchListings(listings: Movie[], metadata: Movie[]): Promise<Movie[]> {
  const index = filmIndex(metadata);
  const candidates = listings
    .filter(
      (movie) =>
        !verifiedIdentityId(movie) &&
        !conflictingIdentity(movie) &&
        movie.year &&
        index.candidates(movie).length,
    )
    .slice(0, MAX_VERIFICATIONS);
  if (!candidates.length) return listings;
  const signal = AbortSignal.timeout(3500);
  const checked = await Promise.allSettled(
    candidates.map(async (movie) => {
      const html = await fetchSource(movie.source, { signal });
      // This detail belongs to the listing's native ID. Title/year never supplies an IMDb ID.
      const verified = parseDetail(html, movie);
      return [movie.id, verified] as const;
    }),
  );
  const verified = new Map(
    checked.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
  );
  return listings.map((movie) => verified.get(movie.id) || movie);
}

export type ReportDecisions = {
  matched: number;
  unresolved: number;
  ambiguous: number;
  conflict: number;
};

/** Shared import gate for current enrichment and future independent report discovery. */
export function attachVerifiedReports(movies: Movie[], reports: ReleaseReport[]) {
  const index = filmIndex(movies),
    additions = new Map<string, ReleaseReport[]>();
  const decisions: ReportDecisions = { matched: 0, unresolved: 0, ambiguous: 0, conflict: 0 };
  for (const report of reports) {
    const decision = index.resolve(report);
    if (
      decision.status !== 'matched' ||
      !report.imdbId ||
      report.release.filmImdbId !== report.imdbId
    ) {
      decisions[
        decision.status === 'conflict'
          ? 'conflict'
          : decision.status === 'ambiguous'
            ? 'ambiguous'
            : 'unresolved'
      ]++;
      continue;
    }
    const movie = decision.candidates[0],
      bucket = additions.get(movie.id) || [];
    bucket.push(report);
    additions.set(movie.id, bucket);
    decisions.matched++;
  }
  return {
    movies: movies.map((movie) => {
      const releases = [...movie.releases];
      const updated = new Set<string>();
      for (const { release } of additions.get(movie.id) || []) {
        const existing = releases.findIndex((current) => current.kind === release.kind);
        // Preserve the main source's listed dates and the current calendar window model.
        if (updated.has(release.kind)) continue;
        if (existing === -1) releases.push(release);
        else if (
          releases[existing].confidence === 'rumored' ||
          releases[existing].sourceName === 'When To Stream'
        )
          releases[existing] = release;
        updated.add(release.kind);
      }
      return { ...movie, releases };
    }),
    decisions,
  };
}

/** Enrich existing catalogue records; independent imports use the automatic identity gate. */
export async function enrichCatalogueReports(
  movies: Movie[],
  reports: ReleaseReport[],
  identities?: readonly ReviewedReportIdentity[],
  parent?: AbortSignal,
) {
  const index = filmIndex(movies);
  const candidates = reports
    .filter(
      (report) => index.resolve(report).status === 'matched' || index.candidates(report).length,
    )
    .slice(0, MAX_VERIFICATIONS);
  if (!candidates.length)
    return attachVerifiedReports(
      movies,
      reports.map((report) => ({ ...report, imdbId: undefined })),
    );
  const deadline = AbortSignal.timeout(6000),
    signal = parent ? AbortSignal.any([parent, deadline]) : deadline,
    profiles = new Map<string, Promise<string>>();
  const checked = await Promise.allSettled(
    candidates.map((report) => fetchVerifiedReport(report, identities, signal, profiles)),
  );
  const verified = checked.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : [],
  );
  const withheld = new Set(
    checked.flatMap((result, index) =>
      result.status === 'fulfilled' && !result.value ? [candidates[index].release.source] : [],
    ),
  );

  // Fetch each native film page once per ingestion, with a separate item cap.
  const details = new Map<string, Movie>();
  for (const report of verified)
    for (const movie of index.candidates(report)) {
      if (
        !verifiedIdentityId(movie) &&
        !conflictingIdentity(movie) &&
        details.size < MAX_VERIFICATIONS
      )
        details.set(movie.id, movie);
    }
  const linked = await Promise.allSettled(
    [...details.values()].map(async (movie) => {
      assertListingSource(movie);
      const id = listingImdbId(await fetchSource(movie.source, { signal }));
      return [movie.id, id] as const;
    }),
  );
  const ids = new Map(
    linked.flatMap((result) =>
      result.status === 'fulfilled' && result.value[1] ? [result.value] : [],
    ),
  );
  const linkedMovies = movies.map((movie) => ({
    ...movie,
    ...(ids.has(movie.id)
      ? { imdbId: ids.get(movie.id), identityVerifiedAt: new Date().toISOString() }
      : {}),
    releases: movie.releases.filter((release) => !withheld.has(release.source)),
  }));
  const result = attachVerifiedReports(linkedMovies, verified);
  result.decisions.unresolved += reports.length - verified.length;
  return result;
}
