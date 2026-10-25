import { filmIndex, verifiedIdentityId } from './film-identity';
import { mergeMovies, type Movie } from './model';

/** Approved imports keep their canonical IDs when the main source later lists them. */
export function mergeImportedCatalogue(primary: Movie[], imports: Movie[]): Movie[] {
  const index = filmIndex(imports),
    seen = new Set<string>();
  const movies = primary.map((movie) => {
    const decision = index.resolve(movie);
    if (decision.status !== 'matched') return movie;
    const imported = decision.candidates[0];
    seen.add(imported.id);
    const merged = mergeMovies([imported, { ...movie, id: imported.id }])[0];
    return {
      ...merged,
      id: imported.id,
      imdbId: verifiedIdentityId(imported),
      identityVerifiedAt: movie.identityVerifiedAt || imported.identityVerifiedAt,
    };
  });
  const nativeIds = new Set(movies.map((movie) => movie.id));
  return mergeMovies([
    ...movies,
    ...imports.filter((movie) => !seen.has(movie.id) && !nativeIds.has(movie.id)),
  ]);
}
