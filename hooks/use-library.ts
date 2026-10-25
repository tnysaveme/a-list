'use client';
import { useCallback, useRef, useState } from 'react';
import { requestApi } from '../lib/client-api';
import type { Movie } from '../lib/model';
import type { LibraryPage } from '../lib/pagination';
import { applyLibraryBatch, type LibraryAction } from '../lib/library-batch';

export type LibraryInit = LibraryPage & {
  feedPath: string;
  feedPublic: boolean;
  includeRumors: boolean;
};
const emptyPage: LibraryPage = {
  movies: [],
  total: 0,
  filteredTotal: 0,
  trackedCount: 0,
  knownCount: 0,
  listedEvents: 0,
  rumoredEvents: 0,
  upcoming: null,
  nextOffset: null,
};
export function useLibrary(
  sort: string,
  filter: string,
  notify: (message: string, error?: boolean) => void,
) {
  const [library, setLibrary] = useState<Movie[]>([]),
    [page, setPage] = useState(emptyPage);
  const [ready, setReady] = useState(false),
    [initializing, setInitializing] = useState(true),
    [pageBusy, setPageBusy] = useState(false),
    [busy, setBusy] = useState(false);
  const pageRequest = useRef(0),
    mutating = useRef(false);
  const initialize = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await requestApi<LibraryInit>('init', {}, signal);
        if (signal?.aborted) return;
        setLibrary(data.movies);
        setPage(data);
        setReady(true);
        return data;
      } catch (error) {
        if (!signal?.aborted) notify((error as Error).message, true);
      } finally {
        if (!signal?.aborted) setInitializing(false);
      }
    },
    [notify],
  );
  const loadLibrary = useCallback(
    async (offset = 0, append = false, options = { sort, filter }, signal?: AbortSignal) => {
      const request = ++pageRequest.current;
      setPageBusy(true);
      try {
        const data = await requestApi<LibraryPage>(
          `library?sort=${options.sort}&filter=${options.filter}&offset=${offset}`,
          undefined,
          signal,
        );
        if (signal?.aborted || request !== pageRequest.current) return false;
        setLibrary((current) => {
          if (!append) return data.movies;
          const ids = new Set(current.map((movie) => movie.id));
          return [...current, ...data.movies.filter((movie) => !ids.has(movie.id))];
        });
        setPage(data);
        return true;
      } catch (error) {
        if (!signal?.aborted && request === pageRequest.current)
          notify((error as Error).message, true);
        return false;
      } finally {
        if (request === pageRequest.current) setPageBusy(false);
      }
    },
    [sort, filter, notify],
  );
  const mutate = useCallback(
    async (action: LibraryAction, ids: string[]) => {
      if (mutating.current) return null;
      mutating.current = true;
      setBusy(true);
      pageRequest.current++;
      try {
        const result = await applyLibraryBatch(action, ids, {
          read: async (chunk) =>
            (
              await requestApi<{ membership: Record<string, boolean> }>(
                `library/membership?ids=${chunk.join(',')}`,
              )
            ).membership,
          write: async (action, chunk) => {
            await requestApi('library', { action, ids: chunk });
          },
        });
        const affected = new Set(result.completedIds);
        if (action === 'remove')
          setLibrary((current) => current.filter((movie) => !affected.has(movie.id)));
        return result;
      } finally {
        // Always reconcile the view, including a failure after earlier successful chunks.
        await loadLibrary();
        mutating.current = false;
        setBusy(false);
      }
    },
    [loadLibrary],
  );
  return {
    library,
    setLibrary,
    page,
    ready,
    initializing,
    pageBusy,
    busy,
    initialize,
    beginInitialization: () => setInitializing(true),
    loadLibrary,
    mutate,
  };
}
