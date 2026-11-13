import { automaticEvidence, UnresolvedRelease } from './release-automation';
import {
  getMetadataEvidence,
  findListingEvidence,
  UnsupportedMediaType,
  type MetadataEvidence,
} from './metadata';
import { verifiedIdentityId } from './film-identity';
import { sameReleaseTitle, releaseSearchTitle, samePersonName } from './release-evidence';
import type { SourceProfile } from './release-profile';
import type { Movie } from './model';

export function knownProfileMovies(profile: SourceProfile, movies: Movie[]) {
  const unique = new Map<string, Movie>();
  for (const movie of movies) {
    const id = verifiedIdentityId(movie);
    if (
      !id ||
      movie.mediaType === 'series' ||
      !(
        sameReleaseTitle(profile.title, movie.title, profile.facts?.nonfiction) ||
        sameReleaseTitle(
          releaseSearchTitle(profile.title, profile.facts?.nonfiction, profile.directors),
          movie.title,
          profile.facts?.nonfiction,
        )
      )
    )
      continue;
    const before = unique.get(id);
    if (!before || movie.source.startsWith('https://www.dvdsreleasedates.com/movies/'))
      unique.set(id, movie);
  }
  return [...unique.values()];
}

/** Every shortlisted candidate retains its place until independently checked. */
export async function corroborateCandidates(
  profile: SourceProfile,
  movies: Movie[],
  signal: AbortSignal,
): Promise<MetadataEvidence> {
  // Year only shortlists crowded ordinary titles; independent credits still establish identity.
  // Keep unknown years and presentation editions, whose heading can use a rerelease year.
  if (movies.length > 3 && !/\b(?:anniversary|restoration)\b/i.test(profile.title))
    movies = movies.filter(
      (movie) => !movie.year || Math.abs(Number(movie.year) - Number(profile.year)) <= 2,
    );
  if (movies.length > 3) throw new UnresolvedRelease('ambiguous_identity');
  const checked = await Promise.all(
    movies.map(async (movie) => {
      const id = verifiedIdentityId(movie);
      if (!id) throw new UnresolvedRelease('conflicting_identity');
      try {
        return await getMetadataEvidence(id, signal);
      } catch (error) {
        // Positive evidence excludes this candidate, not the WTS film's other namesakes.
        if (error instanceof UnsupportedMediaType) return null;
        if (signal.aborted) throw error;
        const primary = await findListingEvidence(movie, signal);
        if (!primary) throw error;
        return primary;
      }
    }),
  );
  const candidates = checked.filter((candidate) => candidate !== null);
  if (!candidates.length && checked.length) throw new UnresolvedRelease('insufficient_evidence');
  try {
    return automaticEvidence(profile, candidates);
  } catch (error) {
    if (
      signal.aborted ||
      !(error instanceof UnresolvedRelease) ||
      error.message !== 'insufficient_evidence'
    )
      throw error;
    const primary = await Promise.all(
      candidates.map(async (candidate) => {
        if (candidate.primaryIdentityVerified) return candidate;
        const primary = await findListingEvidence(
          movies.find((movie) => verifiedIdentityId(movie) === candidate.movie.id)!,
          signal,
        );
        if (!primary) return candidate;
        if (primary.movie.id !== candidate.movie.id)
          throw new UnresolvedRelease('conflicting_identity');
        if (
          primary.directors.length &&
          candidate.directors.length &&
          !primary.directors.some((name) =>
            candidate.directors.some((other) => samePersonName(name, other)),
          )
        )
          throw new UnresolvedRelease('insufficient_evidence');
        // Both sources have independently checked this exact IMDb subject. Retain their
        // complementary credits and synopsis instead of replacing richer metadata.
        return {
          ...primary,
          movie: {
            ...primary.movie,
            overview: primary.movie.overview || candidate.movie.overview,
            overviewSource: primary.movie.overview
              ? primary.movie.overviewSource
              : candidate.movie.overviewSource,
          },
          directors: [...new Set([...primary.directors, ...candidate.directors])],
          cast: [...new Set([...primary.cast, ...candidate.cast])],
          facts: {
            ...candidate.facts,
            ...Object.fromEntries(
              Object.entries(primary.facts || {}).filter(([, value]) => value !== undefined),
            ),
          },
        };
      }),
    );
    return automaticEvidence(profile, primary);
  }
}
