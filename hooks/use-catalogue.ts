'use client';
import {
  collectionFreshMs,
  initialQuery,
  sameQuery,
  type CollectionError,
} from '../lib/collection-query';
import { transitionContent } from '../lib/content-motion';
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { cataloguePage, type CatalogueOptions, type CataloguePage } from '../lib/catalogue-view';
import { getApi } from '../lib/client-api';
import { CatalogueMemory } from '../lib/catalogue-memory';
import type { Movie } from '../lib/model';
import { refreshLoadedPages } from '../lib/collection-pages';
import { useCollectionAnchor } from './use-collection-anchor';

export function useCatalogue(
  initial: CataloguePage,
  onError: (message: string, error?: boolean) => void,
) {
  const [catalogue, updateCatalogue] = useState(initial.movies);
  const [page, setPage] = useState(initial),
    [busy, setBusy] = useState(false);
  const [loadReason, setLoadReason] = useState<'replace' | 'append' | 'refresh' | null>(null);
  const [displayQuery, setDisplayQuery] = useState(initialQuery);
  const [loadError, setLoadError] = useState<CollectionError | null>(null);
  const applied = useRef(initialQuery);
  const freshAt = useRef(0);
  useEffect(() => {
    if (!initial.stale) freshAt.current = Date.now();
  }, [initial.stale]);
  const setCatalogue = useCallback((value: SetStateAction<Movie[]>) => {
    freshAt.current = 0;
    updateCatalogue(value);
  }, []);
  const extent = useRef(25);
  const loading = useRef(false);
  const query = useRef<CatalogueOptions>({});
  const captureAnchor = useCollectionAnchor(catalogue);
  const current = useRef<AbortController | null>(null),
    fallback = useRef<Movie[] | null>(null);
  const [memory] = useState(() => new CatalogueMemory(initial.movies));
  const pages = useRef(new Map<string, CataloguePage>());
  const recordMembership = useCallback(
    (values: Record<string, boolean>) => {
      freshAt.current = 0;
      memory.recordMembership(values);
    },
    [memory],
  );
  const rememberMovie = useCallback(
    (movie: Movie) => {
      freshAt.current = 0;
      memory.remember([movie]);
      if (typeof movie.saved === 'boolean') memory.recordMembership({ [movie.id]: movie.saved });
    },
    [memory],
  );
  useEffect(() => () => current.current?.abort(), []);

  const load = useCallback(
    async (
      options: CatalogueOptions = {},
      append = false,
      parent?: AbortSignal,
      refresh = false,
      animate = false,
    ) => {
      if (refresh && loading.current) return false;
      const requested = { sort: options.sort || 'release', filter: options.filter || 'all' };
      if (
        !refresh &&
        !append &&
        !loading.current &&
        sameQuery(applied.current, requested) &&
        Date.now() - freshAt.current < collectionFreshMs
      ) {
        setLoadError(null);
        return true;
      }
      if (!refresh) query.current = requested;
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
      setLoadError(null);
      setBusy(true);
      loading.current = true;
      setLoadReason(refresh ? 'refresh' : append ? 'append' : 'replace');
      const epoch = memory.epoch;
      try {
        const read = async (offset: number): Promise<CataloguePage> => {
          const params = new URLSearchParams({
            sort: options.sort || 'release',
            filter: options.filter || 'all',
            offset: String(offset),
          });
          // A changed revision must not acknowledge an older Redis snapshot. The first
          // page rebuilds from stored rows; subsequent loaded pages reuse that cache.
          if (refresh && offset === 0) params.set('fresh', 'true');
          let data: CataloguePage;
          try {
            data = await getApi(`catalogue?${params}`, signal);
            memory.remember(data.movies, epoch === memory.epoch);
            data = { ...data, movies: memory.fallback(data.movies) };
            pages.current.set(params.toString(), data);
            if (pages.current.size > 10) pages.current.delete(pages.current.keys().next().value!);
          } catch {
            signal.throwIfAborted();
            fallback.current ??= (await import('../lib/catalogue.json')).default as Movie[];
            signal.throwIfAborted();
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
                  ...cataloguePage(
                    memory.fallback(fallback.current, true),
                    { ...options, offset },
                    day,
                  ),
                  stale: true,
                  checkedAt: null,
                  provenance: 'fallback',
                };
          }
          signal.throwIfAborted();
          // A partial background refresh must not replace the last coherent live range.
          if (refresh && data.stale)
            throw new Error('Could not refresh films. Keeping the loaded films.');
          return data;
        };
        const data = refresh
          ? await refreshLoadedPages(read, extent.current)
          : await read(options.offset || 0);
        if (signal.aborted) return false;
        if (refresh) captureAnchor();
        data.movies = memory.fallback(data.movies);
        const commit = () => {
          if (!refresh)
            extent.current = append ? Math.max(extent.current, (options.offset || 0) + 25) : 25;
          updateCatalogue((previous) => {
            if (!append) return data.movies;
            const ids = new Set(previous.map((movie) => movie.id));
            return [...previous, ...data.movies.filter((movie) => !ids.has(movie.id))];
          });
          setPage(data);
          applied.current = requested;
          freshAt.current = data.stale ? 0 : Date.now();
          setDisplayQuery(requested);
        };
        if (animate)
          return await transitionContent(
            commit,
            'results',
            () => !signal.aborted && current.current === controller,
          );
        commit();
        return true;
      } catch (error) {
        if (!signal.aborted && current.current === controller) {
          query.current = applied.current;
          setLoadError({ query: requested, offset: options.offset || 0, append, refresh });
          onError(error instanceof Error ? error.message : 'Could not load films.', true);
        }
        return false;
      } finally {
        if (current.current === controller) {
          loading.current = false;
          setBusy(false);
          setLoadReason(null);
        }
      }
    },
    [onError, memory, captureAnchor],
  );
  const refresh = useCallback(
    (signal?: AbortSignal) => load(query.current, false, signal, true),
    [load],
  );
  return {
    catalogue,
    setCatalogue,
    page,
    busy,
    loadReason,
    displayFilter: displayQuery.filter,
    displayQuery,
    loadError,
    load,
    refresh,
    recordMembership,
    rememberMovie,
  };
}
