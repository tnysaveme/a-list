'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cataloguePage, type CatalogueOptions, type CataloguePage } from '../lib/catalogue-view';
import { getApi } from '../lib/client-api';
import { CatalogueMemory } from '../lib/catalogue-memory';
import type { Movie } from '../lib/model';

export function useCatalogue(
  initial: CataloguePage,
  onError: (message: string, error?: boolean) => void,
) {
  const [catalogue, setCatalogue] = useState(initial.movies);
  const [page, setPage] = useState(initial),
    [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null),
    fallback = useRef<Movie[] | null>(null);
  const [memory] = useState(() => new CatalogueMemory(initial.movies));
  const pages = useRef(new Map<string, CataloguePage>());
  const recordMembership = useCallback(
    (values: Record<string, boolean>) => memory.recordMembership(values),
    [memory],
  );
  const rememberMovie = useCallback(
    (movie: Movie) => {
      memory.remember([movie]);
      if (typeof movie.saved === 'boolean') memory.recordMembership({ [movie.id]: movie.saved });
    },
    [memory],
  );
  useEffect(() => () => current.current?.abort(), []);

  const load = useCallback(
    async (options: CatalogueOptions = {}, append = false, parent?: AbortSignal) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
      setBusy(true);
      const epoch = memory.epoch;
      try {
        const params = new URLSearchParams({
          sort: options.sort || 'release',
          filter: options.filter || 'all',
          offset: String(options.offset || 0),
        });
        let data: CataloguePage;
        try {
          data = await getApi(`catalogue?${params}`, signal);
          memory.remember(data.movies, epoch === memory.epoch);
          data = { ...data, movies: memory.fallback(data.movies) };
          pages.current.set(params.toString(), data);
          if (pages.current.size > 10) pages.current.delete(pages.current.keys().next().value!);
        } catch {
          if (signal.aborted) return false;
          fallback.current ??= (await import('../lib/catalogue.json')).default as Movie[];
          if (signal.aborted) return false;
          const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
          const previous = pages.current.get(params.toString());
          data = previous
            ? {
                ...previous,
                movies: memory.fallback(previous.movies),
                stale: true,
                provenance: 'fallback',
              }
            : {
                ...cataloguePage(memory.fallback(fallback.current, true), options, day),
                stale: true,
                checkedAt: null,
                provenance: 'fallback',
              };
        }
        if (signal.aborted) return false;
        setCatalogue((previous) => {
          if (!append) return data.movies;
          const ids = new Set(previous.map((movie) => movie.id));
          return [...previous, ...data.movies.filter((movie) => !ids.has(movie.id))];
        });
        setPage(data);
        return true;
      } catch (error) {
        if (!signal.aborted)
          onError(error instanceof Error ? error.message : 'Could not load films.', true);
        return false;
      } finally {
        if (current.current === controller) setBusy(false);
      }
    },
    [onError, memory],
  );
  return { catalogue, setCatalogue, page, busy, load, recordMembership, rememberMovie };
}
