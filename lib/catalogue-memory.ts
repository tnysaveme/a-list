import type { Movie } from './model';
import { fallbackMovies } from './catalogue-fallback';
/** Personal membership stays local to this mounted browser view, separate from metadata snapshots. */
export class CatalogueMemory {
  readonly movies = new Map<string, Movie>();
  readonly membership = new Map<string, boolean>();
  readonly watched = new Map<string, string | null>();
  epoch = 0;
  constructor(initial: Movie[]) {
    this.remember(initial);
  }
  remember(movies: Movie[], membershipIsCurrent = true) {
    for (const movie of movies) {
      this.movies.set(movie.id, movie);
      if (membershipIsCurrent && typeof movie.saved === 'boolean') {
        this.membership.set(movie.id, movie.saved);
        this.watched.set(movie.id, movie.watchedAt || null);
      }
    }
  }
  recordMembership(values: Record<string, boolean>) {
    this.epoch++;
    for (const [id, saved] of Object.entries(values)) {
      this.membership.set(id, saved);
      if (!saved) this.watched.set(id, null);
    }
  }
  recordWatched(values: Record<string, string | null>) {
    this.epoch++;
    for (const [id, stamp] of Object.entries(values)) {
      this.watched.set(id, stamp);
      this.membership.set(id, true);
    }
  }
  fallback(snapshot: Movie[], includeKnown = false) {
    const ids = new Set(snapshot.map((movie) => movie.id));
    const source = includeKnown
      ? [...snapshot, ...[...this.movies.values()].filter((movie) => !ids.has(movie.id))]
      : snapshot;
    return fallbackMovies(source, this.movies).map((movie) =>
      this.membership.has(movie.id)
        ? {
            ...movie,
            saved: this.membership.get(movie.id),
            watchedAt: this.watched.get(movie.id) || null,
            tracked: this.membership.get(movie.id) && !this.watched.get(movie.id),
          }
        : movie,
    );
  }
}
