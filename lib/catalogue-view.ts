import {
  availableRelease,
  displayRelease,
  sanitizeMovie,
  verifiedReleases,
  type Movie,
} from './model';

/** The selected window must be the one that qualified the film for this view. */
export function releaseForView(movie: Movie, filter: string, today: string) {
  const releases = verifiedReleases(movie).sort((a, b) => a.date.localeCompare(b.date));
  if (filter === 'soon') return releases.find((r) => r.date >= today);
  if (filter === 'rumored') {
    const reported = releases.filter((r) => r.confidence === 'rumored');
    return reported.find((r) => r.date >= today) || reported.at(-1);
  }
  if (filter === 'available') return availableRelease(movie, today);
  return displayRelease(movie, today);
}

export type CatalogueOptions = {
  sort?: string;
  filter?: string;
  offset?: number;
  limit?: number;
  query?: string;
};
export type CataloguePage = {
  movies: Movie[];
  total: number;
  filteredTotal: number;
  nextOffset: number | null;
  stale: boolean;
};

/** Cards do not need synopsis and metadata payloads; details load on opening. */
export function movieCard(movie: Movie): Movie {
  const card = { ...sanitizeMovie(movie) };
  delete card.overview;
  delete card.overviewSource;
  delete card.metadataCheckedAt;
  delete card.synopsisCheckedAt;
  return card;
}

export function cataloguePage(
  movies: Movie[],
  options: CatalogueOptions,
  today: string,
): Omit<CataloguePage, 'stale'> {
  const term = options.query?.trim().toLowerCase();
  const filtered = discoverMovies(
    term ? movies.filter((movie) => movie.title.toLowerCase().includes(term)) : movies,
    options.filter || 'all',
    options.sort || 'release',
    today,
  );
  const offset = Math.max(0, Math.min(100000, options.offset || 0)),
    limit = Math.max(1, Math.min(50, options.limit || 25));
  const page = filtered.slice(offset, offset + limit).map(movieCard);
  return {
    movies: page,
    total: movies.length,
    filteredTotal: filtered.length,
    nextOffset: offset + page.length < filtered.length ? offset + page.length : null,
  };
}

/** Compute each film's release once, rather than inside every sort comparison. */
export function discoverMovies(
  catalogue: Movie[],
  filter: string,
  sort: string,
  today: string,
): Movie[] {
  const films = catalogue.map(sanitizeMovie).filter((movie) => {
    if (filter === 'soon') return movie.releases.some((release) => release.date >= today);
    if (filter === 'available')
      return movie.releases.some(
        (release) => release.date <= today && release.confidence === 'listed',
      );
    if (filter === 'unknown') return !movie.releases.length;
    if (filter === 'rumored')
      return movie.releases.some((release) => release.confidence === 'rumored');
    return true;
  });
  if (sort === 'title') return films.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'added')
    return films.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  if (sort === 'theatrical')
    return films.sort((a, b) => (b.theatrical || '').localeCompare(a.theatrical || ''));
  return films
    .map((movie) => {
      const date = releaseForView(movie, filter, today)?.date;
      return { movie, date: date || '9999', rank: !date ? 2 : date >= today ? 0 : 1 };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.date.localeCompare(b.date) ||
        a.movie.title.localeCompare(b.movie.title),
    )
    .map(({ movie }) => movie);
}
