import { selectRelease, sanitizeMovie, verifiedReleases, type Movie } from './model';

/** The selected window must be the one that qualified the film for this view. */
export function releaseForView(movie: Movie, filter: string, today: string) {
  return selectRelease(verifiedReleases(movie), today, filter);
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
  checkedAt?: string | null;
  provenance?: 'live' | 'fallback';
};

/** A bounded synopsis powers hover previews; complete details still load on opening. */
export function movieCard(movie: Movie): Movie {
  const card = { ...sanitizeMovie(movie) };
  if (card.overview) card.overview = card.overview.slice(0, 320);
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
  const films = movies.filter((movie) => movie.mediaType !== 'series');
  const term = options.query?.trim().toLowerCase();
  const filtered = discoverMovies(
    term ? films.filter((movie) => movie.title.toLowerCase().includes(term)) : films,
    options.filter || 'all',
    options.sort || 'release',
    today,
  );
  const offset = Math.max(0, Math.min(100000, options.offset || 0)),
    limit = Math.max(1, Math.min(50, options.limit || 25));
  const page = filtered.slice(offset, offset + limit).map(movieCard);
  return {
    movies: page,
    total: films.length,
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
    if (filter === 'soon') return movie.releases.some((release) => release.date > today);
    if (filter === 'available')
      return movie.releases.some(
        (release) => release.date <= today && release.confidence === 'listed',
      );
    if (filter === 'unknown') return !movie.releases.length;
    if (filter === 'rumored')
      return movie.releases.some((release) => release.confidence === 'rumored');
    return true;
  });
  return films
    .map((movie) => {
      const date =
        sort === 'title'
          ? undefined
          : sort === 'added'
            ? movie.addedAt
            : sort === 'theatrical'
              ? movie.theatrical
              : selectRelease(movie.releases, today, filter)?.date;
      return {
        movie,
        title: movie.title.toLowerCase(),
        date: date || (sort === 'added' || sort === 'theatrical' ? '' : '9999'),
        rank: !date ? 2 : date >= today ? 0 : 1,
      };
    })
    .sort(
      (a, b) =>
        (sort === 'title'
          ? 0
          : sort === 'added' || sort === 'theatrical' || filter === 'available'
            ? b.date.localeCompare(a.date)
            : a.rank - b.rank || a.date.localeCompare(b.date)) ||
        compareText(a.title, b.title) ||
        compareText(a.movie.id, b.movie.id),
    )
    .map(({ movie }) => movie);
}

function compareText(a: string, b: string) {
  let left = 0,
    right = 0;
  while (left < a.length && right < b.length) {
    const leftPoint = a.codePointAt(left)!,
      rightPoint = b.codePointAt(right)!;
    const difference = leftPoint - rightPoint;
    if (difference) return difference;
    left += leftPoint > 0xffff ? 2 : 1;
    right += rightPoint > 0xffff ? 2 : 1;
  }
  return Number(left < a.length) - Number(right < b.length);
}
