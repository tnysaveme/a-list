'use client';
import type { MembershipChange } from '../lib/membership-motion';
import { pointerMotionAllowed, transitionContent } from '../lib/content-motion';
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { getApi, postApi } from '../lib/client-api';
import type { Movie } from '../lib/model';
import type { LibraryPage } from '../lib/pagination';
import { applyLibraryBatch, type LibraryAction } from '../lib/library-batch';
import { refreshLoadedPages } from '../lib/collection-pages';
import { useCollectionAnchor } from './use-collection-anchor';

import {
  collectionFreshMs,
  initialQuery,
  sameQuery,
  type CollectionError,
} from '../lib/collection-query';
import type { LibraryInit } from '../lib/api-contract';
export type { LibraryInit } from '../lib/api-contract';
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
  initial?: LibraryInit | null,
) {
  const [library, updateLibrary] = useState<Movie[]>(initial?.movies || []),
    [page, setPage] = useState<LibraryPage>(initial || emptyPage);
  const [ready, setReady] = useState(!!initial),
    [initializing, setInitializing] = useState(!initial),
    [pageBusy, setPageBusy] = useState(false),
    [busy, setBusy] = useState(false);
  const [membershipChange, setMembershipChange] = useState<MembershipChange | null>(null);
  const membershipVersion = useRef(0);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [displayQuery, setDisplayQuery] = useState(initialQuery);
  const [loadError, setLoadError] = useState<CollectionError | null>(null);
  const applied = useRef(initialQuery);
  const freshAt = useRef(0);
  useEffect(() => {
    if (initial) freshAt.current = Date.now();
  }, [initial]);
  const setLibrary = useCallback((value: SetStateAction<Movie[]>) => {
    freshAt.current = 0;
    updateLibrary(value);
  }, []);
  const [loadReason, setLoadReason] = useState<'replace' | 'append' | 'refresh' | null>(null);
  const pageRequest = useRef(0),
    mutating = useRef(false);
  const active = useRef<AbortController | null>(null);
  const extent = useRef(25);
  const query = useRef({ sort, filter });
  const loading = useRef(false);
  const captureAnchor = useCollectionAnchor(library);
  useEffect(() => () => active.current?.abort(), []);
  const initialize = useCallback(
    async (signal?: AbortSignal) => {
      const request = ++pageRequest.current;
      try {
        const data = await postApi('init', {}, signal);
        if (signal?.aborted || request !== pageRequest.current) return;
        updateLibrary(data.movies);
        freshAt.current = Date.now();
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
    async (
      offset = 0,
      append = false,
      options = { sort, filter },
      parent?: AbortSignal,
      refresh = false,
      animate = false,
    ) => {
      // A background event must not interrupt an explicit filter or pagination request.
      if (refresh && (loading.current || mutating.current)) return false;
      if (
        !refresh &&
        !append &&
        !loading.current &&
        sameQuery(applied.current, options) &&
        Date.now() - freshAt.current < collectionFreshMs
      ) {
        setLoadError(null);
        return true;
      }
      if (!refresh) query.current = options;
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
      const request = ++pageRequest.current;
      loading.current = true;
      setLoadError(null);
      setPageBusy(true);
      setLoadReason(refresh ? 'refresh' : append ? 'append' : 'replace');
      try {
        const read = (at: number) =>
          getApi(`library?sort=${options.sort}&filter=${options.filter}&offset=${at}`, signal);
        const data = refresh ? await refreshLoadedPages(read, extent.current) : await read(offset);
        if (signal?.aborted || request !== pageRequest.current) return false;
        if (refresh) captureAnchor();
        const commit = () => {
          if (!refresh) extent.current = append ? Math.max(extent.current, offset + 25) : 25;
          updateLibrary((current) => {
            if (!append) return data.movies;
            const ids = new Set(current.map((movie) => movie.id));
            return [...current, ...data.movies.filter((movie) => !ids.has(movie.id))];
          });
          setPage(data);
          applied.current = options;
          freshAt.current = Date.now();
          setDisplayQuery(options);
        };
        if (animate)
          return await transitionContent(
            commit,
            'results',
            () => !signal.aborted && request === pageRequest.current,
          );
        commit();
        return true;
      } catch (error) {
        if (!signal?.aborted && request === pageRequest.current) {
          query.current = applied.current;
          setLoadError({ query: options, offset, append, refresh });
          notify((error as Error).message, true);
        }
        return false;
      } finally {
        if (request === pageRequest.current) {
          loading.current = false;
          setPageBusy(false);
          setLoadReason(null);
        }
      }
    },
    [sort, filter, notify, captureAnchor],
  );
  const refreshLibrary = useCallback(
    (signal?: AbortSignal) => loadLibrary(0, false, query.current, signal, true),
    [loadLibrary],
  );
  const mutate = useCallback(
    async (action: LibraryAction, ids: string[]) => {
      if (mutating.current) return null;
      const pointer = pointerMotionAllowed();
      mutating.current = true;
      freshAt.current = 0;
      setBusy(true);
      setPendingIds(new Set(ids));
      pageRequest.current++;
      active.current?.abort();
      loading.current = false;
      setPageBusy(false);
      setLoadReason(null);
      try {
        const result = await applyLibraryBatch(action, ids, {
          read: async (chunk) =>
            (await getApi(`library/membership?ids=${chunk.join(',')}`)).membership,
          write: async (action, chunk) => {
            await postApi('library', { action, ids: chunk });
          },
        });
        const affected = new Set(result.completedIds);
        if (result.completedIds.length)
          setMembershipChange({
            key: ++membershipVersion.current,
            action,
            ids: result.completedIds,
            pointer,
          });
        if (action === 'remove')
          setLibrary((current) => current.filter((movie) => !affected.has(movie.id)));
        return result;
      } finally {
        mutating.current = false;
        setBusy(false);
        setPendingIds(new Set());
        // Confirmation is independent of the ancillary list read. Keep loaded pages.
        void refreshLibrary();
      }
    },
    [refreshLibrary, setLibrary],
  );
  return {
    library,
    setLibrary,
    page,
    ready,
    initializing,
    pageBusy,
    busy,
    pendingIds,
    membershipChange,
    displayFilter: displayQuery.filter,
    displayQuery,
    loadError,
    loadReason,
    initialize,
    beginInitialization: () => setInitializing(true),
    loadLibrary,
    refreshLibrary,
    mutate,
  };
}
