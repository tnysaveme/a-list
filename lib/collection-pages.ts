type Page<T> = { movies: T[]; nextOffset: number | null };

/** Refresh the loaded range atomically. Never publish a half-refreshed collection. */
export async function refreshLoadedPages<T extends { id: string }, P extends Page<T>>(
  read: (offset: number) => Promise<P>,
  extent: number,
): Promise<P> {
  const movies = new Map<string, T>();
  let offset = 0;
  for (;;) {
    const page = await read(offset);
    for (const movie of page.movies) if (!movies.has(movie.id)) movies.set(movie.id, movie);
    if (page.nextOffset === null || page.nextOffset >= extent)
      return { ...page, movies: [...movies.values()] };
    if (page.nextOffset <= offset) throw new Error('The collection returned an invalid next page.');
    offset = page.nextOffset;
  }
}
