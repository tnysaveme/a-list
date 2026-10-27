import type { Movie } from './model';
import { fallbackMovies } from './catalogue-fallback';
/** Personal membership stays local to this mounted browser view, separate from metadata snapshots. */
export class CatalogueMemory {
  readonly movies = new Map<string, Movie>();
  readonly membership = new Map<string, boolean>();
  epoch = 0;
  constructor(initial: Movie[]) {
    this.remember(initial);
  }
  remember(movies: Movie[], membershipIsCurrent = true) {
    for (const movie of movies) {
      this.movies.set(movie.id, movie);
      if (membershipIsCurrent && typeof movie.saved === 'boolean')
        this.membership.set(movie.id, movie.saved);
    }
  }
  recordMembership(values: Record<string, boolean>) {
    this.epoch++;
    for (const [id, saved] of Object.entries(values)) this.membership.set(id, saved);
  }
  fallback(snapshot: Movie[], includeKnown = false) {
    const ids = new Set(snapshot.map((movie) => movie.id));
    const source = includeKnown
      ? [...snapshot, ...[...this.movies.values()].filter((movie) => !ids.has(movie.id))]
      : snapshot;
    return fallbackMovies(source, this.movies).map((movie) =>
      this.membership.has(movie.id)
        ? { ...movie, saved: this.membership.get(movie.id), tracked: this.membership.get(movie.id) }
        : movie,
    );
  }
}
